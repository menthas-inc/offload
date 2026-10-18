// 019: a thread picks its calendars, and what follows from a pick.
//
// AC-7, AC-8, AC-9: the envelope, the picks routes, membership and ownership.
// AC-10, AC-12: what a thread reads through its picks, and the row that draws once.
// AC-11: where a write goes, and the question when the thread cannot decide.
// AC-17: a shared calendar's name never reaches a prompt as the person's words.
//
// Google is stubbed at the module boundary: the write path reaches it for the
// event, the access list and the create, and none of that is under test here.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { matchCalendarLabel } from "../src/questions.js";
import { GrantRevoked } from "../src/connectors/google.js";
import { undoTurn } from "../src/routes/dumps.js";

const tokens = vi.hoisted(() => ({ real: false }));
vi.mock("../src/connectors/tokens.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/connectors/tokens.js")>();
  return {
    ...actual,
    accessTokenFor: vi.fn(async (id: string) => (tokens.real ? actual.accessTokenFor(id) : "token")),
  };
});

const google = vi.hoisted(() => ({
  createEvent: vi.fn(async () => `evt-${Math.random().toString(36).slice(2, 8)}`),
  getEvent: vi.fn(async () => null),
  deleteEvent: vi.fn(async () => undefined),
  patchEvent: vi.fn(async () => undefined),
  countParticipants: vi.fn(async () => 1),
  sharedWith: vi.fn(async (_token: string, _calendarId: string): Promise<string[]> => []),
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
  google.countParticipants.mockReset();
  google.countParticipants.mockResolvedValue(1);
  google.sharedWith.mockReset();
  google.sharedWith.mockResolvedValue([]);
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("connector_pending_writes").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

const ACL = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.acls.readonly";

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function account(name = "Jo Alves"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      display_name: name,
      analytics_subject_id: uuidv7(),
    })
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
    .values({
      connection_id: row.id,
      access_token: Buffer.from("x"),
      refresh_token: null,
      access_expires_at: null,
      scope: ACL,
      wrapped_by: "test",
    })
    .execute();
  return row.id;
}

async function calendar(
  connectionId: string,
  over: {
    accessRole?: "owner" | "writer" | "reader";
    selected?: boolean;
    summary?: string;
    externalId?: string;
    participants?: number | null;
    primary?: boolean;
  } = {}
): Promise<string> {
  const row = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connectionId,
      external_id: over.externalId ?? `cal-${uuidv7()}`,
      summary: over.summary ?? "Home",
      access_role: over.accessRole ?? "owner",
      selected: over.selected ?? true,
      participants: over.participants === undefined ? 1 : over.participants,
      is_primary: over.primary ?? false,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function idOf(externalId: string, connectionId: string): Promise<string> {
  const row = await db
    .selectFrom("connector_calendars")
    .select("id")
    .where("external_id", "=", externalId)
    .where("connection_id", "=", connectionId)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function event(
  accountId: string,
  calendarId: string,
  title: string,
  at: string,
  over: { sourceRef?: string; untrusted?: boolean; createdByMe?: boolean | null; invitedMe?: boolean | null } = {},
) {
  const external = (await db.selectFrom("connector_calendars").select("external_id").where("id", "=", calendarId).executeTakeFirstOrThrow()).external_id;
  await db
    .insertInto("connector_events")
    .values({
      account_id: accountId,
      calendar_id: calendarId,
      source_ref: over.sourceRef ?? `${external}:${uuidv7()}`,
      title,
      occurs_at: new Date(at),
      occurs_end_at: new Date(new Date(at).getTime() + 3600_000),
      untrusted: over.untrusted ?? false,
      attendees: JSON.stringify([{ name: "Ana", email: "ana@example.com", response: "accepted" }]),
      created_by_me: over.createdByMe === undefined ? true : over.createdByMe,
      invited_me: over.invitedMe === undefined ? false : over.invitedMe,
    } as never)
    .execute();
}

async function thread(accountId: string, name = "Lisbon trip"): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function join(accountId: string, threadId: string) {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state: "accepted" }).execute();
}

async function pick(threadId: string, calendarId: string, accountId: string) {
  await db.insertInto("thread_calendars").values({ thread_id: threadId, calendar_id: calendarId, account_id: accountId }).execute();
}

async function row(accountId: string, threadId: string, title: string, messageId: string | null, at: string | null = "2026-09-22T15:00:00Z") {
  const r = await db
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: threadId,
      type: "event",
      title,
      occurs_at: at ? new Date(at) : null,
      derived_from_message_id: messageId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return r.id;
}

/** A dump with a job against it, the way the route writes one. */
async function dump(accountId: string, lookingAt: string | null = null, conversationId: string | null = null) {
  const conversation = conversationId
    ? { id: conversationId }
    : await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id,
      account_id: accountId,
      role: "person",
      type: "text",
      turn_id: turnId,
      text: "dentist Tuesday 3pm",
      state: "seen",
      looking_at_thread_id: lookingAt,
    })
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
  return { conversationId: conversation.id, messageId: message.id, turnId, jobId: job.id };
}

const tool = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/tool-call",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

const get = (url: string, cookie: string) => app.inject({ method: "GET", url, headers: { cookie } });

/** The calendar a `createEvent` call went to, as Google names it. */
const calledWith = (call: number): unknown => (google.createEvent.mock.calls[call] as unknown[] | undefined)?.[1];

describe("AC-7, AC-9 the picks", () => {
  it("a non-member is 404 on the list, the pick and the events", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    const id = await calendar(await connection(other));
    const cookie = await signIn(other);
    expect((await get(`/v1/threads/${t}/calendars`, cookie)).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "PATCH", url: `/v1/threads/${t}/calendars/${id}`, headers: { cookie }, payload: { picked: true } })).statusCode
    ).toBe(404);
    expect((await get(`/v1/threads/${t}/events?from=2026-09-01&to=2026-09-30`, cookie)).statusCode).toBe(404);
  });

  it("picking a calendar you do not own is 404, and picking your own is stored with your id", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const mine = await calendar(await connection(me));
    const theirs = await calendar(await connection(other));
    const cookie = await signIn(me);

    const refused = await app.inject({ method: "PATCH", url: `/v1/threads/${t}/calendars/${theirs}`, headers: { cookie }, payload: { picked: true } });
    expect(refused.statusCode).toBe(404);

    const picked = await app.inject({ method: "PATCH", url: `/v1/threads/${t}/calendars/${mine}`, headers: { cookie }, payload: { picked: true } });
    expect(picked.statusCode).toBe(200);
    const stored = await db.selectFrom("thread_calendars").selectAll().where("thread_id", "=", t).execute();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.account_id).toBe(me);

    const detail = await get(`/v1/threads/${t}`, cookie);
    expect((detail.json() as { calendars: unknown }).calendars).toEqual({ picked: 1, total: 1, anyPicked: true });
  });

  it("the envelope says null with no connection, and counts only your own", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    expect((await get(`/v1/threads/${t}`, await signIn(me)).then((r) => r.json() as { calendars: unknown })).calendars).toBeNull();

    const theirs = await calendar(await connection(other));
    await pick(t, theirs, other);
    await connection(me);
    const mine = await get(`/v1/threads/${t}`, await signIn(me));
    expect((mine.json() as { calendars: unknown }).calendars).toEqual({ picked: 0, total: 0, anyPicked: true });
  });

  it("the list names the other members with picks and counts their calendars, never naming them", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const n = await connection(other);
    await pick(t, await calendar(n, { summary: "Secret work" }), other);
    await pick(t, await calendar(n, { summary: "Family" }), other);
    await connection(me);

    const body = (await get(`/v1/threads/${t}/calendars`, await signIn(me))).json() as { calendars: unknown[]; others: unknown[] };
    expect(body.calendars).toEqual([]);
    expect(body.others).toEqual([{ displayName: "Tom Reilly", count: 2 }]);
    expect(JSON.stringify(body)).not.toContain("Secret work");

    // Two members with one name are two lines, not one with a summed count.
    const twin = await account("Tom Reilly");
    await join(twin, t);
    await pick(t, await calendar(await connection(twin)), twin);
    const again = (await get(`/v1/threads/${t}/calendars`, await signIn(me))).json() as { others: unknown[] };
    expect(again.others).toEqual([
      { displayName: "Tom Reilly", count: 2 },
      { displayName: "Tom Reilly", count: 1 },
    ]);
  });

  it("a member leaving takes their picks with them", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    await pick(t, await calendar(await connection(me)), me);
    await pick(t, await calendar(await connection(other)), other);

    const left = await app.inject({ method: "DELETE", url: `/v1/threads/${t}`, headers: { cookie: await signIn(other) } });
    expect(left.statusCode).toBe(200);
    const remaining = await db.selectFrom("thread_calendars").select("account_id").where("thread_id", "=", t).execute();
    expect(remaining.map((r) => r.account_id)).toEqual([me]);
  });
});

describe("AC-10, AC-12 what a thread reads", () => {
  it("draws every member's picks, marks another member's as untrusted, and carries no guests or place", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const mine = await calendar(await connection(me), { summary: "Home" });
    const theirs = await calendar(await connection(other), { summary: "Work" });
    await pick(t, mine, me);
    await pick(t, theirs, other);
    await event(me, mine, "Dentist", "2026-09-22T15:00:00Z");
    await event(other, theirs, "Standup", "2026-09-23T09:00:00Z");

    const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as {
      events: Array<Record<string, unknown>>;
    };
    expect(body.events.map((e) => e["title"])).toEqual(["Dentist", "Standup"]);
    expect(body.events[0]!["untrusted"]).toBe(false);
    expect(body.events[1]!["untrusted"]).toBe(true);
    expect(body.events[1]!["calendarName"]).toBe("Work");
    expect(JSON.stringify(body)).not.toContain("ana@example.com");
    expect(JSON.stringify(body)).not.toContain("attendees");
  });

  it("an un-approved pick reads as nothing", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me), { selected: false });
    await pick(t, id, me);
    await event(me, id, "Dentist", "2026-09-22T15:00:00Z");
    const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it("a connection that needs a sign-in keeps its picks, its count and its held events; only a write refuses", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const id = await calendar(n, { summary: "Home" });
    await pick(t, id, me);
    await event(me, id, "Dentist", "2026-09-22T15:00:00Z");
    await db.updateTable("connector_connections").set({ state: "needs_reauth" }).where("id", "=", n).execute();
    const cookie = await signIn(me);

    const sheet = (await get(`/v1/threads/${t}/calendars`, cookie)).json() as { calendars: Array<{ name: string; picked: boolean }> };
    expect(sheet.calendars).toEqual([expect.objectContaining({ name: "Home", picked: true })]);
    const bundle = (await get(`/v1/threads/${t}`, cookie)).json() as { calendars: { picked: number; total: number } };
    expect(bundle.calendars).toEqual({ picked: 1, total: 1, anyPicked: true });
    const rail = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, cookie)).json() as { events: Array<{ title: string }> };
    expect(rail.events.map((e) => e.title)).toEqual(["Dentist"]);

    // The write is where the state tells: the real token step refuses, by
    // name and without reaching Google.
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Haircut", messageId);
    tokens.real = true;
    try {
      const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
      expect(result).toEqual({ ok: false, error: "needs_reconnect" });
    } finally {
      tokens.real = false;
    }
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("two connections to the same Google calendar draw an event once", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const mine = await calendar(await connection(me), { externalId: "family@group" });
    const theirs = await calendar(await connection(other), { externalId: "family@group" });
    await pick(t, mine, me);
    await pick(t, theirs, other);
    await event(me, mine, "Dinner", "2026-09-22T19:00:00Z", { sourceRef: "family@group:evt1" });
    await event(other, theirs, "Dinner", "2026-09-22T19:00:00Z", { sourceRef: "family@group:evt1" });

    const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as { events: unknown[] };
    expect(body.events).toHaveLength(1);
  });

  it("an event a row in the thread remembers is skipped, so it draws once", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me), { externalId: "cal-1" });
    await pick(t, id, me);
    await event(me, id, "Dentist", "2026-09-22T15:00:00Z", { sourceRef: "cal-1:evt1" });
    await db
      .insertInto("content")
      .values({ account_id: me, thread_id: t, type: "event", title: "Dentist", occurs_at: new Date("2026-09-22T15:00:00Z"), source_ref: "cal-1:evt1" })
      .execute();
    const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it("an occurrence of a series a row in the thread remembers is skipped too", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me), { externalId: "cal-1" });
    await pick(t, id, me);
    await event(me, id, "Standup", "2026-09-23T09:00:00Z", { sourceRef: "cal-1:series1_20260923" });
    await db.updateTable("connector_events").set({ series_ref: "series1" }).where("source_ref", "=", "cal-1:series1_20260923").execute();
    await db
      .insertInto("content")
      .values({ account_id: me, thread_id: t, type: "event", title: "Standup", occurs_at: new Date("2026-09-22T09:00:00Z"), rrule: "FREQ=DAILY", source_ref: "cal-1:series1" })
      .execute();
    const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as { events: unknown[] };
    expect(body.events).toEqual([]);
  });
});

