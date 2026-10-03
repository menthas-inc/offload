// 035 part B. Your copy, on a phone.
//
// The row's state is the server's; what this adds is the file: downloaded with
// the session into the cache, handed to the system's own sheet, and taken back
// out of the cache afterwards, because it is everything the person has and it
// is not sealed on the device. The rest are rules about the screens, read from
// source since these tests render nothing.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type State = { state: string; readyAt: string | null; expiresAt: string | null; nextAt: string | null };
const idle: State = { state: "idle", readyAt: null, expiresAt: null, nextAt: null };
let row: State | null = idle;
let answer: { status: number; data: State | null } = { status: 202, data: { ...idle, state: "making" } };
const sent: { path: string; method: string | undefined }[] = [];

vi.mock("../lib/api", () => ({
  request: () => Promise.resolve(row),
  send: (path: string, init: RequestInit) => {
    sent.push({ path, method: init.method });
    return Promise.resolve(answer);
  },
  authHeaders: () => Promise.resolve({ cookie: "session=abc" }),
}));
vi.mock("../lib/auth", () => ({ API_URL: "https://api.example.test" }));

const downloads: { url: string; headers: unknown; idempotent: unknown }[] = [];
const deleted: string[] = [];
let downloadFails = false;
vi.mock("expo-file-system", () => {
  class File {
    uri: string;
    exists = true;
    constructor(...parts: unknown[]) {
      this.uri = `file:///cache/${String(parts[parts.length - 1])}`;
    }
    delete() {
      deleted.push(this.uri);
    }
    static downloadFileAsync(url: string, destination: File, options: { headers?: unknown; idempotent?: unknown }) {
      downloads.push({ url, headers: options.headers, idempotent: options.idempotent });
      return downloadFails ? Promise.reject(new Error("offline")) : Promise.resolve(destination);
    }
  }
  return { File, Paths: { cache: "cache" } };
});

let os = "ios";
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return os;
    },
  },
}));

const shared: { uri: string; options: Record<string, unknown> }[] = [];
let canShare = true;
vi.mock("expo-sharing", () => ({
  isAvailableAsync: () => Promise.resolve(canShare),
  shareAsync: (uri: string, options: Record<string, unknown>) => {
    shared.push({ uri, options });
    return Promise.resolve();
  },
}));

const { askForCopy, clearSavedCopy, deleteCopy, loadCopy, saveCopy } = await import("../lib/copy");

beforeEach(() => {
  row = idle;
  answer = { status: 202, data: { ...idle, state: "making" } };
  sent.length = 0;
  downloads.length = 0;
  deleted.length = 0;
  shared.length = 0;
  downloadFails = false;
  canShare = true;
  os = "ios";
});

describe("the row", () => {
  it("is read from the server", async () => {
    expect(await loadCopy()).toEqual(idle);
  });

  it("asks, and takes the row the server answers with", async () => {
    expect((await askForCopy())?.state).toBe("making");
    expect(sent).toEqual([{ path: "/api/me/export", method: "POST" }]);
  });

  it("reads the row again when the server says it is too soon", async () => {
    answer = { status: 409, data: null };
    row = { ...idle, state: "waiting", nextAt: "2026-10-10T09:00:00Z" };
    expect((await askForCopy())?.state).toBe("waiting");
  });

  it("is null for a press that did not go through", async () => {
    answer = { status: 0, data: null };
    expect(await askForCopy()).toBeNull();
    answer = { status: 500, data: null };
    expect(await deleteCopy()).toBeNull();
  });

  it("does not call a delete that went through a failure because the read after it did not arrive", async () => {
    answer = { status: 204, data: null };
    row = null;
    expect((await deleteCopy())?.state).toBe("idle");
  });

  it("deletes the copy and reads what the row says now", async () => {
    answer = { status: 204, data: null };
    row = { ...idle, state: "waiting", nextAt: "2026-10-10T09:00:00Z" };
    expect((await deleteCopy())?.state).toBe("waiting");
    expect(sent).toEqual([{ path: "/api/me/export", method: "DELETE" }]);
  });
});

describe("the file (AC-21)", () => {
  it("is downloaded with the session, handed to the system's sheet as a zip, and then taken out of the cache", async () => {
    expect(await saveCopy()).toBe(true);
    expect(downloads).toEqual([
      { url: "https://api.example.test/api/me/export/file", headers: { cookie: "session=abc" }, idempotent: true },
    ]);
    expect(shared).toEqual([
      { uri: "file:///cache/offload.zip", options: { mimeType: "application/zip", UTI: "public.zip-archive", dialogTitle: "Save your copy" } },
    ]);
    expect(deleted).toEqual(["file:///cache/offload.zip"]);
  });

  it("leaves the file for the app it was handed to on Android, and clears it on the next visit", async () => {
    os = "android";
    expect(await saveCopy()).toBe(true);
    expect(deleted).toEqual([]);
    clearSavedCopy();
    expect(deleted).toEqual(["file:///cache/offload.zip"]);
  });

  it("says no when the download did not arrive, and leaves nothing in the cache", async () => {
    downloadFails = true;
    expect(await saveCopy()).toBe(false);
    expect(shared).toEqual([]);
    expect(deleted).toEqual(["file:///cache/offload.zip"]);
  });

  it("says no on a device with nowhere to hand a file to", async () => {
    canShare = false;
    expect(await saveCopy()).toBe(false);
    expect(downloads).toEqual([]);
  });
});

describe("the screens", () => {
  const page = readFileSync("app/settings/[page].tsx", "utf8");
  const section = readFileSync("components/settings/YourCopy.tsx", "utf8");
  const sheet = readFileSync("components/settings/DeleteAccountSheet.tsx", "utf8");

  it("puts Your copy on the Privacy page, under Reaching the web", () => {
    expect(page.indexOf("<YourCopy")).toBeGreaterThan(page.indexOf('label="Reaching the web"'));
  });

  it("is a headed section in the 031 format, with a glyph that is in the set", () => {
    expect(section).toContain('label="Your copy"');
    expect(section).toContain('icon="archive"');
    expect(section).toContain("Kept for 7 days. One every 7 days.");
    expect(readFileSync("components/icons.generated.ts", "utf8")).toContain('"archive"');
  });

  it("takes its words from the shared rule, and polls only while a copy is being made", () => {
    expect(section).toContain("copyRow(");
    expect(section).toMatch(/if \(!making\) return;/);
    expect(section).toContain("COPY_POLL_MS } from \"@offload/widgets\"");
  });

  it("says a failed press and a failed download with no reason, beside Retry", () => {
    expect(section).toContain(`"Couldn't start your copy"`);
    expect(section).toContain(`"Couldn't download your copy"`);
    expect(section).toContain(`"Couldn't delete your copy"`);
    expect(section).toContain('label: "Retry"');
  });

  it("stays pressable before the first read, reads the row again after a download that failed, and scopes the link on Android", () => {
    expect(section).not.toContain("copy !== null");
    expect(section).toMatch(/if \(!done\) \{\s*const read = await loadCopy\(\);/);
    expect(section).toContain("row.canDelete");
    expect(section).toContain("clearSavedCopy()");
    expect(sheet).toContain('isAndroid ? "text-blue-700" : "text-text-accent"');
  });

  it("offers a copy from the delete confirmation", () => {
    expect(sheet).toContain("Make a copy first");
    expect(sheet).toContain("onMakeCopy");
  });
});
