// 051. A birthday the turn remembers goes on a calendar, with no row.
//
// Google is stubbed at the module boundary, as thread-calendars.test.ts does.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { makeSignature } from "better-auth/crypto";

vi.mock("../src/connectors/tokens.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/connectors/tokens.js")>();
  return { ...actual, accessTokenFor: vi.fn(async () => "token") };
});

const google = vi.hoisted(() => ({
  createEvent: vi.fn(async (..._args: unknown[]) => `evt-${Math.random().toString(36).slice(2, 8)}`),
  getEvent: vi.fn(async () => null),
  deleteEvent: vi.fn(async (..._args: unknown[]) => undefined),
  patchEvent: vi.fn(async (..._args: unknown[]) => undefined),
  countParticipants: vi.fn(async () => 1),
  sharedWith: vi.fn(async (): Promise<string[]> => []),
}));
vi.mock("../src/connectors/google.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/connectors/google.js")>();
  return { ...actual, ...google };
});

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  google.createEvent.mockClear();
  google.deleteEvent.mockClear();
  google.patchEvent.mockClear();
  google.countParticipants.mockReset();
  google.countParticipants.mockResolvedValue(1);
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("reminder_labels").execute();
  await db.deleteFrom("connector_pending_writes").execute();
  await db.deleteFrom("connector_events").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

const ACL = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.acls.readonly";

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Jo Alves", analytics_subject_id: uuidv7(), time_zone: "Europe/Lisbon" } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function connection(accountId: string): Promise<string> {
  const row = await db
    .insertInto("connector_connections")
    .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("connector_secrets")
    .values({ connection_id: row.id, access_token: Buffer.from("x"), refresh_token: null, access_expires_at: null, scope: ACL, wrapped_by: "test" })
    .execute();
  return row.id;
}

async function calendar(connectionId: string, over: { summary?: string; primary?: boolean; accessRole?: "owner" | "writer" | "reader"; participants?: number | null } = {}) {
  const external = `cal-${uuidv7()}`;
  const row = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connectionId,
      external_id: external,
      summary: over.summary ?? "Home",
      access_role: over.accessRole ?? "owner",
      selected: true,
      participants: over.participants === undefined ? 1 : over.participants,
      is_primary: over.primary ?? false,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id: row.id, external };
}

async function dump(accountId: string, text: string) {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: turnId, text, state: "seen", source: "person" } as never)
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
  return { messageId: message.id, jobId: job.id, conversationId: conversation.id, turnId };
}

const tool = async (payload: Record<string, unknown>) =>
  (
    await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { tool: "memory", toolCallId: uuidv7(), action: "remember", afterMembers: false, ...payload },
    })
  ).json() as Record<string, unknown>;

const KRISTINA = { text: "Kristina's birthday is 1 February.", kind: "people", on: "02-01", name: "Kristina's birthday" };

const memory = async (accountId: string) =>
  db
    .selectFrom("notes")
    .select(["id", "event_ref", sql<boolean>`coalesce((attrs ->> 'event_found')::boolean, false)`.as("found")])
    .where("account_id", "=", accountId)
    .where("scope", "=", "account")
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .executeTakeFirstOrThrow();

/** The next 1 February, as Google keeps an all-day day: midnight UTC. */
function nextFirstOfFeb(): Date {
  const now = new Date();
  const thisYear = Date.UTC(now.getUTCFullYear(), 1, 1);
  return new Date(thisYear >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) ? thisYear : Date.UTC(now.getUTCFullYear() + 1, 1, 1));
}

