// The recurrence rule: a closed grammar, one implementation, every surface.
//
// 023 replaced a six-value enum with an RFC 5545 rule, and this file is the
// cost that decision accepted: a parser, a serialiser, an expander and the
// words for each shape. The grammar is exactly what the picker can draw and
// nothing wider, because a rule the sheet cannot show is a rule nobody can
// correct. The server stores only `formatRule(parseRule(text))`, so the bytes
// that arrived never reach Postgres, a picker or Google.
//
// Every day is a `YYYY-MM-DD` string and the arithmetic is UTC, so the rule
// draws the same days on the server, on the web and on both phones.

import {
  addDays,
  dayOf,
  daysBetween,
  lastDayOfMonth,
  noonUtc,
  partsOf,
  utcDay,
  weekdayIndex,
} from "./days.js";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Rule {
  freq: Freq;
  /** 1 to 99. */
  interval: number;
  /** Weekly only: the days of the week, in Monday-first order, no repeats. */
  byDay?: Weekday[];
  /** Monthly only: the nth weekday, first to fourth, or last as -1. */
  ordinal?: { n: 1 | 2 | 3 | 4 | -1; day: Weekday };
  /** Monthly only: a day of the month, clamped in short months. */
  byMonthDay?: number;
  /** `YYYYMMDDTHHMMSSZ`, inclusive of its UTC day. */
  until?: string;
  /** 1 to 999, counted from the anchor. */
  count?: number;
  wkst?: Weekday;
}

export type RuleRefusal =
  | "empty"
  | "bytes"
  | "no_freq"
  | "bad_freq"
  | "duplicate"
  | "unknown_part"
  | "part_not_allowed"
  | "bad_interval"
  | "bad_byday"
  | "bad_bymonthday"
  | "bad_until"
  | "bad_count"
  | "bad_wkst"
  | "until_and_count"
  | "two_anchors";

export type ParsedRule = { ok: true; rule: Rule } | { ok: false; reason: RuleRefusal };

/** How many occurrences one call may draw. A year of daily is 365, and a
 *  window wider than that is not a calendar anybody reads. Bounds the window,
 *  never the age of the rule: the expander jumps to the window. */
export const RULE_STEP_CAP = 400;

