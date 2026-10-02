// 030 T1.1. What the database holds for a place now that Google draws the map.
//
// Google's terms let offload keep its place id indefinitely and its
// coordinates for thirty days, and nothing else. The columns that held its
// name and address are gone, so nothing can keep them by accident.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});
afterAll(closeDb);

beforeEach(async () => {
  await db.deleteFrom("content").execute();
  await db.deleteFrom("place_lookups").execute();
  await db.deleteFrom("places").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function columns(table: string): Promise<string[]> {
  const rows = await sql<{ column_name: string }>`
    select column_name from information_schema.columns where table_name = ${table}
  `.execute(db);
  return rows.rows.map((r) => r.column_name).sort();
}

async function owner(): Promise<{ me: string; thread: string }> {
  const me = (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  const thread = (
    await db
      .insertInto("threads")
      .values({ created_by_account_id: me, name: "Lisbon trip", last_activity_at: sql`now()`, updated_at: sql`now()` })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  await db.insertInto("thread_members").values({ thread_id: thread, account_id: me, state: "accepted" }).execute();
  return { me, thread };
}

async function row(me: string, thread: string, type: string, location: string | null) {
  return db
    .insertInto("content")
    .values({ account_id: me, thread_id: thread, type: type as never, title: "x", location })
    .returning("id")
    .executeTakeFirstOrThrow();
}

describe("places (AC-7)", () => {
  it("has no column for Google's name, address or the old resolved time", async () => {
    const names = await columns("places");
    expect(names).not.toContain("name");
    expect(names).not.toContain("formatted_address");
    expect(names).not.toContain("resolved_at");
    expect(names).toEqual(expect.arrayContaining(["approximate", "coords_at", "lat", "lng", "provider", "provider_place_id"]));
  });

  it("takes a google or a page place, and nothing else, and has no default provider", async () => {
    await db.insertInto("places").values({ provider: "google", provider_place_id: "ChIJ1" }).execute();
    await db.insertInto("places").values({ provider: "page", provider_place_id: "38.71130,-9.13010", lat: 38.7113, lng: -9.1301 }).execute();
    await expect(
      db.insertInto("places").values({ provider: "maptiler" as never, provider_place_id: "x" }).execute(),
    ).rejects.toThrow(/places_provider_check/);
    await expect(sql`insert into places (provider_place_id) values ('y')`.execute(db)).rejects.toThrow();
  });

  it("keeps no account or thread link on either cache (OFF-3)", async () => {
    const names = [...(await columns("places")), ...(await columns("place_lookups"))];
    expect(names.filter((n) => n.includes("account") || n.includes("thread"))).toEqual([]);
  });
});

describe("a row's location (AC-5)", () => {
  it("takes one line of at most 120 on an event or a link, and on nothing else", async () => {
    const { me, thread } = await owner();
    await row(me, thread, "event", "Time Out Market");
    await row(me, thread, "link", "Casa Alfama");
    await expect(row(me, thread, "task", "Time Out Market")).rejects.toThrow(/content_location_shape/);
    await expect(row(me, thread, "event", "")).rejects.toThrow(/content_location_shape/);
    await expect(row(me, thread, "event", "a".repeat(121))).rejects.toThrow(/content_location_shape/);
    await expect(row(me, thread, "event", "Time Out\nMarket")).rejects.toThrow(/content_location_shape/);
  });

  it("carries the read mark and the Undo record the server writes", async () => {
    expect(await columns("content")).toEqual(expect.arrayContaining(["location", "place_prior", "place_prior_at", "place_read_at"]));
  });
});

describe("a calendar event's place (OFF-4)", () => {
  it("points at a place by id and keeps a fingerprint, never the text it looked up", async () => {
    const names = await columns("connector_events");
    expect(names).toEqual(expect.arrayContaining(["located_key", "place_id"]));
    expect(names).not.toContain("located_location");
  });

  it("lets go of a place that is deleted", async () => {
    const fk = await sql<{ confdeltype: string }>`
      select confdeltype from pg_constraint
      where conrelid = 'connector_events'::regclass and contype = 'f'
        and confrelid = 'places'::regclass
    `.execute(db);
    // 'n' is on delete set null.
    expect(fk.rows.map((r) => r.confdeltype)).toEqual(["n"]);
  });
});
