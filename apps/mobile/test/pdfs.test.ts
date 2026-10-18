// 041. PDFs on the phones: what the draft takes and refuses, the chip's
// name, and opening a PDF in the platform's own viewer from a private copy
// that does not outlive it.
//
// AC-3  a PDF chip's name is clipped in the middle.
// AC-5  ten files, two of them PDFs.
// AC-6  AC-7  the refusals.
// AC-11 the copy comes down, the viewer opens, and a failure is a line with
//       its way forward.
// AC-14 a PDF with no clean copy opens nothing.
// AC-15 the copy lives in a private cache folder and is deleted when the
//       viewer closes, on sign-out and on launch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clipMiddle, isPdf, takeFiles } from "@offload/widgets";

// iOS unless a test says Android, where the viewer is another app and the
// copy goes when offload is forward again.
const rn = vi.hoisted(() => ({ OS: "ios", back: [] as ((state: string) => void)[] }));
vi.mock("react-native", () => ({
  Platform: rn,
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      rn.back.push(listener);
      return { remove: () => rn.back.splice(rn.back.indexOf(listener), 1) };
    },
  },
}));

// A cache folder as a Map, so what is written and deleted can be read back.
const disk = new Map<string, string>();
let failDownload = false;
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    get exists() {
      return [...disk.keys()].some((k) => k.startsWith(this.uri + "/")) || disk.has(this.uri);
    }
    // As the real one does: a missing parent is an error unless asked for.
    create(options: { intermediates?: boolean } = {}) {
      const parent = this.uri.slice(0, this.uri.lastIndexOf("/"));
      if (!options.intermediates && parent !== "cache:" && !disk.has(parent)) throw new Error("no parent");
      disk.set(this.uri, "dir");
    }
    delete() {
      for (const k of [...disk.keys()]) if (k === this.uri || k.startsWith(this.uri + "/")) disk.delete(k);
    }
  }
  // A Blob, as expo-file-system's is, so FormData takes it.
  class File extends Blob {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      super([]);
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    get exists() {
      return disk.has(this.uri);
    }
    delete() {
      disk.delete(this.uri);
    }
    static async downloadFileAsync(_url: string, to: File) {
      if (failDownload) throw new Error("offline");
      disk.set(to.uri, "pdf");
      return to;
    }
  }
  return { Directory, File, Paths: { cache: "cache:" } };
});

const opened: string[] = [];
let viewer: "opened" | "no_viewer" = "opened";
let atViewer: (() => void) | null = null;
vi.mock("../modules/pdf-open", () => ({
  default: {
    open: async (uri: string) => {
      opened.push(uri);
      atViewer?.();
      return viewer;
    },
    revoke: () => undefined,
  },
}));

vi.mock("../lib/api", () => ({
  API_URL: "https://api.test",
  authHeaders: async () => ({ cookie: "s" }),
  send: async () => ({ status: 200, data: null }),
  upload: async () => ({ status: 415, data: null, error: "locked_pdf" }),
}));

vi.mock("expo-sharing", () => ({ shareAsync: vi.fn(async () => undefined), isAvailableAsync: async () => true }));

const dump = await import("../lib/dump");
const pdfOpen = await import("../lib/pdf-open");