describe("which calendar", () => {
  it("is the primary, with no question, when nothing is named", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Family", participants: 1 });
    const primary = await calendar(conn, { summary: "Jo", primary: true });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    const result = await tool({ jobId, ...KRISTINA });
    expect(result).toMatchObject({ ok: true, remembered: { id: expect.any(String) }, calendar: "written" });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    const [, calendarId, draft] = google.createEvent.mock.calls[0]!;
    expect(calendarId).toBe(primary.external);
    expect(draft).toMatchObject({ title: "Kristina's birthday", allDay: true, recurrence: ["RRULE:FREQ=YEARLY"], location: null, attendees: [] });
    const { startsAt } = draft as { startsAt: Date };
    expect(new Date(startsAt).toISOString().slice(5, 10)).toBe("02-01");
    const held = await memory(me);
    expect(held.event_ref).toMatch(new RegExp(`^${primary.external}:evt-`));
    expect(await db.selectFrom("questions").select("id").execute()).toEqual([]);
  });

  it("is the first by name when no primary is approved", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Work" });
    const family = await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    expect(google.createEvent.mock.calls[0]![1]).toBe(family.external);
  });

  it("is the one named", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    const family = await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, put it in the family calendar");
    await tool({ jobId, ...KRISTINA, calendar: "the family calendar" });
    expect(google.createEvent.mock.calls[0]![1]).toBe(family.external);
  });

  it("is asked when the name settles on none", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    const result = await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    expect(result).toMatchObject({ ok: true, calendar: "asked" });
    expect(google.createEvent).not.toHaveBeenCalled();
    const held = await memory(me);
    const question = await db.selectFrom("questions").select(["field", "text", "target_note_id", "target_content_id"]).executeTakeFirstOrThrow();
    expect(question).toEqual({ field: "calendar", text: 'Remembered "Kristina\'s birthday". Which calendar?', target_note_id: held.id, target_content_id: null });
  });

  it("is not asked when the conversation already has a question open", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId, conversationId, messageId, turnId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    await db
      .insertInto("questions")
      .values({ account_id: me, conversation_id: conversationId, message_id: messageId, turn_id: turnId, field: "date", text: 'Filed "Rent". By when?', options: JSON.stringify([]), state: "open", ordinal: 1 } as never)
      .execute();
    const result = await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    expect(result).toMatchObject({ ok: true, calendar: null });
    expect(await db.selectFrom("questions").select("id").execute()).toHaveLength(1);
  });

  it("says nothing with no calendar connected, and says so when one was asked for", async () => {
    const me = await account();
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    expect(await tool({ jobId: first.jobId, ...KRISTINA })).toMatchObject({ ok: true, calendar: null });
    const other = await account();
    const second = await dump(other, "Kristina's birthday is Feb 1st, add it to my calendar");
    expect(await tool({ jobId: second.jobId, ...KRISTINA, calendar: "my calendar" })).toMatchObject({ ok: true, calendar: "noCalendar" });
  });
});

describe("when it goes on", () => {
  it("leaves their own birthday off unless they asked", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "my birthday is May 3rd");
    await tool({ jobId: first.jobId, text: "Their birthday is 3 May.", kind: "about", on: "05-03", name: null });
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("puts their own birthday on when asked, named by the sentence's words", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "my birthday is May 3rd, add it to my calendar");
    const result = await tool({ jobId: first.jobId, text: "Their birthday is 3 May.", kind: "about", on: "05-03", name: "Their birthday", calendar: "my calendar" });
    expect(result).toMatchObject({ calendar: "written" });
    expect(google.createEvent.mock.calls[0]![2]).toMatchObject({ title: "Their birthday" });
  });

  it("does not put a held birthday on again unasked, and does when asked", async () => {
    const me = await account();
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    // A calendar connected afterwards.
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const again = await dump(me, "Kristina's birthday is Feb 1st");
    expect(await tool({ jobId: again.jobId, ...KRISTINA })).toMatchObject({ calendar: null });
    expect(google.createEvent).not.toHaveBeenCalled();
    const asked = await dump(me, "add Kristina's birthday, Feb 1st, to my calendar");
    expect(await tool({ jobId: asked.jobId, ...KRISTINA, calendar: "my calendar" })).toMatchObject({ calendar: "written" });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
  });

  it("draws Done for a later turn that remembered a held birthday or put it on the calendar", async () => {
    const { threadsFor } = await import("../src/routes/dumps.js");
    const me = await account();
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const again = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: again.jobId, ...KRISTINA });
    expect((await threadsFor(again.messageId, me)).filed).toBe(true);
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const asked = await dump(me, "add Kristina's birthday, Feb 1st, to my calendar");
    await tool({ jobId: asked.jobId, ...KRISTINA, calendar: "my calendar" });
    expect((await threadsFor(asked.messageId, me)).filed).toBe(true);
  });

  it("is not put on twice", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const asked = await dump(me, "add Kristina's birthday, Feb 1st, to my calendar");
    expect(await tool({ jobId: asked.jobId, ...KRISTINA, calendar: "my calendar" })).toMatchObject({ calendar: null });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
  });

  it("goes on no calendar with no name of its own", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA, name: "Kristina's big day" });
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("waits for a go-ahead under Ask before adding, and links on the yes", async () => {
    const { confirmPending } = await import("../src/connectors/tool-calls.js");
    const me = await account();
    await db.updateTable("accounts").set({ calendar_ask_first: true } as never).where("id", "=", me).execute();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    expect(await tool({ jobId, ...KRISTINA })).toMatchObject({ calendar: "waiting" });
    const pending = await db.selectFrom("connector_pending_writes").select(["id", "note_id"]).executeTakeFirstOrThrow();
    const held = await memory(me);
    expect(pending.note_id).toBe(held.id);
    expect(await confirmPending(me, pending.id)).toBe(true);
    expect((await memory(me)).event_ref).toMatch(/:evt-/);
  });
});

