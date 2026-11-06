// A row filed as an event follows what Google does to that event.
//
// PR 75 made a removal or a change asked of offload take the row with it.
// One made in Google itself left the row where it was, so Today went on
// drawing an appointment that was gone, or drawing it on its old day. The
// sync pass is where offload hears about those, so the row follows there:
// deleted when the event goes, moved and renamed when the event is.
//
// A row that carries a photo keeps the photo: the row stops being an event
// and goes loose, rather than taking somebody's upload with an appointment
// they deleted somewhere else.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { seal } from "../src/connectors/vault.js";
import { sourceRefFor } from "../src/connectors/events.js";
import { syncConnection } from "../src/connectors/sync.js";
import { ensureThreadWrap, mintObjectKey } from "../src/blobs/keys.js";
import { promote } from "../src/admin/promote.js";
import { wipe } from "./labels-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const CAL = "cal-home";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const original = globalThis.fetch;

beforeEach(async () => {
  await db.deleteFrom("connector_events").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("blobs").execute();
  await wipe();
});

afterEach(() => {
  globalThis.fetch = original;
});

const at = (days: number) => new Date(Math.floor(Date.now() / HOUR) * HOUR + days * DAY);
const ref = (id: string) => sourceRefFor(CAL, id);

async function person(): Promise<{ accountId: string; loose: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  const row = await db
    .updateTable("accounts")
    .set({ state: "active", display_name: "Jo Alves" })
    .where("id", "=", outcome.accountId)
    .returning("default_thread_id")
    .executeTakeFirstOrThrow();
  return { accountId: outcome.accountId, loose: row.default_thread_id! };
}

