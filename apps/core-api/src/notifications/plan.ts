// 042. From labels to moments: the two tables of the feature spec, and every
// rule that drops, moves or cuts a reminder. Pure, so the arithmetic across a
// clock change, a zone behind UTC and a rule's next occurrence is tested
// rather than trusted.
//
// **Nothing here knows about now except the default.** It returns every
// reminder a thing has for its next occurrence, past ones included, each with
// its moment; the sends keep those that land in them, the hourly pass those in
// its hour, and Today those that have begun. The one exception is the default
// for a thing no pass has labelled, which exists only within a day of now.

import { addUtcDays, dayIn, instantIn, nextOnOrAfter, parseRule, timeHM } from "@offload/widgets";
import type { RemindKind, RemindLead } from "../schema.js";

export type Kind = Exclude<RemindKind, "none">;
export type Lead = RemindLead;
export type Window = "long" | "short" | "day";
export type Send = "morning" | "evening";

/** Which windows, in the order How many keeps them. */
export const ORDER: Record<Kind, Record<Lead, Window[]>> = {
  meeting: { none: ["day"], days: ["short", "day"], weeks: ["long", "short", "day"], months: ["long", "short", "day"] },
  appointment: { none: ["short", "day"], days: ["short", "day"], weeks: ["long", "short", "day"], months: ["long", "short", "day"] },
  occasion: { none: ["day"], days: ["short", "day"], weeks: ["short", "long", "day"], months: ["long", "short", "day"] },
  deadline: { none: ["day"], days: ["short", "day"], weeks: ["long", "short", "day"], months: ["long", "short", "day"] },
  trip: { none: ["short"], days: ["short"], weeks: ["long", "short"], months: ["long", "short"] },
  day: { none: ["day"], days: ["day"], weeks: ["day"], months: ["day"] },
};

/** A month out: days before. */
const LONG_DAYS: Record<Lead, number> = { none: 28, days: 28, weeks: 28, months: 56 };

/** A week out: days before, or the evening before. */
function shortPlace(kind: Kind, lead: Lead): { days: number; send: Send } {
  const long = lead === "weeks" || lead === "months";
  switch (kind) {
    case "meeting":
      return { days: long ? 7 : 2, send: "morning" };
    case "appointment":
      return { days: 1, send: "evening" };
    case "occasion":
      return { days: 5, send: "morning" };
    case "deadline":
      return { days: long ? 7 : 3, send: "morning" };
    case "trip":
      return long ? { days: 7, send: "morning" } : { days: 1, send: "evening" };
    case "day":
      return { days: 0, send: "morning" };
  }
}

/** On the day with a clock time: minutes before, or null for the morning. */
const MINUTES_BEFORE: Record<Kind, number | null> = {
  meeting: 15,
  appointment: 60,
  occasion: null,
  deadline: 30,
  trip: null,
  day: 30,
};

/** An unlabelled thing with a clock time in the next 24 hours. */
export const DEFAULT_MINUTES = 30;
const DEFAULT_WITHIN_MS = 24 * 3_600_000;
/** The two-day rule. */
const FRESH_MS = 48 * 3_600_000;
/** A late month out must leave this many days before its week out. */
const LATE_GAP_DAYS = 3;
/** A notification of its own goes only between these, in the account's zone. */
const EARLIEST = "07:00";
const LATEST = "22:00";

export interface Dated {
  /** Null: no pass has labelled it. */
  kind: RemindKind | null;
  lead: Lead | null;
  /** The thing's day, `YYYY-MM-DD` in the account's zone, or its anchor's
   *  for an anchored task; for a rule, the rule's first day. */
  day: string | null;
  /** `HH:MM` in the account's zone, or null for a day with no clock time. */
  time: string | null;
  /** Due the day before `day`, which is the anchor's. */
  anchored: boolean;
  rule: string | null;
  /** A memory's `MM-DD`, every year; 29 February is the 28th in other years. */
  yearlyOn?: string | null;
  /** Somebody asked to be reminded (`is_reminder`). */
  asked: boolean;
  /** Dumped, or its date last set by its author. */
  since: Date;
  labelledAt: Date | null;
}

export interface Clock {
  zone: string;
  /** `HH:MM`, the morning and evening sends. */
  morning: string;
  evening: string;
  /** How many: 1, 2 or 3. */
  count: number;
  now: Date;
}

interface Base {
  window: Window;
  /** The day the reminder is about. */
  occurrence: string;
  moment: Date;
}
export type Slot = Base & ({ at: "send"; day: string; send: Send } | { at: "own"; instant: Date; minutes: number });

function sendAt(day: string, send: Send, clock: Clock): Date {
  return instantIn(`${day}T${(send === "morning" ? clock.morning : clock.evening).slice(0, 5)}`, clock.zone)!;
}

function sendSlot(window: Window, occurrence: string, day: string, send: Send, clock: Clock): Slot {
  return { window, occurrence, at: "send", day, send, moment: sendAt(day, send, clock) };
}

