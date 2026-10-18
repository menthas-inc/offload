"use client";

// 027 Today, over the wire: the day, Needs you, putting a card off, open in
// your threads (2026-10-07), Reminders (042), and the layout Customize Today
// stores. Mirrors
// `apps/core-api/src/routes/today.ts` and `src/today/layout.ts`; the server's
// zod schemas are the shapes, and these types say only what the page reads.

import { GOOGLE_EVENT_LINK, type MonthCount, type ReminderEntry as Entry } from "@offload/widgets";
import type { QuestionOnWire } from "./dump";
import type { ContentRow } from "./threads";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const send = { credentials: "include" as const };
const json = { credentials: "include" as const, headers: { "content-type": "application/json" } };

/** The Today tab pressed while Today is showing: back to Today. The sidebar
 *  sends it; a route entry needs nothing, since the page mounts on Today. */
export const TODAY_RESET = "offload:today-reset";

// ---------------------------------------------------------------- the layout

export const NEEDS_PARTS = ["account", "people", "questions", "tips"] as const;
export type NeedsPart = (typeof NEEDS_PARTS)[number];

export type LayoutSection =
  | { kind: "needs_you"; parts: { kind: NeedsPart; on: boolean }[] }
  | { kind: "day"; on: boolean }
  | { kind: "open_threads"; on: boolean }
  /** 042. Between Your day and Open in your threads by default. */
  | { kind: "reminders"; on: boolean };

export interface TodayLayout {
  version: 1;
  sections: LayoutSection[];
}

export const DEFAULT_LAYOUT: TodayLayout = {
  version: 1,
  sections: [
    { kind: "needs_you", parts: NEEDS_PARTS.map((kind) => ({ kind, on: true })) },
    { kind: "day", on: true },
    { kind: "reminders", on: true },
    { kind: "open_threads", on: true },
  ],
};

/** What `/api/me` resolved, or the defaults before it has said. */
export function layoutOf(stored: TodayLayout | null | undefined): TodayLayout {
  return stored && Array.isArray(stored.sections) ? stored : DEFAULT_LAYOUT;
}

/** 042. The account's layout: V3, the whole document, then V2, which builds
 *  from before Reminders read, then the defaults. */
export function layoutOfMe(me: { todayLayoutV3?: TodayLayout | undefined; todayLayoutV2?: TodayLayout | undefined } | null): TodayLayout {
  return layoutOf(me?.todayLayoutV3 ?? me?.todayLayoutV2);
}

export function partsOn(layout: TodayLayout): Set<NeedsPart> {
  const needs = layout.sections.find((one) => one.kind === "needs_you");
  return new Set(needs?.kind === "needs_you" ? needs.parts.filter((part) => part.on).map((part) => part.kind) : []);
}

export function dayOn(layout: TodayLayout): boolean {
  const day = layout.sections.find((one) => one.kind === "day");
  return day?.kind === "day" ? day.on : true;
}

export function openThreadsOn(layout: TodayLayout): boolean {
  const open = layout.sections.find((one) => one.kind === "open_threads");
  return open?.kind === "open_threads" ? open.on : true;
}

export function remindersOn(layout: TodayLayout): boolean {
  const reminders = layout.sections.find((one) => one.kind === "reminders");
  return reminders?.kind === "reminders" ? reminders.on : true;
}

/** How many switches are on, so the last one can be held on. */
export function switchesOn(layout: TodayLayout): number {
  return layout.sections.reduce(
    (count, one) => count + (one.kind === "needs_you" ? one.parts.filter((part) => part.on).length : one.on ? 1 : 0),
    0,
  );
}

export function withPart(layout: TodayLayout, kind: NeedsPart, on: boolean): TodayLayout {
  return {
    version: 1,
    sections: layout.sections.map((one) =>
      one.kind === "needs_you" ? { ...one, parts: one.parts.map((part) => (part.kind === kind ? { ...part, on } : part)) } : one,
    ),
  };
}

