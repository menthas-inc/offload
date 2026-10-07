// @vitest-environment happy-dom
//
// 036. Storage, on the web's Privacy pane (AC-13), and the composer's word for
// an upload the limit refused (AC-14).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MB = 1024 * 1024;
let answer: { status: number; body?: unknown } = { status: 200, body: { usedBytes: 312 * MB, limitBytes: 1024 * MB } };
const reads: string[] = [];

beforeEach(() => {
  reads.length = 0;
  answer = { status: 200, body: { usedBytes: 312 * MB, limitBytes: 1024 * MB } };
  vi.stubGlobal("fetch", async (url: string) => {
    reads.push(String(url).replace(/^https?:\/\/[^/]+/, ""));
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const { Storage } = await import("../src/components/panes/Storage");
const { uploadPhoto, uploadVoice, PhotoRefused, VoiceRefused } = await import("../src/lib/dump");

let signedOut = 0;

async function render(failed: string[] = []) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const retries: (() => void)[] = [];
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <Storage
        onFailed={(line, retry) => {
          failed.push(line);
          retries.push(retry);
        }}
        onSignedOut={() => (signedOut += 1)}
      />,
    ),
  );
  await act(async () => {});
  return { host, retries, root };
}

describe("the Storage section", () => {
  it("is a headed section with its caption and the figure", async () => {
    const { host } = await render();
    expect(reads).toEqual(["/api/me/storage"]);
    expect(host.querySelector("h2")?.textContent).toBe("Storage");
    expect(host.textContent).toContain("Deleting a photo or PDF makes room.");
    expect(host.textContent).toContain("Photos, PDFs and voice notes");
    expect(host.textContent).toContain("312 MB of 1 GB");
    expect(host.querySelector("button, a")).toBeNull();
  });

  it("leaves the figure out and says so once when the read fails, and Retry reads again", async () => {
    answer = { status: 500 };
    const failed: string[] = [];
    const { host, retries } = await render(failed);
    expect(failed).toEqual(["Couldn't load storage"]);
    expect(host.textContent).toContain("Photos, PDFs and voice notes");
    expect(host.textContent).not.toContain(" of ");

    answer = { status: 200, body: { usedBytes: 2 * 1024 * MB, limitBytes: 5 * 1024 * MB } };
    await act(async () => retries[0]!());
    await act(async () => {});
    expect(host.textContent).toContain("2 GB of 5 GB");
  });
});

describe("the Storage section, when the read cannot help", () => {
  it("goes to sign in when the session ended, with no toast", async () => {
    signedOut = 0;
    answer = { status: 401 };
    const failed: string[] = [];
    await render(failed);
    expect(signedOut).toBe(1);
    expect(failed).toEqual([]);
  });

  it("says nothing once the pane has gone", async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => (finish = resolve)));
    const failed: string[] = [];
    const { root } = await render(failed);
    await act(async () => root.unmount());
    await act(async () => finish(new Response(null, { status: 500 })));
    expect(failed).toEqual([]);
  });
});

describe("an upload the limit refused", () => {
  it("is storage_full for a photo and a voice note, and the day's limit stays the day's", async () => {
    answer = { status: 429, body: { error: "storage_full" } };
    const photo = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
    await expect(uploadPhoto(photo, "k")).rejects.toEqual(new PhotoRefused("storage_full"));
    await expect(uploadVoice(new Blob([new Uint8Array(10)]), "k", 1000, [])).rejects.toEqual(new VoiceRefused("storage_full"));

    answer = { status: 429, body: { error: "daily_limit", scope: "account" } };
    await expect(uploadPhoto(photo, "k")).rejects.toEqual(new PhotoRefused("daily_limit"));
    answer = { status: 429 };
    await expect(uploadPhoto(photo, "k")).rejects.toEqual(new PhotoRefused("daily_limit"));
  });

  it("is said in the composer, for both", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/components/shell/Composer.tsx"), "utf8");
    expect(source).toMatch(/PhotoRefused && error\.reason === "storage_full"[\s\S]{0,300}"Your storage is full\."/);
    expect(source).toMatch(/VoiceRefused && error\.reason === "storage_full"[\s\S]{0,300}"Your storage is full\."/);
  });
});