describe("027 tweak: whether the viewer is in an event", () => {
  it("keeps every event on the thread and says which ones the viewer is not part of", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const shared = await calendar(await connection(me), { summary: "Family" });
    const theirs = await calendar(await connection(other), { summary: "Work" });
    await pick(t, shared, me);
    await pick(t, theirs, other);
    await event(me, shared, "My run", "2026-09-22T07:00:00Z", { createdByMe: true });
    await event(me, shared, "Our dinner", "2026-09-22T19:00:00Z", { createdByMe: false, invitedMe: true });
    await event(me, shared, "Her class", "2026-09-23T08:00:00Z", { createdByMe: false, invitedMe: false });
    await event(me, shared, "Not read yet", "2026-09-23T12:00:00Z", { createdByMe: null, invitedMe: null });
    await event(other, theirs, "Tom's standup", "2026-09-24T09:00:00Z", { createdByMe: true });

    const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as {
      events: Array<{ title: string; involved: boolean }>;
    };
    expect(body.events.map((e) => [e.title, e.involved])).toEqual([
      ["My run", true],
      ["Our dinner", true],
      ["Her class", false],
      ["Not read yet", true],
      ["Tom's standup", false],
    ]);
  });
});

describe("027 tweak: the viewer's own copy of a calendar two members connect", () => {
  it("reads the viewer's own copy, so their own event is never not theirs", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const external = `cal-${uuidv7()}`;
    const mine = await calendar(await connection(me), { summary: "Family", externalId: external });
    const theirs = await calendar(await connection(other), { summary: "Family", externalId: external });
    await pick(t, mine, me);
    await pick(t, theirs, other);
    const ref = `${external}:evt-1`;
    await event(other, theirs, "My run", "2026-09-22T07:00:00Z", { sourceRef: ref, createdByMe: false });
    await event(me, mine, "My run", "2026-09-22T07:00:00Z", { sourceRef: ref, createdByMe: true });
    for (let i = 0; i < 3; i += 1) {
      const body = (await get(`/v1/threads/${t}/events?from=2026-09-21&to=2026-09-27`, await signIn(me))).json() as {
        events: Array<{ title: string; involved: boolean; untrusted: boolean }>;
      };
      expect(body.events.map((e) => [e.title, e.involved, e.untrusted])).toEqual([["My run", true, false]]);
    }
  });
});

describe("AC-10 the agent's scope", () => {
  it("in a thread, reads through its picks; from Today, every approved calendar", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const n = await connection(me);
    const inThread = await calendar(n, { summary: "Home" });
    const elsewhere = await calendar(n, { summary: "Personal" });
    const theirs = await calendar(await connection(other), { summary: "Work" });
    await pick(t, inThread, me);
    await pick(t, theirs, other);

    const inside = await dump(me, t);
    const listed = (await tool({ tool: "list_calendars", jobId: inside.jobId, toolCallId: "c1" })).json() as {
      calendars: Array<{ name: string; yours: boolean; writable: boolean }>;
    };
    expect(listed.calendars.map((c) => c.name).sort()).toEqual(["Home", "Work"]);
    expect(listed.calendars.find((c) => c.name === "Work")).toMatchObject({ yours: false, writable: false });

    const today = await dump(me, null);
    const all = (await tool({ tool: "list_calendars", jobId: today.jobId, toolCallId: "c2" })).json() as { calendars: Array<{ name: string }> };
    expect(all.calendars.map((c) => c.name).sort()).toEqual(["Home", "Personal"]);
    void elsewhere;
  });

  it("find_events reads the copy and marks another member's events", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const mine = await calendar(await connection(me));
    const theirs = await calendar(await connection(other));
    await pick(t, mine, me);
    await pick(t, theirs, other);
    await event(me, mine, "Dentist", "2026-09-22T15:00:00Z");
    await event(other, theirs, "Standup", "2026-09-23T09:00:00Z");

    const { jobId } = await dump(me, t);
    const found = (
      await tool({ tool: "find_events", jobId, toolCallId: "f1", fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" })
    ).json() as { events: Array<{ title: string; untrusted: boolean }> };
    expect(found.events.map((e) => [e.title, e.untrusted])).toEqual([
      ["Dentist", false],
      ["Standup", true],
    ]);
  });
});

