// What reaches Google when offload writes, against a fake Google that counts.
//
// C1: a tap that arrives twice writes once.
// C2: the calendar list is read whole, hidden calendars included.
// C3: "this and all following" starts a series that is the old one moved.
// C4: an all-day event is moved and split in dates, never times.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { confirmPending } from "../src/connectors/tool-calls.js";
import { refreshCalendars } from "../src/connectors/calendars.js";
import { performWrite, targetFor } from "../src/connectors/write.js";
import type { OutwardVerdict } from "../src/connectors/outward.js";

vi.mock("../src/connectors/tokens.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/connectors/tokens.js")>()),
  accessTokenFor: vi.fn(async () => "token"),
}));

await migrate(() => {});
afterAll(async () => {
  await closeDb();
});

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}
let calls: Call[] = [];
/** What the fake answers: a body, or a status Google refused with. */
let answer: (call: Call) => Promise<Record<string, unknown> | number>;

beforeEach(async () => {
  calls = [];
  answer = async () => ({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const call = { method: init?.method ?? "GET", url, body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null };
      calls.push(call);
      const out = await answer(call);
      const status = typeof out === "number" ? out : 200;
      const body = typeof out === "number" ? {} : out;
      return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
    })
  );
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("connector_pending_writes").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("accounts").execute();
});
afterEach(() => vi.unstubAllGlobals());

