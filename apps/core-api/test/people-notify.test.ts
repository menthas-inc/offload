// 024 D1 and D2: the people sends. (AC-7)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { bucketOf, noteAddition, notifyPerson, notifySharedActivity } from "../src/notifications/people.js";
import { MemoryPush, PushFailed, push } from "../src/notifications/push.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const memory = push() as MemoryPush;

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("accounts").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("analytics_events").execute();
  memory.sent.length = 0;
});

async function account(over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), display_name: "Ana", ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function token(accountId: string): Promise<string> {
  const value = `ExponentPushToken[${uuidv7().replace(/-/g, "").slice(-16)}]`;
  const session = await db
    .insertInto("sessions")
    .values({ account_id: accountId, token: uuidv7(), expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("push_tokens").values({ account_id: accountId, session_id: session.id, token: value, platform: "android" }).execute();
  return value;
}

async function activityOf(accountId: string) {
  return db.selectFrom("activity").select(["kind", "sent", "reason", "title", "body"]).where("account_id", "=", accountId).execute();
}

describe("024 AC-7 a connection request", () => {
  it("sends once it is delivered and still open, to the recipient's switch, and records it", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    await token(sam);
    const request = await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: sam, delivered: true, expires_at: sql`now() + interval '30 days'` } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await notifyPerson({ kind: "request", requestId: request.id })).toBe("sent");
    expect(memory.sent.map((m) => [m.title, m.body, m.channelId, m.data])).toEqual([["Ana wants to connect", "Answer in My people.", "people_requests", { kind: "request" }]]);
    expect(await activityOf(sam)).toEqual([{ kind: "request", sent: true, reason: null, title: "Ana wants to connect", body: "Answer in My people." }]);

    // Withdrawn before the send: nothing.
    await db.updateTable("connection_requests").set({ withdrawn_at: new Date() }).where("id", "=", request.id).execute();
    expect(await notifyPerson({ kind: "request", requestId: request.id })).toBe("gone");
    expect(memory.sent).toHaveLength(1);
  });

  it("reaches no phone whose session has expired, and records that as not sent by permission", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    await token(sam);
    await db.updateTable("sessions").set({ expires_at: new Date(Date.now() - 60_000) }).where("account_id", "=", sam).execute();
    const request = await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: sam, delivered: true, expires_at: sql`now() + interval '30 days'` } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    await notifyPerson({ kind: "request", requestId: request.id });
    expect(memory.sent).toEqual([]);
    expect(await activityOf(sam)).toEqual([{ kind: "request", sent: false, reason: "permission", title: "Ana wants to connect", body: "Answer in My people." }]);
  });

  it("is not sent when it was never delivered, or when the switch is off", async () => {
    const ana = await account();
    const blocker = await account({ notify_people_requests: true });
    await token(blocker);
    const undelivered = await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: blocker, delivered: false, expires_at: sql`now() + interval '30 days'` } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await notifyPerson({ kind: "request", requestId: undelivered.id })).toBe("gone");
    const quiet = await account({ notify_people_requests: false });
    await token(quiet);
    const open = await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: quiet, delivered: true, expires_at: sql`now() + interval '30 days'` } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await notifyPerson({ kind: "request", requestId: open.id })).toBe("skipped");
    expect(memory.sent).toEqual([]);
    expect(await activityOf(quiet)).toEqual([]);
  });
});

