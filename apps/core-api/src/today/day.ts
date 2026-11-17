// 027 one day of Today: the events and To do.
//
// The day is the account's zone's day. A bare day is a date, read by its UTC
// date as `whenDayOf` reads it; a timed row is an instant inside the day. Every
// section is capped, so the read has no pagination.

import { addUtcDays, dayIn, instantIn, occurrencesIn, parseRule, timeHM, utcDay, whenDayOf } from "@offload/widgets";
import { sql } from "kysely";
import { z } from "zod";
import { zoneOf } from "../accounts/zone.js";
import { calendarName } from "../connectors/calendars.js";
import { db } from "../db.js";
import { OVERDUE_CAP, TODAY_BACK_DAYS } from "../routes/notifications.js";
import { agendaQuery, agendaRow, everDumped, labelsOf, shapeRows, type AgendaRaw } from "./rows.js";

/** How far ahead the stepper reaches: the edge of the calendar copy. */
export const DAYS_AHEAD = 365;
/** Events drawn on one day; the header counts them all. */
export const EVENTS_CAP = 30;
/** The rest of a day's to-dos drawn before they fold, and the timed ones. */
export const REST_CAP = 100;
export const TIMED_CAP = 100;
/** A backstop on the rows one day reads, repeating ones included: every
 *  section is capped below it, and nothing a member of a shared thread files
 *  can make another member's Today unbounded. */
const DAY_ROWS = 2000;

export const todayEvent = z.object({
  id: z.string(),
  source: z.enum(["calendar", "offload"]),
  title: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  allDay: z.boolean(),
  mine: z.boolean(),
  calendarName: z.string().nullable(),
  link: z.string().nullable(),
  threadId: z.string().nullable(),
  threadName: z.string().nullable(),
  threadIcon: z.string().nullable(),
  threadHue: z.number().nullable(),
  authorName: z.string().nullable(),
  /** 052. An offload event's own words for where it is, and the place they
   *  resolved to, for a reply's details and their Directions. */
  location: z.string().nullable().optional(),
  place: z.object({ lat: z.number().nullable(), lng: z.number().nullable(), approximate: z.boolean() }).nullable().optional(),
  /** 052. The calendar an offload event is on, when it is one of this account's. */
  calendar: z.object({ name: z.string(), colour: z.string().nullable() }).nullable().optional(),
});
export type TodayEvent = z.infer<typeof todayEvent>;

export const dayResponse = z.object({
  date: z.string(),
  events: z.array(todayEvent),
  eventCount: z.number(),
  late: z.array(agendaRow),
  lateMore: z.number(),
  timed: z.array(agendaRow),
  timedMore: z.number(),
  rest: z.array(agendaRow),
  restMore: z.number(),
  /** If you have time, gone 2026-10-07: always empty, for builds that still
   *  read it. Remove once none is in use. */
  picks: z.array(agendaRow),
  everDumped: z.boolean(),
  threadLabels: z.array(z.object({ id: z.string(), name: z.string(), colour: z.number() })),
});
export type DayResponse = z.infer<typeof dayResponse>;

const allDayOf = (attrs: unknown): boolean =>
  typeof attrs === "object" && attrs !== null && (attrs as Record<string, unknown>)["all_day"] === true;

function dayOfRow(row: AgendaRaw, zone: string | null): string | null {
  return whenDayOf(
    {
      type: row.type,
      dueAt: row.due_at ? row.due_at.toISOString() : null,
      occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
      allDay: allDayOf(row.attrs),
      doneAt: null,
      rrule: row.rrule,
    },
    zone,
  );
}

/** Whether a repeating row's rule lands on `date`. */
function landsOn(row: AgendaRaw, anchor: string, date: string): boolean {
  const parsed = parseRule(row.rrule);
  return parsed.ok && anchor <= date && occurrencesIn(parsed.rule, anchor, date, date).length > 0;
}