describe("027 tweak: what the model reads says whose each event is", () => {
  it("find_events returns everything on the calendars, each marked yours or not", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    const shared = await calendar(await connection(me), { summary: "Family" });
    const theirs = await calendar(await connection(other));
    await pick(t, shared, me);
    await pick(t, theirs, other);
    await event(me, shared, "My run", "2026-09-22T07:00:00Z", { createdByMe: true });
    await event(me, shared, "Our dinner", "2026-09-22T19:00:00Z", { createdByMe: false, invitedMe: true });
    await event(me, shared, "Her class", "2026-09-23T08:00:00Z", { createdByMe: false, invitedMe: false });
    await event(me, shared, "Not read yet", "2026-09-23T12:00:00Z", { createdByMe: null, invitedMe: null });
    await event(other, theirs, "Standup", "2026-09-24T09:00:00Z", { createdByMe: true });

    const { jobId } = await dump(me, t);
    const found = (
      await tool({ tool: "find_events", jobId, toolCallId: "f2", fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" })
    ).json() as { events: Array<{ title: string; yours: boolean }> };
    expect(found.events.map((e) => [e.title, e.yours])).toEqual([
      ["My run", true],
      ["Our dinner", true],
      ["Her class", false],
      ["Not read yet", true],
      ["Standup", false],
    ]);
  });
});

describe("AC-11 where a write goes", () => {
  it("one writable pick: written, and the row remembers its event", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me));
    await pick(t, id, me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result["written"]).toBe(true);
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    const after = await db.selectFrom("content").select("source_ref").where("id", "=", contentId).executeTakeFirstOrThrow();
    expect(after.source_ref).toMatch(/:evt-/);

    const again = (await tool({ tool: "create_event", jobId, toolCallId: "w2", contentId })).json() as Record<string, unknown>;
    expect(again).toEqual({ ok: false, error: "already_on_calendar" });
  });

  it("an event offload just wrote is in the copy at once, so the next turn can find it and remove it", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me));
    await pick(t, id, me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Pick up car", messageId);
    await tool({ tool: "create_event", jobId, toolCallId: "m1", contentId });

    // No sync has run. The quarter-hour chain is what brought a written event
    // back before, so "delete it" a minute later found nothing to delete.
    const window = { fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" };
    const next = await dump(me, t);
    const found = (await tool({ tool: "find_events", jobId: next.jobId, toolCallId: "m2", ...window })).json() as {
      events: Array<{ title: string; sourceRef: string; yours: boolean; untrusted: boolean }>;
    };
    expect(found.events.map((e) => [e.title, e.yours, e.untrusted])).toEqual([["Pick up car", true, false]]);

    const later = await dump(me, t);
    const gone = (
      await tool({ tool: "delete_event", jobId: later.jobId, toolCallId: "m3", sourceRef: found.events[0]!.sourceRef, scope: "one" })
    ).json() as Record<string, unknown>;
    expect(gone["written"]).toBe(true);
    const after = (await tool({ tool: "find_events", jobId: later.jobId, toolCallId: "m4", ...window })).json() as { events: unknown[] };
    expect(after.events).toEqual([]);
  });

  /** An event on their own calendar, put there by an earlier turn, and a new
   *  turn that has read the calendar and so holds the event's reference. */
  async function readTurn(me: string, t: string, title = "Dentist appointment") {
    const first = await dump(me, t);
    const contentId = await row(me, t, title, first.messageId);
    await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "r1", contentId });
    const next = await dump(me, t, first.conversationId);
    const found = (
      await tool({ tool: "find_events", jobId: next.jobId, toolCallId: "r2", fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" })
    ).json() as { events: Array<{ sourceRef: string }> };
    google.createEvent.mockClear();
    google.deleteEvent.mockClear();
    google.patchEvent.mockClear();
    return { ...next, sourceRef: found.events[0]!.sourceRef };
  }
  const settle = async (messageId: string, conversationId: string) => {
    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
    await db.updateTable("conversations").set({ last_message_at: new Date() }).where("id", "=", conversationId).execute();
  };
  const window = { fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" };
  /** When `row` puts an event, and the hour a create gives it. */
  const STARTS = "2026-09-22T15:00:00Z";
  const ENDS = "2026-09-22T16:00:00Z";

  it("a removal that reaches nobody else is done with no control, the turn wears Done, and Undo puts the event back", async () => {
    // "Remove this from my calendar" was put to them first, because the turn
    // had read the calendar to find it. What Undo can take back is not asked
    // about: the event is kept for the Undo and re-added by it.
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me), { externalId: "cal-mine" }), me);
    const turn = await readTurn(me, t);

    const gone = (
      await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "d3", sourceRef: turn.sourceRef, scope: "one" })
    ).json() as Record<string, unknown>;
    expect(gone["written"]).toBe(true);
    expect(google.deleteEvent).toHaveBeenCalledTimes(1);
    const { waitingFor } = await import("../src/connectors/tool-calls.js");
    expect((await waitingFor([turn.messageId])).get(turn.messageId)).toBeUndefined();

    // A removal files no row, and the turn still did something.
    await settle(turn.messageId, turn.conversationId);
    const cookie = await signIn(me);
    const one = (await get(`/v1/messages/${turn.messageId}`, cookie)).json() as { filed: boolean; waiting: unknown };
    expect(one).toMatchObject({ filed: true, waiting: null });

    const undone = await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
    expect(undone.statusCode).toBe(200);
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    const [, calendarId, draft, notify] = google.createEvent.mock.calls[0] as unknown as [string, string, { title: string; startsAt: Date; endsAt: Date; attendees?: string[] }, boolean];
    expect(calendarId).toBe("cal-mine");
    expect(draft.title).toBe("Dentist appointment");
    expect(draft.startsAt.toISOString()).toBe(new Date(STARTS).toISOString());
    expect(draft.endsAt.toISOString()).toBe(new Date(ENDS).toISOString());
    expect(notify).toBe(false);

    // It is on the calendar again as far as a turn can see, and what was kept
    // for the Undo is gone with it.
    const again = await dump(me, t);
    const found = (await tool({ tool: "find_events", jobId: again.jobId, toolCallId: "d4", ...window })).json() as { events: Array<{ title: string }> };
    expect(found.events.map((e) => e.title)).toEqual(["Dentist appointment"]);
    const kept = await db.selectFrom("connector_pending_writes").select("payload").execute();
    expect(kept.every((k) => JSON.stringify(k.payload) === "{}")).toBe(true);

    // Pressed twice, it is re-added once.
    await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
  });

  it("a change that reaches nobody else is done with no control, the turn wears Done, and Undo restores what it was", async () => {
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me), { externalId: "cal-mine" }), me);
    const turn = await readTurn(me, t);
    const eventId = turn.sourceRef.split(":").slice(1).join(":");

    const moved = (
      await tool({
        tool: "edit_event",
        jobId: turn.jobId,
        toolCallId: "e3",
        sourceRef: turn.sourceRef,
        scope: "one",
        title: "Dentist, moved",
        startsAt: "2026-09-23T10:00:00Z",
        endsAt: "2026-09-23T11:00:00Z",
      })
    ).json() as Record<string, unknown>;
    expect(moved["written"]).toBe(true);
    expect(google.patchEvent).toHaveBeenCalledTimes(1);

    await settle(turn.messageId, turn.conversationId);
    const cookie = await signIn(me);
    const one = (await get(`/v1/messages/${turn.messageId}`, cookie)).json() as { filed: boolean; waiting: unknown };
    expect(one).toMatchObject({ filed: true, waiting: null });

    const undone = await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
    expect(undone.statusCode).toBe(200);
    expect(google.patchEvent).toHaveBeenCalledTimes(2);
    const [, calendarId, id, patch] = google.patchEvent.mock.calls[1] as unknown as [string, string, string, Record<string, { dateTime?: string }> & { summary?: string }];
    expect([calendarId, id]).toEqual(["cal-mine", eventId]);
    expect(patch.summary).toBe("Dentist appointment");
    expect(patch["start"]?.dateTime).toBe(new Date(STARTS).toISOString());
    expect(patch["end"]?.dateTime).toBe(new Date(ENDS).toISOString());
    // A field the change left alone is not written back.
    expect("location" in patch).toBe(false);

    const again = await dump(me, t);
    const found = (await tool({ tool: "find_events", jobId: again.jobId, toolCallId: "e4", ...window })).json() as { events: Array<{ title: string; startsAt: string }> };
    expect(found.events.map((e) => [e.title, e.startsAt])).toEqual([["Dentist appointment", new Date(STARTS).toISOString()]]);
  });

  it("a time with no zone is read in the account's clock, for a change and for a read", async () => {
    // add_content reads "15:00" in their zone; edit_event and find_events
    // read it in the server's, which is UTC in production. Tokyo, so the
    // answer differs from both UTC and the clock of whoever runs this.
    const me = await account();
    const t = await thread(me);
    await db.updateTable("accounts").set({ time_zone: "Asia/Tokyo" }).where("id", "=", me).execute();
    await pick(t, await calendar(await connection(me), { externalId: "cal-mine" }), me);
    const turn = await readTurn(me, t);

    const found = (await tool({
      tool: "find_events", jobId: turn.jobId, toolCallId: "z1", fromIso: "2026-09-23T00:30:00", toIso: "2026-09-23T01:30:00",
    })).json() as { events: Array<{ title: string }> };
    expect(found.events.map((e) => e.title)).toEqual(["Dentist appointment"]);

    const moved = (await tool({
      tool: "edit_event", jobId: turn.jobId, toolCallId: "z2", sourceRef: turn.sourceRef, scope: "one",
      startsAt: "2026-10-20T15:00", endsAt: "2026-10-20T16:00",
    })).json() as Record<string, unknown>;
    expect(moved["written"]).toBe(true);
    const [, , , patch] = google.patchEvent.mock.calls[0] as unknown as [string, string, string, Record<string, { dateTime?: string }>];
    expect(patch["start"]?.dateTime).toBe("2026-10-20T06:00:00.000Z");
    expect(patch["end"]?.dateTime).toBe("2026-10-20T07:00:00.000Z");
  });

  it("a day name where a date goes is refused by name, never a 500", async () => {
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const turn = await readTurn(me, t);

    const read = await tool({ tool: "find_events", jobId: turn.jobId, toolCallId: "y1", fromIso: "Friday", toIso: "2026-09-28T00:00:00Z" });
    expect([read.statusCode, read.json()]).toEqual([200, { ok: false, error: "bad_date" }]);
    const change = await tool({
      tool: "edit_event", jobId: turn.jobId, toolCallId: "y2", sourceRef: turn.sourceRef, scope: "one", startsAt: "Friday",
    });
    expect([change.statusCode, change.json()]).toEqual([200, { ok: false, error: "bad_date" }]);
    expect(google.patchEvent).not.toHaveBeenCalled();
  });

  it("an all-day row goes up as days, its end the day after its last", async () => {
    // Stored at noon UTC with attrs.all_day, it went to Google as a one-hour
    // event at noon UTC. Google's all-day end is exclusive.
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const { jobId, messageId } = await dump(me, t);
    const days = async (title: string, end: string | null) =>
      (await db
        .insertInto("content")
        .values({
          account_id: me, thread_id: t, type: "event", title, derived_from_message_id: messageId,
          occurs_at: new Date("2026-10-24T12:00:00Z"), occurs_end_at: end ? new Date(end) : null,
          attrs: JSON.stringify({ all_day: true }),
        })
        .returning("id").executeTakeFirstOrThrow()).id;
    await tool({ tool: "create_event", jobId, toolCallId: "a1", contentId: await days("Lisbon weekend", "2026-10-25T12:00:00Z") });
    await tool({ tool: "create_event", jobId, toolCallId: "a2", contentId: await days("Market day", null) });

    const drafts = google.createEvent.mock.calls.map((c) => (c as unknown as [string, string, { allDay?: boolean; startsAt: Date; endsAt: Date }])[2]);
    expect(drafts.map((d) => [d.allDay, d.startsAt.toISOString().slice(0, 10), d.endsAt.toISOString().slice(0, 10)])).toEqual([
      [true, "2026-10-24", "2026-10-26"],
      [true, "2026-10-24", "2026-10-25"],
    ]);
  });

  it("an all-day row a tapped calendar puts up goes as days too", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Work" });
    const { jobId, messageId } = await dump(me, t);
    const contentId = (await db
      .insertInto("content")
      .values({
        account_id: me, thread_id: t, type: "event", title: "Market day", derived_from_message_id: messageId,
        occurs_at: new Date("2026-10-24T12:00:00Z"), attrs: JSON.stringify({ all_day: true }),
      })
      .returning("id").executeTakeFirstOrThrow()).id;
    expect((await tool({ tool: "create_event", jobId, toolCallId: "b1", contentId })).json()).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").select("id").where("target_content_id", "=", contentId).executeTakeFirstOrThrow();

    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    const [, , draft] = google.createEvent.mock.calls[0] as unknown as [string, string, { allDay?: boolean; startsAt: Date; endsAt: Date }];
    expect([draft.allDay, draft.startsAt.toISOString().slice(0, 10), draft.endsAt.toISOString().slice(0, 10)]).toEqual([true, "2026-10-24", "2026-10-25"]);
  });

  it("after a read, a removal Undo cannot take back still waits, and says why in its own words", async () => {
    // "This and all following" ends a series. Nothing is kept that could put
    // a year of it back, so a turn that read a calendar puts it to them.
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const turn = await readTurn(me, t);

    const asked = (
      await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "f3", sourceRef: turn.sourceRef, scope: "following" })
    ).json() as Record<string, unknown>;
    expect(asked).toMatchObject({ ok: true, waitingForThem: true, because: "offload read a calendar this turn." });
    expect(google.deleteEvent).not.toHaveBeenCalled();

    const { waitingFor } = await import("../src/connectors/tool-calls.js");
    const waiting = (await waitingFor([turn.messageId])).get(turn.messageId);
    expect(waiting?.because).toBe("offload read a calendar this turn.");
    expect(waiting?.action).toBe("delete");

    const changed = (
      await tool({ tool: "edit_event", jobId: turn.jobId, toolCallId: "f4", sourceRef: turn.sourceRef, scope: "following", title: "Later" })
    ).json() as Record<string, unknown>;
    expect(changed).toMatchObject({ ok: true, waitingForThem: true, because: "offload read a calendar this turn." });
    expect(google.patchEvent).not.toHaveBeenCalled();
  });

  it("a removal other people would see, or one they asked to check, still waits; agreed to, Undo re-adds it with its guests", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me), { externalId: "cal-mine" });
    await pick(t, id, me);
    const turn = await readTurn(me, t);

    await db.updateTable("connector_calendars").set({ participants: 3 }).where("id", "=", id).execute();
    google.countParticipants.mockResolvedValue(3);
    const shared = (
      await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "g1", sourceRef: turn.sourceRef, scope: "one" })
    ).json() as Record<string, unknown>;
    expect(shared).toMatchObject({ waitingForThem: true, because: "Everyone on this calendar will see it." });
    const moved = (
      await tool({ tool: "edit_event", jobId: turn.jobId, toolCallId: "g2", sourceRef: turn.sourceRef, scope: "one", title: "Later" })
    ).json() as Record<string, unknown>;
    expect(moved).toMatchObject({ waitingForThem: true, because: "Everyone on this calendar will see it." });
    await db.deleteFrom("connector_pending_writes").execute();

    google.countParticipants.mockResolvedValue(1);
    await db.updateTable("accounts").set({ calendar_ask_first: true }).where("id", "=", me).execute();
    const checked = (
      await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "g3", sourceRef: turn.sourceRef, scope: "one" })
    ).json() as Record<string, unknown>;
    expect(checked).toMatchObject({ waitingForThem: true, because: "You asked to check first." });
    await db.deleteFrom("connector_pending_writes").execute();
    await db.updateTable("accounts").set({ calendar_ask_first: false }).where("id", "=", me).execute();

    google.getEvent.mockResolvedValue({ attendees: ["ana@example.com"], seriesId: null, startsAt: new Date(STARTS), recurrence: [] } as never);
    try {
      const guests = (
        await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "g4", sourceRef: turn.sourceRef, scope: "one" })
      ).json() as Record<string, unknown>;
      expect(guests).toMatchObject({ waitingForThem: true, because: "ana@example.com will be told." });
      expect(google.deleteEvent).not.toHaveBeenCalled();

      const cookie = await signIn(me);
      const pending = await db.selectFrom("connector_pending_writes").select("id").executeTakeFirstOrThrow();
      const pressed = await app.inject({ method: "POST", url: `/api/calendar/pending/${pending.id}/confirm`, headers: { cookie } });
      expect(pressed.statusCode).toBe(200);
      expect(google.deleteEvent).toHaveBeenCalledTimes(1);

      const undone = await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
      expect(undone.statusCode).toBe(200);
      const [, , draft, notify] = google.createEvent.mock.calls[0] as unknown as [string, string, { title: string; attendees?: string[] }, boolean];
      expect(draft).toMatchObject({ title: "Dentist appointment", attendees: ["ana@example.com"] });
      expect(notify).toBe(true);
    } finally {
      google.getEvent.mockResolvedValue(null as never);
    }
  });

  it("this and all following on a counted series changes this one, and says only this one changed", async () => {
    // S36. A counted rule cannot be split without counting what came before,
    // so one occurrence moves. The result says so; it used to read as done.
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me), { externalId: "cal-mine" }), me);
    const turn = await readTurn(me, t);
    const eventId = turn.sourceRef.split(":").slice(1).join(":");
    google.getEvent.mockImplementation((async (_token: string, _calendar: string, id: string) =>
      id === "ser"
        ? { attendees: [], seriesId: null, startsAt: new Date("2026-09-01T15:00:00Z"), recurrence: ["RRULE:FREQ=WEEKLY;COUNT=8"] }
        : { attendees: [], seriesId: "ser", startsAt: new Date(STARTS), recurrence: [] }) as never);
    try {
      const changed = (
        await tool({ tool: "edit_event", jobId: turn.jobId, toolCallId: "s1", sourceRef: turn.sourceRef, scope: "following", title: "Later" })
      ).json() as Record<string, unknown>;
      expect(changed).toMatchObject({ ok: true, written: true, scope: "this", line: "Only this one changed." });
      expect(google.createEvent).not.toHaveBeenCalled();
      expect(google.patchEvent.mock.calls.map((c) => (c as unknown as [string, string, string])[2])).toEqual([eventId]);
    } finally {
      google.getEvent.mockImplementation(async () => null);
    }
  });

  it("what is kept for an Undo goes on the daily purge, and the turn still wears Done", async () => {
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const turn = await readTurn(me, t);
    await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "p1", sourceRef: turn.sourceRef, scope: "one" });
    await settle(turn.messageId, turn.conversationId);

    const { forgetPendingWrites } = await import("../src/connectors/tool-calls.js");
    await forgetPendingWrites();
    const kept = await db.selectFrom("connector_pending_writes").select(["payload", "source_ref"]).execute();
    expect(kept).toEqual([{ payload: {}, source_ref: null }]);

    const cookie = await signIn(me);
    expect(((await get(`/v1/messages/${turn.messageId}`, cookie)).json() as { filed: boolean }).filed).toBe(true);
    // Nothing left to re-add, so Undo re-adds nothing.
    await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  // Today draws a day from today on, so these are dated from the clock.
  const SOON = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  const LATER = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const soonWindow = { fromIso: `${SOON}T00:00:00Z`, toIso: `${LATER}T23:59:00Z` };
  type Drawn = { title: string; source: string; startsAt: string | null };
  const todayOn = async (cookie: string, date: string): Promise<Drawn[]> =>
    ((await get(`/v1/today/day?date=${date}`, cookie)).json() as { events: Drawn[] }).events;
  /** "Add a dentist appointment", then a later turn that found it. */
  async function added(me: string, t: string) {
    const first = await dump(me, t);
    const contentId = await row(me, t, "Dentist appointment", first.messageId, `${SOON}T15:00:00Z`);
    await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "t1", contentId });
    const next = await dump(me, t, first.conversationId);
    const found = (await tool({ tool: "find_events", jobId: next.jobId, toolCallId: "t2", ...soonWindow })).json() as { events: Array<{ sourceRef: string }> };
    return { ...next, contentId, sourceRef: found.events[0]!.sourceRef };
  }

  it("a removal takes the row the add filed, so Today stops drawing it, and Undo brings both back, drawn once", async () => {
    // "Delete my dentist appointment" took the event off the calendar and
    // left the row the add had filed, which Today went on drawing.
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me), { externalId: "cal-mine" }), me);
    const turn = await added(me, t);
    const cookie = await signIn(me);
    expect((await todayOn(cookie, SOON)).map((e) => [e.title, e.source])).toEqual([["Dentist appointment", "offload"]]);

    const gone = (
      await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "t3", sourceRef: turn.sourceRef, scope: "one" })
    ).json() as Record<string, unknown>;
    expect(gone["written"]).toBe(true);
    expect(await todayOn(cookie, SOON)).toEqual([]);
    const taken = await db.selectFrom("content").select(["deleted_at", "purge_after"]).where("id", "=", turn.contentId).executeTakeFirstOrThrow();
    expect(taken.deleted_at).not.toBeNull();
    expect(taken.purge_after).not.toBeNull();

    await settle(turn.messageId, turn.conversationId);
    // The turn names the thread it changed, so a screen that is open reads again.
    expect(((await get(`/v1/messages/${turn.messageId}`, cookie)).json() as { changed: string[] }).changed).toEqual([t]);
    const undone = await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
    expect(undone.statusCode).toBe(200);
    // One card, the row, which remembers the event Undo made of it.
    expect((await todayOn(cookie, SOON)).map((e) => [e.title, e.source])).toEqual([["Dentist appointment", "offload"]]);
    const back = await db.selectFrom("content").select(["deleted_at", "source_ref"]).where("id", "=", turn.contentId).executeTakeFirstOrThrow();
    expect(back.deleted_at).toBeNull();
    expect(back.source_ref).not.toBe(turn.sourceRef);
    const copy = await db.selectFrom("connector_events").select("source_ref").where("deleted_at", "is", null).execute();
    expect(copy.map((e) => e.source_ref)).toEqual([back.source_ref]);
  });

  it("a removal they agreed to takes the row as well", async () => {
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const turn = await added(me, t);
    await db.updateTable("accounts").set({ calendar_ask_first: true }).where("id", "=", me).execute();

    const asked = (
      await tool({ tool: "delete_event", jobId: turn.jobId, toolCallId: "t3", sourceRef: turn.sourceRef, scope: "one" })
    ).json() as Record<string, unknown>;
    expect(asked["waitingForThem"]).toBe(true);
    const cookie = await signIn(me);
    // Nothing has happened yet, so it is still there.
    expect((await todayOn(cookie, SOON)).length).toBe(1);

    const pending = await db.selectFrom("connector_pending_writes").select("id").executeTakeFirstOrThrow();
    const pressed = await app.inject({ method: "POST", url: `/api/calendar/pending/${pending.id}/confirm`, headers: { cookie } });
    expect(pressed.statusCode).toBe(200);
    expect(await todayOn(cookie, SOON)).toEqual([]);
  });

  it("a change moves the row with the event, so Today draws it on its new day, and Undo moves it back", async () => {
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const turn = await added(me, t);
    const cookie = await signIn(me);

    const moved = (
      await tool({
        tool: "edit_event",
        jobId: turn.jobId,
        toolCallId: "t3",
        sourceRef: turn.sourceRef,
        scope: "one",
        title: "Dentist, moved",
        startsAt: `${LATER}T10:00:00Z`,
        endsAt: `${LATER}T11:00:00Z`,
      })
    ).json() as Record<string, unknown>;
    expect(moved["written"]).toBe(true);
    expect(await todayOn(cookie, SOON)).toEqual([]);
    expect((await todayOn(cookie, LATER)).map((e) => [e.title, e.source, e.startsAt])).toEqual([
      ["Dentist, moved", "offload", new Date(`${LATER}T10:00:00Z`).toISOString()],
    ]);

    await settle(turn.messageId, turn.conversationId);
    expect(((await get(`/v1/messages/${turn.messageId}`, cookie)).json() as { changed: string[] }).changed).toEqual([t]);
    await app.inject({ method: "POST", url: `/v1/turns/${turn.turnId}/undo`, headers: { cookie } });
    expect(await todayOn(cookie, LATER)).toEqual([]);
    expect((await todayOn(cookie, SOON)).map((e) => [e.title, e.source, e.startsAt])).toEqual([
      ["Dentist appointment", "offload", new Date(`${SOON}T15:00:00Z`).toISOString()],
    ]);
  });

  it("an add to their own calendar is written with no control, even in a turn that read the calendar", async () => {
    // What the turn's Undo can take back is not put to them first. An add is
    // the one calendar write Undo covers: it deletes the event the turn made.
    // A change or a removal has no Undo, so after a read those still wait,
    // which the test above holds.
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me), { externalId: "cal-mine" });
    await pick(t, id, me);
    const { jobId, messageId, turnId } = await dump(me, t);
    await tool({ tool: "find_events", jobId, toolCallId: "u1", fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" });
    const contentId = await row(me, t, "Dentist", messageId);
    google.createEvent.mockClear();

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "u2", contentId })).json() as Record<string, unknown>;
    expect(result["written"]).toBe(true);
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    expect(await db.selectFrom("connector_pending_writes").select("id").execute()).toEqual([]);

    // And Undo on the turn takes the event back off the calendar.
    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
    google.deleteEvent.mockClear();
    const undone = await app.inject({ method: "POST", url: `/v1/turns/${turnId}/undo`, headers: { cookie: await signIn(me) } });
    expect(undone.statusCode).toBe(200);
    expect(google.deleteEvent).toHaveBeenCalledTimes(1);
  });

  it("two writable picks: a question, and nothing written", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await pick(t, await calendar(n, { summary: "Home" }), me);
    await pick(t, await calendar(n, { summary: "Family" }), me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: true, asked: true });
    expect(google.createEvent).not.toHaveBeenCalled();
    const q = await db.selectFrom("questions").selectAll().where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    expect(q.field).toBe("calendar");
    expect(q.text).toBe('Filed "Dentist". Which calendar?');
    const options = q.options as Array<{ label: string; value: string | null }>;
    // By name, and the way out last.
    expect(options.map((o) => o.label)).toEqual(["Family", "Home", "Not that"]);
    expect(q.previous_value).toBeNull();
  });

  it("one writable pick among two: written without asking", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await pick(t, await calendar(n, { summary: "Home" }), me);
    await pick(t, await calendar(n, { summary: "Holidays", accessRole: "reader" }), me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result["written"]).toBe(true);
  });

  it("no picks with approved calendars: a question that picks on the answer; nothing approved: noCalendar", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Family" });
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const asked = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(asked).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").selectAll().where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    expect(q.previous_value).toEqual({ picks: true });

    await db.updateTable("connector_calendars").set({ selected: false }).where("connection_id", "=", n).execute();
    const other = await row(me, t, "Dentist again", messageId);
    const none = (await tool({ tool: "create_event", jobId, toolCallId: "w2", contentId: other })).json() as Record<string, unknown>;
    expect(none).toEqual({ ok: true, noCalendar: true });
  });

  it("no picks and one approved writable calendar: written without a question, and the thread gets no pick", async () => {
    // One candidate is not a question. The owner was asked "which calendar"
    // with their only calendar as the only chip, and had to tap it.
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home", externalId: "cal-only" });
    await calendar(n, { summary: "Holidays", accessRole: "reader" });
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "o1", contentId })).json() as Record<string, unknown>;
    expect(result["written"]).toBe(true);
    expect(calledWith(0)).toBe("cal-only");
    expect(await db.selectFrom("questions").select("id").execute()).toEqual([]);
    // A pick is what a thread reads through, and in a shared thread everyone
    // sees it. Only a tap makes one.
    expect(await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute()).toEqual([]);
  });

  it("a calendar they named is the one written to, over the thread's own pick", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home", externalId: "cal-home" });
    await calendar(n, { summary: "P and B", externalId: "cal-pb" });
    await pick(t, home, me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (
      await tool({ tool: "create_event", jobId, toolCallId: "n1", contentId, calendar: "my shared calendar P and B" })
    ).json() as Record<string, unknown>;
    expect(result["written"]).toBe(true);
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    expect(calledWith(0)).toBe("cal-pb");
    const picks = await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute();
    expect(picks.map((p) => p.calendar_id)).toEqual([home]);
  });

  it("a named calendar other people can see waits, on that calendar", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await pick(t, await calendar(n, { summary: "Home" }), me);
    const shared = await calendar(n, { summary: "P and B", accessRole: "writer", participants: null });
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "n2", contentId, calendar: "P and B" })).json() as Record<string, unknown>;
    expect(result).toMatchObject({ ok: true, waitingForThem: true, because: "Everyone on this calendar will see it." });
    expect(google.createEvent).not.toHaveBeenCalled();
    const pending = await db.selectFrom("connector_pending_writes").select("calendar_id").executeTakeFirstOrThrow();
    expect(pending.calendar_id).toBe(shared);
  });

  it("a named calendar that is none of theirs is asked about, never swapped for the one they have", async () => {
    // The fault exactly: "add it to my shared calendar P and B" went on the
    // personal calendar without a word. One candidate is a default only when
    // nothing was named.
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "P and B", selected: false });
    await pick(t, home, me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "n3", contentId, calendar: "P and B" })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: true, asked: true });
    expect(google.createEvent).not.toHaveBeenCalled();
    const q = await db.selectFrom("questions").selectAll().where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    expect((q.options as Array<{ label: string }>).map((o) => o.label)).toEqual(["Home", "Not that"]);
  });

  it("a tapped calendar for a row where no thread is named says the turn did something, with no pill", async () => {
    // From Today the row lands in the default thread, which has no pill. The
    // tap's own reply is all the client has until a reload, so it has to say
    // the write happened, and it must not name the thread nothing else names.
    const me = await account();
    const loose = await thread(me);
    await db.updateTable("accounts").set({ default_thread_id: loose }).where("id", "=", me).execute();
    const n = await connection(me);
    await calendar(n, { summary: "Home", externalId: "cal-home" });
    await calendar(n, { summary: "Work" });
    const { jobId, messageId } = await dump(me);
    const contentId = await row(me, loose, "Dentist", messageId);
    const asked = (await tool({ tool: "create_event", jobId, toolCallId: "t1", contentId })).json() as Record<string, unknown>;
    expect(asked).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").select("id").where("target_content_id", "=", contentId).executeTakeFirstOrThrow();

    const cookie = await signIn(me);
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    expect(calledWith(0)).toBe("cal-home");
    const sent = response.json() as { messageId: string; threads: unknown[]; filed?: boolean };
    expect(sent.threads).toEqual([]);
    expect(sent.filed).toBe(true);

    // And the reload agrees with the tap.
    await db.updateTable("conversations").set({ last_message_at: new Date() }).execute();
    const tail = (await get("/v1/conversations/current", cookie)).json() as { messages: Array<{ id: string; filed: boolean; threads?: unknown[] }> };
    expect(tail.messages.find((m) => m.id === sent.messageId)).toMatchObject({ filed: true });
  });

  it("a tapped calendar that then waits for their go-ahead has not done anything yet", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Work" });
    await db.updateTable("accounts").set({ calendar_ask_first: true }).where("id", "=", me).execute();
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId });
    const q = await db.selectFrom("questions").select("id").where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    const sent = response.json() as { filed?: boolean; waiting: unknown };
    expect(sent.waiting).not.toBeNull();
    expect(sent.filed).toBe(false);
  });

  it("a name that fits two of theirs is asked about with those two, and the tap writes without picking", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Family", externalId: "cal-family" });
    await calendar(n, { summary: "Family trips" });
    await pick(t, home, me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);

    const result = (await tool({ tool: "create_event", jobId, toolCallId: "n4", contentId, calendar: "fam" })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").selectAll().where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    expect((q.options as Array<{ label: string }>).map((o) => o.label)).toEqual(["Family", "Family trips", "Not that"]);

    // Neither is picked in the thread. The tap is an answer about this one
    // event, so it writes there and the thread keeps the pick it had.
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    expect(calledWith(0)).toBe("cal-family");
    const picks = await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute();
    expect(picks.map((p) => p.calendar_id)).toEqual([home]);
  });

  it("the whole name beats a longer one that starts the same way, and 'my calendar' names nothing", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Family", externalId: "cal-family" });
    await calendar(n, { summary: "Family trips" });
    const first = await dump(me, t);
    const one = await row(me, t, "Dentist", first.messageId);
    const exact = (await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "n5", contentId: one, calendar: "Family" })).json() as Record<string, unknown>;
    expect(exact["written"]).toBe(true);
    expect(calledWith(0)).toBe("cal-family");

    const other = await account("Sam Ibekwe");
    const mine = await thread(other);
    await calendar(await connection(other), { summary: "Home", externalId: "cal-sam" });
    const next = await dump(other, mine);
    const two = await row(other, mine, "Dentist", next.messageId);
    const plain = (await tool({ tool: "create_event", jobId: next.jobId, toolCallId: "n6", contentId: two, calendar: "my calendar" })).json() as Record<string, unknown>;
    expect(plain["written"]).toBe(true);
    expect(calledWith(1)).toBe("cal-sam");
  });

  // 2026-10-05. "Also add it to my personal calendar" in a new thread asked
  // which calendar, with the one nobody else sees and the one shared with
  // Meera as the two chips. Mine is the one only they see.
  it("'my personal calendar' and 'my calendar' are the one nobody else sees, over a thread's pick", async () => {
    const me = await account("Behrooz Afghahi");
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    const shared = await calendar(n, { summary: "P**B", externalId: "cal-pb", participants: 2 });
    const { jobId, messageId } = await dump(me, t);

    const first = await row(me, t, "Pay mortgage", messageId);
    const personal = (
      await tool({ tool: "create_event", jobId, toolCallId: "p1", contentId: first, calendar: "my personal calendar" })
    ).json() as Record<string, unknown>;
    expect(personal["written"]).toBe(true);
    expect(calledWith(0)).toBe("cal-mine");

    // A thread reading through the shared one: "my calendar" still says whose.
    await pick(t, shared, me);
    const second = await row(me, t, "Dentist", messageId);
    const mine = (await tool({ tool: "create_event", jobId, toolCallId: "p2", contentId: second, calendar: "my calendar" })).json() as Record<string, unknown>;
    expect(mine["written"]).toBe(true);
    expect(calledWith(1)).toBe("cal-mine");
  });

  it("'my calendar' with two nobody else sees is the primary one, and 'our calendar' still names nothing", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Gym", externalId: "cal-gym" });
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    const { jobId, messageId } = await dump(me, t);
    const one = await row(me, t, "Dentist", messageId);
    const mine = (await tool({ tool: "create_event", jobId, toolCallId: "p3", contentId: one, calendar: "my own calendar" })).json() as Record<string, unknown>;
    expect(mine["written"]).toBe(true);
    expect(calledWith(0)).toBe("cal-mine");

    const two = await row(me, t, "Dentist again", messageId);
    const ours = (await tool({ tool: "create_event", jobId, toolCallId: "p4", contentId: two, calendar: "our calendar" })).json() as Record<string, unknown>;
    expect(ours).toEqual({ ok: true, asked: true });
  });

  it("'my calendar with Meera' is the one Meera has too, read from her own offload", async () => {
    const me = await account("Behrooz Afghahi");
    const meera = await account("Meera Sen");
    await db.insertInto("connections").values(me < meera ? { account_a: me, account_b: meera } : { account_a: meera, account_b: me }).execute();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    await calendar(n, { summary: "P**B", externalId: "cal-pb", participants: 2 });
    await calendar(n, { summary: "Work", externalId: "cal-work", participants: 5 });
    // Hers, approved in offload. She can see his primary too, which is "my
    // calendar", not the one called by her. One she did not approve is not
    // read: connecting is not consenting to all of them.
    const hers = await connection(meera);
    await calendar(hers, { summary: "P**B", externalId: "cal-pb", accessRole: "writer" });
    await calendar(hers, { summary: "me@g.com", externalId: "cal-mine", accessRole: "reader" });
    await calendar(hers, { summary: "Work", externalId: "cal-work", accessRole: "reader", selected: false });
    google.countParticipants.mockResolvedValue(2);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Pay mortgage", messageId);

    const result = (
      await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId, calendar: "my calendar with Meera" })
    ).json() as Record<string, unknown>;
    expect(result).toMatchObject({ ok: true, waitingForThem: true });
    const pending = await db.selectFrom("connector_pending_writes").select("calendar_id").executeTakeFirstOrThrow();
    expect(pending.calendar_id).toBe(await idOf("cal-pb", n));
    // Her offload answered, so Google was not asked.
    expect(google.sharedWith).not.toHaveBeenCalled();
  });

  it("'the calendar I share with Meera' falls back to who Google says each calendar is shared with", async () => {
    const me = await account("Behrooz Afghahi");
    const meera = await account("Meera Sen");
    await db.insertInto("connections").values(me < meera ? { account_a: me, account_b: meera } : { account_a: meera, account_b: me }).execute();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    await calendar(n, { summary: "P**B", externalId: "cal-pb", participants: 2 });
    await calendar(n, { summary: "Work", externalId: "cal-work", participants: 5 });
    google.sharedWith.mockImplementation(async (_token: string, id: string) =>
      id === "cal-pb" ? ["meera.sen@gmail.com"] : id === "cal-work" ? ["anoushka@work.com", "boss@work.com"] : []
    );
    google.countParticipants.mockResolvedValue(2);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Pay mortgage", messageId);

    const result = (
      await tool({ tool: "create_event", jobId, toolCallId: "w2", contentId, calendar: "the calendar I share with Meera" })
    ).json() as Record<string, unknown>;
    expect(result).toMatchObject({ ok: true, waitingForThem: true });
    const pending = await db.selectFrom("connector_pending_writes").select("calendar_id").executeTakeFirstOrThrow();
    expect(pending.calendar_id).toBe(await idOf("cal-pb", n));
    // Only calendars other people see are worth asking about.
    expect(google.sharedWith.mock.calls.map((call) => call[1]).sort()).toEqual(["cal-pb", "cal-work"]);
  });

  it("a calendar whose own name has 'with' in it is still found by its name, and 'personal calendar' alone is theirs", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    await calendar(n, { summary: "Dinner with friends", externalId: "cal-dinner", participants: 2 });
    google.countParticipants.mockResolvedValue(2);
    const { jobId, messageId } = await dump(me, t);

    const one = await row(me, t, "Tapas", messageId);
    const named = (await tool({ tool: "create_event", jobId, toolCallId: "d1", contentId: one, calendar: "Dinner with friends" })).json() as Record<string, unknown>;
    expect(named).toMatchObject({ ok: true, waitingForThem: true });
    expect(google.sharedWith).not.toHaveBeenCalled();

    google.countParticipants.mockResolvedValue(1);
    const two = await row(me, t, "Dentist", messageId);
    const personal = (await tool({ tool: "create_event", jobId, toolCallId: "d2", contentId: two, calendar: "personal calendar" })).json() as Record<string, unknown>;
    expect(personal["written"]).toBe(true);
    expect(calledWith(0)).toBe("cal-mine");
  });

  it("a connection's address on Google's list counts, and nobody matching is a question", async () => {
    const me = await account("Behrooz Afghahi");
    const sam = await account("Sam Ibekwe");
    await db.insertInto("connections").values(me < sam ? { account_a: me, account_b: sam } : { account_a: sam, account_b: me }).execute();
    const samEmail = (await db.selectFrom("accounts").select("email").where("id", "=", sam).executeTakeFirstOrThrow()).email;
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    await calendar(n, { summary: "Flat", externalId: "cal-flat", participants: 2 });
    google.sharedWith.mockImplementation(async (_token: string, id: string) => (id === "cal-flat" ? [samEmail] : []));
    google.countParticipants.mockResolvedValue(2);
    const { jobId, messageId } = await dump(me, t);

    const one = await row(me, t, "Bins", messageId);
    const found = (await tool({ tool: "create_event", jobId, toolCallId: "s1", contentId: one, calendar: "calendar with Sam" })).json() as Record<string, unknown>;
    expect(found).toMatchObject({ ok: true, waitingForThem: true });

    // Ana is nobody they are connected to. An address with her name in it
    // is not enough on its own, and Google is not asked.
    google.sharedWith.mockClear();
    google.sharedWith.mockImplementation(async (_token: string, id: string) => (id === "cal-flat" ? ["ana.sen@x.com"] : []));
    const two = await row(me, t, "Rent", messageId);
    const nobody = (await tool({ tool: "create_event", jobId, toolCallId: "s2", contentId: two, calendar: "my calendar with Ana" })).json() as Record<string, unknown>;
    expect(nobody).toEqual({ ok: true, asked: true });
    expect(google.sharedWith).not.toHaveBeenCalled();
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("a confirmed write is something the turn did: Done on the single read and in the tail, and after the purge", async () => {
    // Pressing the control made it vanish and drew nothing, live or after a
    // reload: a removal files no row, so nothing said the turn did anything.
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me));
    await pick(t, id, me);
    const first = await dump(me, t);
    const contentId = await row(me, t, "Dentist appointment", first.messageId);
    await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "c1", contentId });
    await db.updateTable("accounts").set({ calendar_ask_first: true }).where("id", "=", me).execute();

    const next = await dump(me, t, first.conversationId);
    const found = (
      await tool({ tool: "find_events", jobId: next.jobId, toolCallId: "c2", fromIso: "2026-09-21T00:00:00Z", toIso: "2026-09-28T00:00:00Z" })
    ).json() as { events: Array<{ sourceRef: string }> };
    await tool({ tool: "delete_event", jobId: next.jobId, toolCallId: "c3", sourceRef: found.events[0]!.sourceRef, scope: "one" });
    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", next.messageId).execute();
    await db.updateTable("conversations").set({ last_message_at: new Date() }).where("id", "=", first.conversationId).execute();

    const cookie = await signIn(me);
    type One = { filed: boolean; waiting: { id: string } | null };
    const before = (await get(`/v1/messages/${next.messageId}`, cookie)).json() as One;
    expect(before.filed).toBe(false);
    expect(before.waiting).not.toBeNull();

    const pressed = await app.inject({ method: "POST", url: `/api/calendar/pending/${before.waiting!.id}/confirm`, headers: { cookie } });
    expect(pressed.statusCode).toBe(200);

    const after = (await get(`/v1/messages/${next.messageId}`, cookie)).json() as One;
    expect(after.waiting).toBeNull();
    expect(after.filed).toBe(true);
    const tailOf = async () =>
      ((await get("/v1/conversations/current", cookie)).json() as { messages: Array<{ id: string; filed: boolean }> }).messages.find(
        (m) => m.id === next.messageId,
      );
    expect((await tailOf())?.filed).toBe(true);

    // The purge forgets what the proposal said and keeps that it happened.
    const { forgetPendingWrites } = await import("../src/connectors/tool-calls.js");
    await forgetPendingWrites();
    expect((await tailOf())?.filed).toBe(true);
  });

  it("a declined write is not something the turn did", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me));
    await pick(t, id, me);
    await db.updateTable("accounts").set({ calendar_ask_first: true }).where("id", "=", me).execute();
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    await tool({ tool: "create_event", jobId, toolCallId: "x1", contentId });
    // As if an earlier message had filed the row, so the only thing this turn
    // could have done is the write it proposed.
    await db.updateTable("content").set({ derived_from_message_id: null }).where("id", "=", contentId).execute();
    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
    const cookie = await signIn(me);
    const pending = await db.selectFrom("connector_pending_writes").select("id").executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/api/calendar/pending/${pending.id}/decline`, headers: { cookie } });
    const after = (await get(`/v1/messages/${messageId}`, cookie)).json() as { filed: boolean };
    expect(after.filed).toBe(false);
  });

  it("another member's calendar is never a write target", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    await pick(t, await calendar(await connection(other)), other);
    await connection(me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: true, noCalendar: true });
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("a row another member wrote is refused", async () => {
    const me = await account();
    const other = await account("Tom Reilly");
    const t = await thread(me);
    await join(other, t);
    await pick(t, await calendar(await connection(me)), me);
    const { jobId } = await dump(me, t);
    const theirs = await row(other, t, "Dentist", null);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId: theirs })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: false, error: "unknown_content" });
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("a row filed by an earlier turn goes on the calendar when they ask (the owner, 2026-10-13)", async () => {
    // "Please submit the rest": seven classes filed by an earlier turn were
    // each refused as unknown_content, because create_event took only a row
    // its own turn had filed. The row is theirs and has a time, and the turn
    // asking is the one any question hangs off.
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await pick(t, await calendar(n), me);
    const earlier = await dump(me, t);
    const contentId = await row(me, t, "Glass blowing class", earlier.messageId, "2026-12-07T18:00:00Z");
    const { jobId } = await dump(me, t, earlier.conversationId);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result).toMatchObject({ ok: true, written: true });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
  });

  it("an earlier turn's row that needs asking about hangs its question off the turn asking", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Family" });
    const earlier = await dump(me, t);
    const contentId = await row(me, t, "Glass blowing class", earlier.messageId, "2026-12-07T18:00:00Z");
    const now = await dump(me, t, earlier.conversationId);
    const result = (await tool({ tool: "create_event", jobId: now.jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").select(["message_id", "target_content_id"]).executeTakeFirstOrThrow();
    expect(q).toEqual({ message_id: now.messageId, target_content_id: contentId });
  });

  it("a row with no time is refused", async () => {
    const me = await account();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId, null);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: false, error: "no_time" });
  });

  it("reads the access list on the write path and confirms when it says more than one", async () => {
    const me = await account();
    const t = await thread(me);
    const id = await calendar(await connection(me), { participants: 1 });
    await pick(t, id, me);
    google.countParticipants.mockResolvedValue(2);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result["waitingForThem"]).toBe(true);
    expect(result["because"]).toBe("Everyone on this calendar will see it.");
    const stored = await db.selectFrom("connector_calendars").select("participants").where("id", "=", id).executeTakeFirstOrThrow();
    expect(stored.participants).toBe(2);
    const pending = await db.selectFrom("connector_pending_writes").select("content_id").executeTakeFirstOrThrow();
    expect(pending.content_id).toBe(contentId);
  });

  it("the ask-first switch confirms a write nobody else would see", async () => {
    const me = await account();
    await db.updateTable("accounts").set({ calendar_ask_first: true }).where("id", "=", me).execute();
    const t = await thread(me);
    await pick(t, await calendar(await connection(me)), me);
    const { jobId, messageId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result["because"]).toBe("You asked to check first.");
  });
});

describe("AC-11, AC-17 a tapped calendar answer", () => {
  async function askedQuestion(me: string, t: string, calendars: string[], picksOnAnswer: boolean) {
    const { jobId, messageId, conversationId } = await dump(me, t);
    const contentId = await row(me, t, "Dentist", messageId);
    if (!picksOnAnswer) for (const id of calendars) await pick(t, id, me);
    const result = (await tool({ tool: "create_event", jobId, toolCallId: "w1", contentId })).json() as Record<string, unknown>;
    expect(result).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").select("id").where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    return { questionId: q.id, contentId, conversationId };
  }

  it("settles first, writes outside, remembers after, and a second tap is 404", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home" });
    const family = await calendar(n, { summary: "Family" });
    const { questionId, contentId } = await askedQuestion(me, t, [home, family], false);
    const cookie = await signIn(me);

    const first = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie }, payload: { option: 1 } });
    expect(first.statusCode).toBe(200);
    const body = first.json() as { threads: Array<{ id: string }>; waiting: unknown };
    expect(body.threads.map((x) => x.id)).toEqual([t]);
    expect(body.waiting).toBeNull();
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    const after = await db.selectFrom("content").select("source_ref").where("id", "=", contentId).executeTakeFirstOrThrow();
    expect(after.source_ref).toMatch(/:evt-/);

    const second = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie }, payload: { option: 0 } });
    expect(second.statusCode).toBe(404);
    expect(google.createEvent).toHaveBeenCalledTimes(1);
  });

  it("the tap picks the calendar for a thread that had none", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    const family = await calendar(n, { summary: "Family" });
    const { questionId } = await askedQuestion(me, t, [], true);
    // Options are by name: Family, Home, Not that.
    const response = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    const picks = await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute();
    expect(picks.map((p) => p.calendar_id)).toEqual([family]);
  });

  it("rows filed in one turn share one question, and the tap writes every one of them (the owner, 2026-10-13)", async () => {
    // Eight glass blowing classes were filed and asked about; only the first
    // reached the calendar, because every raise in the turn took the same
    // ordinal and the rest were dropped on conflict.
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    const family = await calendar(n, { summary: "Family" });
    const { jobId, messageId, turnId } = await dump(me, t);
    const ids: string[] = [];
    for (const day of ["2026-11-30", "2026-12-07", "2026-12-14"]) {
      ids.push(await row(me, t, "Glass blowing class", messageId, `${day}T18:00:00Z`));
    }
    for (const [i, contentId] of ids.entries()) {
      const result = (await tool({ tool: "create_event", jobId, toolCallId: `g${i}`, contentId })).json() as Record<string, unknown>;
      expect(result).toEqual({ ok: true, asked: true });
    }
    const questions = await db.selectFrom("questions").selectAll().where("turn_id", "=", turnId).execute();
    expect(questions).toHaveLength(1);
    const q = questions[0]!;
    expect(q.target_content_id).toBe(ids[0]);
    expect(q.text).toBe('Filed "Glass blowing class" and 2 more. Which calendar?');
    expect(q.previous_value).toEqual({ picks: true, also: [ids[1], ids[2]] });

    // Family, Home, Not that: the tap writes all three and picks once.
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    expect(google.createEvent).toHaveBeenCalledTimes(3);
    const written = await db.selectFrom("content").select(["id", "source_ref"]).where("id", "in", ids).execute();
    expect(written.every((one) => one.source_ref?.includes(":evt-"))).toBe(true);
    const picks = await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute();
    expect(picks.map((p) => p.calendar_id)).toEqual([family]);
  });

  it("a calendar that needs the person's say-so turns the tap into a proposal on their own turn", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home", participants: 3 });
    const family = await calendar(n, { summary: "Family", participants: 3 });
    google.countParticipants.mockResolvedValue(3);
    const { questionId } = await askedQuestion(me, t, [home, family], false);
    const response = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { messageId: string; waiting: { id: string; because: string } | null };
    expect(body.waiting?.because).toBe("Everyone on this calendar will see it.");
    const pending = await db.selectFrom("connector_pending_writes").select("message_id").executeTakeFirstOrThrow();
    expect(pending.message_id).toBe(body.messageId);
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("the tap's rows on a shared calendar are one proposal, and agreeing to it writes every one (the owner, 2026-10-13)", async () => {
    // The tap wrote the first row as a proposal with a control, and the seven
    // others as proposals with none: one event reached the calendar and the
    // rest sat until the purge.
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home", participants: 3 });
    await calendar(n, { summary: "Family", participants: 3 });
    google.countParticipants.mockResolvedValue(3);
    const { jobId, messageId, turnId } = await dump(me, t);
    const ids: string[] = [];
    for (const day of ["2026-11-30", "2026-12-07", "2026-12-14"]) {
      ids.push(await row(me, t, "Glass blowing class", messageId, `${day}T18:00:00Z`));
    }
    for (const [i, contentId] of ids.entries()) {
      await tool({ tool: "create_event", jobId, toolCallId: `g${i}`, contentId });
    }
    const q = await db.selectFrom("questions").select("id").where("turn_id", "=", turnId).executeTakeFirstOrThrow();
    const cookie = await signIn(me);
    const response = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { waiting: { id: string; because: string } | null };
    expect(body.waiting?.because).toBe("Everyone on this calendar will see it. 3 events.");
    expect(google.createEvent).not.toHaveBeenCalled();

    const pressed = await app.inject({ method: "POST", url: `/api/calendar/pending/${body.waiting!.id}/confirm`, headers: { cookie } });
    expect(pressed.statusCode).toBe(200);
    expect(google.createEvent).toHaveBeenCalledTimes(3);
    const written = await db.selectFrom("content").select(["id", "source_ref"]).where("id", "in", ids).execute();
    expect(written.every((one) => one.source_ref?.includes(":evt-"))).toBe(true);
    const open = await db.selectFrom("connector_pending_writes").select("id").where("confirmed_at", "is", null).execute();
    expect(open).toHaveLength(0);
  });

  it("rows a turn proposed together on one calendar are one proposal, agreed to or declined with one tap", async () => {
    // The same eight classes through a thread with one pick: eight proposals
    // on one message, and the screen draws one control, so seven had no way
    // to be agreed to.
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await pick(t, await calendar(n, { participants: 3 }), me);
    google.countParticipants.mockResolvedValue(3);
    const cookie = await signIn(me);
    const propose = async () => {
      const { jobId, messageId } = await dump(me, t);
      const ids: string[] = [];
      for (const day of ["2026-11-30", "2026-12-07", "2026-12-14"]) {
        ids.push(await row(me, t, "Glass blowing class", messageId, `${day}T18:00:00Z`));
      }
      for (const [i, contentId] of ids.entries()) {
        const result = (await tool({ tool: "create_event", jobId, toolCallId: `g${i}`, contentId })).json() as Record<string, unknown>;
        expect(result).toMatchObject({ ok: true, waitingForThem: true });
      }
      await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
      const one = (await get(`/v1/messages/${messageId}`, cookie)).json() as { waiting: { id: string; because: string } | null };
      expect(one.waiting?.because).toBe("Everyone on this calendar will see it. 3 events.");
      return { ids, waitingId: one.waiting!.id };
    };

    const agreed = await propose();
    const pressed = await app.inject({ method: "POST", url: `/api/calendar/pending/${agreed.waitingId}/confirm`, headers: { cookie } });
    expect(pressed.statusCode).toBe(200);
    expect(google.createEvent).toHaveBeenCalledTimes(3);
    const written = await db.selectFrom("content").select("source_ref").where("id", "in", agreed.ids).execute();
    expect(written.every((one) => one.source_ref?.includes(":evt-"))).toBe(true);

    google.createEvent.mockClear();
    const declined = await propose();
    const refused = await app.inject({ method: "POST", url: `/api/calendar/pending/${declined.waitingId}/decline`, headers: { cookie } });
    expect(refused.statusCode).toBe(200);
    expect(google.createEvent).not.toHaveBeenCalled();
    const open = await db.selectFrom("connector_pending_writes").select("id").where("confirmed_at", "is", null).where("declined_at", "is", null).execute();
    expect(open).toHaveLength(0);
  });

  it("a proposal Google refuses on the tap stays open on its own, and the rest are written", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await pick(t, await calendar(n, { participants: 3 }), me);
    google.countParticipants.mockResolvedValue(3);
    const { jobId, messageId } = await dump(me, t);
    const ids: string[] = [];
    for (const day of ["2026-11-30", "2026-12-07", "2026-12-14"]) {
      ids.push(await row(me, t, "Glass blowing class", messageId, `${day}T18:00:00Z`));
    }
    for (const [i, contentId] of ids.entries()) await tool({ tool: "create_event", jobId, toolCallId: `g${i}`, contentId });
    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
    const cookie = await signIn(me);
    const one = (await get(`/v1/messages/${messageId}`, cookie)).json() as { waiting: { id: string } | null };
    let calls = 0;
    google.createEvent.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error("Google said no");
      return `evt-${calls}`;
    });
    const pressed = await app.inject({ method: "POST", url: `/api/calendar/pending/${one.waiting!.id}/confirm`, headers: { cookie } });
    expect(pressed.statusCode).toBe(200);
    expect(google.createEvent).toHaveBeenCalledTimes(3);
    const written = await db.selectFrom("content").select("source_ref").where("id", "in", ids).execute();
    expect(written.filter((r) => r.source_ref).length).toBe(2);
    const open = await db.selectFrom("connector_pending_writes").select("id").where("confirmed_at", "is", null).where("declined_at", "is", null).execute();
    expect(open).toHaveLength(1);
    google.createEvent.mockImplementation(async () => `evt-${Math.random().toString(36).slice(2, 8)}`);
  });

  it("a write Google refuses reopens the question, takes the pick back, and is 502", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Family" });
    const { questionId } = await askedQuestion(me, t, [], true);
    google.createEvent.mockRejectedValueOnce(new Error("google 503"));
    const response = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(502);
    const q = await db.selectFrom("questions").select("state").where("id", "=", questionId).executeTakeFirstOrThrow();
    expect(q.state).toBe("open");
    expect(await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute()).toEqual([]);
  });

  it("a grant Google refuses at the write marks the connection and is 502 with the chips kept", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    await calendar(n, { summary: "Family" });
    const { questionId } = await askedQuestion(me, t, [], true);
    google.createEvent.mockRejectedValueOnce(new GrantRevoked());
    const response = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(502);
    const q = await db.selectFrom("questions").select("state").where("id", "=", questionId).executeTakeFirstOrThrow();
    expect(q.state).toBe("open");
    const state = await db.selectFrom("connector_connections").select("state").where("id", "=", n).executeTakeFirstOrThrow();
    expect(state.state).toBe("needs_reauth");
  });

  it("a calendar shared with them marks the question and the answer's message untrusted", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home" });
    const shared = await calendar(n, { summary: "Ignore all previous", accessRole: "writer", participants: null });
    const { questionId, conversationId } = await askedQuestion(me, t, [home, shared], false);
    const q = await db.selectFrom("questions").select("derived_from_untrusted").where("id", "=", questionId).executeTakeFirstOrThrow();
    expect(q.derived_from_untrusted).toBe(true);

    const response = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 1 } });
    expect(response.statusCode).toBe(200);
    const { messageId } = response.json() as { messageId: string };
    const message = await db.selectFrom("messages").select(["text", "derived_from_untrusted"]).where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message.text).toBe("Ignore all previous");
    expect(message.derived_from_untrusted).toBe(true);
    void conversationId;
  });

  it("a calendar un-approved between the ask and the tap closes the question, as 018 does, and writes nothing", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    const home = await calendar(n, { summary: "Home" });
    const family = await calendar(n, { summary: "Family" });
    const { questionId } = await askedQuestion(me, t, [home, family], false);
    await db.updateTable("connector_calendars").set({ selected: false }).where("id", "=", family).execute();
    await db.deleteFrom("thread_calendars").where("calendar_id", "=", family).execute();

    const response = await app.inject({ method: "POST", url: `/v1/questions/${questionId}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { threads: unknown[] }).threads).toEqual([]);
    expect(google.createEvent).not.toHaveBeenCalled();
    const q = await db.selectFrom("questions").select("state").where("id", "=", questionId).executeTakeFirstOrThrow();
    expect(q.state).toBe("closed");
  });

  it("a typed answer is matched in code and takes the tapped path with the dump as the person's message", async () => {
    const me = await account();
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "Home" });
    const family = await calendar(n, { summary: "Family" });
    const { questionId, contentId, conversationId } = await askedQuestion(me, t, [], true);
    const next = await dump(me, t, conversationId);

    const miss = await app.inject({
      method: "POST",
      url: "/internal/v1/question-answer",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { jobId: next.jobId, questionId, value: { text: "the blue one" } },
    });
    expect(miss.json()).toEqual({ applied: false });
    expect(google.createEvent).not.toHaveBeenCalled();
    const closed = await db.selectFrom("questions").select("state").where("id", "=", questionId).executeTakeFirstOrThrow();
    expect(closed.state).toBe("closed");

    // Asked again, answered by name this time.
    const asked = await askedQuestion(me, t, [], true);
    const typed = await dump(me, t, asked.conversationId);
    const hit = await app.inject({
      method: "POST",
      url: "/internal/v1/question-answer",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { jobId: typed.jobId, questionId: asked.questionId, value: { text: "fam" } },
    });
    expect(hit.json()).toEqual({ applied: true });
    expect(google.createEvent).toHaveBeenCalledTimes(1);
    const q = await db
      .selectFrom("questions")
      .select(["state", "answered_message_id"])
      .where("id", "=", asked.questionId)
      .executeTakeFirstOrThrow();
    expect(q.state).toBe("answered");
    expect(q.answered_message_id).toBe(typed.messageId);
    const picks = await db.selectFrom("thread_calendars").select("calendar_id").where("thread_id", "=", t).execute();
    expect(picks.map((p) => p.calendar_id)).toEqual([family]);
    void contentId;
  });

  it("a typed answer matches one label by prefix and none by two", () => {
    const options = [
      { label: "Family", value: "a" },
      { label: "Family (Sam)", value: "b" },
      { label: "Home", value: "c" },
      { label: "Not that", value: null },
    ];
    expect(matchCalendarLabel("home", options)).toBe(2);
    expect(matchCalendarLabel("HOME ", options)).toBe(2);
    expect(matchCalendarLabel("family", options)).toBeNull();
    expect(matchCalendarLabel("not", options)).toBeNull();
    expect(matchCalendarLabel("", options)).toBeNull();
  });
});