describe("024 AC-7 a share, and additions to a shared thread", () => {
  it("a share says the thread's name once and lands on the invitation", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    await token(sam);
    const thread = await db.insertInto("threads").values({ name: "Lisbon trip" } as never).returning("id").executeTakeFirstOrThrow();
    await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: ana, state: "accepted" } as never).execute();
    const member = await db
      .insertInto("thread_members")
      .values({ thread_id: thread.id, account_id: sam, state: "pending", invited_by: ana, expires_at: sql`now() + interval '30 days'` } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await notifyPerson({ kind: "share", memberId: member.id })).toBe("sent");
    expect(memory.sent.map((m) => [m.title, m.body, m.channelId, m.data])).toEqual([
      ["Ana shared Lisbon trip", "Waiting in My threads.", "shared_activity", { kind: "share", memberId: member.id }],
    ]);
    expect(await activityOf(sam)).toEqual([{ kind: "share", sent: true, reason: null, title: "Ana shared Lisbon trip", body: "Waiting in My threads." }]);
  });

  // 034 AC-12. A disabled member gets no push and no record of one.
  it("sends an addition to nobody who is disabled or marked for deletion", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam", state: "disabled" });
    const tom = await account({ display_name: "Tom", delete_after: new Date(Date.now() + 86_400_000) });
    await token(sam);
    await token(tom);
    const thread = await db.insertInto("threads").values({ name: "Lisbon trip" } as never).returning("id").executeTakeFirstOrThrow();
    for (const member of [ana, sam, tom]) {
      await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: member, state: "accepted" } as never).execute();
    }
    const now = new Date();
    await noteAddition(thread.id, ana, now);
    const [job] = await db.selectFrom("jobs").select("payload").where("kind", "=", "shared.activity").execute();
    await db.insertInto("content").values({ account_id: ana, thread_id: thread.id, title: "Ferry times", type: "task" } as never).execute();
    expect(await notifySharedActivity({ threadId: thread.id, authorId: ana, since: (job!.payload as { since: string }).since })).toBe(0);
    expect(memory.sent).toEqual([]);
    expect(await activityOf(sam)).toEqual([]);
    expect(await activityOf(tom)).toEqual([]);
  });

  it("additions coalesce per thread, author and ten minutes, and are composed at send time from what each member may still read", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    const tom = await account({ display_name: "Tom", notify_shared_activity: false });
    await token(sam);
    await token(tom);
    const thread = await db.insertInto("threads").values({ name: "Lisbon trip" } as never).returning("id").executeTakeFirstOrThrow();
    for (const member of [ana, sam, tom]) {
      await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: member, state: "accepted" } as never).execute();
    }
    const now = new Date();
    await noteAddition(thread.id, ana, now);
    await noteAddition(thread.id, ana, now);
    const jobs = await db.selectFrom("jobs").select(["idempotency_key", "payload"]).where("kind", "=", "shared.activity").execute();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.idempotency_key).toBe(`shared.activity:${thread.id}:${ana}:${bucketOf(now)}`);
    const since = (jobs[0]?.payload as { since: string }).since;

    for (const title of ["Ferry times", "a place in Alfama", "Deleted before the send"]) {
      await db.insertInto("content").values({ account_id: ana, thread_id: thread.id, title, type: "task" } as never).execute();
    }
    await db.updateTable("content").set({ deleted_at: new Date() }).where("title", "=", "Deleted before the send").execute();
    // Their own additions are nobody's news, and Tom's switch is off.
    expect(await notifySharedActivity({ threadId: thread.id, authorId: ana, since })).toBe(1);
    expect(memory.sent.map((m) => [m.to.startsWith("ExponentPushToken"), m.title, m.body, m.data])).toEqual([
      [true, "Ana added two to Lisbon trip", "Ferry times, and a place in Alfama.", { kind: "shared_activity", threadId: thread.id }],
    ]);
    expect(await activityOf(sam)).toEqual([{ kind: "shared_activity", sent: true, reason: null, title: "Ana added two to Lisbon trip", body: "Ferry times, and a place in Alfama." }]);
    expect(await activityOf(tom)).toEqual([]);
    expect(await activityOf(ana)).toEqual([]);
  });
});

