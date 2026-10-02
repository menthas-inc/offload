// 030 T1.7 to T1.10. Filing and editing a row's place, through the tool
// endpoint the worker calls.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { undoTurn } from "../src/routes/dumps.js";

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
  return { messageId: message.id, jobId: job.id, turnId };
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

describe("editing a row's place (T1.9, AC-9)", () => {
  async function filedEvent(me: string, t: string, location = "Time Out Market") {
    const first = await dump(me);
    const res = await tool({ tool: "add_content", jobId: first.jobId, toolCallId: "e1", threadId: t, title: "Dinner", type: "event", location });
    const id = res.json().contentId as string;
    const placeId = (await db.insertInto("places").values({ provider: "google", provider_place_id: "ChIJ_market", lat: 38.7, lng: -9.1, coords_at: new Date() }).returning("id").executeTakeFirstOrThrow()).id;
    await db.updateTable("content").set({ place_id: placeId }).where("id", "=", id).execute();
    await db.deleteFrom("jobs").where("kind", "=", "location.resolve").execute();
    return { id, placeId };
  }
  const read = (id: string) =>
    db.selectFrom("content").select(["location", "place_id", "place_read_at", "title"]).where("id", "=", id).executeTakeFirstOrThrow();

  it("changes an event's location, dropping the old place and booking a lookup", async () => {
    const me = await account();
    const t = await thread(me);
    const { id } = await filedEvent(me, t);
    const { jobId } = await dump(me, "actually it's at Cervejaria Ramiro");
    const res = await tool({ tool: "edit_content", jobId, toolCallId: "x1", contentId: id, location: "Cervejaria Ramiro" });
    expect(res.json().ok).toBe(true);
    expect(await read(id)).toMatchObject({ location: "Cervejaria Ramiro", place_id: null });
    expect(await resolveJobs()).toEqual([{ contentId: id }]);
  });

  it("clears an event's location", async () => {
    const me = await account();
    const t = await thread(me);
    const { id } = await filedEvent(me, t);
    const { jobId } = await dump(me, "it's not there any more");
    await tool({ tool: "edit_content", jobId, toolCallId: "x1", contentId: id, clearLocation: true });
    expect(await read(id)).toMatchObject({ location: null, place_id: null });
    expect(await resolveJobs()).toEqual([]);
  });

  it("refuses a location the filter would not send", async () => {
    const me = await account();
    const t = await thread(me);
    const { id } = await filedEvent(me, t);
    const { jobId } = await dump(me);
    const res = await tool({ tool: "edit_content", jobId, toolCallId: "x1", contentId: id, location: "Rua Augusta 12" });
    expect(res.json()).toEqual({ ok: false, error: "bad_place_name" });
  });

  it("clears a link's point and keeps it from being read again, but sets none", async () => {
    mapsOn();
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me, "https://www.airbnb.com/rooms/1");
    const filed = await tool({ tool: "add_content", jobId, toolCallId: "l1", threadId: t, title: "Casa Alfama", type: "link", url: "https://www.airbnb.com/rooms/1", worker: { pageRead: true, pageLocation: { lat: 38.7113, lng: -9.1301 } } });
    const id = filed.json().contentId as string;
    const later = await dump(me, "take it off the map");
    const set = await tool({ tool: "edit_content", jobId: later.jobId, toolCallId: "x1", contentId: id, location: "Alfama" });
    expect(set.json()).toEqual({ ok: false, error: "location_not_here" });
    await tool({ tool: "edit_content", jobId: later.jobId, toolCallId: "x2", contentId: id, clearLocation: true });
    const row = await read(id);
    expect(row.place_id).toBeNull();
    expect(row.place_read_at).toBeInstanceOf(Date);
  });

  it("refuses a location on a saved place, and looks it up again on a rename", async () => {
    const me = await account();
    const t = await thread(me);
    const first = await dump(me);
    const filed = await tool({ tool: "add_content", jobId: first.jobId, toolCallId: "p1", threadId: t, title: "Time Out Market", type: "location" });
    const id = filed.json().contentId as string;
    await db.deleteFrom("jobs").where("kind", "=", "location.resolve").execute();
    const later = await dump(me);
    expect((await tool({ tool: "edit_content", jobId: later.jobId, toolCallId: "x1", contentId: id, location: "Alfama" })).json()).toEqual({
      ok: false,
      error: "location_not_here",
    });
    await tool({ tool: "edit_content", jobId: later.jobId, toolCallId: "x2", contentId: id, title: "Cervejaria Ramiro" });
    expect(await resolveJobs()).toEqual([{ contentId: id }]);
  });

  it("refuses another member changing the place on a row that is not theirs (OFF-3)", async () => {
    const ana = await account();
    const t = await thread(ana);
    const { id } = await filedEvent(ana, t);
    const ben = await account();
    await db.insertInto("thread_members").values({ thread_id: t, account_id: ben, state: "accepted" }).execute();
    const { jobId } = await dump(ben);
    for (const change of [{ location: "Cervejaria Ramiro" }, { clearLocation: true }]) {
      const res = await tool({ tool: "edit_content", jobId, toolCallId: `b${Object.keys(change)[0]}`, contentId: id, ...change });
      expect(res.json()).toEqual({ ok: false, error: "not_yours" });
    }
    expect((await read(id)).location).toBe("Time Out Market");
  });

  it("puts the place back when the turn that changed it is undone, and books nothing", async () => {
    const me = await account();
    const t = await thread(me);
    const { id, placeId } = await filedEvent(me, t);
    const { jobId, turnId } = await dump(me, "actually it's at Cervejaria Ramiro");
    await tool({ tool: "edit_content", jobId, toolCallId: "x1", contentId: id, location: "Cervejaria Ramiro" });
    await db.deleteFrom("jobs").where("kind", "=", "location.resolve").execute();
    await undoTurn(me, turnId);
    const row = await db.selectFrom("content").select(["location", "place_id", "place_prior", "deleted_at"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(row).toEqual({ location: "Time Out Market", place_id: placeId, place_prior: null, deleted_at: null });
    expect(await resolveJobs()).toEqual([]);
  });

  it("keeps the old place alive for Undo through the daily sweep", async () => {
    const me = await account();
    const t = await thread(me);
    const { id, placeId } = await filedEvent(me, t);
    const { jobId } = await dump(me);
    await tool({ tool: "edit_content", jobId, toolCallId: "x1", contentId: id, clearLocation: true });
    const { agePlaces } = await import("../src/places/age.js");
    await agePlaces();
    expect(await db.selectFrom("places").select("id").where("id", "=", placeId).executeTakeFirst()).toBeDefined();
  });
});

describe("what no request can set (T1.9, SEC-2)", () => {
  it("refuses the place columns in a tool body", async () => {
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);
    for (const key of ["placeId", "placePrior", "placeReadAt"]) {
      const res = await tool({ tool: "add_content", jobId, toolCallId: key, threadId: t, title: "Dinner", type: "event", [key]: "x" });
      expect(res.statusCode, key).toBe(400);
    }
  });
});
