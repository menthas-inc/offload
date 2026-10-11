// Every line a notification can say. 024.
//
// One template with three arms, so a sentence is testable rather than judged
// per send: one is named, two to four are listed, five or more name the first
// two and count the rest. The title is verb-free and subject-free and says the
// day in counts, "Three today" or "One today, three from yesterday", never
// "You have 3 tasks due" and never a person's words (2026-09-30). What is
// still open is named after today's list and never a second notification.
// An event says its hour and a task says nothing about time even when it has
// one. Another member's row is named with its
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

/** 042. A month out or a week out, as a send's Coming up names it: always the
 *  recipient's own, so never possessive. `by` for a deadline and a task that
 *  belongs to another thing; every other kind is on its day. */
export interface ComingRow {
  id: string;
  name: string;
  /** The day it is about, `YYYY-MM-DD` in the account's zone. */
  day: string;
  by: boolean;
}

export interface Copy {
  title: string;
  body: string | null;
}

/** The switches' names, which a suppressed digest's title names. */
const TITLES: Record<Send, string> = { morning: "Due today", evening: "Tomorrow" };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** A count in words up to nine, and a number past that: a count stands on its own. */
export function count(n: number): string {
  return WORDS[n] ?? String(n);
}

/** Control characters and the two Unicode line separators, built from a
 *  string so no editor can turn an escape into the character itself. */
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+", "g");

/** One line, control characters stripped, and no bound: for a whole
 *  notification's words, which its own column bounds. */
export function oneLine(text: string): string {
  // 042. Format characters too: a bidi override or a zero-width mark in a
  // name would make a lock screen say something its words do not.
  return text.replace(/\p{Cf}/gu, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/** One line, control characters stripped, 120 characters. */
export function clamp(text: string): string {
  return oneLine(text).slice(0, CLAMP).trim();
}

/** The same, to another length. 026 keeps an email's subject to 300. */
export function clampTo(text: string, max: number): string {
  return oneLine(text).slice(0, max).trim();
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
function phrase(row: DigestRow, zone: string | null, hour = true): string {
  const title = clamp(row.title);
  const named = row.author === null ? title : `${possessive(row.author)} ${title}`;
  return hour && row.type === "event" && row.at && !row.allDay ? `${named} at ${hourOf(row.at, zone)}` : named;
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

/** At most two rows by any one other member are named; the rest are counted.
 *  `seen` is shared across a send's lists, so the bound is per send. */
function capped(rows: DigestRow[], seen = new Map<string, number>()): { named: DigestRow[]; hidden: number } {
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

/** Where the oldest overdue row is from: yesterday, a weekday, or last week. */
function fromOf(overdue: DigestRow[], today: string, locale: string): string {
  const oldest = [...overdue].map((row) => row.day).sort()[0]!;
  const daysAgo = Math.round((noonUtc(today).getTime() - noonUtc(oldest).getTime()) / 86_400_000);
  if (daysAgo >= 7) return "last week";
  return daysAgo === 1 ? "yesterday" : weekdayOf(oldest, locale);
}

/** The title, in counts: "Three today", "Five still open", "One today, three
 *  from yesterday", "Two tomorrow", and since 042 "two coming up" after them.
 *  Never a person's words, 024's rule for a digest title. 2026-09-30. */
function titleOf(send: Send, rows: DigestRow[], overdue: DigestRow[], today: string, locale: string, coming = 0): string {
  const due = rows.length > 0 ? `${count(rows.length)} ${send === "morning" ? "today" : "tomorrow"}` : "";
  const ahead = coming > 0 ? `${count(coming)} coming up` : "";
  let title: string;
  if (overdue.length === 0) title = due;
  else if (!due) title = `${count(overdue.length)} still open`;
  else title = `${due}, ${count(overdue.length)} from ${fromOf(overdue, today, locale)}`;
  return capital([title, ahead].filter(Boolean).join(", "));
}

/** 042. No dash reaches a reminder: a name is a person's words, and a dash in
 *  one would be the one offload wrote. */
function withoutDashes(text: string): string {
  return text.replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, ", ").replace(/^, |, $/g, "");
}

/** A name a reminder carries: one line, 120, no dashes. */
export function reminderName(name: string): string {
  return clamp(withoutDashes(oneLine(name)));
}

/** 042. When a coming day is: "tomorrow", its weekday within the week, its
 *  day and month further out. */
function comingWhen(row: ComingRow, today: string, locale: string): string {
  const days = Math.round((noonUtc(row.day).getTime() - noonUtc(today).getTime()) / 86_400_000);
  const word = row.by ? "by" : "on";
  if (days === 1) return row.by ? "by tomorrow" : "tomorrow";
  if (days > 1 && days < 7) return `${word} ${weekdayOf(row.day, locale)}`;
  const dayMonth = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(noonUtc(row.day));
  return `${word} ${dayMonth}`;
}

/** 042. Cut at a word, ending as a sentence: a lock screen shows little, and
 *  what is due comes first so it is what survives. */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const at = head.lastIndexOf(" ");
  return `${(at > 0 ? head.slice(0, at) : head).replace(/[\s,.:;]+$/, "")}.`;
}

/** 042. A reminder of its own: when in the title, never a person's words,
 *  and what and when in the body. */
export function ownCopy(name: string, at: Date, minutes: number, zone: string | null): { title: string; body: string } {
  const title = minutes === 0 ? "Now" : minutes === 60 ? "In an hour" : `In ${minutes} minutes`;
  return { title, body: `${capital(reminderName(name))} at ${hourOf(at.toISOString(), zone)}.` };
}

/** A digest's title and body. `rows` are what lands in the send's day;
 *  `overdue` the reminders one to seven days late, morning only. The body
 *  names today's rows, then a repeating row's clause, then what is still
 *  open, named the same way but never with an hour. */
export function digestCopy(
  send: Send,
  rows: DigestRow[],
  overdue: DigestRow[],
  zone: string | null,
  today: string,
  locale = "en",
  ahead: ComingRow[] = [],
): { title: string; body: string } {
  const coming = rows.filter((row) => row.repeating && !row.daily);
  const seen = new Map<string, number>();
  const { named, hidden } = capped(
    rows.filter((row) => !(row.repeating && !row.daily)),
    seen,
  );
  const sentences: string[] = [];
  const list = listOf(
    named.map((row) => phrase(row, zone)),
    hidden,
  );
  if (list) sentences.push(capital(list));
  for (const row of coming) {
    const named = row.author === null ? clamp(row.title) : `${possessive(row.author)} ${clamp(row.title)}`;
    sentences.push(`${capital(named)} is back on ${weekdayOf(row.day, locale)}.`);
  }
  const late = capped(overdue, seen);
  // Every overdue row can be past its member's two, which leaves a count alone.
  const open =
    late.named.length > 0
      ? capital(listOf(late.named.map((row) => phrase(row, null, false)), late.hidden))
      : late.hidden > 0
        ? `${capital(count(late.hidden))} more.`
        : "";
  if (open) sentences.push(sentences.length > 0 ? `Still open: ${open}` : open);
  // 042. What is coming, after what is due and what is still open.
  const next = listOf(
    ahead.map((row) => `${reminderName(row.name)} ${comingWhen(row, today, locale)}`),
    0,
  );
  if (next) sentences.push(sentences.length > 0 ? `Coming up: ${next}` : capital(next));
  return { title: titleOf(send, rows, overdue, today, locale, ahead.length), body: sentences.join(" ") };
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

function names(list: string[]): string {
  const clean = list.map((one) => clamp(one));
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}