beforeEach(() => {
  disk.clear();
  opened.length = 0;
  failDownload = false;
  viewer = "opened";
  atViewer = null;
  rn.OS = "ios";
  rn.back.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("what the draft takes", () => {
  it("knows a PDF by its type or its name, and refuses what is neither", () => {
    expect(isPdf({ type: "application/pdf", name: "a" })).toBe(true);
    expect(isPdf({ type: null, name: "a.PDF" })).toBe(true);
    // Mail and several Android providers hand a .pdf over as bytes of no type.
    expect(isPdf({ type: "application/octet-stream", name: "Boarding.pdf" })).toBe(true);
    expect(isPdf({ type: "application/octet-stream", name: "a.zip" })).toBe(false);
    expect(dump.refuseFile({ type: "application/pdf", name: "a.pdf", size: 10 })).toBeNull();
    expect(dump.refuseFile({ type: "application/msword", name: "a.doc", size: 10 })).toBe("not_a_photo");
    expect(dump.refuseFile({ type: "application/pdf", name: "a.pdf", size: 20 * 1024 * 1024 + 1 })).toBe("too_big");
  });

  it("takes two PDFs at most and ten in all, and says which", () => {
    const pdf = { type: "application/pdf", name: "p.pdf" };
    const jpg = { type: "image/jpeg", name: "j.jpg" };
    expect(takeFiles([{ kind: "pdf" }], [pdf, pdf])).toEqual({ taken: [pdf], line: "Two PDFs at a time." });
    expect(takeFiles(Array.from({ length: 9 }, () => ({ kind: "image" as const })), [jpg, jpg]).line).toBe("Ten at a time.");
  });

  it("names unnamed PDFs PDF, PDF 2, and clips a long name in the middle", () => {
    expect(dump.draftName({ type: "application/pdf", name: null }, [])).toBe("PDF");
    expect(dump.draftName({ type: "application/pdf", name: null }, [{ kind: "pdf", named: false }])).toBe("PDF 2");
    expect(clipMiddle("Boarding_pass_TAP_LIS_14OCT.pdf")).toBe("Boarding_…_14OCT.pdf");
  });

  it("hears a locked PDF from the server as its own refusal", async () => {
    await expect(dump.uploadPhoto({ uri: "file:///a.pdf", name: "a.pdf", type: "application/pdf" }, "k")).rejects.toEqual(
      new dump.PhotoRefused("locked_pdf"),
    );
  });
});

describe("opening a PDF", () => {
  it("brings the copy into a private cache folder, opens it, and deletes it when the viewer closes", async () => {
    expect(await pdfOpen.openPdf({ blobId: "b1", openable: true }, "Boarding pass")).toBe("opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^cache:\/pdfs\/b1\/Boarding pass\.pdf$/);
    expect([...disk.keys()].filter((k) => k.endsWith(".pdf"))).toEqual([]);
  });

  it("says why it did not open, and leaves nothing behind", async () => {
    expect(await pdfOpen.openPdf({ blobId: "b1", openable: false, unreadable: true }, "x")).toBe("never");
    expect(await pdfOpen.openPdf({ blobId: "b1", openable: false }, "x")).toBe("not_yet");
    failDownload = true;
    expect(await pdfOpen.openPdf({ blobId: "b1", openable: true }, "x")).toBe("failed");
    failDownload = false;
    viewer = "no_viewer";
    expect(await pdfOpen.openPdf({ blobId: "b1", openable: true }, "x")).toBe("no_viewer");
    expect(opened).toHaveLength(1);
    expect([...disk.keys()].filter((k) => k.endsWith(".pdf"))).toEqual([]);
  });

  it("sweeps the folder on launch and on sign-out", () => {
    disk.set("cache:/pdfs/b9/left.pdf", "pdf");
    pdfOpen.sweepPdfs();
    expect(disk.size).toBe(0);
  });

  it("keeps the tile's one spinner until the viewer is up", async () => {
    const seen: (string | null)[] = [];
    const stop = pdfOpen.onOpening((id) => seen.push(id));
    atViewer = () => seen.push("viewer");
    await pdfOpen.openPdf({ blobId: "b2", openable: true }, "x");
    stop();
    expect(seen).toEqual(["b2", "viewer", null]);
  });

  it("keeps a shared copy on Android until offload is forward again, for the app it went to", async () => {
    rn.OS = "android";
    await pdfOpen.sharePdf("b3", "Boarding pass");
    expect([...disk.keys()].filter((k) => k.endsWith(".pdf"))).toEqual(["cache:/pdfs/b3-share/Boarding pass.pdf"]);
    for (const listener of [...rn.back]) listener("active");
    expect([...disk.keys()].filter((k) => k.endsWith(".pdf"))).toEqual([]);
  });
});

describe("a settled turn", () => {
  it("takes each file's state from the answer, keeping the device's own copy", () => {
    const sent = [
      { blobId: "p1", kind: "image" as const, name: "a.jpg", width: 1, height: 1, ready: false, localUri: "file:///a" },
      { blobId: "d1", kind: "pdf" as const, name: "b.pdf", ready: false, openable: false },
    ];
    const answered = [
      { blobId: "p1", kind: "image" as const, name: "a.jpg", width: 4, height: 3, ready: true },
      { blobId: "d1", kind: "pdf" as const, name: "b.pdf", pages: 2, ready: true, openable: true, unreadable: false },
    ];
    expect(dump.settledPhotos(sent, answered)).toEqual([
      { blobId: "p1", kind: "image", name: "a.jpg", width: 4, height: 3, ready: true, localUri: "file:///a" },
      { blobId: "d1", kind: "pdf", name: "b.pdf", pages: 2, ready: true, openable: true, unreadable: false },
    ]);
    expect(dump.settledPhotos(sent, undefined)?.[0]?.ready).toBe(true);
  });
});