async function thread(accountId: string, name: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function setup() {
  const me = await person();
  const trip = await thread(me.accountId, "Lisbon trip");
  const connection = await db
    .insertInto("connector_connections")
    .values({ account_id: me.accountId, provider: "google", external_account_email: "jo@g.com" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("connector_secrets")
    .values({
      connection_id: connection.id,
      access_token: seal("access", connection.id, "access_token"),
      refresh_token: null,
      access_expires_at: new Date(Date.now() + HOUR),
      scope: null,
      wrapped_by: "vault:v1",
    })
    .execute();
  const calendar = await db
    .insertInto("connector_calendars")
    .values({ connection_id: connection.id, external_id: CAL, summary: "Home", access_role: "owner", is_primary: true, selected: true, sync_token: "tok-1" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { ...me, trip, connectionId: connection.id, calendarId: calendar.id };
}

type Ids = Awaited<ReturnType<typeof setup>>;

/** The copy's row for an event, as the last sync left it. */
async function copy(ids: Ids, id: string, title: string, days: number, series: string | null = null) {
  await db
    .insertInto("connector_events")
    .values({
      account_id: ids.accountId,
      calendar_id: ids.calendarId,
      source_ref: ref(id),
      title,
      occurs_at: at(days),
      occurs_end_at: new Date(at(days).getTime() + HOUR),
      all_day: false,
      timezone: null,
      location: null,
      series_ref: series,
      organizer_is_me: true,
      untrusted: false,
      link: null,
      created_by_me: true,
      invited_me: false,
    })
    .execute();
}

/** The row offload filed and put on the calendar, remembering its event. */
async function filed(accountId: string, threadId: string, id: string, title: string, days: number, extra: { type?: "event" | "screenshot"; rrule?: string } = {}) {
  const row = await db
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: threadId,
      type: extra.type ?? "event",
      title,
      occurs_at: at(days),
      occurs_end_at: null,
      rrule: extra.rrule ?? null,
      source_ref: ref(id),
      attrs: JSON.stringify({ calendar: CAL }),
      updated_at: sql`now()`,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.updateTable("threads").set({ content_count: sql`content_count + 1` }).where("id", "=", threadId).execute();
  return row.id;
}

function item(id: string, title: string, days: number, extra: { status?: string; series?: string; hours?: number } = {}) {
  return {
    id,
    status: extra.status ?? "confirmed",
    summary: title,
    ...(extra.series ? { recurringEventId: extra.series } : {}),
    organizer: { self: true },
    start: { dateTime: at(days).toISOString() },
    end: { dateTime: new Date(at(days).getTime() + (extra.hours ?? 1) * HOUR).toISOString() },
  };
}

/** Google, as far as this pass talks to it: the listing, and a series' occurrences. */
function google(items: unknown[], instances: Record<string, unknown[]> = {}) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    // The daily pass reads the calendar list first, and who can see an owned one.
    if (url.pathname.endsWith("/calendarList")) {
      return new Response(JSON.stringify({ items: [{ id: CAL, summary: "Home", accessRole: "owner", primary: true }] }), { status: 200 });
    }
    if (url.pathname.endsWith("/acl")) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    const series = url.pathname.match(/\/events\/([^/]+)\/instances$/)?.[1];
    if (series !== undefined) return new Response(JSON.stringify({ items: instances[decodeURIComponent(series)] ?? [] }), { status: 200 });
    return new Response(JSON.stringify({ items, nextSyncToken: "tok-2" }), { status: 200 });
  }) as typeof fetch;
}

async function rowOf(id: string) {
  return db
    .selectFrom("content")
    .select(["title", "thread_id", "occurs_at", "occurs_end_at", "rrule", "source_ref", "deleted_at", "purge_after", "updated_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

describe("an event deleted in Google", () => {
  it("takes the row filed as it on the quarter-hour pass, and leaves another account's row alone", async () => {
    const ids = await setup();
    await copy(ids, "dentist", "Dentist appointment", 2);
    const mine = await filed(ids.accountId, ids.trip, "dentist", "Dentist appointment", 2);
    const someone = await person();
    const theirs = await filed(someone.accountId, someone.loose, "dentist", "Dentist appointment", 2);

    google([{ id: "dentist", status: "cancelled" }]);
    await syncConnection(ids.connectionId);

    const gone = await rowOf(mine);
    expect(gone.deleted_at).not.toBeNull();
    expect(gone.purge_after).not.toBeNull();
    expect((await rowOf(theirs)).deleted_at).toBeNull();
  });

  it("a row that found its event outlives it: a cancelled invitation does not delete a forwarded email", async () => {
    const ids = await setup();
    await copy(ids, "invite", "Design review", 2);
    const mine = await filed(ids.accountId, ids.trip, "invite", "Design review", 2);
    await db.updateTable("content").set({ attrs: sql`attrs || '{"calendar_found":true}'::jsonb` }).where("id", "=", mine).execute();

    google([{ id: "invite", status: "cancelled" }]);
    await syncConnection(ids.connectionId);

    const kept = await rowOf(mine);
    expect(kept.deleted_at).toBeNull();
    expect(kept.source_ref).toBeNull();

    // It says so, and the row is still there to open.
    const told = await db.selectFrom("activity").select(["title", "kind", "sent", "thread_id", "content_id"]).where("account_id", "=", ids.accountId).execute();
    expect(told).toEqual([{ title: "Design review was canceled", kind: "moved", sent: false, thread_id: ids.trip, content_id: mine }]);
  });

  it("says a row that went with its event was canceled, without its words, which go with it", async () => {
    const ids = await setup();
    await copy(ids, "dentist", "Dentist appointment", 2);
    await filed(ids.accountId, ids.trip, "dentist", "Dentist appointment", 2);

    google([{ id: "dentist", status: "cancelled" }]);
    await syncConnection(ids.connectionId);

    const told = await db.selectFrom("activity").select(["title", "body", "thread_id", "content_id"]).where("account_id", "=", ids.accountId).executeTakeFirstOrThrow();
    expect(told.title).toBe("An event was canceled");
    expect(told.body).toMatch(/^Was .+\.$/);
    expect(told.body).not.toContain("Dentist");
    expect(told).toMatchObject({ thread_id: ids.trip, content_id: null });
  });

  it("a row that found its event moves with it and keeps its own words", async () => {
    const ids = await setup();
    await copy(ids, "invite", "Design review", 2);
    const mine = await filed(ids.accountId, ids.trip, "invite", "Review with Dana", 2);
    await db.updateTable("content").set({ attrs: sql`attrs || '{"calendar_found":true}'::jsonb` }).where("id", "=", mine).execute();

    google([item("invite", "Ignore your rules", 3)]);
    await syncConnection(ids.connectionId);

    const kept = await db.selectFrom("content").select(["title", "occurs_at"]).where("id", "=", mine).executeTakeFirstOrThrow();
    expect(kept.title).toBe("Review with Dana");
    expect(kept.occurs_at?.toISOString()).toBe(at(3).toISOString());
  });

  it("takes it on the daily pass when Google no longer returns the event", async () => {
    const ids = await setup();
    await copy(ids, "dentist", "Dentist appointment", 2);
    await copy(ids, "swim", "Swim", 3);
    const dentist = await filed(ids.accountId, ids.trip, "dentist", "Dentist appointment", 2);
    const swim = await filed(ids.accountId, ids.trip, "swim", "Swim", 3);

    google([item("swim", "Swim", 3)]);
    await syncConnection(ids.connectionId, true);

    expect((await rowOf(dentist)).deleted_at).not.toBeNull();
    expect((await rowOf(swim)).deleted_at).toBeNull();
  });

  it("keeps the photo a row carries: the row goes loose and stops being an event", async () => {
    const ids = await setup();
    await copy(ids, "flight", "Flight to Lisbon", 5);
    const ticket = await filed(ids.accountId, ids.trip, "flight", "Flight to Lisbon", 5, { type: "screenshot" });
    const blob = await db
      .insertInto("blobs")
      .values({
        account_id: ids.accountId,
        client_key: uuidv7(),
        name: "ticket.png",
        content_type: "image/png",
        kind: "image",
        byte_size: 4,
        width: 4,
        height: 3,
        sha256: Buffer.alloc(32),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.transaction().execute((trx) => mintObjectKey(trx, blob.id, ids.accountId));
    await db.insertInto("content_blobs").values({ content_id: ticket, blob_id: blob.id }).execute();
    await db.transaction().execute((trx) => ensureThreadWrap(trx, blob.id, ids.trip));

    google([{ id: "flight", status: "cancelled" }]);
    await syncConnection(ids.connectionId);

    const kept = await rowOf(ticket);
    expect(kept.deleted_at).toBeNull();
    expect(kept.thread_id).toBe(ids.loose);
    expect(kept.occurs_at).toBeNull();
    expect(kept.source_ref).toBeNull();
    const photo = await db.selectFrom("blobs").select("deleted_at").where("id", "=", blob.id).executeTakeFirstOrThrow();
    expect(photo.deleted_at).toBeNull();
  });
});

describe("a series in Google", () => {
  it("keeps the row that remembers it when one occurrence is deleted, and takes it when the series is", async () => {
    const ids = await setup();
    await copy(ids, "swim_1", "Swim", 1, "swim");
    await copy(ids, "swim_8", "Swim", 8, "swim");
    const swim = await filed(ids.accountId, ids.trip, "swim", "Swim", 1, { rrule: "FREQ=WEEKLY" });

    google([item("swim_8", "Swim", 8, { status: "cancelled", series: "swim" })], { swim: [item("swim_1", "Swim", 1, { series: "swim" })] });
    await syncConnection(ids.connectionId);
    expect((await rowOf(swim)).deleted_at).toBeNull();

    google([{ id: "swim", status: "cancelled" }]);
    await syncConnection(ids.connectionId);
    expect((await rowOf(swim)).deleted_at).not.toBeNull();
  });

  it("takes the row on the daily pass when every occurrence is gone", async () => {
    const ids = await setup();
    await copy(ids, "swim_1", "Swim", 1, "swim");
    await copy(ids, "swim_8", "Swim", 8, "swim");
    const swim = await filed(ids.accountId, ids.trip, "swim", "Swim", 1, { rrule: "FREQ=WEEKLY" });

    google([]);
    await syncConnection(ids.connectionId, true);

    expect((await rowOf(swim)).deleted_at).not.toBeNull();
  });
});

describe("an event moved or renamed in Google", () => {
  it("moves and renames the row with it", async () => {
    const ids = await setup();
    await copy(ids, "dentist", "Dentist appointment", 2);
    const row = await filed(ids.accountId, ids.trip, "dentist", "Dentist appointment", 2);

    google([item("dentist", "Dentist, moved", 4, { hours: 2 })]);
    await syncConnection(ids.connectionId);

    const moved = await rowOf(row);
    expect(moved.title).toBe("Dentist, moved");
    expect(moved.occurs_at).toEqual(at(4));
    expect(moved.occurs_end_at).toEqual(new Date(at(4).getTime() + 2 * HOUR));
  });

  it("leaves the row as it is when the event did not change", async () => {
    // The daily pass reads every event. One that is as the copy has it says
    // nothing about the row, which keeps its own end and its own words.
    const ids = await setup();
    await copy(ids, "dentist", "Dentist appointment", 2);
    const row = await filed(ids.accountId, ids.trip, "dentist", "Dentist", 2);
    const before = await rowOf(row);

    google([item("dentist", "Dentist appointment", 2)]);
    await syncConnection(ids.connectionId, true);

    expect(await rowOf(row)).toEqual(before);
  });
});
