// 052 T1.6. Pills: what the dump left out, chosen and worded by code from the
// turn's record, at most two, in a fixed order, and never on a turn that asked.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { repliesFor } from "../src/dumps/replies.js";
import { account, dump, join, thread, tool, wipe } from "./labels-kit.js";

let app: App;
await migrate(() => {});
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await db.deleteFrom("turn_changes").execute();
  await db.deleteFrom("connections").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await wipe();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function pills(me: string, turnId: string) {
  const messages = await db.selectFrom("messages").select(["id", "role", "turn_id", "created_at"]).where("turn_id", "=", turnId).execute();
  return (await repliesFor(me, messages)).get(turnId)!.pills;
}

async function writable(me: string, name = "Personal") {
  const conn = await db
    .insertInto("connector_connections")
    .values({ account_id: me, provider: "google", external_account_email: `${name}-${Math.random()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();
  const cal = await db
    .insertInto("connector_calendars")
    .values({ connection_id: conn.id, external_id: `cal-${name}-${Math.random()}`, summary: name, access_role: "owner", selected: true, participants: 1, is_primary: false, colour: "#7986CB" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return cal.id;
}

async function add(jobId: string, threadId: string, over: Record<string, unknown>, id = "c1") {
  const res = await tool(app, { tool: "add_content", jobId, toolCallId: id, threadId, ...over });
  expect(res.statusCode).toBe(200);
}

describe("each pill, alone", () => {
  it("Add a date: one undated to-do", async () => {
    const me = await account();
    const admin = await thread(me, "Admin");
    const d = await dump(me, "renew passport");
    await add(d.jobId, admin, { type: "task", title: "Renew passport" });
    expect((await pills(me, d.turnId)).map((p) => p.kind)).toEqual(["date"]);
  });

  it("Add a date: never for two", async () => {
    const me = await account();
    const admin = await thread(me, "Admin");
    const d = await dump(me, "renew passport and car insurance");
    await add(d.jobId, admin, { type: "task", title: "Renew passport" }, "c1");
    await add(d.jobId, admin, { type: "task", title: "Car insurance" }, "c2");
    expect(await pills(me, d.turnId)).toEqual([]);
  });

  it("Add to a calendar: one timed row on no calendar, one writable calendar", async () => {
    const me = await account();
    const health = await thread(me, "Health");
    const cal = await writable(me);
    const d = await dump(me, "dentist in two days at 3");
    await add(d.jobId, health, { type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    const got = await pills(me, d.turnId);
    expect(got[0]).toMatchObject({ kind: "calendar", calendar: { id: cal, name: "Personal" } });
  });

  it("Add to a calendar: not with two writable calendars", async () => {
    const me = await account();
    const health = await thread(me, "Health");
    await writable(me, "Personal");
    await writable(me, "Work");
    const d = await dump(me, "dentist in two days at 3");
    await add(d.jobId, health, { type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    expect((await pills(me, d.turnId)).map((p) => p.kind)).not.toContain("calendar");
  });

  it("Remind me: a dated row of theirs, in a thread nobody else is in", async () => {
    const me = await account();
    const health = await thread(me, "Health");
    const d = await dump(me, "dentist in two days at 3");
    await add(d.jobId, health, { type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    expect((await pills(me, d.turnId)).map((p) => p.kind)).toContain("remind");
  });

  it("Remind me: never in a shared thread", async () => {
    const me = await account();
    const other = await account("Meera Das");
    const family = await thread(me, "Family");
    await join(family, other);
    const d = await dump(me, "dinner in two days at 7");
    await add(d.jobId, family, { type: "event", title: "Dinner", occursAt: `${day(2)}T19:00` });
    expect((await pills(me, d.turnId)).map((p) => p.kind)).not.toContain("remind");
  });

  it("Share with: a new thread whose dump names a connection", async () => {
    const me = await account();
    const ana = await account("Ana Duarte");
    await db.insertInto("connections").values({ account_a: me < ana ? me : ana, account_b: me < ana ? ana : me }).execute();
    const d = await dump(me, "Porto with Ana in March");
    await tool(app, { tool: "create_thread", jobId: d.jobId, toolCallId: "c1", name: "Porto weekend" });
    expect(await pills(me, d.turnId)).toEqual([{ kind: "share", person: { accountId: ana, name: "Ana Duarte" } }]);
  });

  it("Share with: never from words somebody else wrote", async () => {
    const me = await account();
    const ana = await account("Ana Duarte");
    await db.insertInto("connections").values({ account_a: me < ana ? me : ana, account_b: me < ana ? ana : me }).execute();
    const d = await dump(me, "Porto with Ana in March");
    await db.updateTable("messages").set({ source: "mail" }).where("id", "=", d.messageId).execute();
    await tool(app, { tool: "create_thread", jobId: d.jobId, toolCallId: "c1", name: "Porto weekend" });
    expect(await pills(me, d.turnId)).toEqual([]);
  });

  it("Directions: the one entry has a resolved place", async () => {
    const me = await account();
    const bbq = await thread(me, "Ana's bbq");
    const d = await dump(me, "picnic at Victoria Park");
    await add(d.jobId, bbq, { type: "task", title: "Picnic at Victoria Park" });
    const place = await db.insertInto("places").values({ provider: "google", provider_place_id: `p-${Math.random()}`, lat: 51.53, lng: -0.04, approximate: false }).returning("id").executeTakeFirstOrThrow();
    await db.updateTable("content").set({ place_id: place.id }).where("derived_from_message_id", "=", d.messageId).execute();
    expect((await pills(me, d.turnId)).map((p) => p.kind)).toContain("directions");
  });
});

describe("together", () => {
  it("shows the first two in order: date, calendar, remind, share, directions", async () => {
    const me = await account();
    const health = await thread(me, "Health");
    await writable(me);
    const d = await dump(me, "dentist in two days at 3");
    await add(d.jobId, health, { type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    expect((await pills(me, d.turnId)).map((p) => p.kind)).toEqual(["calendar", "remind"]);
  });

  it("offers none on a turn that asked a question", async () => {
    const me = await account();
    const admin = await thread(me, "Admin");
    const d = await dump(me, "renew passport");
    await add(d.jobId, admin, { type: "task", title: "Renew passport" });
    const row = await db.selectFrom("content").select("id").where("derived_from_message_id", "=", d.messageId).executeTakeFirstOrThrow();
    await sql`
      insert into questions (account_id, conversation_id, turn_id, message_id, ordinal, field, target_content_id, options, text, state)
      values (${me}::uuid, ${d.conversationId}::uuid, ${d.turnId}::uuid, ${d.messageId}::uuid, 1, 'date', ${row.id}::uuid, '[]'::jsonb, 'Filed "Renew passport". By when?', 'open')`.execute(db);
    expect(await pills(me, d.turnId)).toEqual([]);
  });

  it("offers none on a turn that only ticked or remembered", async () => {
    const me = await account();
    const d = await dump(me, "remember Meera is allergic to cashews");
    await tool(app, { tool: "memory", jobId: d.jobId, toolCallId: "c1", action: "remember", text: "Meera is allergic to cashews", kind: "people" });
    expect(await pills(me, d.turnId)).toEqual([]);
  });
});

describe("the tap (T1.7)", () => {
  const tap = async (me: string, turnId: string, payload: Record<string, unknown>) => {
    const { as, signIn } = await import("./labels-kit.js");
    return as(app, await signIn(me)).post(`/v1/turns/${turnId}/pills`, payload);
  };

  it("Remind me switches the row's Remind me on, and undo switches it off", async () => {
    const me = await account();
    const health = await thread(me, "Health");
    const d = await dump(me, "dentist in two days at 3");
    await add(d.jobId, health, { type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    const row = await db.selectFrom("content").select("id").where("derived_from_message_id", "=", d.messageId).executeTakeFirstOrThrow();
    expect((await tap(me, d.turnId, { kind: "remind" })).json()).toEqual({ ok: true });
    expect((await db.selectFrom("content").select("is_reminder").where("id", "=", row.id).executeTakeFirstOrThrow()).is_reminder).toBe(true);
    expect((await tap(me, d.turnId, { kind: "remind", undo: true })).json()).toEqual({ ok: true });
    expect((await db.selectFrom("content").select("is_reminder").where("id", "=", row.id).executeTakeFirstOrThrow()).is_reminder).toBe(false);
  });

  it("refuses a kind the turn does not offer, and another account's turn", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const admin = await thread(me, "Admin");
    const d = await dump(me, "renew passport");
    await add(d.jobId, admin, { type: "task", title: "Renew passport" });
    expect((await tap(me, d.turnId, { kind: "remind" })).statusCode).toBe(409);
    expect((await tap(other, d.turnId, { kind: "remind" })).statusCode).toBe(404);
  });

  it("refuses a caller who has left the thread", async () => {
    const me = await account();
    const them = await account("Tom Reilly");
    const shared = await thread(them, "Their thread");
    await join(shared, me);
    const d = await dump(me, "dentist in two days at 3");
    await add(d.jobId, shared, { type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", shared).where("account_id", "=", me).execute();
    expect((await tap(me, d.turnId, { kind: "remind" })).statusCode).toBe(409);
  });
});
