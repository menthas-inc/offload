// 026. What a processed email writes in Activity, and its Undo
// (AC-15, AC-16, AC-17).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { receiveMail } from "../src/mail-in/receive.js";
import { resetObjectStore } from "../src/blobs/store.js";
import { as, signIn, thread, wipe } from "./labels-kit.js";
import { DOMAIN, person, raw, resolver, signed } from "./mail-kit.js";

await migrate(() => {});
let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

let jo: string;
beforeEach(async () => {
  resetObjectStore();
  await sql`delete from mail_signatures`.execute(db);
  await db.deleteFrom("blobs").execute();
  await wipe();
  jo = await person(`jo@${DOMAIN}`);
});

async function forwarded(subject = "Booking LX3K9", body = "Flights on 3 and 10 October. A PDF is attached.") {
  await receiveMail(await signed(raw({ subject, body })), { resolver: resolver() });
  const job = await db
    .selectFrom("jobs")
    .select(["id", "payload"])
    .where("account_id", "=", jo)
    .where("kind", "=", "dump.answer")
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();
  const { messageId, turnId } = job.payload as { messageId: string; turnId: string };
  return { jobId: job.id, messageId, turnId };
}

async function file(messageId: string, threadId: string, title: string) {
  return (
    await db
      .insertInto("content")
      .values({ account_id: jo, thread_id: threadId, type: "event", title, derived_from_message_id: messageId, updated_at: new Date() } as never)
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const result = (jobId: string, outcome: "answered" | "failed" = "answered") =>
  app.inject({
    method: "POST",
    url: "/internal/v1/turn-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: outcome === "answered" ? { outcome, jobId, usage: [] } : { outcome, jobId, reason: "invalid_output" },
  });

const rows = () => db.selectFrom("activity").selectAll().where("account_id", "=", jo).where("kind", "=", "mail").execute();

describe("the Activity row (AC-15, AC-17)", () => {
  it("names the one row that landed and where, with the subject quoted", async () => {
    const trip = await thread(jo, "Lisbon trip");
    const { jobId, messageId } = await forwarded("Your appointment is confirmed");
    const dentist = await file(messageId, trip, "Dentist, Tuesday 15:00");
    expect((await result(jobId)).statusCode).toBe(200);
    const [row, ...rest] = await rows();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      mail_outcome: "filed",
      sent: false,
      reason: "design",
      title: "Dentist, Tuesday 15:00, in Lisbon trip",
      body: "From an email, “Your appointment is confirmed”.",
      content_id: dentist,
      thread_id: trip,
      message_id: messageId,
    });
  });

  it("counts several in one thread, and opens the thread", async () => {
    const trip = await thread(jo, "Lisbon trip");
    const { jobId, messageId } = await forwarded();
    await file(messageId, trip, "Flight out");
    await file(messageId, trip, "Flight back");
    await result(jobId);
    const [row] = await rows();
    expect(row).toMatchObject({ title: "Two into Lisbon trip, from an email", body: "“Booking LX3K9”.", thread_id: trip, content_id: null });
  });

  it("counts several across threads, and opens the email", async () => {
    const { jobId, messageId } = await forwarded();
    await file(messageId, await thread(jo, "A"), "One");
    await file(messageId, await thread(jo, "B"), "Two");
    await result(jobId);
    const [row] = await rows();
    expect(row).toMatchObject({ title: "Two from an email", thread_id: null, content_id: null, message_id: messageId });
  });

  it("says a question was asked", async () => {
    const { jobId, messageId, turnId } = await forwarded("Parents' evening");
    const message = await db.selectFrom("messages").select("conversation_id").where("id", "=", messageId).executeTakeFirstOrThrow();
    await db
      .insertInto("questions")
      .values({
        account_id: jo, conversation_id: message.conversation_id, message_id: messageId, turn_id: turnId,
        ordinal: 1, options: JSON.stringify([]), field: "date", text: "When?", state: "open",
      } as never)
      .execute();
    await result(jobId);
    const [row] = await rows();
    expect(row).toMatchObject({ mail_outcome: "asked", title: "A question about an email", body: "“Parents' evening”.", message_id: messageId });
  });

  it("says nothing was filed, and opens the email, when the turn filed nothing or failed", async () => {
    const { jobId, messageId } = await forwarded("Newsletter");
    await result(jobId, "failed");
    const [row] = await rows();
    expect(row).toMatchObject({ mail_outcome: "nothing", title: "Nothing filed from an email", body: "“Newsletter”.", message_id: messageId });
  });

  it("writes one row for the email however many results arrive", async () => {
    const trip = await thread(jo, "Lisbon trip");
    const { jobId, messageId } = await forwarded();
    await file(messageId, trip, "Flight out");
    await result(jobId);
    await result(jobId);
    expect(await rows()).toHaveLength(1);
  });

  it("writes nothing for a dump that is not an email", async () => {
    const { dump } = await import("./labels-kit.js");
    const { jobId } = await dump(jo, "milk");
    await result(jobId);
    expect(await rows()).toEqual([]);
  });
});

