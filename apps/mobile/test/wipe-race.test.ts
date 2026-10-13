// A fetch in flight when the phone lets go of the account's copy.
//
// From the security review of PR 108 (2026-10-11): the session ends, the
// cache folders go, and a photo, a mark or a PDF that was still on its way
// down lands afterwards, makes its folder again and writes the bytes back.
// The wipe then reads as done while the last account's picture sits in the
// cache. Each writer reads the copy's generation before it fetches, and keeps
// what came down only if the copy was not forgotten meanwhile.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Image: () => null,
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));

// A cache folder as a set of paths, so what is written can be read back.
const disk = new Set<string>();
let download: Promise<void> = Promise.resolve();
vi.mock("expo-file-system", () => {
  const join = (parts: (string | { uri: string })[]) => parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return [...disk].some((k) => k === this.uri || k.startsWith(this.uri + "/"));
    }
    create() {
      disk.add(this.uri);
    }
    delete() {
      for (const k of [...disk]) if (k === this.uri || k.startsWith(this.uri + "/")) disk.delete(k);
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return disk.has(this.uri);
    }
    write() {
      disk.add(this.uri);
    }
    delete() {
      disk.delete(this.uri);
    }
    static async downloadFileAsync(_url: string, to: File) {
      await download;
      disk.add(to.uri);
      return to;
    }
  }
  return { Directory, File, Paths: { cache: "cache:" } };
});

const opened: string[] = [];
vi.mock("../modules/pdf-open", () => ({
  default: {
    open: async (uri: string) => {
      opened.push(uri);
      return "opened";
    },
    revoke: () => undefined,
  },
}));
const shared: string[] = [];
vi.mock("expo-sharing", () => ({
  shareAsync: async (uri: string) => {
    shared.push(uri);
  },
}));
vi.mock("../lib/api", () => ({ API_URL: "https://api.test", authHeaders: async () => ({ cookie: "s" }) }));
vi.mock("../lib/auth", () => ({ API_URL: "https://api.test" }));
vi.mock("../lib/dump", () => ({ photoUrl: (id: string, r: string) => `https://api.test/v1/blobs/${id}/${r}` }));

/** A fetch that answers when the test says so. */
let answer: () => void = () => undefined;
vi.stubGlobal("fetch", () =>
  new Promise((resolve) => {
    answer = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  }),
);

const { copyForgotten, ended } = await import("../lib/session-end");
const { fetchRendition } = await import("../components/shell/PhotoThumb");
const { fetchMark } = await import("../lib/marks");
const pdfOpen = await import("../lib/pdf-open");

/** What the wipe does to the folders, and the generation with it. */
function wipe(): void {
  for (const k of [...disk]) if (k.startsWith("cache:/")) disk.delete(k);
  copyForgotten();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  disk.clear();
  opened.length = 0;
  shared.length = 0;
  download = Promise.resolve();
});

describe("a fetch that lands after the copy is forgotten keeps nothing", () => {
  it("a photo's rendition", async () => {
    const pending = fetchRendition("b1", "thumb");
    await tick();
    wipe();
    answer();
    expect(await pending).toBeNull();
    expect([...disk]).toEqual([]);
  });

  it("a person's mark", async () => {
    const pending = fetchMark("a2");
    await tick();
    wipe();
    answer();
    expect(await pending).toBeNull();
    expect([...disk]).toEqual([]);
  });

  it("a PDF on its way to the viewer, which never opens", async () => {
    let land: () => void = () => undefined;
    download = new Promise((resolve) => {
      land = resolve;
    });
    const pending = pdfOpen.openPdf({ blobId: "b3", openable: true }, "Lease");
    await tick();
    wipe();
    land();
    expect(await pending).toBe("failed");
    expect(opened).toEqual([]);
    expect([...disk]).toEqual([]);
  });

  it("a PDF on its way to the share sheet, which never opens", async () => {
    let land: () => void = () => undefined;
    download = new Promise((resolve) => {
      land = resolve;
    });
    const pending = pdfOpen.sharePdf("b4", "Lease");
    await tick();
    wipe();
    land();
    await pending;
    expect(shared).toEqual([]);
    expect([...disk]).toEqual([]);
  });

  it("and one the copy was not forgotten under is kept, as before", async () => {
    const pending = fetchRendition("b5", "large");
    await tick();
    answer();
    expect(await pending).toBe("cache:/photos/b5-large.jpg");
    expect(disk.has("cache:/photos/b5-large.jpg")).toBe(true);
  });
});

// The tile's spinner names a PDF by id. A session that ends mid-download
// leaves no spinner for the next account to see.
describe("the PDF coming down is forgotten with the session", () => {
  it("clears the spinner at the end", async () => {
    download = new Promise(() => undefined);
    void pdfOpen.openPdf({ blobId: "b6", openable: true }, "Lease");
    await tick();
    expect(pdfOpen.openingNow()).toBe("b6");
    await ended();
    expect(pdfOpen.openingNow()).toBeNull();
  });
});

// The voice note's copy is fetched inside its component, so it is read here
// from source: it checks the same generation, not a mount of its own.
describe("a voice note heard on this phone", () => {
  it("keeps what came down only under the generation it started in", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../components/shell/SentVoice.tsx", import.meta.url), "utf8");
    const source = text.slice(text.indexOf("async function source()"), text.indexOf("async function toggle()"));
    expect(source).toMatch(/const generation = copyGeneration\(\);[\s\S]*await fetch\([\s\S]*copyGeneration\(\) !== generation[\s\S]*file\.write\(bytes\)/);
  });
});
