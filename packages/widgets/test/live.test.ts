// 048. What the live connection says, and whether a screen reads again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadFloor, touches } from "../src/index.js";

describe("touches", () => {
  it("is true for everything on all", () => {
    expect(touches({ kinds: ["all"] }, ["memories"])).toBe(true);
    expect(touches({ kinds: ["all"] }, ["thread"], "t1")).toBe(true);
  });

  it("is false for a kind the screen does not show", () => {
    expect(touches({ kinds: ["memories"] }, ["thread", "today"], "t1")).toBe(false);
  });

  it("is true for an account kind the screen shows", () => {
    expect(touches({ kinds: ["people"] }, ["people", "invitation"])).toBe(true);
  });

  it("takes a thread change only for its own thread when it has one", () => {
    const changes = { kinds: ["thread" as const], threads: ["t2"] };
    expect(touches(changes, ["thread"], "t1")).toBe(false);
    expect(touches(changes, ["thread"], "t2")).toBe(true);
    // A screen with no thread of its own, My threads or Today, takes any.
    expect(touches(changes, ["thread"])).toBe(true);
  });

  it("takes a removal of its own thread", () => {
    const changes = { kinds: ["removed" as const], removed: ["t1"] };
    expect(touches(changes, ["removed"], "t1")).toBe(true);
    expect(touches(changes, ["removed"], "t2")).toBe(false);
  });
});

describe("reloadFloor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the first change at once", () => {
    const run = vi.fn();
    const floor = reloadFloor(run, 2000);
    floor.ask();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("turns a burst inside the floor into one more run at its end", () => {
    const run = vi.fn();
    const floor = reloadFloor(run, 2000);
    floor.ask();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(200);
      floor.ask();
    }
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs nothing after it is cancelled", () => {
    const run = vi.fn();
    const floor = reloadFloor(run, 2000);
    floor.ask();
    floor.ask();
    floor.cancel();
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
