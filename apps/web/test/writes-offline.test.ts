// A write that never left is the write's own failure value, not a throw.
//
// Every caller of these reads null or false as "say so and offer Retry". A
// fetch that rejects, offline or blocked, went past them instead: Leave on a
// thread stayed busy for good with no line under it.

import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

const threads = await import("../src/lib/threads");
const dump = await import("../src/lib/dump");

describe("a write that never left", () => {
  it("is null or false from the thread helpers", async () => {
    expect(await threads.deleteThread("th1")).toBeNull();
    expect(await threads.restoreThread("th1")).toBe(false);
    expect(await threads.completeContent("c1", true)).toBe(false);
    expect(await threads.editContent("c1", { title: "x" })).toBeNull();
    expect(await threads.fetchThread("th1")).toBeNull();
  });

  it("is empty or false from the dump helpers", async () => {
    expect(await dump.fetchCurrent()).toEqual([]);
    expect(await dump.undoTurn("t1")).toBe(false);
    expect(await dump.fetchAnswer("m1")).toBeNull();
    expect(await dump.resumeDump("m1")).toBeNull();
  });
});
