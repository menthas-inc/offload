// The web copy of the widget logic, against the same cases as the server's.
//
// `apps/web/src/lib/widgets.ts` is a deliberate copy of
// `apps/core-api/src/threads/widgets.ts`: `stack.md` says the clients share
// design tokens and TypeScript types only, never behaviour, and this is a
// hundred lines of arithmetic with no imports and no environment. **The price
// of a copy is that it can drift, and the only thing that makes it not drift is
// this file holding the same assertions.** If a third caller ever wants it,
// that is the moment for a package.
//
// Which widgets a thread earns, and how their contents group.
//
// AC-1 a widget only when the content justifies one, never drawn empty.
// AC-3 preference order overrides the derived one, with one mechanism.
// AC-4 grouping by the dimension the thread names.
// AC-5 rows with no tag in that dimension are still shown, in one group, last.
// AC-6 enumerating dimensions is a scan over the page.
//
// Pure functions over rows, so these are fast and exhaustive rather than
// database-bound. What they assert is the arithmetic the screen depends on.

import { beforeEach, describe, expect, it } from "vitest";
import {
  cadenceLabel,
  splitRepeating,
  dimensionsIn,
  groupBy,
  liveCount,
  readPreference,
  reorderPlan,
  respread,
  widgetsFor,
  type Sortable,
} from "../src/lib/widgets";
import {
  addNote,
  deleteNote,
  deleteThread,
  restoreNote,
  restoreThread,
} from "../src/lib/threads";

let n = 0;
function row(over: Partial<Sortable> = {}): Sortable {
  return {
    id: `r${n++}`,
    type: "note",
    priority: 50,
    tags: [],
    doneAt: null,
    occursAt: null,
    placeId: null,
    ...over,
  };
}

describe("widgets are earned", () => {
  it("draws none for a thread that earns nothing (AC-1)", () => {
    expect(widgetsFor([row(), row()])).toEqual([]);
  });

  it("draws none at all for an empty thread (AC-1)", () => {
    expect(widgetsFor([])).toEqual([]);
  });

  it("earns each one from its own predicate (AC-1)", () => {
    const rows = [
      row({ placeId: "p1" }),
      row({ type: "task" }),
      row({ type: "image" }),
    ];
    expect(widgetsFor(rows).map((w) => w.kind).sort()).toEqual(["files", "map", "todo"]);
  });

  it("loses a widget when the content that earned it goes (AC-1)", () => {
    // A thread that loses its last place loses its map. That is the system
    // working, not state going missing.
    //
    // *This asserted the same thing about a dated row and the timeline until
    // 015, which took the timeline out of the earned set: it is a rail at the
    // top of every thread now, drawn whether or not a date exists.*
    const placed = row({ placeId: "p1" });
    expect(widgetsFor([placed]).map((w) => w.kind)).toEqual(["map"]);
    expect(widgetsFor([{ ...placed, placeId: null }])).toEqual([]);
  });

  it("never earns a timeline, whatever the thread holds (AC-1)", () => {
    const dated = row({ occursAt: "2026-09-20T00:00:00Z" });
    expect(widgetsFor([dated])).toEqual([]);
    // And a stored preference naming it is ignored rather than breaking, which
    // is what `widgetsFor` already does for a kind a thread does not earn.
    expect(widgetsFor([dated, row({ type: "task" })], ["timeline", "todo"]).map((w) => w.kind))
      .toEqual(["todo"]);
  });

  it("still earns a to-do list from tasks that are all done (AC-1)", () => {
    // Reversed deliberately. This asserted the opposite until somebody ticked
    // something off and watched it vanish: a done task leaves the widget's
    // predicate but not the widget, because the list is a record of a finished
    // job and the tick is the reward for doing the work.
    expect(widgetsFor([row({ type: "task", doneAt: "2026-09-01T00:00:00Z" })]).map((w) => w.kind))
      .toEqual(["todo"]);
  });

  it("leads with whatever the thread is mostly made of", () => {
    // A trip full of places leads with the map, without anybody choosing.
    const rows = [
      ...Array.from({ length: 5 }, () => row({ placeId: "p" })),
      row({ type: "task" }),
    ];
    expect(widgetsFor(rows).map((w) => w.kind)).toEqual(["map", "todo"]);
  });

  it("breaks a tie the same way every time", () => {
    const rows = [row({ type: "task" }), row({ placeId: "p" })];
    expect(widgetsFor(rows).map((w) => w.kind)).toEqual(["map", "todo"]);
    expect(widgetsFor([...rows].reverse()).map((w) => w.kind)).toEqual(["map", "todo"]);
  });
});