describe("already there", () => {
  it("links a yearly event of theirs on that day, on a calendar it only reads, and writes nothing", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const birthdays = await calendar(conn, { summary: "Birthdays", accessRole: "reader" });
    const day = nextFirstOfFeb();
    await db
      .insertInto("connector_events")
      .values({
        account_id: me,
        calendar_id: birthdays.id,
        source_ref: `${birthdays.external}:kb_20270201`,
        series_ref: "kb",
        title: "Kristina's Birthday",
        occurs_at: day,
        occurs_end_at: new Date(day.getTime() + 86_400_000),
        all_day: true,
        untrusted: false,
        attendees: JSON.stringify([]),
        created_by_me: true,
        invited_me: false,
      } as never)
      .execute();
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    const result = await tool({ jobId, ...KRISTINA });
    expect(result).toMatchObject({ ok: true, calendar: null });
    expect(google.createEvent).not.toHaveBeenCalled();
    expect(await memory(me)).toMatchObject({ event_ref: `${birthdays.external}:kb`, found: true });
  });

  it("does not take somebody else's event, or one that does not repeat", async () => {
    const me = await account();
    const conn = await connection(me);
    const primary = await calendar(conn, { primary: true });
    const day = nextFirstOfFeb();
    for (const over of [{ series_ref: null, created_by_me: true }, { series_ref: "x", created_by_me: false }]) {
      await db
        .insertInto("connector_events")
        .values({
          account_id: me,
          calendar_id: primary.id,
          source_ref: `${primary.external}:${uuidv7()}`,
          title: "Kristina's birthday",
          occurs_at: day,
          occurs_end_at: new Date(day.getTime() + 86_400_000),
          all_day: true,
          untrusted: false,
          attendees: JSON.stringify([]),
          invited_me: false,
          ...over,
        } as never)
        .execute();
    }
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
  });
});

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