describe("Undo from Activity (AC-16)", () => {
  async function filedRow() {
    const trip = await thread(jo, "Lisbon trip");
    const { jobId, messageId } = await forwarded();
    const out = await file(messageId, trip, "Flight out");
    const back = await file(messageId, trip, "Flight back");
    await result(jobId);
    const [row] = await rows();
    return { row: row!, out, back, messageId };
  }
  const undo = async (id: string, accountId = jo) => as(app, await signIn(accountId)).post(`/v1/activity/${id}/undo`);

  it("takes back what the turn filed and keeps the email", async () => {
    const { row, out, back, messageId } = await filedRow();
    expect((await undo(row.id)).statusCode).toBe(200);
    const live = await db.selectFrom("content").select("id").where("id", "in", [out, back]).where("deleted_at", "is", null).execute();
    expect(live).toEqual([]);
    const email = await db.selectFrom("messages").select("deleted_at").where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(email.deleted_at).toBeNull();
    const after = await db.selectFrom("activity").select("undone_at").where("id", "=", row.id).executeTakeFirstOrThrow();
    expect(after.undone_at).not.toBeNull();
  });

  it("keeps the record after the purge takes the undone rows", async () => {
    const trip = await thread(jo, "Health");
    const { jobId, messageId } = await forwarded("Your appointment is confirmed");
    const dentist = await file(messageId, trip, "Dentist");
    await result(jobId);
    const [row] = await rows();
    expect(row!.content_id).toBe(dentist);
    await undo(row!.id);
    // The purge's hard delete, eight seconds on.
    await db.deleteFrom("content").where("id", "=", dentist).execute();
    const kept = await db.selectFrom("activity").select(["id", "undone_at", "content_id"]).where("id", "=", row!.id).executeTakeFirst();
    expect(kept).toMatchObject({ id: row!.id, content_id: null });
    expect(kept!.undone_at).not.toBeNull();
  });

  it("leaves a row somebody changed since", async () => {
    const { row, out, back } = await filedRow();
    await db.updateTable("content").set({ title: "Flight out, seat 12A", updated_at: sql`now() + interval '1 minute'` }).where("id", "=", out).execute();
    await undo(row.id);
    const live = await db.selectFrom("content").select("id").where("id", "in", [out, back]).where("deleted_at", "is", null).execute();
    expect(live.map((r) => r.id)).toEqual([out]);
  });

  it("is offered for a day and not after", async () => {
    const { row } = await filedRow();
    const read = async () => (await as(app, await signIn(jo)).get("/v1/activity")).json().rows[0];
    expect((await read()).undoable).toBe(true);
    await db.updateTable("activity").set({ occurred_at: sql`now() - interval '24 hours 1 minute'` }).where("id", "=", row.id).execute();
    expect((await read()).undoable).toBe(false);
    expect((await undo(row.id)).statusCode).toBe(409);
  });

  it("is nobody else's to press", async () => {
    const { row } = await filedRow();
    const other = await person();
    expect((await undo(row.id, other)).statusCode).toBe(404);
  });

  it("is not offered on a row that filed nothing", async () => {
    const { jobId } = await forwarded("Newsletter");
    await result(jobId, "failed");
    const [row] = await rows();
    expect((await undo(row!.id)).statusCode).toBe(404);
  });
});

describe("/api/me says whether mail can reach this account (AC-18)", () => {
  it("is true for an ordinary address and false for Apple's private relay", async () => {
    const me = async (accountId: string) => (await as(app, await signIn(accountId)).get("/api/me")).json();
    expect((await me(jo)).mailAvailable).toBe(true);
    const hidden = await person("x7q2k9@privaterelay.appleid.com");
    expect((await me(hidden)).mailAvailable).toBe(false);
  });
});

describe("the conversation draws an email as one (AC-5)", () => {
  it("carries the subject on a mail message and null on anything else", async () => {
    await forwarded("Your appointment is confirmed");
    const tail = (await as(app, await signIn(jo)).get("/v1/conversations/current")).json();
    const [message] = tail.messages;
    expect(message.mail).toEqual({ subject: "Your appointment is confirmed", note: "Flights on 3 and 10 October. A PDF is attached." });
    const { dump } = await import("./labels-kit.js");
    const other = await person();
    await dump(other, "milk");
    const theirs = (await as(app, await signIn(other)).get("/v1/conversations/current")).json();
    expect(theirs.messages[0].mail).toBeNull();
  });
});

describe("the conversation shows the person's note, not the forwarded header", () => {
  it("carries the note above the forwarded part", async () => {
    const body = "for the trip\r\n\r\n---------- Forwarded message ---------\r\nFrom: a@b.test\r\n\r\nFlights.";
    await forwarded("Booking LX3K9", body);
    const tail = (await as(app, await signIn(jo)).get("/v1/conversations/current")).json();
    expect(tail.messages[0].mail).toEqual({ subject: "Booking LX3K9", note: "for the trip" });
  });
});


describe("a question a mail turn asks (SEC-1)", () => {
  it("is marked as derived from somebody else's words", async () => {
    const trip = await thread(jo, "Health");
    const { jobId, messageId, turnId } = await forwarded("Parents' evening");
    const contentId = await file(messageId, trip, "Parents' evening");
    const res = await app.inject({
      method: "POST",
      url: "/internal/v1/turn-result",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: {
        outcome: "answered",
        jobId,
        usage: [],
        questions: [
          { field: "date", title: "Parents' evening", contentId, options: [{ label: "Thursday", value: "2026-10-08" }] },
        ],
      },
    });
    expect(res.json()).toEqual({ status: "written" });
    const q = await db.selectFrom("questions").select("derived_from_untrusted").where("turn_id", "=", turnId).executeTakeFirstOrThrow();
    expect(q.derived_from_untrusted).toBe(true);
  });
});