describe("a stated order", () => {
  const rows = [row({ type: "task" }), row({ placeId: "p" }), row({ type: "image" })];

  it("overrides the derived one (AC-3)", () => {
    expect(widgetsFor(rows, ["todo", "map"]).map((w) => w.kind)).toEqual([
      "todo",
      "map",
      // Earned but unnamed, so it follows rather than disappearing: a widget
      // that appeared after the preference was set should be visible.
      "files",
    ]);
  });

  it("ignores a kind the thread no longer earns (AC-3)", () => {
    // A thread whose contents changed under a preference is the normal case.
    expect(widgetsFor([row({ type: "task" })], ["timeline", "todo"]).map((w) => w.kind)).toEqual([
      "todo",
    ]);
  });

  it("ignores a kind that does not exist", () => {
    expect(widgetsFor(rows, ["nonsense", "map"]).map((w) => w.kind)).toEqual([
      "map",
      "todo",
      "files",
    ]);
  });
});

describe("grouping", () => {
  it("is one flat list when the thread names no dimension (AC-4)", () => {
    const rows = [row({ tags: ["city:alfama"] }), row()];
    expect(groupBy(rows, null)).toEqual([{ value: null, rows }]);
  });

  it("buckets by the named dimension (AC-4)", () => {
    const a = row({ tags: ["city:alfama"], priority: 80 });
    const b = row({ tags: ["city:porto"], priority: 20 });
    const c = row({ tags: ["city:alfama"], priority: 10 });

    expect(groupBy([a, b, c], "city")).toEqual([
      // The group holding the highest-priority row leads.
      { value: "alfama", rows: [a, c] },
      { value: "porto", rows: [b] },
    ]);
  });

  it("shows an untagged row, in one group, last (AC-5)", () => {
    // Nothing is ever invisible for not having been tagged, which would be the
    // worst possible failure of a feature whose pitch is that you never file.
    const tagged = row({ tags: ["city:alfama"], priority: 10 });
    const bare = row({ priority: 99 });
    const other = row({ tags: ["receipt"], priority: 99 });

    const groups = groupBy([tagged, bare, other], "city");
    expect(groups).toHaveLength(2);
    // Last, despite holding the highest priority rows.
    expect(groups.at(-1)).toEqual({ value: null, rows: [bare, other] });
    expect(groups[0]!.value).toBe("alfama");
  });

  it("puts everything in one unnamed group when nothing carries the dimension (AC-5)", () => {
    const rows = [row({ tags: ["receipt"] }), row()];
    // Reads as ungrouped, which is honest: somebody asked to group by city
    // before anything had one.
    expect(groupBy(rows, "city")).toEqual([{ value: null, rows }]);
  });

  it("uses only the named dimension when a row carries two (AC-4)", () => {
    const both = row({ tags: ["city:alfama", "room:kitchen"] });
    expect(groupBy([both], "city")[0]!.value).toBe("alfama");
    expect(groupBy([both], "room")[0]!.value).toBe("kitchen");
  });

  it("puts every row in exactly one group", () => {
    const rows = [
      row({ tags: ["city:alfama"] }),
      row({ tags: ["city:porto"] }),
      row(),
      row({ tags: ["receipt"] }),
    ];
    const total = groupBy(rows, "city").reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(rows.length);
  });

  it("enumerates the dimensions a page uses, over the page (AC-6)", () => {
    expect(
      dimensionsIn([
        { tags: ["city:alfama", "receipt"] },
        { tags: ["room:kitchen"] },
        { tags: [] },
      ])
    ).toEqual(["city", "room"]);
  });
});

describe("a ticked item sinks rather than vanishing", () => {
  it("keeps the to-do list when every task is done (AC-1)", () => {
    // The list is a record of a finished job, not an empty widget. Something
    // you did this morning disappearing is how you end up wondering whether
    // you did it.
    const done = row({ type: "task", doneAt: "2026-09-01T00:00:00Z" });
    expect(widgetsFor([done]).map((w) => w.kind)).toEqual(["todo"]);
  });

  it("puts done tasks last, whatever their priority", () => {
    const urgentDone = row({ type: "task", priority: 99, doneAt: "2026-09-01T00:00:00Z" });
    const idle = row({ type: "task", priority: 1 });
    const mid = row({ type: "task", priority: 50 });

    const todo = widgetsFor([urgentDone, idle, mid])[0]!;
    // Its importance dropped below everything outstanding the moment it was
    // finished, which is what "move it to the bottom" means.
    expect(todo.rows.map((r) => r.priority)).toEqual([50, 1, 99]);
  });

  it("sinks done rows inside a group too", () => {
    const done = row({ type: "task", tags: ["city:alfama"], priority: 90, doneAt: "2026-09-01T00:00:00Z" });
    const open = row({ type: "task", tags: ["city:alfama"], priority: 10 });
    const group = groupBy([done, open], "city")[0]!;
    expect(group.rows.map((r) => r.priority)).toEqual([10, 90]);
  });

  it("ranks a group of finished work below one with anything left", () => {
    const finished = row({ type: "task", tags: ["city:porto"], priority: 99, doneAt: "2026-09-01T00:00:00Z" });
    const outstanding = row({ type: "task", tags: ["city:alfama"], priority: 5 });
    expect(groupBy([finished, outstanding], "city").map((g) => g.value)).toEqual([
      "alfama",
      "porto",
    ]);
  });
});