describe("the answer", () => {
  it("puts the memory on the calendar tapped, with no thread and no pick", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    const q = await db.selectFrom("questions").select(["id", "options"]).executeTakeFirstOrThrow();
    const options = (typeof q.options === "string" ? JSON.parse(q.options) : q.options) as Array<{ label: string; value: string | null }>;
    const family = options.findIndex((o) => o.label === "Family");
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: family } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ filed: true, threads: [] });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    expect(google.createEvent.mock.calls[0]![2]).toMatchObject({ title: "Kristina's birthday", allDay: true, recurrence: ["RRULE:FREQ=YEARLY"] });
    expect((await memory(me)).event_ref).toMatch(/:evt-/);
    expect(await db.selectFrom("thread_calendars").select("calendar_id").execute()).toEqual([]);
  });

  it("keeps the tap's Done after a reload", async () => {
    const { threadsForAll } = await import("../src/routes/dumps.js");
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    const q = await db.selectFrom("questions").select("id").executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    const answered = await db.selectFrom("questions").select("answered_message_id").executeTakeFirstOrThrow();
    expect((await threadsForAll([answered.answered_message_id!], me)).get(answered.answered_message_id!)).toEqual([]);
  });

  it("reopens the question when the write does not go through", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    google.createEvent.mockRejectedValueOnce(new Error("down"));
    const q = await db.selectFrom("questions").select("id").executeTakeFirstOrThrow();
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(502);
    expect((await db.selectFrom("questions").select("state").executeTakeFirstOrThrow()).state).toBe("open");
  });

  it("writes nothing for a memory forgotten before the tap", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    await db.updateTable("notes").set({ deleted_at: new Date() }).execute();
    const q = await db.selectFrom("questions").select("id").executeTakeFirstOrThrow();
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    expect(google.createEvent).not.toHaveBeenCalled();
  });
});