// 038. A calendar named by who it is shared with, asked once in those words and
// remembered: "Which calendar is shared with Meera?".
describe("038 the calendar shared with somebody offload cannot find", () => {
  async function world() {
    const me = await account("Behrooz Afghahi");
    const t = await thread(me);
    const n = await connection(me);
    const mine = await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    const pb = await calendar(n, { summary: "P**B", externalId: "cal-pb", participants: 2 });
    google.countParticipants.mockResolvedValue(2);
    return { me, t, n, mine, pb };
  }

  /** What they said, which a remembered name has to come from. */
  const says = (messageId: string, text: string) => db.updateTable("messages").set({ text }).where("id", "=", messageId).execute();

  const memories = (accountId: string) =>
    db
      .selectFrom("notes")
      .select(["text", "origin", "kind", "calendar_id"])
      .where("scope", "=", "account")
      .where("subject_id", "=", accountId)
      .where("deleted_at", "is", null)
      .where("superseded_at", "is", null)
      .execute();

  it("asks in their words, with the row, and the answer writes the event and remembers who", async () => {
    const { me, t, mine, pb } = await world();
    const { jobId, messageId } = await dump(me, t);
    await says(messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const contentId = await row(me, t, "Pay mortgage", messageId);

    const asked = (await tool({ tool: "create_event", jobId, toolCallId: "m1", contentId, calendar: "my calendar with Meera" })).json() as Record<string, unknown>;
    expect(asked).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").selectAll().where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    expect(q.text).toBe('Filed "Pay mortgage". Which calendar is shared with Meera?');
    expect((q.options as Array<{ label: string }>).map((o) => o.label)).toEqual(["Behrooz Afghahi", "P**B", "Not that"]);
    expect(await memories(me)).toEqual([]);

    const tapped = await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 1 } });
    expect(tapped.statusCode).toBe(200);
    // Somebody else sees that calendar, so the write is put to them first.
    const pending = await db.selectFrom("connector_pending_writes").select("calendar_id").executeTakeFirstOrThrow();
    expect(pending.calendar_id).toBe(pb);
    // The calendar's name is never in it: it may be somebody else's words.
    expect(await memories(me)).toEqual([{ text: "They share a calendar with Meera.", origin: "answered", kind: "things", calendar_id: pb }]);
    void mine;
  });

  it("settles the next time from what it remembered, over the thread's pick and without Google", async () => {
    const { me, t, mine, pb } = await world();
    await pick(t, mine, me);
    const first = await dump(me, t);
    await says(first.messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const one = await row(me, t, "Pay mortgage", first.messageId);
    await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "m1", contentId: one, calendar: "my calendar with Meera" });
    const q = await db.selectFrom("questions").select("id").where("target_content_id", "=", one).executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 1 } });
    await db.deleteFrom("connector_pending_writes").execute();
    google.sharedWith.mockClear();

    const next = await dump(me, t, first.conversationId);
    await says(next.messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const two = await row(me, t, "Bins night", next.messageId);
    const settled = (await tool({ tool: "create_event", jobId: next.jobId, toolCallId: "m2", contentId: two, calendar: "calendar with MEERA" })).json() as Record<string, unknown>;
    expect(settled).toMatchObject({ ok: true, waitingForThem: true });
    expect((await db.selectFrom("connector_pending_writes").select("calendar_id").executeTakeFirstOrThrow()).calendar_id).toBe(pb);
    expect(google.sharedWith).not.toHaveBeenCalled();
  });

  it("asks again when the remembered calendar is no longer approved, and a second answer replaces the first", async () => {
    const { me, t, mine, pb } = await world();
    const first = await dump(me, t);
    await says(first.messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const one = await row(me, t, "Pay mortgage", first.messageId);
    await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "m1", contentId: one, calendar: "with Meera" });
    const q1 = await db.selectFrom("questions").select("id").where("target_content_id", "=", one).executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q1.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 1 } });

    await db.updateTable("connector_calendars").set({ selected: false }).where("id", "=", pb).execute();
    const next = await dump(me, t, first.conversationId);
    await says(next.messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const two = await row(me, t, "Bins night", next.messageId);
    expect((await tool({ tool: "create_event", jobId: next.jobId, toolCallId: "m2", contentId: two, calendar: "with Meera" })).json()).toEqual({ ok: true, asked: true });
    const q2 = await db.selectFrom("questions").select("id").where("target_content_id", "=", two).executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q2.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect((await memories(me)).map((m) => m.calendar_id)).toEqual([mine]);
  });

  it("remembers nothing on Not that, and a typed answer remembers like a tap", async () => {
    const { me, t, pb } = await world();
    const first = await dump(me, t);
    await says(first.messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const one = await row(me, t, "Pay mortgage", first.messageId);
    await tool({ tool: "create_event", jobId: first.jobId, toolCallId: "m1", contentId: one, calendar: "with Meera" });
    const q1 = await db.selectFrom("questions").select("id").where("target_content_id", "=", one).executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q1.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 2 } });
    expect(await memories(me)).toEqual([]);

    const second = await dump(me, t, first.conversationId);
    await says(second.messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const two = await row(me, t, "Bins night", second.messageId);
    await tool({ tool: "create_event", jobId: second.jobId, toolCallId: "m2", contentId: two, calendar: "with Meera" });
    const q2 = await db.selectFrom("questions").select("id").where("target_content_id", "=", two).executeTakeFirstOrThrow();
    const typed = await dump(me, t, first.conversationId);
    const hit = await app.inject({
      method: "POST",
      url: "/internal/v1/question-answer",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { jobId: typed.jobId, questionId: q2.id, value: { text: "P**B" } },
    });
    expect(hit.json()).toEqual({ applied: true });
    expect((await memories(me)).map((m) => m.calendar_id)).toEqual([pb]);
  });

  it("keeps the sentence inside the bound with a long title and a long name", async () => {
    const { me, t } = await world();
    const { jobId, messageId } = await dump(me, t);
    await says(messageId, "add it to my calendar with Meera, or Anoushka Sen-Mukherjee");
    const contentId = await row(me, t, "Pay the mortgage and the property tax and the water bill", messageId);
    await tool({ tool: "create_event", jobId, toolCallId: "m1", contentId, calendar: "my calendar with Anoushka Sen-Mukherjee" });
    const q = await db.selectFrom("questions").select("text").where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    expect(q.text.length).toBeLessThanOrEqual(80);
    expect(q.text).toMatch(/^Filed ".+". Which calendar is shared with Anoushka Sen-Ch…\?$/);
  });
});

