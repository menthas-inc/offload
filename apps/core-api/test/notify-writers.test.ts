// 024 D1 to D4: the writers that feed the sends and the silences. (AC-7, AC-17, AC-20)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { request, sweepPeople } from "../src/people/people.js";
import { record } from "../src/notifications/activity.js";
import { quickAdd } from "../src/routes/threads.js";
import { takeOut } from "../src/threads/sharing.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("accounts").execute();
  await db.deleteFrom("threads").execute();
});

async function account(name = "Ana"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), display_name: name } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(members: string[], name = "Lisbon trip"): Promise<string> {
  const row = await db.insertInto("threads").values({ name } as never).returning("id").executeTakeFirstOrThrow();
  for (const member of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: member, state: "accepted" } as never).execute();
  }
  return row.id;
}

async function jobsOf(kind: string) {
  return db.selectFrom("jobs").select(["kind", "account_id", "payload", "idempotency_key"]).where("kind", "=", kind).execute();
}

describe("024 D1 a request and a share are announced by a job", () => {
  it("a delivered request enqueues one send to the recipient, keyed on the request; an undelivered one enqueues nothing", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const asked = await request(ana, sam);
    expect(asked.ok).toBe(true);
    const jobs = await jobsOf("people.notify");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ account_id: sam, payload: { kind: "request", requestId: (asked as { requestId: string }).requestId } });

    const wary = await account("Tom");
    await db.insertInto("blocks").values({ blocker_account_id: wary, blocked_account_id: ana } as never).execute();
    const blocked = await request(ana, wary);
    expect(blocked.ok).toBe(true);
    expect(await jobsOf("people.notify")).toHaveLength(1);
  });
});

describe("024 D3 what expires unanswered lands in the sender's record", () => {
  it("an expired request and an expired share write one row each, quietly, with the other's name", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: sam, delivered: true, expires_at: sql`now() - interval '1 hour'` } as never)
      .execute();
    const trip = await thread([ana]);
    await db
      .insertInto("thread_members")
      .values({ thread_id: trip, account_id: sam, state: "pending", invited_by: ana, expires_at: sql`now() - interval '1 hour'` } as never)
      .execute();
    await sweepPeople();
    const rows = await db.selectFrom("activity").select(["kind", "sent", "reason", "title", "body"]).where("account_id", "=", ana).orderBy("title").execute();
    expect(rows).toEqual([
      { kind: "expired", sent: false, reason: "design", title: "Your invite to Sam expired", body: "Thirty days, no answer." },
      { kind: "expired", sent: false, reason: "design", title: "Your request to Sam expired", body: "Thirty days, no answer." },
    ]);
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", sam).execute()).toEqual([]);
    // A second sweep finds nothing left to expire and writes nothing more.
    await sweepPeople();
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", ana).execute()).toHaveLength(2);
  });
});

describe("024 D2 an addition to a thread reaches the others, coalesced", () => {
  it("a typed row enqueues the thread's addition job for its author", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread([ana, sam]);
    await quickAdd(ana, trip, "Ferry times", "todo");
    const jobs = await jobsOf("shared.activity");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ account_id: ana, payload: { threadId: trip, authorId: ana } });
    expect(jobs[0]?.idempotency_key).toMatch(new RegExp(`^shared.activity:${trip}:${ana}:\\d+$`));
  });
});

describe("024 D4 the rows that named a member's words go with the membership", () => {
  it("taking somebody out purges their rows about the thread and the others' rows about them", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread([ana, sam]);
    const other = await thread([ana, sam], "Flat admin");
    await record(sam, { kind: "shared_activity", sent: true, title: "Ana added two to Lisbon trip", body: "Ferry times.", threadId: trip, aboutAccountId: ana });
    await record(ana, { kind: "shared_activity", sent: true, title: "Sam added one to Lisbon trip", body: "Dinner.", threadId: trip, aboutAccountId: sam });
    await record(ana, { kind: "shared_activity", sent: true, title: "Sam added one to Flat admin", body: "Bins.", threadId: other, aboutAccountId: sam });
    await record(sam, { kind: "digest", sent: true, title: "Due today", body: "Pay the rent.", send: "morning" });
    // A digest that named Ana's words in the trip, and one that named nobody's.
    await record(sam, { kind: "digest", sent: true, title: "Tomorrow", body: "Ana's ferry times.", send: "evening", mentions: [{ threadId: trip, aboutAccountId: ana }] });
    await record(ana, { kind: "digest", sent: true, title: "Tomorrow", body: "Sam's dinner.", send: "evening", mentions: [{ threadId: trip, aboutAccountId: sam }] });
    await takeOut(ana, trip, sam);
    const titles = async (who: string) => (await db.selectFrom("activity").select("title").where("account_id", "=", who).orderBy("title").execute()).map((row) => row.title);
    expect(await titles(sam)).toEqual(["Due today"]);
    expect(await titles(ana)).toEqual(["Sam added one to Flat admin"]);
  });
});