/** The last day an event covers. A calendar's all-day end is exclusive, as
 *  Google sends it; a timed end at midnight belongs to the day before. */
function lastDay(start: Date, end: Date | null, allDay: boolean, zone: string | null, exclusiveAllDayEnd: boolean): string {
  const first = allDay ? utcDay(start) : dayIn(start, zone);
  if (!end || end <= start) return first;
  const last = allDay ? (exclusiveAllDayEnd ? addUtcDays(utcDay(end), -1) : utcDay(end)) : dayIn(new Date(end.getTime() - 1), zone);
  return last < first ? first : last;
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && utcDay(new Date(`${value}T12:00:00Z`)) === value;
}

/** The day read, or `bad_date` for a day outside today to a year ahead. A
 *  reply (052) may read a day up to a year back: what a past turn wrote. */
export async function readDay(accountId: string, date: string, now = new Date(), opts: { past?: boolean } = {}): Promise<DayResponse | "bad_date"> {
  const zone = await zoneOf(accountId);
  const today = dayIn(now, zone);
  const earliest = opts.past ? addUtcDays(today, -DAYS_AHEAD) : today;
  if (!isDay(date) || date < earliest || date > addUtcDays(today, DAYS_AHEAD)) return "bad_date";
  const isToday = date === today;

  const start = instantIn(`${date}T00:00`, zone) ?? new Date(`${date}T00:00:00Z`);
  const end = instantIn(`${addUtcDays(date, 1)}T00:00`, zone) ?? new Date(`${addUtcDays(date, 1)}T00:00:00Z`);
  // Wide enough for a bare day's noon UTC and any zone's day either side.
  const lateFrom = new Date(`${addUtcDays(isToday ? addUtcDays(today, -TODAY_BACK_DAYS) : date, -1)}T00:00:00Z`);
  const to = new Date(`${addUtcDays(date, 2)}T00:00:00Z`);

  const [rows, events] = await Promise.all([
    agendaQuery(accountId)
      .where("content.type", "<>", "event")
      .where((eb) => eb.or([eb.and([eb("content.due_at", ">=", lateFrom), eb("content.due_at", "<", to)]), eb("content.rrule", "is not", null)]))
      .orderBy("content.created_at", "asc")
      .orderBy("content.id", "asc")
      .limit(DAY_ROWS)
      .execute() as Promise<AgendaRaw[]>,
    eventsOn(accountId, date, start, end, zone),
  ]);

  const late: { day: string; row: AgendaRaw }[] = [];
  const timed: AgendaRaw[] = [];
  const rest: AgendaRaw[] = [];
  for (const row of rows) {
    const day = dayOfRow(row, zone);
    if (!day) continue;
    if (row.rrule) {
      if (landsOn(row, day, date)) (allDayOf(row.attrs) ? rest : timed).push(row);
      continue;
    }
    if (day === date) (allDayOf(row.attrs) ? rest : timed).push(row);
    else if (isToday && day < today && day >= addUtcDays(today, -TODAY_BACK_DAYS)) late.push({ day, row });
  }
  late.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1));
  // By the hour on the clock, so a repeating row sits at its time of day.
  const hourOf = (row: AgendaRaw) => (row.due_at ? timeHM(row.due_at.toISOString(), zone) : "");
  timed.sort((a, b) => (hourOf(a) < hourOf(b) ? -1 : hourOf(a) > hourOf(b) ? 1 : 0));

  const [lateRows, timedRows, restRows] = await Promise.all([
    shapeRows(late.slice(0, OVERDUE_CAP).map((one) => one.row), accountId),
    shapeRows(timed.slice(0, TIMED_CAP), accountId),
    shapeRows(rest.slice(0, REST_CAP), accountId),
  ]);

  // 052. The calendar each row and offload event is on, by its own name.
  const refs = new Map<string, string>();
  for (const row of rows) if (row.source_ref) refs.set(row.id, row.source_ref);
  for (const event of events) if (event.sourceRef) refs.set(event.id, event.sourceRef);
  const calendars = await calendarsOf(accountId, [...refs.values()]);
  const calendarOf = (id: string) => calendars.get(refs.get(id)?.split(":")[0] ?? "") ?? null;
  for (const row of [...lateRows, ...timedRows, ...restRows]) row.calendar = calendarOf(row.id);
  for (const event of events) {
    if (event.source === "offload") event.calendar = calendarOf(event.id);
    delete event.sourceRef;
  }

  return {
    date,
    events: events.slice(0, EVENTS_CAP),
    eventCount: events.length,
    late: lateRows,
    lateMore: Math.max(0, late.length - OVERDUE_CAP),
    timed: timedRows,
    timedMore: Math.max(0, timed.length - TIMED_CAP),
    rest: restRows,
    restMore: Math.max(0, rest.length - REST_CAP),
    picks: [],
    everDumped: await everDumped(accountId),
    threadLabels: await labelsOf([...lateRows, ...timedRows, ...restRows]),
  };
}

