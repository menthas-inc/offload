// 019. The calendars a thread reads through, and what a thread reads through them.
//
// **A thread starts with none and picks explicitly.** Approving a calendar in
// Settings adds it to no thread; a pick is one member's, stored with their
// account, and it reads for the whole thread. A write reaches a calendar only
// through the acting account's own picks, which is why every function here
// says whose calendars it is answering about.
//
// **Every read joins the approved list and the live connection.** A pick that
// survived by accident still resolves to nothing, because nothing here reads
// `thread_calendars` without `connector_calendars.selected` and an active
// connection beside it.

import { sql } from "kysely";
import { db } from "../db.js";
import { calendarName } from "../connectors/calendars.js";
import { memberOf, NotYours, type Executor } from "./access.js";
import { bookLocate, mapsConfig } from "../places/resolve.js";

export interface ThreadCalendar {
  id: string;
  name: string;
  colour: string | null;
  writable: boolean;
  sharedWithYou: boolean;
  primary: boolean;
  picked: boolean;
  /** The account's address, when two of the viewer's rows share a name. */
  note: string | null;
}

export interface ThreadCalendars {
  calendars: ThreadCalendar[];
  /** Other members with picks here: named, their calendars counted, never named. */
  others: Array<{ displayName: string; count: number }>;
}

/** The viewer's approved calendars against this thread, with the pick on each.
 *
 *  **A connection's state gates the token step and nothing else.** An approved
 *  calendar stays approved through a sign-in Google now wants: its picks, its
 *  count, its rows here and the events already held all read as before, and a
 *  write reaches `accessTokenFor`, which is the one place that knows, and
 *  refuses `needs_reconnect`. Found in production on 2026-09-19: a grant that
 *  had lapsed on the 15th left Settings showing two ticked calendars and the
 *  thread saying there were none to read. */
export async function viewerCalendars(accountId: string, threadId: string): Promise<ThreadCalendars> {
  if (!(await memberOf(accountId, threadId))) throw new NotYours();

  const account = await db
    .selectFrom("accounts")
    .select("display_name")
    .where("id", "=", accountId)
    .executeTakeFirst();

  const rows = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .leftJoin("thread_calendars as p", (join) =>
      join.onRef("p.calendar_id", "=", "c.id").on("p.thread_id", "=", threadId)
    )
    .select([
      "c.id as id",
      "c.summary as summary",
      "c.is_primary as isPrimary",
      "c.colour as colour",
      "c.access_role as accessRole",
      "n.external_account_email as email",
      "p.calendar_id as pickedId",
    ])
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .where("c.selected", "=", true)
    .orderBy("c.is_primary", "desc")
    .orderBy("c.summary")
    .execute();

  const named = rows.map((row) => ({
    row,
    name: calendarName({ summary: row.summary, is_primary: row.isPrimary }, account?.display_name ?? null),
  }));
  const collisions = new Map<string, number>();
  for (const { name } of named) collisions.set(name, (collisions.get(name) ?? 0) + 1);

  const calendars = named.map(({ row, name }) => ({
    id: row.id,
    name,
    colour: row.colour,
    writable: row.accessRole === "owner" || row.accessRole === "writer",
    sharedWithYou: row.accessRole !== "owner",
    primary: row.isPrimary,
    picked: row.pickedId !== null,
    note: (collisions.get(name) ?? 0) > 1 ? row.email : null,
  }));

  const others = await db
    .selectFrom("thread_calendars as p")
    .innerJoin("connector_calendars as c", "c.id", "p.calendar_id")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .innerJoin("accounts as a", "a.id", "p.account_id")
    .select(["a.display_name as displayName", sql<string>`count(*)`.as("count")])
    .where("p.thread_id", "=", threadId)
    .where("p.account_id", "<>", accountId)
    .where("c.selected", "=", true)
    .where("n.deleted_at", "is", null)
    // By member, not by name: two members called Sam are two lines.
    .groupBy(["p.account_id", "a.display_name"])
    .orderBy("a.display_name")
    .execute();

  return {
    calendars,
    others: others.map((row) => ({ displayName: row.displayName ?? "Someone", count: Number(row.count) })),
  };
}

/** Pick, or un-pick, one of the viewer's own calendars for a thread.
 *
 *  Membership of the thread and ownership of the calendar through its
 *  connection, both here: a calendar id from a client is an access decision. */