const FREQS: readonly Freq[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const KEYS = ["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "UNTIL", "COUNT", "WKST"] as const;
type Key = (typeof KEYS)[number];
const BYTES = /^[A-Z0-9;=,+-]+$/;
const UNTIL = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
const ORDINAL = /^([+-]?[1-4]|-1)(MO|TU|WE|TH|FR|SA|SU)$/;

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

function refuse(reason: RuleRefusal): ParsedRule {
  return { ok: false, reason };
}

/** Parse, or say why not. Case is forgiven on the way in; nothing else is. */
export function parseRule(text: unknown): ParsedRule {
  if (typeof text !== "string") return refuse("empty");
  const trimmed = text.trim();
  if (trimmed === "") return refuse("empty");
  const upper = trimmed.toUpperCase();
  if (!BYTES.test(upper)) return refuse("bytes");

  const raw = new Map<Key, string>();
  for (const part of upper.split(";")) {
    const at = part.indexOf("=");
    if (at <= 0) return refuse("unknown_part");
    const key = part.slice(0, at);
    if (!(KEYS as readonly string[]).includes(key)) return refuse("unknown_part");
    if (raw.has(key as Key)) return refuse("duplicate");
    raw.set(key as Key, part.slice(at + 1));
  }

  const freqText = raw.get("FREQ");
  if (freqText === undefined) return refuse("no_freq");
  if (!(FREQS as readonly string[]).includes(freqText)) return refuse("bad_freq");
  const freq = freqText as Freq;
  const rule: Rule = { freq, interval: 1 };

  const intervalText = raw.get("INTERVAL");
  if (intervalText !== undefined) {
    if (!/^\d{1,2}$/.test(intervalText)) return refuse("bad_interval");
    const interval = Number(intervalText);
    if (interval < 1 || interval > 99) return refuse("bad_interval");
    rule.interval = interval;
  }

  const byDayText = raw.get("BYDAY");
  const byMonthDayText = raw.get("BYMONTHDAY");
  if ((freq === "DAILY" || freq === "YEARLY") && (byDayText !== undefined || byMonthDayText !== undefined)) {
    return refuse("part_not_allowed");
  }
  if (freq === "WEEKLY" && byMonthDayText !== undefined) return refuse("part_not_allowed");

  if (byDayText !== undefined) {
    if (freq === "WEEKLY") {
      const days = byDayText.split(",");
      if (days.some((day) => !isWeekday(day))) return refuse("bad_byday");
      rule.byDay = WEEKDAYS.filter((day) => days.includes(day));
    } else {
      const match = ORDINAL.exec(byDayText);
      if (!match) return refuse("bad_byday");
      const n = Number(match[1]) as 1 | 2 | 3 | 4 | -1;
      rule.ordinal = { n, day: match[2] as Weekday };
    }
  }

  if (byMonthDayText !== undefined) {
    if (!/^\d{1,2}$/.test(byMonthDayText)) return refuse("bad_bymonthday");
    const dom = Number(byMonthDayText);
    if (dom < 1 || dom > 31) return refuse("bad_bymonthday");
    rule.byMonthDay = dom;
  }
  if (rule.ordinal && rule.byMonthDay !== undefined) return refuse("two_anchors");

  const untilText = raw.get("UNTIL");
  if (untilText !== undefined) {
    const match = UNTIL.exec(untilText);
    if (!match) return refuse("bad_until");
    const [, y, mo, d, h, mi, s] = match.map(Number);
    const at = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!));
    const sound =
      at.getUTCFullYear() === y && at.getUTCMonth() === mo! - 1 && at.getUTCDate() === d &&
      at.getUTCHours() === h && at.getUTCMinutes() === mi && at.getUTCSeconds() === s;
    if (!sound) return refuse("bad_until");
    rule.until = untilText;
  }

  const countText = raw.get("COUNT");
  if (countText !== undefined) {
    if (!/^\d{1,3}$/.test(countText)) return refuse("bad_count");
    const count = Number(countText);
    if (count < 1 || count > 999) return refuse("bad_count");
    rule.count = count;
  }
  if (rule.until !== undefined && rule.count !== undefined) return refuse("until_and_count");

  const wkstText = raw.get("WKST");
  if (wkstText !== undefined) {
    if (!isWeekday(wkstText)) return refuse("bad_wkst");
    rule.wkst = wkstText;
  }

  return { ok: true, rule };
}