describe("034 merge: the order additions are named in", () => {
  // A row's moment has microseconds and a JavaScript Date has milliseconds.
  // Two rows made inside one millisecond tied in the sort, and the order was
  // whatever the table handed back.
  it("names two additions made in the same millisecond in the order they were made", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    await token(sam);
    const thread = await db.insertInto("threads").values({ name: "Lisbon trip" } as never).returning("id").executeTakeFirstOrThrow();
    for (const member of [ana, sam]) {
      await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: member, state: "accepted" } as never).execute();
    }
    await noteAddition(thread.id, ana, new Date());
    const job = await db.selectFrom("jobs").select("payload").where("kind", "=", "shared.activity").executeTakeFirstOrThrow();
    const since = (job.payload as { since: string }).since;
    // The later one is written first, so the table's own order is the wrong one.
    for (const [title, micros] of [["a place in Alfama", 700], ["Ferry times", 200]] as const) {
      await sql`
        insert into content (account_id, thread_id, title, type, created_at)
        values (${ana}, ${thread.id}, ${title}, 'task', ${since}::timestamptz + make_interval(secs => ${micros / 1_000_000}))`.execute(db);
    }
    expect(await notifySharedActivity({ threadId: thread.id, authorId: ana, since })).toBe(1);
    expect(memory.sent.map((m) => m.body)).toEqual(["Ferry times, and a place in Alfama."]);
  });
});

describe("024 review of 2026-09-22: what the send is composed from, and what fails it", () => {
  it("a note typed into a shared thread reaches the others too, as its text", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    await token(sam);
    const thread = await db.insertInto("threads").values({ name: "Lisbon trip" } as never).returning("id").executeTakeFirstOrThrow();
    for (const member of [ana, sam]) {
      await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: member, state: "accepted" } as never).execute();
    }
    const now = new Date();
    await noteAddition(thread.id, ana, now);
    const job = await db.selectFrom("jobs").select("payload").where("kind", "=", "shared.activity").executeTakeFirstOrThrow();
    const since = (job.payload as { since: string }).since;
    await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "thread", subject_id: thread.id, kind: "going_on", text: "Ferry leaves at nine", origin: "stated" } as never)
      .execute();
    expect(await notifySharedActivity({ threadId: thread.id, authorId: ana, since })).toBe(1);
    expect(memory.sent.map((m) => [m.title, m.body])).toEqual([["Ana added one to Lisbon trip", "Ferry leaves at nine."]]);
  });

  it("a ticket the service refuses for any reason but a gone device fails the job with the code, and records nothing as sent", async () => {
    const ana = await account({ display_name: "Ana" });
    const sam = await account({ display_name: "Sam" });
    await token(sam);
    const request = await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: sam, delivered: true, expires_at: sql`now() + interval '30 days'` } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    const send = memory.send;
    memory.send = async (messages) => messages.map((message) => ({ token: message.to, ok: false as const, code: "InvalidCredentials" }));
    try {
      await expect(notifyPerson({ kind: "request", requestId: request.id })).rejects.toBeInstanceOf(PushFailed);
    } finally {
      memory.send = send;
    }
    expect(await activityOf(sam)).toEqual([]);
    const events = await db.selectFrom("analytics_events").select(["name", "properties"]).where("name", "in", ["notification_sent", "notification_failed"]).execute();
    expect(events.map((event) => [event.name, event.properties])).toEqual([["notification_failed", { kind: "request", status: 200, code: "InvalidCredentials" }]]);
    // The token stays: the service did not say the device is gone.
    expect(await db.selectFrom("push_tokens").select("id").where("account_id", "=", sam).execute()).toHaveLength(1);
  });

  it("the addition job is enqueued inside the caller's transaction, so a rolled-back insert leaves no job", async () => {
    const ana = await account();
    const thread = await db.insertInto("threads").values({ name: "Lisbon trip" } as never).returning("id").executeTakeFirstOrThrow();
    await db
      .transaction()
      .execute(async (trx) => {
        await noteAddition(thread.id, ana, new Date(), trx);
        throw new Error("rolled back");
      })
      .catch(() => undefined);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "shared.activity").execute()).toEqual([]);
  });
});