export async function setPick(accountId: string, threadId: string, calendarId: string, picked: boolean): Promise<void> {
  if (!(await memberOf(accountId, threadId))) throw new NotYours();
  const owned = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select("c.id")
    .where("c.id", "=", calendarId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .where("c.selected", "=", true)
    .executeTakeFirst();
  if (!owned) throw new NotYours();

  if (picked) {
    await db
      .insertInto("thread_calendars")
      .values({ thread_id: threadId, calendar_id: calendarId, account_id: accountId })
      .onConflict((oc) => oc.columns(["thread_id", "calendar_id"]).doNothing())
      .execute();
    // 030. A calendar picked for a thread has its events' locations looked up
    // now rather than at the next sync, keyed on the pick so a sync that
    // already booked this slot does not swallow it.
    await bookLocate(calendarId, `event.locate:pick:${calendarId}:${threadId}`);
  } else {
    await db
      .deleteFrom("thread_calendars")
      .where("thread_id", "=", threadId)
      .where("calendar_id", "=", calendarId)
      .where("account_id", "=", accountId)
      .execute();
  }
}

/** For the thread's envelope: the viewer's picks and approved count, and
 *  whether anybody has picked here, which is what earns the rail. Null when
 *  the account has no connection at all, which is what hides the glyph. */
export async function calendarCounts(
  accountId: string,
  threadId: string
): Promise<{ picked: number; total: number; anyPicked: boolean } | null> {
  const connection = await db
    .selectFrom("connector_connections")
    .select("id")
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!connection) return null;

  const mine = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .leftJoin("thread_calendars as p", (join) =>
      join.onRef("p.calendar_id", "=", "c.id").on("p.thread_id", "=", threadId)
    )
    .select([sql<string>`count(*)`.as("total"), sql<string>`count(p.calendar_id)`.as("picked")])
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .where("c.selected", "=", true)
    .executeTakeFirstOrThrow();

  const any = await db
    .selectFrom("thread_calendars as p")
    .innerJoin("connector_calendars as c", "c.id", "p.calendar_id")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select("p.calendar_id")
    .where("p.thread_id", "=", threadId)
    .where("c.selected", "=", true)
    .where("n.deleted_at", "is", null)
    .limit(1)
    .executeTakeFirst();

  return { picked: Number(mine.picked), total: Number(mine.total), anyPicked: any !== undefined };
}

export interface ThreadEvent {
  id: string;
  sourceRef: string;
  calendarId: string;
  calendarName: string;
  colour: string | null;
  title: string;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  untrusted: boolean;
  /** 027. The viewer is in it: on the viewer's own calendar, and created by
   *  them, invited, or not read yet. False for another member's calendar. */
  involved: boolean;
  /** 030. Where it is, in its owner's calendar's words, and its point once
   *  looked up, for every member while the map is on. Null while it is off. */
  location: string | null;
  place: { id: string; lat: number | null; lng: number | null; approximate: boolean } | null;
}

/** The events on a thread's calendars inside a window, through every member's
 *  picks, one line per event. A title, a time and, while the map is on, where
 *  it is cross to another member (030, by the product owner's decision):
 *  never the guests, their answers, the description, or whether it is theirs. Another member's event is
 *  untrusted in the viewer's hands whoever wrote it, because trust is relative
 *  to the account whose turn it is. An event a row in the thread remembers is
 *  skipped, so a row offload put on the calendar draws once. */
