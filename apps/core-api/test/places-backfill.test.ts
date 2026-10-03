// 030 T1.17 and T1.18. The one pass over what existed before the map, and the
// route the worker posts a re-read page's location to.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { backfillMaps } from "../src/places/backfill.js";

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
  await db.deleteFrom("content").execute();
  await db.deleteFrom("place_lookups").execute();
  await db.deleteFrom("places").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(links = true): Promise<string> {
  return (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), web_links_enabled: links })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function thread(...members: string[]): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: members[0]!, name: "Lisbon trip", last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  for (const m of members) await db.insertInto("thread_members").values({ thread_id: row.id, account_id: m, state: "accepted" }).execute();
  return row.id;
}

async function message(accountId: string, text: string): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  return (
    await db
      .insertInto("messages")
      .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: uuidv7(), text, state: "seen" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function link(author: string, t: string, url: string, said: string, extra: Record<string, unknown> = {}) {
  const m = await message(author, said);
  return (
    await db
      .insertInto("content")
      .values({ account_id: author, thread_id: t, type: "link", title: "A page", url, derived_from_message_id: m, updated_at: new Date(), ...extra })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const booked = async (kind: string) =>
  (await db.selectFrom("jobs").select("payload").where("kind", "=", kind as never).execute()).map(
    (j) => ((typeof j.payload === "string" ? JSON.parse(j.payload) : j.payload) as { contentId: string }).contentId,
  );

describe("the one pass (T1.17, AC-27)", () => {
  it("does nothing while the map is off", async () => {
    const me = await account();
    const t = await thread(me);
    await db.insertInto("content").values({ account_id: me, thread_id: t, type: "location", title: "Time Out Market", updated_at: new Date() }).execute();
    await backfillMaps();
    expect(await db.selectFrom("jobs").selectAll().execute()).toHaveLength(0);
  });

  it("forgets every remembered miss and looks up every saved place with no point", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    await db.insertInto("place_lookups").values({ query_hash: "h", place_id: null }).execute();
    const id = (await db.insertInto("content").values({ account_id: me, thread_id: t, type: "location", title: "Time Out Market", updated_at: new Date() }).returning("id").executeTakeFirstOrThrow()).id;
    await backfillMaps();
    expect(await db.selectFrom("place_lookups").selectAll().execute()).toHaveLength(0);
    expect(await booked("location.resolve")).toEqual([id]);
  });

  it("reads a link's page again only for its author, only with their switch on, only if they wrote the address", async () => {
    mapsOn();
    const ana = await account(true);
    const ben = await account(false);
    const t = await thread(ana, ben);
    const mine = await link(ana, t, "https://www.airbnb.com/rooms/1", "this one https://www.airbnb.com/rooms/1");
    await link(ben, t, "https://example.com/b", "https://example.com/b");
    await link(ana, t, "https://example.com/invented", "the restaurant from yesterday");
    await link(ana, t, "https://example.com/read", "https://example.com/read", { place_read_at: new Date() });
    await backfillMaps();
    expect(await booked("link.place")).toEqual([mine]);
  });

  it("books nothing twice", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    await link(me, t, "https://www.airbnb.com/rooms/1", "https://www.airbnb.com/rooms/1");
    await db.insertInto("content").values({ account_id: me, thread_id: t, type: "location", title: "Time Out Market", updated_at: new Date() }).execute();
    await backfillMaps();
    await backfillMaps();
    expect(await booked("link.place")).toHaveLength(1);
    expect(await booked("location.resolve")).toHaveLength(1);
  });
});

describe("POST /internal/v1/content/:id/page-location (T1.18, AC-27)", () => {
  async function running(contentId: string) {
    return (
      await db
        .insertInto("jobs")
        .values({ kind: "link.place", payload: JSON.stringify({ contentId }), priority: 200, run_after: new Date(), state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  }
  const post = (id: string, body: Record<string, unknown>, token = env.INTERNAL_SERVICE_TOKEN) =>
    app.inject({ method: "POST", url: `/internal/v1/content/${id}/page-location`, headers: { authorization: `Bearer ${token}` }, payload: body });
  const state = (id: string) => db.selectFrom("content").select(["place_id", "place_read_at", "location"]).where("id", "=", id).executeTakeFirstOrThrow();

  it("puts the page's coordinates on the link and marks it read", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const id = await link(me, t, "https://www.airbnb.com/rooms/1", "https://www.airbnb.com/rooms/1");
    const res = await post(id, { jobId: await running(id), found: { lat: 38.7113, lng: -9.1301 } });
    expect(res.statusCode).toBe(200);
    const row = await state(id);
    expect(row.place_id).not.toBeNull();
    expect(row.place_read_at).toBeInstanceOf(Date);
  });

  it("keeps a page's place name and books a lookup", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const id = await link(me, t, "https://www.airbnb.com/rooms/1", "https://www.airbnb.com/rooms/1");
    await post(id, { jobId: await running(id), found: { name: "Casa Alfama" } });
    expect((await state(id)).location).toBe("Casa Alfama");
    expect(await booked("location.resolve")).toEqual([id]);
  });

  it("marks a page read that gave nothing", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const id = await link(me, t, "https://www.airbnb.com/rooms/1", "https://www.airbnb.com/rooms/1");
    await post(id, { jobId: await running(id), found: null });
    expect((await state(id)).place_read_at).toBeInstanceOf(Date);
  });

  it("refuses without the token, or for a job that is not this row's", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const id = await link(me, t, "https://www.airbnb.com/rooms/1", "https://www.airbnb.com/rooms/1");
    const other = await link(me, t, "https://example.com/x", "https://example.com/x");
    expect((await post(id, { jobId: await running(id), found: null }, "x".repeat(env.INTERNAL_SERVICE_TOKEN.length))).statusCode).toBe(401);
    expect((await post(id, { jobId: await running(other), found: null })).statusCode).toBe(404);
    expect((await state(id)).place_read_at).toBeNull();
  });

  it("refuses a row already read, deleted, or whose author turned the switch off", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const read = await link(me, t, "https://example.com/a", "https://example.com/a", { place_read_at: new Date() });
    const gone = await link(me, t, "https://example.com/b", "https://example.com/b", { deleted_at: new Date(), purge_after: new Date() });
    const off = await link(me, t, "https://example.com/c", "https://example.com/c");
    await db.updateTable("accounts").set({ web_links_enabled: false }).where("id", "=", me).execute();
    for (const id of [read, gone, off]) {
      expect((await post(id, { jobId: await running(id), found: { lat: 38.7, lng: -9.1 } })).statusCode).toBe(404);
    }
    expect(await db.selectFrom("places").selectAll().execute()).toHaveLength(0);
  });
});