async function account(): Promise<string> {
  return (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function connection(accountId: string): Promise<string> {
  const row = await db
    .insertInto("connector_connections")
    .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();
  // No access-list scope, so nothing here reads a participant count.
  await db
    .insertInto("connector_secrets")
    .values({ connection_id: row.id, access_token: Buffer.from("x"), refresh_token: null, access_expires_at: null, scope: null, wrapped_by: "test" })
    .execute();
  return row.id;
}

async function calendar(connectionId: string, externalId = `cal-${uuidv7()}`): Promise<string> {
  return (
    await db
      .insertInto("connector_calendars")
      .values({ connection_id: connectionId, external_id: externalId, summary: "Home", access_role: "owner", selected: true, participants: 1 })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function message(accountId: string): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  return (
    await db
      .insertInto("messages")
      .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: uuidv7(), text: "dinner", state: "seen" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function proposal(accountId: string, calendarId: string, over: { attendees?: string[]; messageId?: string | null } = {}): Promise<string> {
  return (
    await db
      .insertInto("connector_pending_writes")
      .values({
        account_id: accountId,
        calendar_id: calendarId,
        action: "create",
        scope: null,
        payload: JSON.stringify({
          action: "create",
          draft: { title: "Dinner with Ana", startsAt: "2026-10-20T19:00:00.000Z", endsAt: "2026-10-20T21:00:00.000Z", attendees: over.attendees ?? [] },
          because: over.attendees?.length ? "guests" : "asked_for",
        }),
        message_id: over.messageId ?? null,
        expires_at: new Date(Date.now() + 3600_000),
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const creates = () => calls.filter((c) => c.method === "POST" && /\/events\?/.test(c.url));
const SILENT: OutwardVerdict = { outward: false, notify: false, audience: [], reason: "none" };

describe("C1 a confirm that arrives twice", () => {
  it("writes to Google once", async () => {
    const me = await account();
    const cal = await calendar(await connection(me));
    const id = await proposal(me, cal, { attendees: ["ana@example.com"] });
    answer = async (call) => {
      // Slow enough that both taps are in flight together.
      if (call.method === "POST") await new Promise((done) => setTimeout(done, 30));
      return { id: "evt-1" };
    };

    const both = await Promise.all([confirmPending(me, id), confirmPending(me, id)]);
    expect(both.sort()).toEqual([false, true]);
    expect(creates()).toHaveLength(1);
  });

  it("leaves a proposal Google refused open to be confirmed again", async () => {
    const me = await account();
    const cal = await calendar(await connection(me));
    const id = await proposal(me, cal, { attendees: ["ana@example.com"] });
    answer = async () => 500;
    await expect(confirmPending(me, id)).rejects.toThrow();

    answer = async () => ({ id: "evt-1" });
    expect(await confirmPending(me, id)).toBe(true);
    expect(creates()).toHaveLength(2);
  });

  it("writes each alike proposal once, when two of them are tapped together", async () => {
    const me = await account();
    const cal = await calendar(await connection(me));
    const messageId = await message(me);
    const first = await proposal(me, cal, { messageId });
    const second = await proposal(me, cal, { messageId });
    answer = async (call) => {
      if (call.method === "POST") await new Promise((done) => setTimeout(done, 30));
      return { id: `evt-${uuidv7()}` };
    };

    await Promise.all([confirmPending(me, first), confirmPending(me, second)]);
    expect(creates()).toHaveLength(2);
  });
});

describe("C2 the calendar list", () => {
  it("reads every page, hidden calendars included, and deletes none of them", async () => {
    const me = await account();
    const n = await connection(me);
    await calendar(n, "cal-hidden");
    answer = async (call) => {
      if (!call.url.includes("/calendarList")) return {};
      return call.url.includes("pageToken=2")
        ? { items: [{ id: "cal-hidden", summary: "Kids", accessRole: "owner", hidden: true }] }
        : { items: [{ id: "me@g.com", summary: "me@g.com", accessRole: "owner", primary: true }], nextPageToken: "2" };
    };

    const outcome = await refreshCalendars(n, "token");
    expect(outcome.calendars).toBe(2);
    const kept = await db.selectFrom("connector_calendars").select("external_id").where("connection_id", "=", n).orderBy("external_id").execute();
    expect(kept.map((c) => c.external_id)).toEqual(["cal-hidden", "me@g.com"]);
    expect(calls.find((c) => c.url.includes("/calendarList"))?.url).toContain("showHidden=true");
  });
});

/** A weekly series and one of its occurrences, as Google answers a read. */
function series(rule: string, over: { allDay?: boolean } = {}) {
  const slot = (at: string) => (over.allDay ? { date: at.slice(0, 10) } : { dateTime: at, timeZone: "Europe/Lisbon" });
  const common = {
    summary: "Standup",
    location: "Room 4",
    attendees: [{ email: "ana@example.com" }, { email: "sam@example.com" }],
  };
  return async (call: Call): Promise<Record<string, unknown>> => {
    if (call.method !== "GET") return { id: "evt-new" };
    if (call.url.includes("/events/occ-6")) {
      return { ...common, id: "occ-6", recurringEventId: "ser", start: slot("2026-11-10T09:00:00.000Z"), end: slot(over.allDay ? "2026-11-11T00:00:00.000Z" : "2026-11-10T09:30:00.000Z") };
    }
    return { ...common, id: "ser", recurrence: [rule], start: slot("2026-10-06T09:00:00.000Z"), end: slot(over.allDay ? "2026-10-07T00:00:00.000Z" : "2026-10-06T09:30:00.000Z") };
  };
}

async function target() {
  const me = await account();
  const cal = await calendar(await connection(me), "cal-work");
  const found = await targetFor(cal, me);
  if (!found) throw new Error("no target");
  return found;
}

describe("C3 this and all following", () => {
  it("starts the new series as the old one moved: its title, length, place and guests, ending when the old one did", async () => {
    answer = series("RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z");
    await performWrite(
      await target(),
      { action: "edit", sourceRef: "cal-work:occ-6", scope: "following", patch: { startsAt: new Date("2026-11-10T15:00:00.000Z") } },
      SILENT
    );

    const made = creates()[0]?.body;
    expect(made).toMatchObject({
      summary: "Standup",
      start: { dateTime: "2026-11-10T15:00:00.000Z" },
      end: { dateTime: "2026-11-10T15:30:00.000Z" },
      location: "Room 4",
      attendees: [{ email: "ana@example.com" }, { email: "sam@example.com" }],
      recurrence: ["RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z"],
    });
  });

  it("moves only this one when the series is counted, so nothing runs past its end", async () => {
    answer = series("RRULE:FREQ=WEEKLY;COUNT=10");
    await performWrite(
      await target(),
      { action: "edit", sourceRef: "cal-work:occ-6", scope: "following", patch: { startsAt: new Date("2026-11-10T15:00:00.000Z") } },
      SILENT
    );

    expect(creates()).toHaveLength(0);
    const patched = calls.filter((c) => c.method === "PATCH");
    expect(patched.map((c) => new URL(c.url).pathname.split("/").pop())).toEqual(["occ-6"]);
  });
});

describe("C4 an all-day event", () => {
  it("is split as a series, in dates", async () => {
    answer = series("RRULE:FREQ=WEEKLY", { allDay: true });
    await performWrite(
      await target(),
      { action: "edit", sourceRef: "cal-work:occ-6", scope: "following", patch: { startsAt: new Date("2026-11-11T00:00:00.000Z") } },
      SILENT
    );

    expect(creates()[0]?.body).toMatchObject({ start: { date: "2026-11-11" }, end: { date: "2026-11-12" }, recurrence: ["RRULE:FREQ=WEEKLY"] });
    const ended = calls.find((c) => c.method === "PATCH" && c.url.includes("/events/ser?"));
    expect(ended?.body).toEqual({ recurrence: ["RRULE:FREQ=WEEKLY;UNTIL=20261109"] });
  });

  it("is moved in dates, the end the day after", async () => {
    answer = series("RRULE:FREQ=WEEKLY", { allDay: true });
    await performWrite(
      await target(),
      { action: "edit", sourceRef: "cal-work:occ-6", scope: "one", patch: { startsAt: new Date("2026-11-12T00:00:00.000Z") } },
      SILENT
    );

    const moved = calls.find((c) => c.method === "PATCH");
    expect(moved?.body).toEqual({ start: { date: "2026-11-12" }, end: { date: "2026-11-13" } });
  });
});