describe("Undo", () => {
  it("of the turn takes back the memory and deletes the event it wrote", async () => {
    const { undoTurn } = await import("../src/routes/dumps.js");
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const { jobId, turnId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    const ref = (await memory(me)).event_ref!;
    await undoTurn(me, turnId);
    expect(google.deleteEvent).toHaveBeenCalledTimes(1);
    expect(google.deleteEvent.mock.calls[0]![2]).toBe(ref.split(":").slice(1).join(":"));
    const left = await db.selectFrom("notes").select(["event_ref", "deleted_at"]).executeTakeFirstOrThrow();
    expect(left.event_ref).toBeNull();
    expect(left.deleted_at).not.toBeNull();
  });

  it("of the turn leaves an event it only found", async () => {
    const { undoTurn } = await import("../src/routes/dumps.js");
    const me = await account();
    const conn = await connection(me);
    const primary = await calendar(conn, { primary: true });
    const day = nextFirstOfFeb();
    await db
      .insertInto("connector_events")
      .values({ account_id: me, calendar_id: primary.id, source_ref: `${primary.external}:kb_1`, series_ref: "kb", title: "Kristina's birthday", occurs_at: day, occurs_end_at: new Date(day.getTime() + 86_400_000), all_day: true, untrusted: false, attendees: JSON.stringify([]), created_by_me: true, invited_me: false } as never)
      .execute();
    const { jobId, turnId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    await undoTurn(me, turnId);
    expect(google.deleteEvent).not.toHaveBeenCalled();
  });

  it("of a later turn that put a held birthday on the calendar deletes that event and keeps the memory", async () => {
    const { undoTurn } = await import("../src/routes/dumps.js");
    const me = await account();
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const asked = await dump(me, "add Kristina's birthday, Feb 1st, to my calendar");
    await tool({ jobId: asked.jobId, ...KRISTINA, calendar: "my calendar" });
    expect((await memory(me)).event_ref).not.toBeNull();
    await undoTurn(me, asked.turnId);
    expect(google.deleteEvent).toHaveBeenCalledTimes(1);
    const left = await memory(me);
    expect(left.event_ref).toBeNull();
  });

  it("of a correction brings the old memory back, with its event moved back to its day", async () => {
    const { undoTurn } = await import("../src/routes/dumps.js");
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const old = await memory(me);
    const second = await dump(me, "actually Kristina's birthday is Feb 2nd");
    await tool({ jobId: second.jobId, ...KRISTINA, text: "Kristina's birthday is 2 February.", on: "02-02" });
    await db.deleteFrom("jobs").where("kind", "=", "memory.event").execute();
    await undoTurn(me, second.turnId);
    const back = await memory(me);
    expect(back.id).toBe(old.id);
    expect(back.event_ref).toBe(old.event_ref);
    expect(google.deleteEvent).not.toHaveBeenCalled();
    const jobs = await db.selectFrom("jobs").select("payload").where("kind", "=", "memory.event").execute();
    expect(jobs.map((j) => j.payload)).toEqual([{ noteId: old.id, accountId: me, action: "move", on: "02-01" }]);
  });

  it("of the pick deletes the event and keeps the memory", async () => {
    const { undoTurn } = await import("../src/routes/dumps.js");
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { summary: "Jo", primary: true });
    await calendar(conn, { summary: "Family" });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, on the studio calendar");
    await tool({ jobId, ...KRISTINA, calendar: "the studio calendar" });
    const q = await db.selectFrom("questions").select("id").executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    const answered = await db.selectFrom("questions").select("answer_turn_id").executeTakeFirstOrThrow();
    await undoTurn(me, answered.answer_turn_id!);
    expect(google.deleteEvent).toHaveBeenCalledTimes(1);
    const left = await memory(me);
    expect(left.event_ref).toBeNull();
  });
});

describe("forget", () => {
  async function onCalendar(over: { participants?: number | null } = {}) {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true, ...over });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    return { me, held: await memory(me) };
  }

  async function forgetInTab(me: string, id: string) {
    const { forget } = await import("../src/memories/store.js");
    await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: null, memoryId: id }));
  }

  async function runDue() {
    const { handlers } = await import("../src/jobs/handlers.js");
    // The jobs run once the Undo has closed: the forget is aged past it.
    await sql`update notes set deleted_at = deleted_at - interval '11 minutes' where deleted_at is not null`.execute(db);
    const jobs = await db.selectFrom("jobs").select(["kind", "payload", "run_after"]).where("kind", "=", "memory.event").execute();
    for (const job of jobs) await handlers["memory.event"]!(job.payload as never, { mailer: null as never }, null);
    return jobs;
  }

  it("deletes the event once the forget's Undo has closed, on a shared calendar too", async () => {
    const { me, held } = await onCalendar({ participants: 4 });
    await forgetInTab(me, held.id);
    const jobs = await runDue();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.run_after.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(google.deleteEvent).toHaveBeenCalledTimes(1);
    expect(google.countParticipants).not.toHaveBeenCalled();
  });

  it("deletes nothing for a memory brought back inside its Undo", async () => {
    const { restoreMemory } = await import("../src/memories/store.js");
    const { me, held } = await onCalendar();
    await forgetInTab(me, held.id);
    await db.transaction().execute((trx) => restoreMemory(trx, me, held.id));
    await runDue();
    expect(google.deleteEvent).not.toHaveBeenCalled();
    expect((await memory(me)).event_ref).toBe(held.event_ref);
  });

  it("only unlinks an event it found", async () => {
    const me = await account();
    const conn = await connection(me);
    const primary = await calendar(conn, { primary: true });
    const day = nextFirstOfFeb();
    await db
      .insertInto("connector_events")
      .values({ account_id: me, calendar_id: primary.id, source_ref: `${primary.external}:kb_1`, series_ref: "kb", title: "Kristina's birthday", occurs_at: day, occurs_end_at: new Date(day.getTime() + 86_400_000), all_day: true, untrusted: false, attendees: JSON.stringify([]), created_by_me: true, invited_me: false } as never)
      .execute();
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    const held = await memory(me);
    await forgetInTab(me, held.id);
    await runDue();
    expect(google.deleteEvent).not.toHaveBeenCalled();
    const left = await db.selectFrom("notes").select("event_ref").where("id", "=", held.id).executeTakeFirstOrThrow();
    expect(left.event_ref).toBeNull();
  });

  it("ends quietly when Google refuses the delete", async () => {
    const { me, held } = await onCalendar();
    google.deleteEvent.mockRejectedValueOnce(new Error("boom"));
    await forgetInTab(me, held.id);
    await expect(runDue()).resolves.toHaveLength(1);
    const left = await db.selectFrom("notes").select("event_ref").where("id", "=", held.id).executeTakeFirstOrThrow();
    expect(left.event_ref).toBeNull();
  });
});