describe("reading a stored preference", () => {
  it("tolerates nonsense rather than failing", () => {
    // A thread whose preference names something that no longer exists must
    // render as though it had none.
    expect(readPreference(null)).toEqual({});
    expect(readPreference("nope")).toEqual({});
    expect(readPreference({ widgets: ["nonsense"] })).toEqual({});
    expect(readPreference({ groupBy: { nonsense: "city" } })).toEqual({});
    expect(readPreference({ groupBy: { todo: 7 } })).toEqual({});
  });

  it("keeps what it recognises", () => {
    expect(
      readPreference({ widgets: ["todo", "nonsense", "map"], groupBy: { todo: "City" } })
    ).toEqual({ widgets: ["todo", "map"], groupBy: { todo: "city" } });
  });

  it("never reads the fold from the thread", () => {
    // The fold is the viewer's, composed in by the server from their
    // membership. A copy that once sat in `attrs` is ignored, not honoured.
    expect(readPreference({ hideDone: true })).toEqual({});
  });
});

describe("a request with no body does not claim one", () => {
  // The bug this locks: four bodyless calls sent `content-type:
  // application/json` with nothing in the body, Fastify refused them with a
  // 400, and the helpers read that as an ordinary failure. Deleting a thread
  // and deleting a memory both did nothing at all, in production, silently.
  const calls: { url: string; init: RequestInit }[] = [];

  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ deleted: true, restored: true, left: true }),
      } as unknown as Response);
    }) as unknown as typeof fetch;
  });

  function headers(): Record<string, string> {
    return (calls[0]?.init.headers ?? {}) as Record<string, string>;
  }

  it("sends no content-type when deleting a thread", async () => {
    await deleteThread("t1");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(headers()["content-type"]).toBeUndefined();
  });

  it("sends no content-type when deleting a note", async () => {
    await deleteNote("n1");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(headers()["content-type"]).toBeUndefined();
  });

  it("sends no content-type when restoring either", async () => {
    await restoreThread("t1");
    await restoreNote("n1");
    for (const call of calls) {
      expect(call.init.body).toBeUndefined();
      expect((call.init.headers ?? {}) as Record<string, string>).not.toHaveProperty(
        "content-type"
      );
    }
  });

  it("still sends one when there is a body", async () => {
    await addNote("t1", "Todo names in three words");
    expect(calls[0]?.init.body).toBeDefined();
    expect(headers()["content-type"]).toBe("application/json");
  });
});

describe("a repeating thing is one row in a list, not thirty", () => {
  // Reported from a real account: "I see a lot of Yoga". The timeline widget
  // collapsed a series and 015 deleted the widget, so the list somebody
  // actually reads kept all thirty rows. The rail draws every occurrence,
  // because a calendar has a cell per day already and repetition there is
  // free; a list has no grid.
  const NOW = new Date("2026-09-16T12:00:00Z");

  function occurrence(day: number, ref = "yoga") {
    return row({
      id: `y${day}`,
      type: "event",
      occursAt: `2026-09-${String(day).padStart(2, "0")}T18:00:00Z`,
      seriesRef: ref,
    });
  }

  it("collapses a series and counts what it stands for", () => {
    const rows = [occurrence(15), occurrence(22), occurrence(29), row({ id: "once" })];
    const { once, repeating } = splitRepeating(rows, NOW);

    expect(once.map((r) => r.id)).toEqual(["once"]);
    expect(repeating).toHaveLength(1);
    expect(repeating[0]?.count).toBe(3);
    expect(cadenceLabel(repeating[0]?.everyDays ?? null)).toBe("every week");
  });

  it("stands for the series with the next occurrence that has not happened", () => {
    const { repeating } = splitRepeating([occurrence(15), occurrence(22), occurrence(29)], NOW);
    expect(repeating[0]?.row.id).toBe("y22");
  });

  it("leaves a series of one alone, whatever it calls itself", () => {
    // Collapsing it would say "every week" about a single date.
    const { once, repeating } = splitRepeating([occurrence(15)], NOW);
    expect(once).toHaveLength(1);
    expect(repeating).toHaveLength(0);
  });
});

