// 030 T1.14 to T1.16. What the clients read to draw a thread's map.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

const saved = { MAPS: env.MAPS, KEY: env.GOOGLE_MAPS_API_KEY, PEPPER: env.PLACE_HASH_PEPPER };
function mapsOn() {
  env.MAPS = "on";
  env.GOOGLE_MAPS_API_KEY = "test-key";
  env.PLACE_HASH_PEPPER = "test-pepper-test-pepper-test-pepper";
}
afterEach(() => {
  env.MAPS = saved.MAPS;
  env.GOOGLE_MAPS_API_KEY = saved.KEY;
  env.PLACE_HASH_PEPPER = saved.PEPPER;
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("place_lookups").execute();
  await db.deleteFrom("places").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<{ id: string; cookie: string }> {
  const id = (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: id, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
  return { id, cookie: `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}` };
}

async function thread(accountId: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name: "Lisbon trip", last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function place(lat: number | null = 38.7, provider: "google" | "page" = "google"): Promise<string> {
  return (
    await db
      .insertInto("places")
      .values({ provider, provider_place_id: `p-${uuidv7()}`, lat, lng: lat === null ? null : -9.1, approximate: lat === null ? null : false, coords_at: lat === null ? null : new Date() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function row(accountId: string, threadId: string, type: string, title: string, placeId: string | null, extra: Record<string, unknown> = {}) {
  return (
    await db
      .insertInto("content")
      .values({ account_id: accountId, thread_id: threadId, type: type as never, title, place_id: placeId, updated_at: new Date(), ...extra })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const bundle = (cookie: string, t: string) => app.inject({ method: "GET", url: `/v1/threads/${t}`, headers: { cookie } });
const points = (cookie: string, t: string) => app.inject({ method: "GET", url: `/v1/threads/${t}/points`, headers: { cookie } });

describe("hasPoint on the thread (T1.14, AC-11, AC-12)", () => {
  it("is false for everything while the map is off", async () => {
    const me = await account();
    const t = await thread(me.id);
    await row(me.id, t, "location", "Time Out Market", await place());
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(false);
  });

  it("is true with a located row, and false once it goes or ages out", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me.id);
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(false);
    await row(me.id, t, "location", "Somewhere", null);
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(false);
    const p = await place();
    const id = await row(me.id, t, "event", "Dinner", p, { location: "Time Out Market" });
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(true);
    await db.updateTable("places").set({ lat: null, lng: null }).where("id", "=", p).execute();
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(false);
    await db.updateTable("places").set({ lat: 38.7, lng: -9.1 }).where("id", "=", p).execute();
    await db.updateTable("content").set({ archived_at: new Date() }).where("id", "=", id).execute();
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(false);
  });

  it("is true with a picked calendar's located event in the window", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me.id);
    const connection = (await db.insertInto("connector_connections").values({ account_id: me.id, provider: "google", external_account_email: `${uuidv7()}@g.com` }).returning("id").executeTakeFirstOrThrow()).id;
    const cal = (await db.insertInto("connector_calendars").values({ connection_id: connection, external_id: `c-${uuidv7()}`, summary: "Home", access_role: "owner", selected: true, participants: 1 }).returning("id").executeTakeFirstOrThrow()).id;
    await db.insertInto("thread_calendars").values({ thread_id: t, calendar_id: cal, account_id: me.id }).execute();
    await db
      .insertInto("connector_events")
      .values({ account_id: me.id, calendar_id: cal, source_ref: `x:${uuidv7()}`, title: "Dinner", location: "Time Out Market", place_id: await place(), occurs_at: new Date(Date.now() + 86_400_000), untrusted: false, attendees: "[]" } as never)
      .execute();
    expect((await bundle(me.cookie, t)).json().hasPoint).toBe(true);
  });
});

describe("the row's place (T1.14, AC-1)", () => {
  it("is where it is and whether it is an area, and an event carries its own location", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me.id);
    await row(me.id, t, "event", "Dinner", await place(), { location: "Time Out Market" });
    await row(me.id, t, "link", "Casa Alfama", await place(), { location: "Casa Alfama" });
    const res = await app.inject({ method: "GET", url: `/v1/threads/${t}/content`, headers: { cookie: me.cookie } });
    const rows = res.json().rows as { title: string; place: Record<string, unknown>; location: string | null }[];
    const dinner = rows.find((r) => r.title === "Dinner")!;
    expect(Object.keys(dinner.place).sort()).toEqual(["approximate", "id", "lat", "lng"]);
    expect(dinner.location).toBe("Time Out Market");
    expect(rows.find((r) => r.title === "Casa Alfama")!.location).toBeNull();
  });
});

describe("GET /v1/threads/:id/points (T1.15, AC-31)", () => {
  it("returns every located live row with what the map draws, and nothing Google named", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me.id);
    await row(me.id, t, "event", "Dinner", await place(), { location: "Time Out Market", occurs_at: new Date() });
    await row(me.id, t, "link", "Casa Alfama", await place(38.71, "page"), { url: "https://www.airbnb.com/rooms/1" });
    await row(me.id, t, "location", "Gone", await place(), { deleted_at: new Date(), purge_after: new Date() });
    await row(me.id, t, "location", "Put away", await place(), { archived_at: new Date() });
    await row(me.id, t, "image", "Beach", await place());
    const res = await points(me.cookie, t);
    expect(res.statusCode).toBe(200);
    const got = res.json().points as Record<string, unknown>[];
    expect(got.map((p) => p["title"]).sort()).toEqual(["Casa Alfama", "Dinner"]);
    const dinner = got.find((p) => p["title"] === "Dinner")!;
    expect(dinner).toMatchObject({ source: "row", type: "event", address: "Time Out Market", approximate: false, lat: 38.7, lng: -9.1, labelIds: [] });
    expect(dinner["googlePlaceId"]).toMatch(/^p-/);
    expect(got.find((p) => p["title"] === "Casa Alfama")!).toMatchObject({ googlePlaceId: null, url: "https://www.airbnb.com/rooms/1" });
    expect(res.json().pending).toBe(0);
  });

  it("is empty while the map is off", async () => {
    const me = await account();
    const t = await thread(me.id);
    await row(me.id, t, "location", "Time Out Market", await place());
    expect((await points(me.cookie, t)).json()).toEqual({ points: [], pending: 0 });
  });

  it("is not found for somebody who is not in the thread", async () => {
    mapsOn();
    const me = await account();
    const other = await account();
    const t = await thread(me.id);
    expect((await points(other.cookie, t)).statusCode).toBe(404);
  });

  it("leaves out a place whose coordinates aged out, counts it, and books it again once a day", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me.id);
    await row(me.id, t, "location", "Time Out Market", await place(null));
    const first = await points(me.cookie, t);
    expect(first.json()).toEqual({ points: [], pending: 1 });
    await points(me.cookie, t);
    expect(await db.selectFrom("jobs").select("kind").where("kind", "=", "places.refresh").execute()).toHaveLength(1);
  });

  it("stops at five hundred, content first", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me.id);
    const p = await place();
    await db
      .insertInto("content")
      .values(Array.from({ length: 501 }, (_, i) => ({ account_id: me.id, thread_id: t, type: "location" as const, title: `Place ${String.fromCharCode(65 + (i % 26))}`, place_id: p, updated_at: new Date() })))
      .execute();
    expect((await points(me.cookie, t)).json().points).toHaveLength(500);
  });
});

describe("/api/me says whether the map is on (T1.16, AC-28)", () => {
  it("only while it is, and a request cannot turn it on", async () => {
    const me = await account();
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: me.cookie } })).json().maps).toBe(false);
    mapsOn();
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: me.cookie } })).json().maps).toBe(true);
    env.MAPS = "off";
    const patched = await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie: me.cookie }, payload: { maps: true } });
    expect(patched.json().maps ?? false).toBe(false);
  });
});
