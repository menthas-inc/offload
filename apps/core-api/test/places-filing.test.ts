// 030 T1.7 to T1.10. Filing and editing a row's place, through the tool
// endpoint the worker calls.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
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
  await db.deleteFrom("content").execute();
  await db.deleteFrom("place_lookups").execute();
  await db.deleteFrom("places").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(links = true): Promise<string> {
  return (
    await db
      .insertInto("accounts")
      .values({
        email: `${uuidv7()}@example.com`,
        state: "active",
        email_verified: true,
        analytics_subject_id: uuidv7(),
        web_links_enabled: links,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
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

async function dump(accountId: string, text = "dinner at Time Out Market on Friday") {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: turnId, text, state: "seen" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const job = await db
    .insertInto("jobs")
    .values({
      kind: "dump.answer",
      account_id: accountId,
      payload: JSON.stringify({ messageId: message.id, conversationId: conversation.id, turnId }),
      priority: 10,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { messageId: message.id, jobId: job.id };
}

const tool = (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/tool-call",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload,
  });

const resolveJobs = async () =>
  (await db.selectFrom("jobs").select("payload").where("kind", "=", "location.resolve").execute()).map(
    (j) => (typeof j.payload === "string" ? JSON.parse(j.payload) : j.payload) as Record<string, unknown>,
  );

describe("an event's location (T1.7, AC-5)", () => {
  it("is kept and booked for a lookup, with an id and nothing else in the job", async () => {
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);
    const res = await tool({ tool: "add_content", jobId, toolCallId: "e1", threadId: t, title: "Dinner", type: "event", location: "Time Out Market" });
    expect(res.json().ok).toBe(true);
    const row = await db.selectFrom("content").select(["location", "type"]).executeTakeFirstOrThrow();
    expect(row).toEqual({ location: "Time Out Market", type: "event" });
    const jobs = await resolveJobs();
    expect(jobs).toEqual([{ contentId: res.json().contentId }]);
  });

  it("is refused on anything but an event", async () => {
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);
    const res = await tool({ tool: "add_content", jobId, toolCallId: "t1", threadId: t, title: "Book a table", type: "task", location: "Time Out Market" });
    expect(res.json()).toEqual({ ok: false, error: "location_not_here" });
  });

  it("is refused when it is not a public place's name, so the model hears it", async () => {
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);
    for (const [i, location] of ["Rua Augusta 12", "Ana's", "a".repeat(121), "Time Out\nMarket"].entries()) {
      const res = await tool({ tool: "add_content", jobId, toolCallId: `e${i}`, threadId: t, title: "Dinner", type: "event", location });
      expect(res.json(), location).toEqual({ ok: false, error: "bad_place_name" });
    }
    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(0);
  });
});

describe("the worker's envelope on a link (T1.8, AC-2)", () => {
  const link = (jobId: string, t: string, worker: unknown, id = "l1") =>
    tool({ tool: "add_content", jobId, toolCallId: id, threadId: t, title: "Casa Alfama", type: "link", url: "https://www.airbnb.com/rooms/1", worker });

  it("puts a page's coordinates on the link and marks the page read", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me, "https://www.airbnb.com/rooms/1");
    const res = await link(jobId, t, { pageRead: true, pageLocation: { lat: 38.7113, lng: -9.1301 } });
    expect(res.json().ok).toBe(true);
    const row = await db.selectFrom("content").select(["place_id", "place_read_at", "location"]).executeTakeFirstOrThrow();
    expect(row.place_id).not.toBeNull();
    expect(row.place_read_at).toBeInstanceOf(Date);
    expect(row.location).toBeNull();
    expect(await resolveJobs()).toEqual([]);
  });

  it("keeps a page's place name for the lookup, with an id-only job", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me, "https://www.airbnb.com/rooms/1");
    const res = await link(jobId, t, { pageRead: true, pageLocation: { name: "Casa Alfama" } });
    const row = await db.selectFrom("content").select(["location", "place_read_at"]).executeTakeFirstOrThrow();
    expect(row.location).toBe("Casa Alfama");
    expect(await resolveJobs()).toEqual([{ contentId: res.json().contentId }]);
  });

  it("marks a page read that gave nothing", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me, "https://www.airbnb.com/rooms/1");
    await link(jobId, t, { pageRead: true });
    const row = await db.selectFrom("content").select(["place_read_at", "place_id"]).executeTakeFirstOrThrow();
    expect(row.place_read_at).toBeInstanceOf(Date);
    expect(row.place_id).toBeNull();
  });

  it("is ignored when the author's switch is off, or the map is", async () => {
    const off = await account(false);
    const t1 = await thread(off);
    mapsOn();
    const { jobId: j1 } = await dump(off, "https://www.airbnb.com/rooms/1");
    await link(j1, t1, { pageRead: true, pageLocation: { lat: 38.7113, lng: -9.1301 } });

    env.MAPS = "off";
    const on = await account(true);
    const t2 = await thread(on);
    const { jobId: j2 } = await dump(on, "https://www.airbnb.com/rooms/1");
    await link(j2, t2, { pageRead: true, pageLocation: { lat: 38.7113, lng: -9.1301 } });

    const rows = await db.selectFrom("content").select(["place_id", "place_read_at"]).execute();
    expect(rows).toEqual([
      { place_id: null, place_read_at: null },
      { place_id: null, place_read_at: null },
    ]);
  });

  it("is refused on anything but a link", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);
    const res = await tool({ tool: "add_content", jobId, toolCallId: "t1", threadId: t, title: "Dinner", type: "event", worker: { pageRead: true } });
    expect(res.json()).toEqual({ ok: false, error: "location_not_here" });
  });
});