/** The one string the server stores: parts in a fixed order, no INTERVAL=1. */
export function formatRule(rule: Rule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(",")}`);
  if (rule.ordinal) parts.push(`BYDAY=${rule.ordinal.n}${rule.ordinal.day}`);
  if (rule.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${rule.until}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.wkst) parts.push(`WKST=${rule.wkst}`);
  return parts.join(";");
}

/** Is this exactly what `formatRule` would write? What the routes assert
 *  about a stored value, and what the migration's output is tested against. */
export function isCanonicalRule(text: string): boolean {
  const parsed = parseRule(text);
  return parsed.ok && formatRule(parsed.rule) === text;
}

// ---------------------------------------------------------------- expansion

function weekdayOfDay(day: string): Weekday {
  return WEEKDAYS[weekdayIndex(day)]!;
}

/** The start of the week a day is in, for a week starting on `wkst`. */
function startOfWeek(day: string, wkst: Weekday): string {
  const offset = (weekdayIndex(day) - WEEKDAYS.indexOf(wkst) + 7) % 7;
  return addDays(day, -offset);
}

function nthWeekday(year: number, month: number, n: 1 | 2 | 3 | 4 | -1, day: Weekday): string {
  const wanted = WEEKDAYS.indexOf(day);
  if (n === -1) {
    const last = lastDayOfMonth(year, month);
    const lastDay = dayOf(year, month, last);
    return addDays(lastDay, -((weekdayIndex(lastDay) - wanted + 7) % 7));
  }
  const first = dayOf(year, month, 1);
  const firstOfKind = addDays(first, (wanted - weekdayIndex(first) + 7) % 7);
  return addDays(firstOfKind, 7 * (n - 1));
}

function untilDay(rule: Rule): string | null {
  return rule.until ? `${rule.until.slice(0, 4)}-${rule.until.slice(4, 6)}-${rule.until.slice(6, 8)}` : null;
}

/** Occurrences on or after `from`, at most `limit`, never past `end`. The
 *  anchor is always the first occurrence, as a calendar counts DTSTART. Jumps
 *  to `from` rather than walking there, so a rule from years ago still answers
 *  for this month. */
function take(rule: Rule, anchor: string, from: string, end: string | null, limit: number): string[] {
  const out: string[] = [];
  const push = (day: string): boolean => {
    if (end !== null && day > end) return false;
    if (day >= from && day >= anchor && out[out.length - 1] !== day) out.push(day);
    return out.length < limit;
  };
  const start = from > anchor ? from : anchor;
  if (end !== null && start > end) return out;
  if (!push(anchor)) return out;

  if (rule.freq === "DAILY" || (rule.freq === "WEEKLY" && !rule.byDay?.length)) {
    const step = rule.freq === "DAILY" ? rule.interval : 7 * rule.interval;
    const behind = daysBetween(anchor, start);
    let k = behind <= 0 ? 1 : Math.max(1, Math.ceil(behind / step));
    for (let steps = 0; steps < RULE_STEP_CAP; steps += 1, k += 1) {
      if (!push(addDays(anchor, k * step))) break;
    }
    return out;
  }

  if (rule.freq === "WEEKLY") {
    const wkst = rule.wkst ?? "MO";
    const base = startOfWeek(anchor, wkst);
    const span = 7 * rule.interval;
    const offsets = rule.byDay!.map((day) => (WEEKDAYS.indexOf(day) - WEEKDAYS.indexOf(wkst) + 7) % 7);
    let k = Math.max(0, Math.floor(daysBetween(base, start) / span) - 1);
    for (let steps = 0; steps < RULE_STEP_CAP; steps += 1, k += 1) {
      const weekStart = addDays(base, k * span);
      let more = true;
      for (const offset of offsets) {
        const day = addDays(weekStart, offset);
        if (day <= anchor) continue;
        if (!(more = push(day))) break;
      }
      if (!more) break;
      if (end !== null && weekStart > end) break;
    }
    return out;
  }

  if (rule.freq === "MONTHLY") {
    const { year, month, dom } = partsOf(anchor);
    const startParts = partsOf(start);
    const monthsBehind = (startParts.year - year) * 12 + (startParts.month - month);
    let k = Math.max(1, Math.floor(monthsBehind / rule.interval) - 1);
    for (let steps = 0; steps < RULE_STEP_CAP; steps += 1, k += 1) {
      const total = month - 1 + k * rule.interval;
      const y = year + Math.floor(total / 12);
      const m = (total % 12) + 1;
      const day = rule.ordinal
        ? nthWeekday(y, m, rule.ordinal.n, rule.ordinal.day)
        : dayOf(y, m, Math.min(rule.byMonthDay ?? dom, lastDayOfMonth(y, m)));
      if (!push(day)) break;
    }
    return out;
  }

  const { year, month, dom } = partsOf(anchor);
  let k = Math.max(1, Math.floor((partsOf(start).year - year) / rule.interval) - 1);
  for (let steps = 0; steps < RULE_STEP_CAP; steps += 1, k += 1) {
    const y = year + k * rule.interval;
    if (!push(dayOf(y, month, Math.min(dom, lastDayOfMonth(y, month))))) break;
  }
  return out;
}

/** The last day a counted rule lands on. Counted from the anchor, which is
 *  the first occurrence; at most 999 steps, which is the grammar's bound. */
function countEnd(rule: Rule, anchor: string): string {
  const { count, until, ...open } = rule;
  void until;
  const days = take(open, anchor, anchor, null, count!);
  return days[days.length - 1] ?? anchor;
}

function endOf(rule: Rule, anchor: string, to: string | null): string | null {
  let end = to;
  const until = untilDay(rule);
  if (until !== null && (end === null || until < end)) end = until;
  if (rule.count !== undefined) {
    const last = countEnd(rule, anchor);
    if (end === null || last < end) end = last;
  }
  return end;
}

/** Every day the rule lands on inside `[from, to]`, at most `cap`. */
export function occurrencesIn(
  rule: Rule,
  anchor: string,
  from: string,
  to: string,
  cap = RULE_STEP_CAP,
): string[] {
  const end = endOf(rule, anchor, to);
  if (end === null || end < from) return [];
  return take(rule, anchor, from, end, cap);
}

/** The first day the rule lands on, on or after `day`, or null once it is over. */
export function nextOnOrAfter(rule: Rule, anchor: string, day: string): string | null {
  const end = endOf(rule, anchor, null);
  if (end !== null && end < day) return null;
  return take(rule, anchor, day, end, 1)[0] ?? null;
}

// ------------------------------------------------------------------ words

const ORDINALS: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };

function nth(dom: number): string {
  const rest = dom % 100;
  if (rest >= 11 && rest <= 13) return `${dom}th`;
  const last = dom % 10;
  return `${dom}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