/** A section's own switch: the day, Reminders, or open in your threads. */
export function withSection(layout: TodayLayout, kind: "day" | "reminders" | "open_threads", on: boolean): TodayLayout {
  return { version: 1, sections: layout.sections.map((one) => (one.kind === kind ? { ...one, on } : one)) };
}

/** The section moved to `to`, the others keeping their order. */
export function moved(layout: TodayLayout, kind: LayoutSection["kind"], to: number): TodayLayout {
  const from = layout.sections.findIndex((one) => one.kind === kind);
  if (from < 0) return layout;
  const sections = [...layout.sections];
  const [taken] = sections.splice(from, 1);
  sections.splice(Math.max(0, Math.min(to, sections.length)), 0, taken!);
  return { version: 1, sections };
}

// ---------------------------------------------------------------- the day

/** A row on Today: the thread page's row, with the thread it lives in. */
export interface AgendaRow extends ContentRow {
  threadId: string;
  /** 028. Null for a row that is not in a thread, which draws no pill. */
  threadName: string | null;
  /** 037. Null with the name. */
  threadIcon: string | null;
  threadHue: number | null;
}

export interface TodayEvent {
  id: string;
  source: "calendar" | "offload";
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  /** A calendar of the account's, or a row it filed. */
  mine: boolean;
  calendarName: string | null;
  link: string | null;
  threadId: string | null;
  threadName: string | null;
  threadIcon: string | null;
  threadHue: number | null;
  /** An offload event another member filed. */
  authorName: string | null;
}

export interface Day {
  date: string;
  events: TodayEvent[];
  eventCount: number;
  late: AgendaRow[];
  lateMore: number;
  timed: AgendaRow[];
  rest: AgendaRow[];
  restMore: number;
  timedMore: number;
  everDumped: boolean;
  threadLabels: { id: string; name: string; colour: number }[];
}

/** One day, or null when it did not load. */
export async function fetchDay(date: string): Promise<Day | null> {
  try {
    const response = await fetch(`${API}/v1/today/day?date=${encodeURIComponent(date)}`, send);
    if (!response.ok) return null;
    return (await response.json()) as Day;
  } catch {
    return null;
  }
}

/** 2026-10-18. What each day in a window holds, for Today's month; null
 *  when it did not load, so the grid draws without dots and asks again. */
export async function fetchMonth(from: string, to: string): Promise<MonthCount[] | null> {
  try {
    const response = await fetch(`${API}/v1/today/month?from=${from}&to=${to}`, send);
    if (!response.ok) return null;
    return ((await response.json()) as { days: MonthCount[] }).days;
  } catch {
    return null;
  }
}

/** Google's own link to an event, and only that: https on Google's calendar
 *  hosts, the same pattern the column holds. Anything else is not opened. */
export function calendarHref(link: string | null): string | undefined {
  if (!link) return undefined;
  return GOOGLE_EVENT_LINK.test(link) ? link : undefined;
}

// ---------------------------------------------------------------- Needs you

interface Person {
  accountId: string;
  displayName: string | null;
  initials: string;
}

export type NeedsCard =
  | { key: string; kind: "calendar"; since: string; connectionId: string; email: string | null }
  | { key: string; kind: "request"; since: string; requestId: string; person: Person }
  | {
      key: string;
      kind: "invitation";
      since: string;
      memberId: string;
      threadName: string;
      from: Person;
      preview: { count: number };
    }
  | {
      key: string;
      kind: "question";
      since: string;
      question: QuestionOnWire;
      threadId: string | null;
      threadName: string | null;
      threadIcon: string | null;
      threadHue: number | null;
      fromEmail: boolean;
    }
  | { key: string; kind: "tip"; tip: "forwarding"; address: string; from: string };

/** Which switch a server card follows. */
export function partOf(card: NeedsCard): NeedsPart {
  switch (card.kind) {
    case "calendar":
      return "account";
    case "request":
    case "invitation":
      return "people";
    case "question":
      return "questions";
    case "tip":
      return "tips";
  }
}

/** The server's cards in order, or null when they could not be read, which
 *  draws no Needs you and leaves the day alone. */