function ownSlot(window: Window, occurrence: string, at: Date, minutes: number, clock: Clock): Slot {
  const instant = new Date(at.getTime() - minutes * 60_000);
  const local = dayIn(instant, clock.zone);
  const hhmm = timeHM(instant.toISOString(), clock.zone);
  if (hhmm < EARLIEST) return sendSlot(window, occurrence, addUtcDays(local, -1), "evening", clock);
  if (hhmm > LATEST) return sendSlot(window, occurrence, local, "morning", clock);
  return { window, occurrence, at: "own", instant, minutes, moment: instant };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function nextYearly(mmdd: string, today: string): string {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const day = mmdd === "02-29" && !isLeap(y) ? `${y}-02-28` : `${y}-${mmdd}`;
    if (day >= today) return day;
  }
  return `${year + 1}-${mmdd}`;
}

/** The next occurrence on or after today, and which windows its rule allows. */
function nextOf(dated: Dated, today: string): { occurrence: string; allowed: Set<Window> } | null {
  const all = new Set<Window>(["long", "short", "day"]);
  if (dated.yearlyOn) return { occurrence: nextYearly(dated.yearlyOn, today), allowed: all };
  if (!dated.day) return null;
  if (!dated.rule) {
    const occurrence = dated.anchored ? addUtcDays(dated.day, -1) : dated.day;
    return occurrence >= today ? { occurrence, allowed: all } : null;
  }
  const parsed = parseRule(dated.rule);
  if (!parsed.ok) return null;
  const occurrence = nextOnOrAfter(parsed.rule, dated.day, today);
  if (!occurrence) return null;
  const freq = parsed.rule.freq;
  if (freq === "DAILY" || freq === "WEEKLY") return { occurrence, allowed: new Set(["day"]) };
  if (freq === "MONTHLY") return { occurrence, allowed: new Set(["short", "day"]) };
  return { occurrence, allowed: all };
}

/** Every reminder the thing has for its next occurrence, oldest first. */
export function plan(dated: Dated, clock: Clock): Slot[] {
  const today = dayIn(clock.now, clock.zone);
  const next = nextOf(dated, today);
  if (!next) return [];
  const { occurrence, allowed } = next;
  const clocked = dated.time && !dated.anchored ? instantIn(`${occurrence}T${dated.time}`, clock.zone) : null;

  // Asked at a clock time: at that time, first, whatever the label says.
  const asked = dated.asked && clocked ? ownSlot("day", occurrence, clocked, 0, clock) : null;

  if (dated.kind === null) {
    if (asked) return [asked];
    if (!clocked) return [];
    const ahead = clocked.getTime() - clock.now.getTime();
    if (ahead <= 0 || ahead > DEFAULT_WITHIN_MS) return [];
    return [ownSlot("day", occurrence, clocked, DEFAULT_MINUTES, clock)];
  }
  if (dated.kind === "none" || !dated.lead) return asked ? [asked] : [];

  const kind = dated.kind;
  const lead = dated.lead;
  const table = ORDER[kind][lead].filter((window) => allowed.has(window));
  // Asked at a clock time is a day reminder whatever the kind's table holds.
  const windows: Window[] = asked && !table.includes("day") ? [...table, "day"] : table;

  const placed = new Map<Window, Slot>();
  for (const window of windows) {
    if (window === "long") {
      placed.set(window, sendSlot(window, occurrence, addUtcDays(occurrence, -LONG_DAYS[lead]), "morning", clock));
    } else if (window === "short") {
      const { days, send } = shortPlace(kind, lead);
      placed.set(window, sendSlot(window, occurrence, addUtcDays(occurrence, -days), send, clock));
    } else if (asked) {
      placed.set(window, asked);
    } else {
      const minutes = MINUTES_BEFORE[kind];
      placed.set(
        window,
        clocked && minutes !== null ? ownSlot(window, occurrence, clocked, minutes, clock) : sendSlot(window, occurrence, occurrence, "morning", clock),
      );
    }
  }

  // Drop what cannot be used: passed by the time it was labelled, and a month
  // out or a week out within two days after it was dumped or its date set.
  const labelled = dated.labelledAt?.getTime() ?? -Infinity;
  const fresh = dated.since.getTime() + FRESH_MS;
  const usable = (slot: Slot) =>
    slot.moment.getTime() >= labelled && (slot.window === "day" || slot.moment.getTime() >= fresh);

  const long = placed.get("long");
  if (long && !usable(long)) {
    placed.delete("long");
    // A late month out: the first morning send the two-day rule allows, when
    // that is at least three days before the week out.
    const short = placed.get("short");
    if (short && short.at === "send" && (lead === "weeks" || lead === "months")) {
      const earliest = Math.max(fresh, labelled);
      let day = dayIn(new Date(earliest), clock.zone);
      if (sendAt(day, "morning", clock).getTime() < earliest) day = addUtcDays(day, 1);
      if (day <= addUtcDays(short.day, -LATE_GAP_DAYS)) placed.set("long", sendSlot("long", occurrence, day, "morning", clock));
    }
  }
  for (const [window, slot] of placed) if (window !== "long" && !usable(slot)) placed.delete(window);

  // Then cut to How many, the asked one first.
  const order = asked ? (["day", ...windows.filter((window) => window !== "day")] as Window[]) : windows;
  const kept = order.filter((window) => placed.has(window)).slice(0, Math.max(1, clock.count));

  // Two windows that land in the same send are one mention.
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const window of kept) {
    const slot = placed.get(window)!;
    const key = slot.at === "send" ? `${slot.day} ${slot.send}` : `own ${slot.instant.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out.sort((a, b) => a.moment.getTime() - b.moment.getTime());
}