export interface CalendarCopy {
  id: string;
  calendar_id: string;
  title: string;
  occurs_at: Date;
  occurs_end_at: Date | null;
  all_day: boolean;
  link: string | null;
  source_ref: string;
  series_ref: string | null;
  external_id: string;
  summary: string;
  is_primary: boolean;
}

/** The events on a day on the account's own ticked calendars, its own part of
 *  them only. Today draws them and the morning send names them. A send reads
 *  narrower, since it puts a title on a lock screen unasked: only a live
 *  grant, and only events the person made or said yes or maybe to. */
export async function calendarOn(accountId: string, date: string, zone: string | null, { forSend = false } = {}): Promise<CalendarCopy[]> {
  const start = instantIn(`${date}T00:00`, zone) ?? new Date(`${date}T00:00:00Z`);
  const end = instantIn(`${addUtcDays(date, 1)}T00:00`, zone) ?? new Date(`${addUtcDays(date, 1)}T00:00:00Z`);
  const rows = await calendarBetween(accountId, new Date(start.getTime() - 86400_000), new Date(end.getTime() + 86400_000), forSend);
  return rows.filter((row) => calendarCovers(row, date, zone));
}

/** Whether a calendar's event is on a day, in the account's clock. */
function calendarCovers(row: CalendarCopy, date: string, zone: string | null): boolean {
  return dayCovers(date, row.all_day ? utcDay(row.occurs_at) : dayIn(row.occurs_at, zone), lastDay(row.occurs_at, row.occurs_end_at, row.all_day, zone, true));
}

/** The account's own ticked calendars' events touching a window. */
async function calendarBetween(accountId: string, wideFrom: Date, wideTo: Date, forSend: boolean): Promise<CalendarCopy[]> {
  // **Never `thread_calendars`, never `threadEvents`**: those return every
  // member's picks, and this is the account's own calendars only.
  let query = db
    .selectFrom("connector_events as e")
    .innerJoin("connector_calendars as c", "c.id", "e.calendar_id")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select(["e.id", "e.calendar_id", "e.title", "e.occurs_at", "e.occurs_end_at", "e.all_day", "e.link", "e.source_ref", "e.series_ref", "c.external_id", "c.summary", "c.is_primary"])
    .where("e.account_id", "=", accountId)
    .where("n.account_id", "=", accountId)
    .where("c.selected", "=", true)
    .where("n.deleted_at", "is", null)
    .where("e.deleted_at", "is", null)
    // Only the account's own part of a calendar: what it created or was
    // invited to. A calendar shared with somebody else carries their day too,
    // and Where you will be is not where they will be. Null is not read yet.
    .where((eb) =>
      eb.or([
        eb("e.created_by_me", "=", true),
        eb("e.invited_me", "=", true),
        eb.and([eb("e.created_by_me", "is", null), eb("e.invited_me", "is", null)]),
      ]),
    )
    .where("e.occurs_at", "<", wideTo)
    .where(sql<boolean>`coalesce(e.occurs_end_at, e.occurs_at) >= ${wideFrom}`);
  if (forSend) query = query.where("n.state", "=", "active").where("e.going", "=", true);
  // A backstop as the rows' reads have: a month's window reads up to 64 days.
  const rows = await query.orderBy("e.occurs_at").limit(DAY_ROWS).execute();
  return rows.filter((row): row is typeof row & { occurs_at: Date } => row.occurs_at !== null);
}

