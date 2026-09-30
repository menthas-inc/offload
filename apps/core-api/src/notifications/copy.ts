// Every line a notification can say. 024.
//
// One template with three arms, so a sentence is testable rather than judged
// per send: one is named, two to four are listed, five or more name the first
// two and count the rest. The title is verb-free and subject-free, Due today
// or Tomorrow, never "You have 3 tasks due". Overdue is a second sentence and
// never a second notification. An event says its hour and a task says nothing
// about time even when it has one. Another member's row is named with its
// author, yours never is, so the possessive itself carries the meaning. Every
// string a person wrote is clamped before it is rendered, and the words are
// stored verbatim on the Activity row and never rendered again.
//
// Pure: no clock, no database, no locale beyond the one passed in. What is
// said here is what the tests pin, line by line.

import { noonUtc } from "@offload/widgets";

/** The bound the share preview already uses: one line, 120 characters. */
const CLAMP = 120;

/** What a digest names: a reminder row, as the send sees it. */
export interface DigestRow {
  id: string;
  title: string;
  /** "event" says its hour; every other type says nothing about time. */
  type: string;
  /** The instant of the type's column, for the hour; null on a bare day. */
  at: string | null;
  allDay: boolean;
  /** The local day the row lands on, `YYYY-MM-DD`, for the overdue sentence
   *  and the repeating clause. */
  day: string;
  /** Another member's display name, "" for a member with no name, and null
   *  when the row is the recipient's own. */
  author: string | null;
  /** Carries a rule. */
  repeating: boolean;
  /** A daily rule, which is simply named. */
  daily: boolean;
}

export type Send = "morning" | "evening";

export interface Copy {
  title: string;
  body: string | null;
}

const TITLES: Record<Send, string> = { morning: "Due today", evening: "Tomorrow" };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** A count in words up to nine, and a number past that: a count stands on its own. */
export function count(n: number): string {
  return WORDS[n] ?? String(n);
}

/** Control characters and the two Unicode line separators, built from a
 *  string so no editor can turn an escape into the character itself. */
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+", "g");

/** One line, control characters stripped, 120 characters. */
export function clamp(text: string): string {
  return clampTo(text, CLAMP);
}