export async function fetchNeeds(): Promise<NeedsCard[] | null> {
  try {
    const response = await fetch(`${API}/v1/today/needs`, send);
    if (!response.ok) return null;
    return ((await response.json()) as { cards: NeedsCard[] }).cards;
  } catch {
    return null;
  }
}

/** Until the start of tomorrow in the account's zone, or for good where that
 *  exists: an invitation's Not now and the tip's Got it. "gone" is a card that
 *  is no longer live, settled somewhere else, which simply goes. */
export async function putOff(card: string, forGood = false): Promise<"ok" | "gone" | "failed"> {
  try {
    const response = await fetch(`${API}/v1/today/put-off`, {
      ...json,
      method: "POST",
      body: JSON.stringify(forGood ? { card, forGood } : { card }),
    });
    if (response.ok) return "ok";
    return response.status === 404 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}

// ---------------------------------------------------------------- open in your threads

/** A page: a thread's open to-dos with no date, its oldest four and how many
 *  it holds. `name` is null for Not in a thread, which carries `loose`. */
export interface OpenPage {
  threadId: string;
  name: string | null;
  icon: string | null;
  hue: number | null;
  people: Person[];
  todos: AgendaRow[];
  count: number;
  loose: { inMind: number; holds: Record<string, number> } | null;
}

/** The pages in the server's order, or null when they could not be read,
 *  which draws no section and leaves the day alone. */
export async function fetchOpenThreads(): Promise<OpenPage[] | null> {
  try {
    const response = await fetch(`${API}/v1/today/threads`, send);
    if (!response.ok) return null;
    return ((await response.json()) as { pages: OpenPage[] }).pages;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Reminders

export type ReminderWindow = "long" | "short" | "day";

/** 2026-10-11. Which of the thing's reminders is showing, and the day its
 *  next one comes, so a dismiss can name the one reminder it hides. */
interface Showing {
  window: ReminderWindow;
  next: string | null;
}

/** 042. A row whose reminders have begun: the day it is reminded against, and
 *  whether that is "by" (a deadline, or a task that belongs to something). */
export interface ReminderRow extends AgendaRow, Showing {
  remindDay: string;
  remindBy: boolean;
}

/** A note or a memory whose reminders have begun. A memory has no thread. */
export interface ReminderOther extends Showing {
  of: "note" | "memory";
  id: string;
  name: string;
  day: string;
  by: boolean;
  /** `HH:MM` in the account's zone when the thing has a clock time. */
  time: string | null;
  threadId: string | null;
  threadName: string | null;
  threadIcon: string | null;
  threadHue: number | null;
}

/** One reminder, as the screen showed it. */
export interface Dismissal {
  of: "content" | "note" | "memory";
  id: string;
  day: string;
  window: ReminderWindow;
}

async function postDismissal(path: "dismiss" | "undismiss", which: Dismissal): Promise<boolean> {
  try {
    const response = await fetch(`${API}/v1/today/reminders/${path}`, { ...json, method: "POST", body: JSON.stringify(which) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The x on a card: this reminder hidden, the thing and its next reminder
 *  untouched. True when it landed. */
export const dismissReminder = (which: Dismissal): Promise<boolean> => postDismissal("dismiss", which);

/** Undo. */
export const undismissReminder = (which: Dismissal): Promise<boolean> => postDismissal("undismiss", which);

export interface RemindersRead {
  rows: ReminderRow[];
  others: ReminderOther[];
  /** Always 0 since 2026-10-11: the column shows everything that has begun. */
  more: number;
}

/** The section's read, or null when it could not be read, which draws no
 *  section and leaves the day alone. */
export async function fetchReminders(): Promise<RemindersRead | null> {
  try {
    const response = await fetch(`${API}/v1/today/reminders`, send);
    if (!response.ok) return null;
    return (await response.json()) as RemindersRead;
  } catch {
    return null;
  }
}

/** Rows, notes and memories in one list, put in order by widgets'
 *  `remindersInOrder`, the same way on the phones. */
export type ReminderEntry = Entry<ReminderRow, ReminderOther>;