/** An event offload wrote to a calendar from a row: drawn, or named, once, as
 *  the row. A repeating row remembers the series; the copy holds its
 *  occurrences. */
export function isWritten(row: Pick<CalendarCopy, "source_ref" | "series_ref" | "external_id">, written: Set<string>): boolean {
  return written.has(row.source_ref) || (row.series_ref !== null && written.has(`${row.external_id}:${row.series_ref}`));
}

const dayCovers = (date: string, first: string, last: string) => first <= date && date <= last;

/** Whether an offload event is on a day: its span, or its rule's occurrence. */
function eventOn(row: AgendaRaw, date: string, zone: string | null): boolean {
  if (!row.occurs_at) return false;
  const allDay = allDayOf(row.attrs);
  const first = allDay ? utcDay(row.occurs_at) : dayIn(row.occurs_at, zone);
  return row.rrule ? landsOn(row, first, date) : dayCovers(date, first, lastDay(row.occurs_at, row.occurs_end_at, allDay, zone, false));
}

/** The day's events: the account's own ticked calendars, never a calendar
 *  another member picked for a thread, and every `event` row the account
 *  reads. An event offload wrote to a calendar is drawn once, as the row. */
/** 052. This account's calendars by external id, for the refs given. */
async function calendarsOf(accountId: string, sourceRefs: string[]): Promise<Map<string, { name: string; colour: string | null }>> {
  const ids = [...new Set(sourceRefs.map((ref) => ref.split(":")[0]).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const found = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select(["c.external_id as externalId", "c.summary as name", "c.colour as colour"])
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .where("c.external_id", "in", ids)
    .execute();
  return new Map(found.map((one) => [one.externalId, { name: one.name, colour: one.colour }]));
}

async function eventsOn(accountId: string, date: string, start: Date, end: Date, zone: string | null): Promise<(TodayEvent & { sourceRef?: string | null })[]> {
  const wideFrom = new Date(start.getTime() - 86400_000);
  const wideTo = new Date(end.getTime() + 86400_000);

  const [owner, calendarRows, offloadRows] = await Promise.all([
    db.selectFrom("accounts").select("display_name").where("id", "=", accountId).executeTakeFirst(),
    calendarOn(accountId, date, zone),
    agendaQuery(accountId)
      .where("content.type", "=", "event")
      .where((eb) =>
        eb.or([
          eb.and([eb("content.occurs_at", "<", wideTo), eb(sql`coalesce(content.occurs_end_at, content.occurs_at)`, ">=", wideFrom)]),
          eb("content.rrule", "is not", null),
        ]),
      )
      .execute() as Promise<AgendaRaw[]>,
  ]);

  const out: (TodayEvent & { sourceRef?: string | null })[] = [];
  const written = new Set<string>();

  for (const row of offloadRows) {
    if (!row.occurs_at || !eventOn(row, date, zone)) continue;
    const allDay = allDayOf(row.attrs);
    if (row.source_ref) written.add(row.source_ref);
    const mine = row.account_id === accountId;
    // A repeating event's occurrence on this day, at its time of day.
    const startsAt = row.rrule
      ? allDay
        ? new Date(`${date}T12:00:00Z`)
        : instantIn(`${date}T${timeHM(row.occurs_at.toISOString(), zone)}`, zone)
      : row.occurs_at;
    const endsAt = row.rrule || !row.occurs_end_at ? null : row.occurs_end_at;
    out.push({
      id: row.id,
      source: "offload",
      title: row.title,
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      allDay,
      mine,
      calendarName: null,
      link: null,
      threadId: row.threadId,
      threadName: row.threadName,
      threadIcon: row.threadIcon,
      threadHue: row.threadHue,
      authorName: mine ? null : row.authorName,
      location: row.location,
      place: row.place_id ? { lat: row.placeLat, lng: row.placeLng, approximate: row.placeApproximate === true } : null,
      sourceRef: row.source_ref,
    });
  }

  for (const row of calendarRows) {
    if (isWritten(row, written)) continue;
    out.push({
      id: row.id,
      source: "calendar",
      title: row.title,
      startsAt: row.occurs_at.toISOString(),
      endsAt: row.occurs_end_at?.toISOString() ?? null,
      allDay: row.all_day,
      mine: true,
      // Which calendar, by its own name: "Google" said nothing a person could use.
      calendarName: `Calendar: ${calendarName(row, owner?.display_name ?? null)}`,
      link: row.link,
      threadId: null,
      threadName: null,
      threadIcon: null,
      threadHue: null,
      authorName: null,
    });
  }

  return out.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const at = (a.startsAt ?? "") < (b.startsAt ?? "") ? -1 : (a.startsAt ?? "") > (b.startsAt ?? "") ? 1 : 0;
    return at !== 0 ? at : a.title.localeCompare(b.title);
  });
}

