// 024 C4: the two digests, placed and decided. (AC-1 to AC-4, AC-6, AC-8)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { composeDigest, placements, queuedDigests, readReceipts, runDigest, RULE_ROWS_CAP, scheduleDigests } from "../src/notifications/digest.js";
import { MemoryPush, PushFailed, push } from "../src/notifications/push.js";
import { uuidv7 } from "../src/uuid.js";
import { addUtcDays } from "@offload/widgets";

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

const TODAY = "2026-09-22";

async function account(over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      analytics_subject_id: uuidv7(),
      display_name: "Ana",
      time_zone: "Europe/Lisbon",
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(members: string[], name = "Flat admin"): Promise<string> {
  const row = await db.insertInto("threads").values({ name } as never).returning("id").executeTakeFirstOrThrow();
  for (const member of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: member, state: "accepted" } as never).execute();
  }
  return row.id;
}

async function reminder(accountId: string, threadId: string, title: string, day: string, over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: threadId,
      title,
      type: "task",
      is_reminder: true,
      due_at: new Date(`${day}T12:00:00Z`),
      attrs: { all_day: true },
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A phone's token, registered by a session of its own that is still live. */
async function token(accountId: string, token = `ExponentPushToken[${uuidv7().replace(/-/g, "").slice(-16)}]`): Promise<string> {
  const session = await db
    .insertInto("sessions")
    .values({ account_id: accountId, token: uuidv7(), expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("push_tokens").values({ account_id: accountId, session_id: session.id, token, platform: "ios" }).execute();
  return token;
}

async function activityOf(accountId: string) {
  return db.selectFrom("activity").select(["kind", "sent", "reason", "title", "body", "send", "content_id"]).where("account_id", "=", accountId).execute();
}

const at = (iso: string) => new Date(iso);

describe("024 AC-1 placing the sends", () => {
  it("places a send whose hour falls in the coming hour, in the account's zone, and nothing for an account without a clock", () => {
    const lisbon = { id: "a", zone: "Europe/Lisbon", morningAt: "08:00:00", eveningAt: "19:00:00" };
    // 07:00Z is 08:00 in Lisbon in September.
    expect(placements([lisbon], at("2026-09-22T06:30:00Z"))).toEqual([{ accountId: "a", send: "morning", day: "2026-09-22", runAfter: at("2026-09-22T07:00:00Z") }]);
    expect(placements([lisbon], at("2026-09-22T06:00:00Z"))).toEqual([]);
    expect(placements([lisbon], at("2026-09-22T17:30:00Z"))).toEqual([{ accountId: "a", send: "evening", day: "2026-09-22", runAfter: at("2026-09-22T18:00:00Z") }]);
    expect(placements([{ ...lisbon, zone: null }], at("2026-09-22T06:30:00Z"))).toEqual([]);
  });

  it("follows the clock change: 08:00 in Lisbon is 07:00Z on 24 October and 08:00Z on 26 October", () => {
    const lisbon = { id: "a", zone: "Europe/Lisbon", morningAt: "08:00:00", eveningAt: "19:00:00" };
    expect(placements([lisbon], at("2026-10-24T06:30:00Z")).map((p) => p.runAfter.toISOString())).toEqual(["2026-10-24T07:00:00.000Z"]);
    expect(placements([lisbon], at("2026-10-26T07:30:00Z")).map((p) => p.runAfter.toISOString())).toEqual(["2026-10-26T08:00:00.000Z"]);
    // Tokyo's evening of the 22nd is the morning of the 22nd in UTC.
    const tokyo = { id: "b", zone: "Asia/Tokyo", morningAt: "08:00:00", eveningAt: "19:00:00" };
    expect(placements([tokyo], at("2026-09-22T09:30:00Z"))).toEqual([{ accountId: "b", send: "evening", day: "2026-09-22", runAfter: at("2026-09-22T10:00:00Z") }]);
  });

  it("writes one job per account, day and send, and a second pass collapses into it", async () => {
    // Tokyo keeps one offset all year, so the arithmetic does not depend on
    // the day this runs: 08:00 there is 23:00Z the day before.
    const me = await account({ time_zone: "Asia/Tokyo" });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const now = new Date(`${tomorrow}T22:30:00Z`);
    expect(await scheduleDigests(now)).toBe(1);
    expect(await scheduleDigests(now)).toBe(1);
    const jobs = await db.selectFrom("jobs").select(["idempotency_key", "payload", "max_attempts"]).where("kind", "=", "account.digest").execute();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.idempotency_key).toMatch(new RegExp(`^account.digest:${me}:\\d{4}-\\d{2}-\\d{2}:morning$`));
    expect(jobs[0]?.max_attempts).toBe(2);
    expect(await queuedDigests(me)).toHaveLength(1);
  });
});

describe("024 AC-2 and AC-4 the morning send", () => {
  it("names what is due today, adds one sentence for what is one to seven days late, and not eight", async () => {
    const me = await account();
    const th = await thread([me]);
    await reminder(me, th, "Pay the rent", TODAY);
    await reminder(me, th, "Call the clinic", "2026-09-15");
    await reminder(me, th, "Buy stamps", "2026-09-14");
    await reminder(me, th, "Done already", TODAY, { done_at: new Date() });
    await reminder(me, th, "Not a reminder", TODAY, { is_reminder: false });
    await reminder(me, th, "Deleted", TODAY, { deleted_at: new Date() });
    await reminder(me, th, "Archived", TODAY, { archived_at: new Date() });
    const composed = await composeDigest(me, "morning", TODAY);
    expect(composed.rows.map((row) => row.title)).toEqual(["Pay the rent"]);
    expect(composed.overdue.map((row) => row.title)).toEqual(["Call the clinic"]);
  });

  it("reads a timed row in the account's zone: 23:30 in Lisbon is tomorrow in UTC and today here", async () => {
    const me = await account();
    const th = await thread([me]);
    await reminder(me, th, "Late call", TODAY, { due_at: new Date("2026-09-22T22:30:00Z"), attrs: { all_day: false } });
    const composed = await composeDigest(me, "morning", TODAY);
    expect(composed.rows.map((row) => row.title)).toEqual(["Late call"]);
  });

  it("never counts a repeating row as overdue, and names it on the days its rule lands", async () => {
    const me = await account();
    const th = await thread([me]);
    // Every Tuesday since two weeks ago: today is a Tuesday.
    await reminder(me, th, "Yoga", "2026-09-08", { rrule: "FREQ=WEEKLY;BYDAY=TU" });
    await reminder(me, th, "Stretch", "2026-09-09", { rrule: "FREQ=WEEKLY;BYDAY=WE" });
    const composed = await composeDigest(me, "morning", TODAY);
    expect(composed.rows.map((row) => row.title)).toEqual(["Yoga"]);
    expect(composed.overdue).toEqual([]);
  });

  it("names another member's row with its author, resolved through the membership at send time", async () => {
    const me = await account();
    const ana = await account({ display_name: "Ana" });
    const nameless = await account({ display_name: null });
    const shared = await thread([me, ana, nameless], "Lisbon trip");
    await reminder(ana, shared, "ferry times", TODAY);
    await reminder(nameless, shared, "the museum", TODAY);
    const left = await thread([me], "Old thread");
    await reminder(me, left, "Not mine any more", TODAY);
    await db.updateTable("thread_members").set({ state: "removed" } as never).where("thread_id", "=", left).where("account_id", "=", me).execute();
    const composed = await composeDigest(me, "morning", TODAY);
    expect(composed.rows.map((row) => [row.title, row.author]).sort()).toEqual([
      ["ferry times", "Ana"],
      ["the museum", ""],
    ]);
  });
});

describe("024 AC-3 the evening send", () => {
  it("names what is due tomorrow and a rule landing tomorrow, and is skipped when its set is the morning's", async () => {
    const me = await account();
    const th = await thread([me]);
    await reminder(me, th, "Dentist", "2026-09-23");
    await reminder(me, th, "Stretch", "2026-09-09", { rrule: "FREQ=WEEKLY;BYDAY=WE" });
    const composed = await composeDigest(me, "evening", TODAY);
    expect(composed.rows.map((row) => [row.title, row.repeating]).sort()).toEqual([
      ["Dentist", false],
      ["Stretch", true],
    ]);

    const daily = await account();
    const th2 = await thread([daily]);
    await token(daily);
    await reminder(daily, th2, "Take the pills", "2026-09-01", { rrule: "FREQ=DAILY" });
    expect(await runDigest(daily, "evening", TODAY, at(`${TODAY}T18:00:00Z`), at(`${TODAY}T18:00:30Z`))).toBe("same");
    expect(await activityOf(daily)).toEqual([]);
  });
});

describe("024 AC-6 and AC-8 what the job decides", () => {
  it("sends to every token, with the verbs on a one-task digest, records the words, and reads the receipts later", async () => {
    const me = await account();
    const th = await thread([me]);
    const id = await reminder(me, th, "Pay the rent", TODAY);
    const a = await token(me);
    const b = await token(me);
    expect(await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("sent");
    expect(memory.sent.map((m) => [m.to, m.title, m.body, m.categoryId, m.channelId, m.data]).sort()).toEqual(
      [a, b].sort().map((to) => [to, "One today", "Pay the rent.", "digest_verbs", "due_today", { kind: "digest", send: "morning", contentId: id }]),
    );
    expect(await activityOf(me)).toEqual([{ kind: "digest", sent: true, reason: null, title: "One today", body: "Pay the rent.", send: "morning", content_id: id }]);
    const receipts = await db.selectFrom("jobs").select(["kind", "payload"]).where("kind", "=", "push.receipts").execute();
    expect(receipts).toHaveLength(1);
    expect((receipts[0]?.payload as { tickets: unknown[] }).tickets).toHaveLength(2);
  });

  it("carries no verbs for several, for an event, for a repeating row or for a calendar's row", async () => {
    const me = await account();
    const th = await thread([me]);
    await token(me);
    await reminder(me, th, "Dentist", TODAY, { type: "event", occurs_at: new Date(`${TODAY}T08:00:00Z`), due_at: null, attrs: { all_day: false } });
    expect(await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("sent");
    expect(memory.sent[0]?.categoryId).toBe("digest");
    expect(memory.sent[0]?.data).toEqual({ kind: "digest", send: "morning" });
  });

  it("records a switch that was off only when there was something to say, and no phone as not sent by permission", async () => {
    const off = await account({ notify_due_today: false });
    const th = await thread([off]);
    await token(off);
    expect(await runDigest(off, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("empty");
    expect(await activityOf(off)).toEqual([]);
    await reminder(off, th, "Pay the rent", TODAY);
    expect(await runDigest(off, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("skipped_setting");
    expect(await activityOf(off)).toEqual([{ kind: "digest", sent: false, reason: "setting", title: "Due today was off", body: "Pay the rent.", send: "morning", content_id: null }]);
    expect(memory.sent).toEqual([]);

    const phoneless = await account();
    await reminder(phoneless, await thread([phoneless]), "Pay the rent", TODAY);
    expect(await runDigest(phoneless, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("skipped_permission");
    expect(await activityOf(phoneless)).toEqual([{ kind: "digest", sent: false, reason: "permission", title: "One today", body: "Pay the rent.", send: "morning", content_id: null }]);
  });

  it("reaches no phone whose session has expired, and records that as not sent by permission", async () => {
    const me = await account();
    await reminder(me, await thread([me]), "Pay the rent", TODAY);
    await token(me);
    await db.updateTable("sessions").set({ expires_at: new Date(Date.now() - 60_000) }).where("account_id", "=", me).execute();
    expect(await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("skipped_permission");
    expect(memory.sent).toEqual([]);
    expect(await activityOf(me)).toEqual([{ kind: "digest", sent: false, reason: "permission", title: "One today", body: "Pay the rent.", send: "morning", content_id: null }]);
  });

  it("drops a job more than two hours late without a send or a record", async () => {
    const me = await account();
    await reminder(me, await thread([me]), "Pay the rent", TODAY);
    await token(me);
    expect(await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T09:00:01Z`))).toBe("late");
    expect(memory.sent).toEqual([]);
    expect(await activityOf(me)).toEqual([]);
  });

  it("drops a token the receipts say is gone", async () => {
    const me = await account();
    const gone = await token(me);
    const kept = await token(me);
    const asked = memory.receipts;
    memory.receipts = async () => ({ r1: { ok: false, code: "DeviceNotRegistered" }, r2: { ok: true } });
    // The job carries the token's row id, never the token itself.
    const idOf = async (held: string) =>
      (await db.selectFrom("push_tokens").select("id").where("token", "=", held).executeTakeFirstOrThrow()).id;
    await readReceipts([
      { id: "r1", tokenId: await idOf(gone) },
      { id: "r2", tokenId: await idOf(kept) },
    ]);
    memory.receipts = asked;
    expect((await db.selectFrom("push_tokens").select("token").where("account_id", "=", me).execute()).map((row) => row.token)).toEqual([kept]);
  });

  it("the events carry counts and enums, never words", async () => {
    const me = await account();
    await reminder(me, await thread([me]), "Pay the rent", TODAY);
    await token(me);
    await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`));
    const events = await db.selectFrom("analytics_events").select(["name", "properties", "subject_id"]).where("name", "in", ["digest_sent", "digest_skipped"]).execute();
    expect(events.map((event) => [event.name, event.properties])).toEqual([["digest_sent", { send: "morning", rows: 1, overdue: 0 }]]);
    // The subject is the pseudonym, never the account id (OFF-1, and the
    // privacy page's own words).
    const pseudonym = (await db.selectFrom("accounts").select("analytics_subject_id").where("id", "=", me).executeTakeFirstOrThrow()).analytics_subject_id;
    expect(events[0]?.subject_id).toBe(pseudonym);
    expect(events[0]?.subject_id).not.toBe(me);
    await sql`delete from analytics_events`.execute(db);
  });

  it("puts no token in the receipts job, since the worker may read a job's payload", async () => {
    const me = await account();
    await reminder(me, await thread([me]), "Pay the rent", TODAY);
    const held = await token(me);
    await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`));
    const job = await db.selectFrom("jobs").select("payload").where("kind", "=", "push.receipts").executeTakeFirstOrThrow();
    expect(JSON.stringify(job.payload)).not.toContain(held);
    expect(JSON.stringify(job.payload)).not.toContain("PushToken");
  });

  it("never announces a calendar's own row, whatever its flag says", async () => {
    const me = await account();
    const th = await thread([me]);
    await reminder(me, th, "Standup", TODAY, { type: "event", occurs_at: new Date(`${TODAY}T08:00:00Z`), due_at: null, source: "calendar", source_ref: "google:evt_1", attrs: { all_day: false } });
    const composed = await composeDigest(me, "morning", TODAY);
    expect(composed.rows).toEqual([]);
  });

  it("names on the sent row which thread and whose words it carried, so the purges can reach it", async () => {
    const me = await account();
    const ana = await account({ display_name: "Ana" });
    const trip = await thread([me, ana], "Lisbon trip");
    await reminder(ana, trip, "ferry times", TODAY);
    await token(me);
    await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`));
    const row = await db.selectFrom("activity").select("id").where("account_id", "=", me).executeTakeFirstOrThrow();
    const mentions = await db.selectFrom("activity_mentions").select(["thread_id", "about_account_id"]).where("activity_id", "=", row.id).execute();
    expect(mentions).toEqual([{ thread_id: trip, about_account_id: ana }]);
  });
});

describe("024 review of 2026-09-22: what fails a send, and what a cap drops", () => {
  it("a ticket the service refuses for any reason but a gone device fails the job with the code, and records nothing as sent", async () => {
    const me = await account();
    await reminder(me, await thread([me]), "Pay the rent", TODAY);
    await token(me);
    const send = memory.send;
    memory.send = async (messages) => messages.map((message) => ({ token: message.to, ok: false as const, code: "MessageTooBig" }));
    try {
      await expect(runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).rejects.toBeInstanceOf(PushFailed);
    } finally {
      memory.send = send;
    }
    expect(await activityOf(me)).toEqual([]);
    const events = await db.selectFrom("analytics_events").select(["name", "properties"]).where("name", "in", ["digest_sent", "notification_failed"]).execute();
    expect(events.map((event) => [event.name, event.properties])).toEqual([["notification_failed", { kind: "digest", status: 200, code: "MessageTooBig" }]]);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "push.receipts").execute()).toEqual([]);
  });

  // The verbs are for a task due today. A lone overdue row is named since
  // 2026-09-30, and still carries none: Tomorrow on a row a week late would
  // be a second date change the notification never offered.
  it("a digest whose only row is overdue names it and carries no verbs, which are for what is due today", async () => {
    const me = await account();
    await reminder(me, await thread([me]), "Call the clinic", "2026-09-20");
    await token(me);
    expect(await runDigest(me, "morning", TODAY, at(`${TODAY}T07:00:00Z`), at(`${TODAY}T07:00:10Z`))).toBe("sent");
    expect(memory.sent.map((m) => [m.body, m.categoryId, m.data])).toEqual([["Call the clinic.", "digest", { kind: "digest", send: "morning" }]]);
  });

  it("past the candidate cap, what is furthest off is dropped first, never what is due today", async () => {
    const me = await account();
    const flat = await thread([me]);
    const tomorrow = "2026-09-23";
    await db
      .insertInto("content")
      .values(
        Array.from({ length: RULE_ROWS_CAP + 500 }, (_, i) => ({
          account_id: me,
          thread_id: flat,
          title: `Row ${i}`,
          type: "task",
          is_reminder: true,
          due_at: new Date(`${tomorrow}T12:00:00Z`),
          attrs: { all_day: true },
        })) as never,
      )
      .execute();
    const rent = await reminder(me, flat, "Pay the rent", TODAY);
    const composed = await composeDigest(me, "morning", TODAY);
    expect(composed.rows.map((row) => row.id)).toEqual([rent]);
  });
});

// 027 T1.13: the evening digest says which day it named, so Today opens on it.
describe("027 AC-15 the evening digest carries its day", () => {
  it("names tomorrow's date in its data and nothing else new", async () => {
    const me = await account();
    const th = await thread([me]);
    await reminder(me, th, "Ferry", addUtcDays(TODAY, 1));
    await reminder(me, th, "Bins", addUtcDays(TODAY, 1));
    await token(me);
    expect(await runDigest(me, "evening", TODAY, at(`${TODAY}T18:00:00Z`), at(`${TODAY}T18:00:10Z`))).toBe("sent");
    expect(memory.sent[0]?.data).toEqual({ kind: "digest", send: "evening", day: addUtcDays(TODAY, 1) });
  });
});
