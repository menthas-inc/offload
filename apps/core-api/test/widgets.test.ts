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

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { sql } from "kysely";
import { db, closeDb, pool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { dimensionsIn } from "../src/threads/tags.js";
import {
  groupBy,
  liveCount,
  readPreference,
  widgetsFor,
  type Sortable,
} from "../src/threads/widgets.js";

let n = 0;
function row(over: Partial<Sortable> = {}): Sortable {
  return {
    id: `r${n++}`,
    type: "voice",
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

  it("earns Files from a picture and never from a link (020 AC-29)", () => {
    // A link earned it until 020, drawn as a row. In a grid of untitled
    // squares a link loses the title and the domain that identify it, so it
    // stays in the list with the page's own picture on it.
    expect(widgetsFor([row({ type: "link" })]).map((w) => w.kind)).toEqual([]);
    expect(widgetsFor([row({ type: "screenshot" })]).map((w) => w.kind)).toEqual(["files"]);
    expect(widgetsFor([row({ type: "file" })]).map((w) => w.kind)).toEqual([]);
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
});


// --------------------------------------------------------------------------
// The claim the whole widget design rests on.

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("content").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

describe("the thread read does not grow with what a thread holds (AC-9)", () => {
  it("makes the same number of queries for four widgets as for none", async () => {
    // The claim the whole widget design rests on: widgets are `filter` calls
    // over one already-fetched page, not a query each. Four widgets is exactly
    // where one-query-per-widget would start to look reasonable, so this counts
    // them rather than trusting the shape of the code.
    const account = await db
      .insertInto("accounts")
      .values({
        email: `${uuidv7()}@example.com`, state: "active", email_verified: true,
        display_name: "Ana Duarte", analytics_subject_id: uuidv7(),
      })
      .returning("id").executeTakeFirstOrThrow();

    const token = uuidv7();
    await db
      .insertInto("sessions")
      .values({
        account_id: account.id, token, expires_at: new Date(Date.now() + 3_600_000),
      })
      .execute();
    const cookie = `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;

    const makeThread = async (name: string) => {
      const t = await db
        .insertInto("threads")
        .values({
          created_by_account_id: account.id, name,
          last_activity_at: sql`now()`, updated_at: sql`now()`,
        })
        .returning("id").executeTakeFirstOrThrow();
      await db
        .insertInto("thread_members")
        .values({ thread_id: t.id, account_id: account.id, state: "accepted" })
        .execute();
      return t.id;
    };

    const bare = await makeThread("Plain notes");
    const rich = await makeThread("Lisbon trip");

    for (let i = 0; i < 20; i++) {
      await db
        .insertInto("content")
        .values({
          account_id: account.id, thread_id: bare, title: `note ${i}`,
          type: "voice", updated_at: new Date(),
        })
        .execute();
    }

    const place = await db
      .insertInto("places")
      .values({
        provider: "google", provider_place_id: `p-${uuidv7()}`, name: "Time Out Market",
        lat: 38.7, lng: -9.1,
      })
      .returning("id").executeTakeFirstOrThrow();

    // One of each, so the thread earns all four widgets.
    for (const row of [
      { title: "Alfama", type: "location" as const, place_id: place.id },
      { title: "Book the flat", type: "task" as const },
      { title: "Fly out", type: "event" as const, occurs_at: new Date() },
      { title: "Tickets", type: "file" as const },
    ]) {
      await db
        .insertInto("content")
        .values({
          account_id: account.id, thread_id: rich, updated_at: new Date(), ...row,
        })
        .execute();
    }

    // Count what actually reaches Postgres, at the pool, rather than reasoning
    // about the code.
    const count = async (threadId: string) => {
      let queries = 0;
      const original = pool.query.bind(pool);
      (pool as { query: typeof pool.query }).query = ((...args: unknown[]) => {
        queries++;
        return (original as (...a: unknown[]) => unknown)(...args);
      }) as typeof pool.query;
      try {
        const bundle = await app.inject({
          method: "GET", url: `/v1/threads/${threadId}`, headers: { cookie },
        });
        const page = await app.inject({
          method: "GET", url: `/v1/threads/${threadId}/content`, headers: { cookie },
        });
        expect(bundle.statusCode).toBe(200);
        expect(page.statusCode).toBe(200);
        return queries;
      } finally {
        (pool as { query: typeof pool.query }).query = original;
      }
    };

    const forBare = await count(bare);
    const forRich = await count(rich);

    // A thread earning four widgets costs exactly what a thread earning none
    // does. If this ever fails, somebody has added a query per widget.
    expect(forRich).toBe(forBare);
  });
});

describe("a repeating occurrence says which series it belongs to", () => {
  // The client collapses a repeating event to one row and counts the rest, and
  // the only thing it can group by is this field. `attrs` is not sent whole,
  // exactly as `place_id` is not: the client needs to know an occurrence
  // repeats and has no business with the rest of what a calendar sync wrote.
  it("derives seriesRef from attrs, and null when there is none", async () => {
    const account = await db
      .insertInto("accounts")
      .values({
        email: `${uuidv7()}@example.com`, state: "active", email_verified: true,
        display_name: "Ana Duarte", analytics_subject_id: uuidv7(),
      })
      .returning("id").executeTakeFirstOrThrow();

    const token = uuidv7();
    await db
      .insertInto("sessions")
      .values({ account_id: account.id, token, expires_at: new Date(Date.now() + 3_600_000) })
      .execute();
    const cookie = `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;

    const thread = await db
      .insertInto("threads")
      .values({ created_by_account_id: account.id, name: "Week" })
      .returning("id").executeTakeFirstOrThrow();
    await db
      .insertInto("thread_members")
      .values({ thread_id: thread.id, account_id: account.id, state: "accepted" })
      .execute();

    await db
      .insertInto("content")
      .values([
        {
          account_id: account.id, thread_id: thread.id, type: "event", title: "Yoga",
          occurs_at: new Date("2026-09-14T18:00:00Z"),
          attrs: JSON.stringify({ series_ref: "yoga-series", calendar: "primary" }),
        },
        {
          account_id: account.id, thread_id: thread.id, type: "event", title: "Lawyer",
          occurs_at: new Date("2026-09-04T10:00:00Z"),
          attrs: JSON.stringify({ calendar: "primary" }),
        },
        {
          // An empty string is not a series. Grouping by it would collect every
          // such row into one imaginary repeating thing.
          account_id: account.id, thread_id: thread.id, type: "event", title: "Dentist",
          occurs_at: new Date("2026-09-05T10:00:00Z"),
          attrs: JSON.stringify({ series_ref: "" }),
        },
      ])
      .execute();

    const page = await app.inject({
      method: "GET", url: `/v1/threads/${thread.id}/content`, headers: { cookie },
    });
    expect(page.statusCode).toBe(200);

    const rows = (page.json() as { rows: { title: string; seriesRef: string | null }[] }).rows;
    const byTitle = new Map(rows.map((r) => [r.title, r.seriesRef]));

    expect(byTitle.get("Yoga")).toBe("yoga-series");
    expect(byTitle.get("Lawyer")).toBe(null);
    expect(byTitle.get("Dentist")).toBe(null);
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