// ---------------------------------------------------------------- the month

/** The longest window the month reads: six weeks of a grid, with room over. */
export const MONTH_DAYS = 62;

export const monthResponse = z.object({
  /** Only the days with something on them. */
  days: z.array(z.object({ date: z.string(), task: z.number(), event: z.number(), calendar: z.number() })),
});
export type MonthResponse = z.infer<typeof monthResponse>;

/** The columns the month counts from, and nothing it would only carry. */
const MONTH_COLUMNS = [
  "content.id as id",
  "content.type as type",
  "content.due_at as due_at",
  "content.occurs_at as occurs_at",
  "content.occurs_end_at as occurs_end_at",
  "content.rrule as rrule",
  "content.attrs as attrs",
  "content.source_ref as source_ref",
] as const;

/** The days a rule lands on inside a window, worked out once per row. */
function ruleDays(row: AgendaRaw, anchor: string, first: string, last: string): Set<string> {
  const parsed = parseRule(row.rrule);
  return new Set(parsed.ok ? occurrencesIn(parsed.rule, anchor, first, last).filter((day) => day >= anchor) : []);
}

/** 2026-10-18. A dot for each thing each day in a window would show on Today:
 *  the day read's own sources and predicates, counted rather than drawn, with
 *  today's cell carrying the late to-dos the day read carries. Each row's days
 *  are worked out once, not once a day (security review, PR 127): a member of
 *  a shared thread must not be able to make another's month slow. A day
 *  before today or past the calendar copy's edge carries nothing, since it
 *  does not open. `bad_window` for anything that is not a short window. */