export async function threadEvents(
  accountId: string,
  threadId: string,
  from: Date,
  to: Date,
  trx: Executor = db
): Promise<ThreadEvent[]> {
  if (!(await memberOf(accountId, threadId, trx))) throw new NotYours();
  const maps = mapsConfig().on;

  const rows = await trx
    .selectFrom("thread_calendars as p")
    .innerJoin("connector_calendars as c", "c.id", "p.calendar_id")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .innerJoin("accounts as owner", "owner.id", "n.account_id")
    .innerJoin("connector_events as e", "e.calendar_id", "c.id")
    .leftJoin("places as pl", "pl.id", "e.place_id")
    .select([
      "e.id as id",
      "e.source_ref as sourceRef",
      "c.id as calendarId",
      "c.summary as summary",
      "c.is_primary as isPrimary",
      "c.colour as colour",
      "e.title as title",
      "e.occurs_at as occursAt",
      "e.occurs_end_at as occursEndAt",
      "e.all_day as allDay",
      "e.untrusted as untrusted",
      "e.created_by_me as createdByMe",
      "e.invited_me as invitedMe",
      "n.account_id as ownerId",
      "owner.display_name as ownerName",
      "e.location as location",
      "e.place_id as placeId",
      "pl.lat as placeLat",
      "pl.lng as placeLng",
      "pl.approximate as placeApproximate",
    ])
    .distinctOn("e.source_ref")
    .where("p.thread_id", "=", threadId)
    .where("c.selected", "=", true)
    .where("n.deleted_at", "is", null)
    .where("e.deleted_at", "is", null)
    .where("e.occurs_at", "<=", to)
    .where(sql<boolean>`coalesce(e.occurs_end_at, e.occurs_at) >= ${from}`)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("content")
            .select("content.id")
            .whereRef("content.source_ref", "=", "e.source_ref")
            .where("content.thread_id", "=", threadId)
            .where("content.deleted_at", "is", null)
        )
      )
    )
    .orderBy("e.source_ref")
    // Two members connecting the same calendar hold two copies; the viewer's
    // own is the one read, so whose an event is answers for the viewer.
    .orderBy(sql`(n.account_id = ${accountId})`, "desc")
    .orderBy("e.occurs_at")
    .execute();

  return rows
    .sort((a, b) => (a.occursAt?.getTime() ?? 0) - (b.occursAt?.getTime() ?? 0))
    .map((row) => ({
      id: row.id,
      sourceRef: row.sourceRef,
      calendarId: row.calendarId,
      // Named by whoever owns it, so another member's primary calendar is
      // their name and never their address, which is what Google calls it.
      calendarName: calendarName({ summary: row.summary, is_primary: row.isPrimary }, row.ownerName),
      colour: row.colour,
      title: row.title,
      occursAt: row.occursAt ? row.occursAt.toISOString() : null,
      occursEndAt: row.occursEndAt ? row.occursEndAt.toISOString() : null,
      allDay: row.allDay,
      untrusted: row.ownerId !== accountId || row.untrusted,
      involved:
        row.ownerId === accountId &&
        (row.createdByMe === true || row.invitedMe === true || (row.createdByMe === null && row.invitedMe === null)),
      location: maps ? row.location : null,
      place:
        maps && row.placeId
          ? { id: row.placeId, lat: row.placeLat, lng: row.placeLng, approximate: row.placeApproximate === true }
          : null,
    }));
}

export interface ScopedCalendar {
  id: string;
  externalId: string;
  name: string;
  writable: boolean;
  /** The acting account's own, through its own connection. Only these can be
   *  written to. */
  yours: boolean;
  /** Owned at Google, so its name is the person's own words. A calendar
   *  shared with them, on their own connection, is somebody else's. */
  owned: boolean;
}

/** What a turn may read: the looking-at thread's picks, any member's, when the
 *  account is still a member; otherwise every approved calendar on the account.
 *  Ordered with the account's own first. */
export async function turnScope(accountId: string, threadId: string | null, trx: Executor = db): Promise<ScopedCalendar[]> {
  const inThread = threadId !== null && (await memberOf(accountId, threadId, trx));
  let query = trx
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .innerJoin("accounts as owner", "owner.id", "n.account_id")
    .select([
      "c.id as id",
      "c.external_id as externalId",
      "c.summary as summary",
      "c.is_primary as isPrimary",
      "c.access_role as accessRole",
      "n.account_id as ownerId",
      "owner.display_name as ownerName",
    ])
    .where("c.selected", "=", true)
    .where("n.deleted_at", "is", null);
  query = inThread
    ? query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("thread_calendars as p")
            .select("p.calendar_id")
            .whereRef("p.calendar_id", "=", "c.id")
            .where("p.thread_id", "=", threadId as string)
        )
      )
    : query.where("n.account_id", "=", accountId);

  const rows = await query.orderBy("c.is_primary", "desc").orderBy("c.summary").execute();
  return rows
    .map((row) => ({
      id: row.id,
      externalId: row.externalId,
      name: calendarName({ summary: row.summary, is_primary: row.isPrimary }, row.ownerName),
      writable: row.ownerId === accountId && (row.accessRole === "owner" || row.accessRole === "writer"),
      yours: row.ownerId === accountId,
      owned: row.ownerId === accountId && row.accessRole === "owner",
    }))
    .sort((a, b) => Number(b.yours) - Number(a.yours));
}

/** The acting account's own writable calendars picked in a thread, in name order. */
export async function writablePicks(accountId: string, threadId: string, trx: Executor = db): Promise<ScopedCalendar[]> {
  const scope = await turnScope(accountId, threadId, trx);
  return scope.filter((calendar) => calendar.yours && calendar.writable);
}

/** The acting account's approved writable calendars, thread or no thread. */
export async function approvedWritable(accountId: string, trx: Executor = db): Promise<ScopedCalendar[]> {
  const scope = await turnScope(accountId, null, trx);
  return scope.filter((calendar) => calendar.writable);
}

/** A member leaving takes their picks with them. */
export async function dropPicksOf(accountId: string, threadId: string, trx: Executor = db): Promise<void> {
  await trx
    .deleteFrom("thread_calendars")
    .where("thread_id", "=", threadId)
    .where("account_id", "=", accountId)
    .execute();
}
