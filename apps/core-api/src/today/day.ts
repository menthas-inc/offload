// 027 one day of Today: the events, To do, and on Today the picks.
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
import { todayPicks } from "./picks.js";
import { agendaQuery, agendaRow, everDumped, labelsOf, shapeRows, type AgendaRaw, type AgendaRow } from "./rows.js";

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

/** The day read, or `bad_date` for a day outside today to a year ahead. */
export async function readDay(accountId: string, date: string, now = new Date()): Promise<DayResponse | "bad_date"> {
  const zone = await zoneOf(accountId);
  const today = dayIn(now, zone);
  if (!isDay(date) || date < today || date > addUtcDays(today, DAYS_AHEAD)) return "bad_date";
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

  const [lateRows, timedRows, restRows, pickRows] = await Promise.all([
    shapeRows(late.slice(0, OVERDUE_CAP).map((one) => one.row), accountId),
    shapeRows(timed.slice(0, TIMED_CAP), accountId),
    shapeRows(rest.slice(0, REST_CAP), accountId),
    isToday ? todayPicks(accountId, today, zone) : Promise.resolve([] as AgendaRow[]),
  ]);

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
    picks: pickRows,
    everDumped: await everDumped(accountId),
    threadLabels: await labelsOf([...lateRows, ...timedRows, ...restRows, ...pickRows]),
  };
}

/** The day's events: the account's own ticked calendars, never a calendar
 *  another member picked for a thread, and every `event` row the account
 *  reads. An event offload wrote to a calendar is drawn once, as the row. */
async function eventsOn(accountId: string, date: string, start: Date, end: Date, zone: string | null): Promise<TodayEvent[]> {
  const wideFrom = new Date(start.getTime() - 86400_000);
  const wideTo = new Date(end.getTime() + 86400_000);

  const [owner, calendarRows, offloadRows] = await Promise.all([
    db.selectFrom("accounts").select("display_name").where("id", "=", accountId).executeTakeFirst(),
    // **Never `thread_calendars`, never `threadEvents`**: those return every
    // member's picks, and Today is the account's own calendars only.
    db
      .selectFrom("connector_events as e")
      .innerJoin("connector_calendars as c", "c.id", "e.calendar_id")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select(["e.id", "e.title", "e.occurs_at", "e.occurs_end_at", "e.all_day", "e.link", "e.source_ref", "e.series_ref", "c.external_id", "c.summary", "c.is_primary"])
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
      .where(sql<boolean>`coalesce(e.occurs_end_at, e.occurs_at) >= ${wideFrom}`)
      .execute(),
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

  const covers = (first: string, last: string) => first <= date && date <= last;
  const out: TodayEvent[] = [];
  const written = new Set<string>();

  for (const row of offloadRows) {
    if (!row.occurs_at) continue;
    const allDay = allDayOf(row.attrs);
    const first = allDay ? utcDay(row.occurs_at) : dayIn(row.occurs_at, zone);
    const onDay = row.rrule ? landsOn(row, first, date) : covers(first, lastDay(row.occurs_at, row.occurs_end_at, allDay, zone, false));
    if (!onDay) continue;
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
    });
  }

  for (const row of calendarRows) {
    if (!row.occurs_at || written.has(row.source_ref)) continue;
    // A repeating row remembers the series; the copy holds its occurrences.
    if (row.series_ref && written.has(`${row.external_id}:${row.series_ref}`)) continue;
    if (!covers(row.all_day ? utcDay(row.occurs_at) : dayIn(row.occurs_at, zone), lastDay(row.occurs_at, row.occurs_end_at, row.all_day, zone, true))) continue;
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