export async function readMonth(
  accountId: string,
  from: string,
  to: string,
  now = new Date(),
  /** 052. A reply's grid may show days gone by, up to a year back. */
  opts: { past?: boolean } = {},
): Promise<MonthResponse | "bad_window"> {
  if (!isDay(from) || !isDay(to) || to < from || to > addUtcDays(from, MONTH_DAYS)) return "bad_window";
  const zone = await zoneOf(accountId);
  const today = dayIn(now, zone);
  const earliest = opts.past ? addUtcDays(today, -DAYS_AHEAD) : today;
  const first = from < earliest ? earliest : from;
  const edge = addUtcDays(today, DAYS_AHEAD);
  const last = to > edge ? edge : to;
  if (first > last) return { days: [] };

  const start = instantIn(`${first}T00:00`, zone) ?? new Date(`${first}T00:00:00Z`);
  const end = instantIn(`${addUtcDays(last, 1)}T00:00`, zone) ?? new Date(`${addUtcDays(last, 1)}T00:00:00Z`);
  const wideFrom = new Date(start.getTime() - 86400_000);
  const wideTo = new Date(end.getTime() + 86400_000);
  // Wide enough for a bare day's noon UTC and any zone's day either side, and
  // back over the late window when today is in it, as the day read reads.
  const withToday = first === today;
  const lateFirst = addUtcDays(today, -TODAY_BACK_DAYS);
  const dueFrom = new Date(`${addUtcDays(withToday ? lateFirst : first, -1)}T00:00:00Z`);
  const dueTo = new Date(`${addUtcDays(last, 2)}T00:00:00Z`);

  const [rows, offloadRows, calendarRows] = await Promise.all([
    agendaQuery(accountId)
      .clearSelect()
      .select(MONTH_COLUMNS)
      .where("content.type", "<>", "event")
      .where((eb) => eb.or([eb.and([eb("content.due_at", ">=", dueFrom), eb("content.due_at", "<", dueTo)]), eb("content.rrule", "is not", null)]))
      .limit(DAY_ROWS)
      .execute() as Promise<AgendaRaw[]>,
    agendaQuery(accountId)
      .clearSelect()
      .select(MONTH_COLUMNS)
      .where("content.type", "=", "event")
      .where((eb) =>
        eb.or([
          eb.and([eb("content.occurs_at", "<", wideTo), eb(sql`coalesce(content.occurs_end_at, content.occurs_at)`, ">=", wideFrom)]),
          eb("content.rrule", "is not", null),
        ]),
      )
      .limit(DAY_ROWS)
      .execute() as Promise<AgendaRaw[]>,
    calendarBetween(accountId, wideFrom, wideTo, false),
  ]);

  const counts = new Map<string, { task: number; event: number; calendar: number }>();
  const bump = (date: string, kind: "task" | "event" | "calendar") => {
    if (date < first || date > last) return;
    const held = counts.get(date) ?? { task: 0, event: 0, calendar: 0 };
    held[kind] += 1;
    counts.set(date, held);
  };

  for (const row of rows) {
    const day = dayOfRow(row, zone);
    if (!day) continue;
    if (row.rrule) for (const on of ruleDays(row, day, first, last)) bump(on, "task");
    else if (day >= first) bump(day, "task");
    // The day read's late section, on today only.
    else if (withToday && day < today && day >= lateFirst) bump(today, "task");
  }

  // An event offload wrote to a calendar is counted once, as the row: the
  // copy it wrote is skipped on the days the row is on.
  const writtenOn = new Map<string, Set<string>>();
  for (const row of offloadRows) {
    if (!row.occurs_at) continue;
    const allDay = allDayOf(row.attrs);
    const firstDay = allDay ? utcDay(row.occurs_at) : dayIn(row.occurs_at, zone);
    const on = row.rrule
      ? [...ruleDays(row, firstDay, first, last)]
      : spanDays(firstDay, lastDay(row.occurs_at, row.occurs_end_at, allDay, zone, false), first, last);
    for (const date of on) {
      bump(date, "event");
      if (row.source_ref) (writtenOn.get(date) ?? writtenOn.set(date, new Set()).get(date)!).add(row.source_ref);
    }
  }
  for (const row of calendarRows) {
    const firstDay = row.all_day ? utcDay(row.occurs_at) : dayIn(row.occurs_at, zone);
    for (const date of spanDays(firstDay, lastDay(row.occurs_at, row.occurs_end_at, row.all_day, zone, true), first, last)) {
      if (!isWritten(row, writtenOn.get(date) ?? new Set())) bump(date, "calendar");
    }
  }

  return {
    days: [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, held]) => ({ date, ...held })),
  };
}

/** The days of a span that fall inside a window. */
function spanDays(spanFirst: string, spanLast: string, first: string, last: string): string[] {
  const out: string[] = [];
  for (let date = spanFirst > first ? spanFirst : first; date <= spanLast && date <= last; date = addUtcDays(date, 1)) out.push(date);
  return out;
}