describe("a changed day", () => {
  async function onCalendar() {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    return { me, held: await memory(me) };
  }

  async function pass(me: string, id: string, on: string | null) {
    const { changeMemory } = await import("../src/memories/store.js");
    const { applyMemoryDates } = await import("../src/notifications/labels.js");
    await db.transaction().execute((trx) => changeMemory(trx, { accountId: me, id, text: on ? "Kristina's birthday is 2 February." : "Kristina is my sister." }));
    const offered = await sql<{ id: string }>`select id from memories_to_date(${me}::uuid)`.execute(db);
    expect(offered.rows.map((r) => r.id)).toEqual([id]);
    await db.transaction().execute((trx) =>
      applyMemoryDates(trx, { accountId: me, shown: [id], dates: on ? [{ id, on, lead: "days", name: "Kristina's birthday" }] : [] }),
    );
    const { handlers } = await import("../src/jobs/handlers.js");
    const jobs = await db.selectFrom("jobs").select("payload").where("kind", "=", "memory.event").execute();
    for (const job of jobs) await handlers["memory.event"]!(job.payload as never, { mailer: null as never }, null);
    return jobs.length;
  }

  it("moves the event to the new day", async () => {
    const { me, held } = await onCalendar();
    expect(await pass(me, held.id, "02-02")).toBe(1);
    expect(google.patchEvent).toHaveBeenCalledTimes(1);
    // Google's own all-day shape when it says the event is one; the stub
    // reads nothing back, so the time form is what is sent here.
    const patch = google.patchEvent.mock.calls[0]![3] as { start: { date?: string; dateTime?: string } };
    expect(String(patch.start.date ?? patch.start.dateTime).slice(5, 10)).toBe("02-02");
    expect((await memory(me)).event_ref).toBe(held.event_ref);
  });

  it("only lets the event go when the words no longer hold a day: no delete outside a forget (OFF-6)", async () => {
    const { me, held } = await onCalendar();
    expect(await pass(me, held.id, null)).toBe(1);
    expect(google.deleteEvent).not.toHaveBeenCalled();
    expect((await memory(me)).event_ref).toBeNull();
  });

  it("does nothing when the day is the same", async () => {
    const { me, held } = await onCalendar();
    const { changeMemory } = await import("../src/memories/store.js");
    const { applyMemoryDates } = await import("../src/notifications/labels.js");
    await db.transaction().execute((trx) => changeMemory(trx, { accountId: me, id: held.id, text: "Kristina's birthday is on 1 February." }));
    await db.transaction().execute((trx) => applyMemoryDates(trx, { accountId: me, shown: [held.id], dates: [{ id: held.id, on: "02-01", lead: "days", name: "Kristina's birthday" }] }));
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "memory.event").execute()).toEqual([]);
  });
});

describe("the calendar's side", () => {
  async function onCalendar() {
    const me = await account();
    const conn = await connection(me);
    const primary = await calendar(conn, { primary: true });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    return { me, primary, held: await memory(me) };
  }

  it("lets an event deleted on Google go, and keeps the memory", async () => {
    const { letGo } = await import("../src/connectors/sync.js");
    const { me, primary, held } = await onCalendar();
    const series = held.event_ref!.split(":").slice(1).join(":");
    await letGo(me, primary.id, primary.external, { refs: [], series: new Set([series]) });
    const left = await db.selectFrom("notes").select(["event_ref", "deleted_at"]).where("id", "=", held.id).executeTakeFirstOrThrow();
    expect(left).toEqual({ event_ref: null, deleted_at: null });
  });

  it("lets go when the calendar is unticked", async () => {
    const { me, primary, held } = await onCalendar();
    const response = await app.inject({ method: "PATCH", url: `/api/connectors/calendars/${primary.id}`, headers: { cookie: await signIn(me) }, payload: { selected: false } });
    expect(response.statusCode).toBe(200);
    expect((await db.selectFrom("notes").select("event_ref").where("id", "=", held.id).executeTakeFirstOrThrow()).event_ref).toBeNull();
  });

  it("changes nothing in offload when the event is changed on Google", async () => {
    const { me, held } = await onCalendar();
    const before = await db.selectFrom("notes").select(["text", "event_ref"]).where("id", "=", held.id).executeTakeFirstOrThrow();
    // A changed event reaches offload as a copy row; nothing links a memory to the copy.
    expect(before.event_ref).toBe(held.event_ref);
    expect((await memory(me)).event_ref).toBe(held.event_ref);
  });
});

