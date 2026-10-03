// 036. Storage on a phone: an upload the limit refused (AC-14), and the
// Storage section on Privacy (AC-13). The rules about the screens are read
// from source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

let uploaded: { status: number; data: null; error?: string } = { status: 429, data: null, error: "storage_full" };
let read: { status: number; data: unknown } = { status: 200, data: { usedBytes: 1, limitBytes: 2 } };
const paths: string[] = [];

vi.mock("../lib/api", () => ({
  send: (path: string) => {
    paths.push(path);
    return Promise.resolve(read);
  },
  upload: () => Promise.resolve(uploaded),
}));
// A Blob over nothing, so a FormData part takes it the way expo's File is taken.
vi.mock("expo-file-system", () => ({
  File: class extends Blob {
    constructor() {
      super([]);
    }
  },
}));

const { uploadPhoto, uploadVoice, PhotoRefused, VoiceRefused } = await import("../lib/dump");
const { loadStorage } = await import("../lib/storage");

const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(join(here, "..", path), "utf8");

describe("an upload the limit refused", () => {
  it("is storage_full for a photo and a voice note, and the day's limit stays the day's", async () => {
    const photo = { uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg" };
    uploaded = { status: 429, data: null, error: "storage_full" };
    await expect(uploadPhoto(photo, "k")).rejects.toEqual(new PhotoRefused("storage_full"));
    await expect(uploadVoice("file:///a.m4a", "k", 1000, [])).rejects.toEqual(new VoiceRefused("storage_full"));
    uploaded = { status: 429, data: null, error: "daily_limit" };
    await expect(uploadPhoto(photo, "k")).rejects.toEqual(new PhotoRefused("daily_limit"));
    uploaded = { status: 429, data: null };
    await expect(uploadVoice("file:///a.m4a", "k", 1000, [])).rejects.toEqual(new VoiceRefused("daily_limit"));
  });

  it("hands the body's error back from the multipart upload, as send does", () => {
    expect(source("lib/api.ts")).toMatch(/export async function upload<T>[\s\S]*?error \? \{ error \} : \{\}/);
  });

  it("is said in the composer, for both", () => {
    const composer = source("components/shell/conversation-context.tsx");
    expect(composer).toMatch(/PhotoRefused && error\.reason === "storage_full"[\s\S]{0,300}"Your storage is full\."/);
    expect(composer).toMatch(/VoiceRefused && error\.reason === "storage_full"[\s\S]{0,300}"Your storage is full\."/);
  });
});

describe("the Storage section", () => {
  it("reads the account's own figure, and null when it did not come", async () => {
    read = { status: 200, data: { usedBytes: 5, limitBytes: 9 } };
    expect(await loadStorage()).toEqual({ usedBytes: 5, limitBytes: 9 });
    expect(paths.at(-1)).toBe("/api/me/storage");
    read = { status: 500, data: null };
    expect(await loadStorage()).toBeNull();
  });

  it("sits on Privacy between Reaching the web and Your copy", () => {
    const page = source("app/settings/[page].tsx");
    const web = page.indexOf('label="Reaching the web"');
    const storage = page.indexOf("<StorageSection");
    const copy = page.indexOf("<YourCopy");
    expect(web).toBeGreaterThan(-1);
    expect(storage).toBeGreaterThan(web);
    expect(copy).toBeGreaterThan(storage);
  });

  // Read from source: these tests render nothing, so reading once, the value
  // arriving and the toast showing once are checked on a device.
  it("names its heading, glyph, caption and row, says the figure through the shared function, and has the failed-read line", () => {
    const section = source("components/settings/StorageSection.tsx");
    expect(section).toContain('label="Storage"');
    expect(section).toContain('icon="image"');
    expect(section).toContain('caption="Deleting a photo makes room."');
    expect(section).toContain('title="Photos and voice notes"');
    expect(section).toContain("storageFigure(");
    expect(section).toContain('"Couldn\'t load storage"');
  });

  it("says nothing once the page has gone", () => {
    const section = source("components/settings/StorageSection.tsx");
    expect(section).toMatch(/if \(!live\.current\) return;/);
  });
});