function weekdayName(day: Weekday, locale?: string): string {
  // The 5th of January 2026 is a Monday, so index 0 is Monday from there.
  const at = new Date(Date.UTC(2026, 0, 5 + WEEKDAYS.indexOf(day), 12));
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(at);
}

function dayAndMonth(day: string, locale: string | undefined, month: "long" | "short", withYear = false): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month,
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(noonUtc(day));
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const WEEKDAYS_ONLY: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR"];

/** The cadence line, and the presets' own labels. */
export function describeRule(rule: Rule, anchor: string, locale?: string): string {
  const every = rule.interval > 1;
  let words: string;
  switch (rule.freq) {
    case "DAILY":
      words = every ? `Every ${rule.interval} days` : "Daily";
      break;
    case "WEEKLY": {
      const days = rule.byDay?.length ? rule.byDay : [weekdayOfDay(anchor)];
      const weekdays = days.length === 5 && days.every((day, at) => day === WEEKDAYS_ONLY[at]);
      const on = weekdays ? "weekdays" : list(days.map((day) => weekdayName(day, locale)));
      words = every
        ? `Every ${rule.interval} weeks on ${on}`
        : weekdays
          ? "Every weekday"
          : `Weekly on ${on}`;
      break;
    }
    case "MONTHLY": {
      const on = rule.ordinal
        ? `the ${ORDINALS[String(rule.ordinal.n)]} ${weekdayName(rule.ordinal.day, locale)}`
        : `the ${nth(rule.byMonthDay ?? partsOf(anchor).dom)}`;
      words = every ? `Every ${rule.interval} months on ${on}` : `Monthly on ${on}`;
      break;
    }
    case "YEARLY": {
      const on = dayAndMonth(anchor, locale, "long");
      words = every ? `Every ${rule.interval} years on ${on}` : `Annually on ${on}`;
      break;
    }
  }
  if (rule.until) {
    const until = untilDay(rule)!;
    const sameYear = until.slice(0, 4) === anchor.slice(0, 4);
    words += `, until ${dayAndMonth(until, locale, "short", !sameYear)}`;
  }
  if (rule.count !== undefined) words += `, ${rule.count} ${rule.count === 1 ? "time" : "times"}`;
  return words;
}

export interface Preset {
  label: string;
  /** The canonical rule, null for Never, and `custom` for the sheet. */
  rule: string | null;
}

/** The seven presets for a picked day, each naming what it read off it.
 *  Monthly is the nth weekday, and a fifth reads as the last. */
export function presetsFor(day: string, locale?: string): Preset[] {
  const weekday = weekdayOfDay(day);
  const dom = partsOf(day).dom;
  const n = (Math.ceil(dom / 7) >= 5 ? -1 : Math.ceil(dom / 7)) as 1 | 2 | 3 | 4 | -1;
  const rules: Rule[] = [
    { freq: "DAILY", interval: 1 },
    { freq: "WEEKLY", interval: 1, byDay: [weekday] },
    { freq: "WEEKLY", interval: 1, byDay: [...WEEKDAYS_ONLY] },
    { freq: "MONTHLY", interval: 1, ordinal: { n, day: weekday } },
    { freq: "YEARLY", interval: 1 },
  ];
  return [
    { label: "Never", rule: null },
    ...rules.map((rule) => ({ label: describeRule(rule, day, locale), rule: formatRule(rule) })),
    { label: "Custom", rule: "custom" },
  ];
}

/** The day a rule anchors on, read off a row: an event repeats when it
 *  happens, everything else when it is wanted by. Bare days are dates and
 *  timed rows are read in the account's zone, which the caller resolves. */
export function anchorDayOf(row: { type: string; occursDay: string | null; dueDay: string | null }): string | null {
  return row.type === "event" ? row.occursDay : row.dueDay;
}

export { utcDay };