describe("one memory, one event", () => {
  it("a turn's correction moves the event to the new memory rather than writing a second", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const old = await memory(me);
    const second = await dump(me, "actually Kristina's birthday is Feb 2nd");
    await tool({ jobId: second.jobId, ...KRISTINA, text: "Kristina's birthday is 2 February.", on: "02-02" });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    const now = await memory(me);
    expect(now.id).not.toBe(old.id);
    expect(now.event_ref).toBe(old.event_ref);
    expect((await db.selectFrom("notes").select("event_ref").where("id", "=", old.id).executeTakeFirstOrThrow()).event_ref).toBeNull();
    const { handlers } = await import("../src/jobs/handlers.js");
    const jobs = await db.selectFrom("jobs").select("payload").where("kind", "=", "memory.event").execute();
    expect(jobs.map((j) => (j.payload as { action: string }).action)).toEqual(["move"]);
    for (const job of jobs) await handlers["memory.event"]!(job.payload as never, { mailer: null as never }, null);
    expect(google.patchEvent).toHaveBeenCalledTimes(1);
  });

  it("the memory pass adds nothing for a birthday already held", async () => {
    const { applyMemoryPass } = await import("../src/memories/pass.js");
    const me = await account();
    const { jobId, messageId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    const applied = await db.transaction().execute((trx) =>
      applyMemoryPass(trx, me, { add: [{ kind: "people", text: "Kristina is a contact whose birthday is Feb 1st.", cites: messageId }], supersede: [], fold: [] }),
    );
    expect(applied).toMatchObject({ added: 0, ignored: 1 });
  });

  it("the memory pass's supersede carries the event", async () => {
    const { applyMemoryPass } = await import("../src/memories/pass.js");
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const old = await memory(me);
    await new Promise((r) => setTimeout(r, 10));
    const later = await dump(me, "Kristina is my sister, her birthday is Feb 1st");
    await db.transaction().execute((trx) =>
      applyMemoryPass(trx, me, { add: [], supersede: [{ id: old.id, text: "Their sister Kristina's birthday is 1 February.", cites: later.messageId }], fold: [] }),
    );
    const now = await memory(me);
    expect(now.id).not.toBe(old.id);
    expect(now.event_ref).toBe(old.event_ref);
    expect((await db.selectFrom("notes").select("event_ref").where("id", "=", old.id).executeTakeFirstOrThrow()).event_ref).toBeNull();
  });
});

describe("OFF-1", () => {
  it("logs no memory text, name or event title on the way", async () => {
    const lines: string[] = [];
    const spies = (["log", "warn", "error", "info"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" "))),
    );
    try {
      const me = await account();
      const conn = await connection(me);
      await calendar(conn, { primary: true, participants: 3 });
      const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
      await tool({ jobId, ...KRISTINA });
      const held = await memory(me);
      const { forget } = await import("../src/memories/store.js");
      await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: null, memoryId: held.id }));
      await sql`update notes set deleted_at = deleted_at - interval '11 minutes' where deleted_at is not null`.execute(db);
      const { handlers } = await import("../src/jobs/handlers.js");
      for (const job of await db.selectFrom("jobs").select("payload").where("kind", "=", "memory.event").execute()) {
        await handlers["memory.event"]!(job.payload as never, { mailer: null as never }, null);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((line) => /kristina|birthday|february/i.test(line))).toEqual([]);
  });
});

describe("scoping", () => {
  it("a memory.event job for another account's memory does nothing", async () => {
    const me = await account();
    const conn = await connection(me);
    await calendar(conn, { primary: true });
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    const held = await memory(me);
    await db.updateTable("notes").set({ deleted_at: new Date(Date.now() - 20 * 60_000) }).where("id", "=", held.id).execute();
    const other = await account();
    const { handlers } = await import("../src/jobs/handlers.js");
    await handlers["memory.event"]!({ noteId: held.id, accountId: other, action: "forget" } as never, { mailer: null as never }, null);
    expect(google.deleteEvent).not.toHaveBeenCalled();
  });
});
