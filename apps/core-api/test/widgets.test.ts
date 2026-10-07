// Which widgets a thread earns.
//
// AC-1 a widget only when the content justifies one, never drawn empty.
// AC-3 preference order overrides the derived one, with one mechanism.
// 007's grouping by a tag dimension (AC-4 to AC-6) was retired by 025.
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
import {
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
      row({ type: "task" }),
      row({ type: "image" }),
    ];
    expect(widgetsFor(rows).map((w) => w.kind).sort()).toEqual(["files", "todo"]);
  });

  it("earns Files from a picture and never from a link (020 AC-29)", () => {
    // A link earned it until 020, drawn as a row. In a grid of untitled
    // squares a link loses the title and the domain that identify it, so it
    // stays in the list with the page's own picture on it.
    expect(widgetsFor([row({ type: "link" })]).map((w) => w.kind)).toEqual([]);
    expect(widgetsFor([row({ type: "screenshot" })]).map((w) => w.kind)).toEqual(["files"]);
    // 041. A file row with its PDF earns it, page 1 being its tile. One
    // written before 041, which could name a file it was never given, has
    // nothing to draw and does not.
    expect(widgetsFor([row({ type: "file" })]).map((w) => w.kind)).toEqual([]);
    expect(widgetsFor([row({ type: "file", photo: { kind: "pdf" } })]).map((w) => w.kind)).toEqual(["files"]);
  });

  it("loses a widget when the content that earned it goes (AC-1)", () => {
    // A thread that loses its last picture loses its files. That is the
    // system working, not state going missing.
    //
    // *This asserted it about a place and the map until 030, which retired the
    // map widget for a thread's map, and about a dated row and the timeline
    // until 015.*
    const picture = row({ type: "image" });
    expect(widgetsFor([picture]).map((w) => w.kind)).toEqual(["files"]);
    expect(widgetsFor([{ ...picture, type: "voice" }])).toEqual([]);
  });

  it("never earns a map, whatever the thread holds (030 AC-26)", () => {
    // 030. The Places section is retired: a thread with a point earns the map
    // switch instead, and located rows stay in Everything in here.
    expect(widgetsFor([row({ placeId: "p1" }), row({ type: "location", placeId: "p2" })])).toEqual([]);
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
    // A thread full of photos leads with its files, without anybody choosing.
    const rows = [
      ...Array.from({ length: 5 }, () => row({ type: "image" })),
      row({ type: "task" }),
    ];
    expect(widgetsFor(rows).map((w) => w.kind)).toEqual(["files", "todo"]);
  });

  it("breaks a tie the same way every time", () => {
    const rows = [row({ type: "image" }), row({ type: "task" })];
    expect(widgetsFor(rows).map((w) => w.kind)).toEqual(["todo", "files"]);
    expect(widgetsFor([...rows].reverse()).map((w) => w.kind)).toEqual(["todo", "files"]);
  });
});

describe("a stated order", () => {
  const rows = [row({ type: "task" }), row({ type: "image" }), row({ type: "image" })];

  it("overrides the derived one (AC-3)", () => {
    expect(widgetsFor(rows, ["todo", "files"]).map((w) => w.kind)).toEqual(["todo", "files"]);
    // Earned but unnamed, so it follows rather than disappearing: a widget
    // that appeared after the preference was set should be visible.
    expect(widgetsFor(rows, ["todo"]).map((w) => w.kind)).toEqual(["todo", "files"]);
  });

  it("ignores a kind the thread no longer earns (AC-3)", () => {
    // A thread whose contents changed under a preference is the normal case.
    expect(widgetsFor([row({ type: "task" })], ["timeline", "todo"]).map((w) => w.kind)).toEqual([
      "todo",
    ]);
  });

  it("ignores a kind that does not exist", () => {
    expect(widgetsFor(rows, ["nonsense", "todo"]).map((w) => w.kind)).toEqual(["todo", "files"]);
    // A stored order from before 030 still names the map; it reads as absent.
    expect(widgetsFor(rows, ["map", "todo"]).map((w) => w.kind)).toEqual(["todo", "files"]);
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

});

describe("reading a stored preference", () => {
  it("tolerates nonsense rather than failing", () => {
    // A thread whose preference names something that no longer exists must
    // render as though it had none.
    expect(readPreference(null)).toEqual({});
    expect(readPreference("nope")).toEqual({});
    expect(readPreference({ widgets: ["nonsense"] })).toEqual({});
    // A grouping stored before 025 is not read back.
    expect(readPreference({ groupBy: { todo: "city" } })).toEqual({});
  });

  it("keeps what it recognises", () => {
    expect(
      readPreference({ widgets: ["todo", "nonsense", "files"] })
    ).toEqual({ widgets: ["todo", "files"] });
  });

  it("reads a stored map out without rewriting it (030 AC-26)", () => {
    const stored = { widgets: ["map", "todo"] };
    expect(readPreference(stored)).toEqual({ widgets: ["todo"] });
    expect(stored).toEqual({ widgets: ["map", "todo"] });
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
        provider: "google", provider_place_id: `p-${uuidv7()}`,
        lat: 38.7, lng: -9.1, coords_at: new Date(),
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
