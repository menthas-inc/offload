// Undo in place (2026-10-18): one line per thing, each with its own eight
// seconds, and a list that keeps a removed thing's slot while its line runs.

import { describe, expect, it } from "vitest";
import { createOrderMemory, createUndoStore, interleave, UNDO_MS, type Place } from "../src/index.js";

function clock() {
  let now = 0;
  const timers: { at: number; run: () => void; live: boolean }[] = [];
  return {
    now: () => now,
    schedule: (run: () => void, ms: number) => {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return timer;
    },
    cancel: (timer: unknown) => {
      (timer as { live: boolean }).live = false;
    },
    advance: (ms: number) => {
      now += ms;
      for (const timer of timers) if (timer.live && timer.at <= now) (timer.live = false), timer.run();
    },
  };
}

const slot = (id: string): Place => ({ id, icon: "archive", form: "slot" });
const undo = { label: "Undo", onPress: () => undefined };

describe("createUndoStore", () => {
  it("holds several at once, each for its own eight seconds", () => {
    const c = clock();
    const store = createUndoStore(c);
    store.put(slot("a"), "Archived", undo);
    c.advance(3000);
    store.put(slot("b"), "Archived", undo);
    expect([...store.entries().keys()]).toEqual(["a", "b"]);
    c.advance(UNDO_MS - 3000);
    expect([...store.entries().keys()]).toEqual(["b"]);
    c.advance(3000);
    expect(store.entries().size).toBe(0);
  });

  // Thread notice (2026-10-31): a sentence that must be read whole wraps.
  it("carries a place's wrap onto its line", () => {
    const store = createUndoStore(clock());
    store.put({ id: "t", icon: "check", form: "under", wrap: true }, "Showing as Events", undo);
    store.put(slot("a"), "Archived", undo);
    expect(store.entries().get("t")?.wrap).toBe(true);
    expect(store.entries().get("a")?.wrap).toBeUndefined();
  });

  it("a second action on the same thing replaces its line and restarts the clock", () => {
    const c = clock();
    const store = createUndoStore(c);
    store.put(slot("a"), "Archived", undo);
    c.advance(5000);
    store.put({ ...slot("a"), icon: "trash-2" }, "Deleted, gone in a moment", undo);
    expect(store.entries().get("a")).toMatchObject({ message: "Deleted, gone in a moment", startedAt: 5000 });
    c.advance(5000);
    expect(store.entries().has("a")).toBe(true);
  });

  it("marks a refusal as failed, by its action's word or by having none", () => {
    const store = createUndoStore(clock());
    store.put(slot("a"), "Couldn't archive that", { label: "Retry", onPress: () => undefined });
    store.put(slot("b"), "Couldn't save that");
    store.put(slot("c"), "Archived", undo);
    expect([...store.entries().values()].map((one) => one.failed)).toEqual([true, true, false]);
  });

  it("undoing drops the line and marks the thing returned for a moment", () => {
    const c = clock();
    const store = createUndoStore(c);
    store.put(slot("a"), "Archived", undo);
    store.drop("a", { returned: true });
    expect(store.entries().has("a")).toBe(false);
    expect(store.returned("a")).toBe(true);
    c.advance(1200);
    expect(store.returned("a")).toBe(false);
  });

  it("tells subscribers about every change, and stops when asked", () => {
    const c = clock();
    const store = createUndoStore(c);
    let calls = 0;
    const stop = store.subscribe(() => (calls += 1));
    store.put(slot("a"), "Archived", undo);
    c.advance(UNDO_MS);
    expect(calls).toBe(2);
    stop();
    store.put(slot("b"), "Archived", undo);
    expect(calls).toBe(2);
  });

  it("hands out a new map on change, so a snapshot read is stable between changes", () => {
    const store = createUndoStore(clock());
    const before = store.entries();
    expect(store.entries()).toBe(before);
    store.put(slot("a"), "Archived", undo);
    expect(store.entries()).not.toBe(before);
  });
});

describe("interleave", () => {
  const id = (row: { id: string }) => row.id;
  const rows = (...ids: string[]) => ids.map((one) => ({ id: one }));

  it("puts a removed thing's slot back where it was", () => {
    const { order } = interleave(["a", "b", "c"], rows("a", "c"), id, new Set(["b"]));
    expect(order).toEqual([{ row: { id: "a" } }, { slot: "b" }, { row: { id: "c" } }]);
  });

  it("keeps the first slot first, and two neighbours in their order", () => {
    const { order, ids } = interleave(["a", "b", "c"], rows("c"), id, new Set(["a", "b"]));
    expect(order).toEqual([{ slot: "a" }, { slot: "b" }, { row: { id: "c" } }]);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("closes up once the line is gone, and ignores a line for a thing it never drew", () => {
    const { order } = interleave(["a", "b"], rows("a"), id, new Set(["z"]));
    expect(order).toEqual([{ row: { id: "a" } }]);
  });

  it("a thing still in the list is a row, whatever its line says", () => {
    const { order } = interleave(["a"], rows("a"), id, new Set(["a"]));
    expect(order).toEqual([{ row: { id: "a" } }]);
  });

  it("remembers a removed thing for a render, in case its line arrives after it left", () => {
    const first = interleave(["a", "b", "c"], rows("a", "c"), id, new Set());
    expect(first.order).toEqual([{ row: { id: "a" } }, { row: { id: "c" } }]);
    const { order } = interleave(first.ids, rows("a", "c"), id, new Set(["b"]));
    expect(order).toEqual([{ row: { id: "a" } }, { slot: "b" }, { row: { id: "c" } }]);
  });

  it("draws every row once when the rows were reordered since", () => {
    const { order } = interleave(["a", "b", "x", "c"], rows("b", "a", "c"), id, new Set(["x"]));
    expect(order).toEqual([{ row: { id: "b" } }, { row: { id: "a" } }, { slot: "x" }, { row: { id: "c" } }]);
  });
});

describe("createOrderMemory", () => {
  it("puts a slot back after its neighbour in a list drawn afresh, as when a screen comes back mid-window", () => {
    const memory = createOrderMemory();
    memory.note(["a", "b", "c"]);
    expect(memory.seed(["a", "c"], new Set(["b"]))).toEqual(["a", "b", "c"]);
  });

  it("keeps a first thing first, and leaves out a slot whose neighbour is not drawn here", () => {
    const memory = createOrderMemory();
    memory.note(["a", "b"]);
    memory.note(["x", "y"]);
    expect(memory.seed(["b"], new Set(["a"]))).toEqual(["a", "b"]);
    expect(memory.seed(["q"], new Set(["y"]))).toEqual(["q"]);
  });

  it("never seeds a slot into a list that draws neither of its neighbours, an empty one included", () => {
    const memory = createOrderMemory();
    memory.note(["a", "b"]);
    expect(memory.seed([], new Set(["a"]))).toEqual([]);
    expect(memory.seed(["z"], new Set(["a"]))).toEqual(["z"]);
  });
});

describe("clear, at sign-out", () => {
  it("forgets every line, its timer and every remembered order, so the next account sees nothing of the last", () => {
    const c = clock();
    const store = createUndoStore(c);
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.put(slot("a"), "Archived", undo);
    store.drop("b", { returned: true });
    store.clear();
    expect(store.entries().size).toBe(0);
    expect(store.returned("b")).toBe(false);
    const before = calls;
    c.advance(UNDO_MS);
    expect(calls).toBe(before);
    const memory = createOrderMemory();
    memory.note(["a", "b"]);
    memory.clear();
    expect(memory.seed(["b"], new Set(["a"]))).toEqual(["b"]);
  });
});
