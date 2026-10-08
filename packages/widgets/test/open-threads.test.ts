// Today, open in your threads (design 2026-10-07): the words both clients
// draw on a page, and the rule that keeps a ticked row where it was until
// Today is built again.

import { describe, expect, it } from "vitest";
import { holdsLine, inMindLine, keepInPlace, openFor, type PageLike } from "../src/open-threads.js";

const NOW = new Date("2026-10-07T12:00:00Z");
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - (days * 24 + hours) * 3600_000).toISOString();

describe("openFor", () => {
  it("says how long a to-do has been open, days then weeks then months then years", () => {
    expect(openFor(ago(0, 3), NOW)).toBe("Today");
    expect(openFor(ago(1), NOW)).toBe("1 day");
    expect(openFor(ago(9), NOW)).toBe("9 days");
    expect(openFor(ago(13), NOW)).toBe("13 days");
    expect(openFor(ago(14), NOW)).toBe("2 weeks");
    expect(openFor(ago(55), NOW)).toBe("7 weeks");
    expect(openFor(ago(61), NOW)).toBe("2 months");
    expect(openFor(ago(400), NOW)).toBe("1 year");
    expect(openFor(ago(800), NOW)).toBe("2 years");
  });
});

describe("Not in a thread's lines", () => {
  it("says offload has a thread in mind only when it has", () => {
    expect(inMindLine(0, 3)).toBeNull();
    expect(inMindLine(1, 1)).toBe("offload has a thread in mind for this one.");
    expect(inMindLine(1, 3)).toBe("offload has a thread in mind for one of these.");
    expect(inMindLine(2, 3)).toBe("offload has a thread in mind for some of these.");
    expect(inMindLine(3, 3)).toBe("offload has a thread in mind for all of these.");
  });

  it("counts what else it holds, the most common kind first", () => {
    expect(holdsLine({})).toBeNull();
    expect(holdsLine({ link: 1 })).toBe("1 link");
    expect(holdsLine({ link: 2 })).toBe("2 links");
    expect(holdsLine({ link: 2, note: 4 })).toBe("6 notes and links");
    expect(holdsLine({ link: 2, note: 4, photo: 1 })).toBe("7 notes, links and photos");
    expect(holdsLine({ link: 2, note: 4, photo: 1, voice: 1 })).toBe("8 notes, links, photos and more");
    expect(holdsLine({ voice: 2, file: 1 })).toBe("3 voice notes and files");
  });
});

describe("keepInPlace", () => {
  const page = (threadId: string, ids: string[], count = ids.length): PageLike<{ id: string; v?: number }> => ({
    threadId,
    todos: ids.map((id) => ({ id })),
    count,
  });
  const ids = (pages: PageLike<{ id: string }>[]) => pages.map((one) => [one.threadId, one.todos.map((row) => row.id), one.count]);

  it("takes the new read when nothing was ticked", () => {
    const next = [page("b", ["b1"]), page("a", ["a1"])];
    expect(keepInPlace([page("a", ["a1"])], next, new Set())).toEqual(next);
  });

  it("keeps a ticked row in its place and its page's count, though the read no longer has it", () => {
    const prev = [page("a", ["a1", "a2", "a3", "a4"], 6), page("b", ["b1"])];
    const next = [page("a", ["a2", "a3", "a4", "a5"], 5), page("b", ["b1"])];
    expect(ids(keepInPlace(prev, next, new Set(["a1"])))).toEqual([
      ["a", ["a1", "a2", "a3", "a4"], 6],
      ["b", ["b1"], 1],
    ]);
  });

  it("keeps the pages in the order they were drawn, a page whose rows were all ticked included", () => {
    const prev = [page("a", ["a1"]), page("b", ["b1"]), page("c", ["c1"])];
    const next = [page("c", ["c1"]), page("b", ["b1"]), page("d", ["d1"])];
    expect(ids(keepInPlace(prev, next, new Set(["a1"])))).toEqual([
      ["a", ["a1"], 1],
      ["b", ["b1"], 1],
      ["c", ["c1"], 1],
      ["d", ["d1"], 1],
    ]);
  });

  it("takes a row's new fields, lets a row the read dropped go, and fills its place from the read", () => {
    const prev = [{ threadId: "a", todos: [{ id: "a1" }, { id: "a2" }, { id: "a3" }], count: 4 }];
    const next = [{ threadId: "a", todos: [{ id: "a1", v: 2 }, { id: "a4" }], count: 3 }];
    expect(keepInPlace(prev, next, new Set(["a3"]))).toEqual([{ threadId: "a", todos: [{ id: "a1", v: 2 }, { id: "a3" }, { id: "a4" }], count: 4 }]);
  });

  it("drops a page that is gone and holds nothing ticked", () => {
    expect(keepInPlace([page("a", ["a1"]), page("b", ["b1"])], [page("b", ["b1"])], new Set())).toEqual([page("b", ["b1"])]);
  });

  it("keeps Not in a thread last", () => {
    const loose = { ...page("l", ["l1"]), loose: { inMind: 0 } };
    const kept = keepInPlace([page("a", ["a1"]), loose], [page("a", ["a1"]), page("z", ["z1"]), loose], new Set());
    expect(kept.map((one) => one.threadId)).toEqual(["a", "z", "l"]);
  });
});