describe("038 security review: a remembered name is theirs, from a clean turn", () => {
  async function world() {
    const me = await account("Behrooz Afghahi");
    const t = await thread(me);
    const n = await connection(me);
    await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    await calendar(n, { summary: "P**B", externalId: "cal-pb", participants: 2 });
    google.countParticipants.mockResolvedValue(2);
    return { me, t };
  }
  const memories = (accountId: string) =>
    db.selectFrom("notes").select("text").where("scope", "=", "account").where("subject_id", "=", accountId).execute();
  const answer = async (me: string, contentId: string) => {
    const q = await db.selectFrom("questions").select(["id", "text"]).where("target_content_id", "=", contentId).executeTakeFirstOrThrow();
    await app.inject({ method: "POST", url: `/v1/questions/${q.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 1 } });
    return q.text;
  };

  it("asks plainly and remembers nothing when the name is not in what they said", async () => {
    const { me, t } = await world();
    const { jobId, messageId } = await dump(me, t);
    await db.updateTable("messages").set({ text: "dentist tuesday 3pm" }).where("id", "=", messageId).execute();
    const contentId = await row(me, t, "Dentist", messageId);
    await tool({ tool: "create_event", jobId, toolCallId: "x1", contentId, calendar: "my calendar with Mallory" });
    expect(await answer(me, contentId)).toBe('Filed "Dentist". Which calendar?');
    expect(await memories(me)).toEqual([]);
  });

  it("asks plainly and remembers nothing in a turn that read a calendar", async () => {
    const { me, t } = await world();
    const { jobId, messageId } = await dump(me, t);
    await db.updateTable("messages").set({ text: "add it to my calendar with Meera" }).where("id", "=", messageId).execute();
    await db.updateTable("jobs").set({ payload: sql`payload || '{"sawApps": true}'::jsonb` }).where("id", "=", jobId).execute();
    const contentId = await row(me, t, "Dentist", messageId);
    await tool({ tool: "create_event", jobId, toolCallId: "x2", contentId, calendar: "my calendar with Meera" });
    expect(await answer(me, contentId)).toBe('Filed "Dentist". Which calendar?');
    expect(await memories(me)).toEqual([]);
  });
});

describe("038 security review: Undo on an answer takes its memory back", () => {
  it("removes the memory the answer wrote and puts back the one it replaced", async () => {
    const me = await account("Behrooz Afghahi");
    const t = await thread(me);
    const n = await connection(me);
    const mine = await calendar(n, { summary: "me@g.com", externalId: "cal-mine", primary: true });
    const pb = await calendar(n, { summary: "P**B", externalId: "cal-pb", participants: 1 });
    const active = () =>
      db
        .selectFrom("notes")
        .select("calendar_id")
        .where("scope", "=", "account")
        .where("subject_id", "=", me)
        .where("deleted_at", "is", null)
        .where("superseded_at", "is", null)
        .execute();
    const ask = async (title: string, tag: string) => {
      const d = await dump(me, t);
      await db.updateTable("messages").set({ text: "add it to my calendar with Meera" }).where("id", "=", d.messageId).execute();
      const contentId = await row(me, t, title, d.messageId);
      await db.deleteFrom("notes").where("scope", "=", "account").where("origin", "=", "answered").where("calendar_id", "is", null).execute();
      await tool({ tool: "create_event", jobId: d.jobId, toolCallId: tag, contentId, calendar: "with Meera" });
      return db.selectFrom("questions").select("id").where("target_content_id", "=", contentId).executeTakeFirst();
    };

    const q1 = await ask("Rent", "u1");
    await app.inject({ method: "POST", url: `/v1/questions/${q1!.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(await active()).toEqual([{ calendar_id: mine }]);
    // Settled from memory now, so make the next one ask by un-approving mine.
    await db.updateTable("connector_calendars").set({ selected: false }).where("id", "=", mine).execute();
    const q2 = await ask("Bins", "u2");
    await db.updateTable("connector_calendars").set({ selected: true }).where("id", "=", mine).execute();
    const tapped = await app.inject({ method: "POST", url: `/v1/questions/${q2!.id}/answer`, headers: { cookie: await signIn(me) }, payload: { option: 0 } });
    expect(await active()).toEqual([{ calendar_id: pb }]);

    const { turnId } = tapped.json() as { turnId: string };
    await undoTurn(me, turnId);
    expect(await active()).toEqual([{ calendar_id: mine }]);
  });
});