// Dragging a row to a new place, as priorities. The same helper the phones and
// the server import, asserted here because the web is where it was first
// dragged and where a drop that does not stick would first be noticed.
//
// The rule: the moved row takes the midpoint between its new neighbours, the
// list is re-spread when they are adjacent, and a tie is never good enough
// because a tie falls back to recency, which is not where the row was dropped.
describe("reorderPlan: a drop becomes one write, or a re-spread", () => {
  const list = (...priorities: number[]) =>
    priorities.map((priority, index) => ({ id: `r${index}`, priority }));

  it("writes nothing when nothing moved", () => {
    expect(reorderPlan(list(90, 50, 10), 1, 1).writes).toEqual([]);
  });

  it("takes the midpoint between the rows either side of the drop", () => {
    const { rows, writes } = reorderPlan(list(90, 50, 10), 2, 1);
    expect(rows.map((r) => r.id)).toEqual(["r0", "r2", "r1"]);
    expect(writes).toEqual([{ id: "r2", priority: 70, previous: 10 }]);
  });

  it("at the top, sits above the first row and never past 100", () => {
    expect(reorderPlan(list(90, 50, 10), 2, 0).writes).toEqual([
      { id: "r2", priority: 95, previous: 10 },
    ]);
    // 99 leaves exactly one number above it, and that is the one it takes.
    expect(reorderPlan(list(99, 50, 10), 2, 0).writes).toEqual([
      { id: "r2", priority: 100, previous: 10 },
    ]);
  });

  it("at the bottom, sits below the last row and never past 0", () => {
    expect(reorderPlan(list(90, 50, 10), 0, 2).writes).toEqual([
      { id: "r0", priority: 4, previous: 90 },
    ]);
    expect(reorderPlan(list(90, 50, 1), 0, 2).writes).toEqual([
      { id: "r0", priority: 0, previous: 90 },
    ]);
  });

  it("re-spreads the list when the neighbours are adjacent", () => {
    // 51 and 50 have nothing between them, so every row takes an even slot
    // and only the ones that changed are written.
    const { rows, writes } = reorderPlan(list(51, 50, 10), 2, 1);
    expect(rows.map((r) => r.priority)).toEqual([75, 50, 25]);
    expect(writes).toEqual([
      { id: "r0", priority: 75, previous: 51 },
      { id: "r2", priority: 50, previous: 10 },
      { id: "r1", priority: 25, previous: 50 },
    ]);
  });

  it("never settles for a tie, because a tie sorts by recency and not by the drop", () => {
    // To the top of a list of ties: the gap above is free, so one write.
    const top = reorderPlan(list(50, 50, 50, 50), 3, 0);
    expect(top.rows.map((r) => r.id)).toEqual(["r3", "r0", "r1", "r2"]);
    expect(top.writes).toEqual([{ id: "r3", priority: 75, previous: 50 }]);

    // Into the middle of them: nothing between 50 and 50, so the whole list.
    const middle = reorderPlan(list(50, 50, 50, 50), 3, 1);
    expect(middle.rows.map((r) => r.id)).toEqual(["r0", "r3", "r1", "r2"]);
    expect(middle.rows.map((r) => r.priority)).toEqual([80, 60, 40, 20]);
    expect(middle.writes).toHaveLength(4);
  });

  it("re-spreads when the top is already 100 or the bottom already 0", () => {
    expect(reorderPlan(list(100, 50, 10), 2, 0).rows.map((r) => r.priority)).toEqual([75, 50, 25]);
    expect(reorderPlan(list(90, 50, 0), 0, 2).rows.map((r) => r.priority)).toEqual([75, 50, 25]);
  });

  it("writes even when the row only crossed a tie, since the tie decided the old order", () => {
    const { rows, writes } = reorderPlan(list(90, 50, 50, 10), 1, 2);
    expect(rows.map((r) => r.id)).toEqual(["r0", "r2", "r1", "r3"]);
    expect(writes).toEqual([{ id: "r1", priority: 30, previous: 50 }]);
  });

  it("holds a hundred rows apart and no more, which is the scale's limit", () => {
    const hundred = respread(
      Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, priority: 50 }))
    );
    const distinct = new Set(hundred.rows.map((r) => r.priority));
    expect(distinct.size).toBe(100);
    expect(Math.max(...distinct)).toBeLessThanOrEqual(100);
    expect(Math.min(...distinct)).toBeGreaterThanOrEqual(0);
  });
});

describe("a section counts what is live in it", () => {
  it("counts open tasks and not finished ones", () => {
    const open = row({ type: "task" });
    const done = row({ type: "task", doneAt: "2026-09-01T00:00:00Z" });
    expect(liveCount([open, open, done])).toBe(2);
  });

  it("is every row for a section nothing in can be done", () => {
    const rows = [row({ type: "image" }), row({ type: "link" }), row({ placeId: "p1" })];
    expect(liveCount(rows)).toBe(3);
  });

  it("is zero, not absent, when every task is done", () => {
    expect(liveCount([row({ type: "task", doneAt: "2026-09-01T00:00:00Z" })])).toBe(0);
  });
});
