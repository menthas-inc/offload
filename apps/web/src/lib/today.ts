"use client";

// 027 Today, over the wire: the day, Needs you, putting a card off, + Today,
// and the layout Customize Today stores. Mirrors
// `apps/core-api/src/routes/today.ts` and `src/today/layout.ts`; the server's
// zod schemas are the shapes, and these types say only what the page reads.

import { GOOGLE_EVENT_LINK } from "@offload/widgets";
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
  | { kind: "day"; on: boolean };

export interface TodayLayout {
  version: 1;
  sections: LayoutSection[];
}

export const DEFAULT_LAYOUT: TodayLayout = {
  version: 1,
  sections: [
    { kind: "needs_you", parts: NEEDS_PARTS.map((kind) => ({ kind, on: true })) },
    { kind: "day", on: true },
  ],
};

/** What `/api/me` resolved, or the defaults before it has said. */
export function layoutOf(stored: TodayLayout | null | undefined): TodayLayout {
  return stored && Array.isArray(stored.sections) ? stored : DEFAULT_LAYOUT;
}

export function partsOn(layout: TodayLayout): Set<NeedsPart> {
  const needs = layout.sections.find((one) => one.kind === "needs_you");
  return new Set(needs?.kind === "needs_you" ? needs.parts.filter((part) => part.on).map((part) => part.kind) : []);
}

export function dayOn(layout: TodayLayout): boolean {
  const day = layout.sections.find((one) => one.kind === "day");
  return day?.kind === "day" ? day.on : true;
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

export function withDay(layout: TodayLayout, on: boolean): TodayLayout {
  return { version: 1, sections: layout.sections.map((one) => (one.kind === "day" ? { ...one, on } : one)) };
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
  picks: AgendaRow[];
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

// ---------------------------------------------------------------- + Today

/** + Today: the row, dated today with no hour, or null on a refusal. */
export async function takeToday(contentId: string): Promise<AgendaRow | null> {
  try {
    const response = await fetch(`${API}/v1/today/picks/${contentId}`, { ...send, method: "POST" });
    if (!response.ok) return null;
    return (await response.json()) as AgendaRow;
  } catch {
    return null;
  }
}

/** + Today's Undo: the date cleared, and not picked again today. */
export async function giveBackToday(contentId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API}/v1/today/picks/${contentId}`, { ...send, method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