/** The same, to another length. 026 keeps an email's subject to 300. */
export function clampTo(text: string, max: number): string {
  return text
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export function capital(sentence: string): string {
  return sentence.length > 0 ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : sentence;
}

/** The hour an event says, in the account's zone: "9:00", "19:30". */
function hourOf(iso: string, zone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hourCycle: "h23",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone ?? "UTC",
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "0";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${String(Number(hour === "24" ? "0" : hour))}:${minute}`;
}

/** The weekday a day falls on, in the reader's language. */
function weekdayOf(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(noonUtc(day));
}

/** A member's name is a person-written string too, and the one string the
 *  digest interpolates raw until the review of 2026-09-22 asked why. */
function possessive(author: string): string {
  const name = clamp(author);
  return `${name === "" ? "Someone" : name}'s`;
}

/** The phrase one row becomes in a list. */
function phrase(row: DigestRow, zone: string | null): string {
  const title = clamp(row.title);
  const named = row.author === null ? title : `${possessive(row.author)} ${title}`;
  return row.type === "event" && row.at && !row.allDay ? `${named} at ${hourOf(row.at, zone)}` : named;
}

/** The three arms over a list of phrases, with the rest counted. */
function listOf(phrases: string[], hidden: number): string {
  const shown = phrases.length + hidden > 4 ? phrases.slice(0, 2) : phrases;
  const more = phrases.length + hidden - shown.length;
  if (shown.length === 0) return "";
  if (shown.length === 1 && more === 0) return `${shown[0]}.`;
  const tail = more > 0 ? `${count(more)} more` : shown[shown.length - 1];
  const head = more > 0 ? shown : shown.slice(0, -1);
  return `${head.join(", ")}, and ${tail}.`;
}

/** At most two rows by any one other member are named; the rest are counted. */
function capped(rows: DigestRow[]): { named: DigestRow[]; hidden: number } {
  const seen = new Map<string, number>();
  const named: DigestRow[] = [];
  let hidden = 0;
  for (const row of rows) {
    if (row.author === null) {
      named.push(row);
      continue;
    }
    const n = seen.get(row.author) ?? 0;
    seen.set(row.author, n + 1);
    if (n < 2) named.push(row);
    else hidden += 1;
  }
  return { named, hidden };
}

/** The overdue sentence: one for the count, from the day or from last week. */
function overdueSentence(overdue: DigestRow[], today: string, locale: string): string {
  if (overdue.length === 0) return "";
  const oldest = [...overdue].map((row) => row.day).sort()[0]!;
  const daysAgo = Math.round((noonUtc(today).getTime() - noonUtc(oldest).getTime()) / 86_400_000);
  const from = daysAgo >= 7 ? "last week" : weekdayOf(oldest, locale);
  const n = overdue.length;
  return `${capital(count(n))} ${n === 1 ? "is" : "are"} from ${from}.`;
}

/** A digest's title and body. `rows` are what lands in the send's day;
 *  `overdue` the reminders one to seven days late, morning only. */
export function digestCopy(
  send: Send,
  rows: DigestRow[],
  overdue: DigestRow[],
  zone: string | null,
  today: string,
  locale = "en",
): { title: string; body: string } {
  const coming = rows.filter((row) => row.repeating && !row.daily);
  const { named, hidden } = capped(rows.filter((row) => !(row.repeating && !row.daily)));
  const sentences: string[] = [];
  const list = listOf(
    named.map((row) => phrase(row, zone)),
    hidden,
  );
  if (list) sentences.push(capital(list));
  const late = overdueSentence(overdue, today, locale);
  if (late) sentences.push(late);
  for (const row of coming) {
    const named = row.author === null ? clamp(row.title) : `${possessive(row.author)} ${clamp(row.title)}`;
    sentences.push(`${capital(named)} is back on ${weekdayOf(row.day, locale)}.`);
  }
  return { title: TITLES[send], body: sentences.join(" ") };
}

/** The title of a digest that was suppressed by its switch. */
export function skippedTitle(send: Send): string {
  return `${TITLES[send]} was off`;
}

function sender(name: string | null): string {
  return name && clamp(name) ? clamp(name) : "Someone";
}

export function requestCopy(name: string | null): Copy {
  return { title: `${sender(name)} wants to connect`, body: "Answer in My people." };
}

export function shareCopy(name: string | null, threadName: string): Copy {
  return { title: `${sender(name)} shared ${clamp(threadName)}`, body: "Waiting in My threads." };
}

/** Somebody adding to a shared thread, coalesced: the count in the title,
 *  "several" past four, and their clamped titles as the body, never a title. */
export function additionsCopy(name: string | null, threadName: string, titles: string[]): Copy {
  const n = titles.length;
  const how = n > 4 ? "several" : count(n);
  return {
    title: `${sender(name)} added ${how} to ${clamp(threadName)}`,
    body: capital(listOf(titles.map(clamp), 0)),
  };
}

export function expiredCopy(kind: "request" | "share", name: string | null): Copy {
  const who = sender(name);
  return {
    title: kind === "share" ? `Your invite to ${who} expired` : `Your request to ${who} expired`,
    body: "Thirty days, no answer.",
  };
}

/** The day a moved-date row names, "Fri 25": a bare day by its own date,
 *  a timed row by the account's zone. */
export function dayLabel(at: Date, allDay: boolean, zone: string | null, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: allDay ? "UTC" : (zone ?? "UTC") }).format(at);
}

/** A date the model moved on a row that already had one. */
export function movedCopy(title: string, from: string, to: string): Copy {
  return { title: `${clamp(title)} moved`, body: `Was ${from}, now ${to}.` };
}

/** A verb acted on from a notification, quiet. */
export function actedCopy(title: string, action: "done" | "tomorrow"): Copy {
  return {
    title:
      action === "done"
        ? `${clamp(title)} ticked from the notification`
        : `${clamp(title)} moved to tomorrow from the notification`,
    body: null,
  };
}

/** 025. A live turn's labelling, as Activity records it. */
export function labelledLiveCopy(facts: { threadName: string; rows: number; labels: string[] }): string {
  return `Labelled ${count(facts.rows)} in ${clamp(facts.threadName)} under ${names(facts.labels)}.`;
}

/** 025. A nightly sort's labelling, as Activity records it. */
export function labelledNightlyCopy(facts: { threadName: string; rows: number; labels: string[] }): string {
  const n = count(facts.rows);
  return `Sorted ${clamp(facts.threadName)} into ${names(facts.labels)}. ${n.charAt(0).toUpperCase() + n.slice(1)} labelled.`;
}

function names(list: string[]): string {
  const clean = list.map((one) => clamp(one));
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}
