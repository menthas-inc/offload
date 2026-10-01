// Today. 027.
//
// What the screen reads and writes, and the rules under it that a test can
// see: the layout's switches and moves, the order of the cards and the count
// over them, the two cards only this phone can know about, and the day a
// notification opens on. The screen draws from this and decides nothing.

import { zoneStrip } from "@offload/widgets";
import { request, send } from "./api";
import type { ContentRow } from "./threads";

// ---------------------------------------------------------------- the day

export interface TodayRow extends ContentRow {
  threadId: string;
  threadName: string;
}

export interface TodayEvent {
  id: string;
  source: "calendar" | "offload";
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  mine: boolean;
  calendarName: string | null;
  link: string | null;
  threadId: string | null;
  threadName: string | null;
  authorName: string | null;
}

export interface Day {
  date: string;
  events: TodayEvent[];
  eventCount: number;
  late: TodayRow[];
  lateMore: number;
  timed: TodayRow[];
  rest: TodayRow[];
  restMore: number;
  picks: TodayRow[];
  everDumped: boolean;
  threadLabels: { id: string; name: string; colour: number }[];
}

/** One day, or null when it did not come back. */
export async function fetchDay(date: string): Promise<Day | null> {
  const sent = await send<Day>(`/v1/today/day?date=${encodeURIComponent(date)}`);
  return sent.status === 200 ? sent.data : null;
}

// ---------------------------------------------------------------- Needs you

interface Person {
  accountId: string;
  displayName: string | null;
  initials: string;
}

export interface QuestionOption {
  label: string;
  kind: "value" | "plain";
}

export type ServerCard =
  | { key: string; kind: "calendar"; since: string; connectionId: string; email: string | null }
  | { key: string; kind: "request"; since: string; requestId: string; person: Person }
  | {
      key: string;
      kind: "invitation";
      since: string;
      memberId: string;
      threadName: string;
      from: Person;
      preview: { count: number; titles: string[] };
    }
  | {
      key: string;
      kind: "question";
      since: string;
      question: { id: string; field: string; text: string; options: QuestionOption[]; ordinal: number };
      threadId: string | null;
      threadName: string | null;
      fromEmail: boolean;
    }
  | { key: string; kind: "tip"; tip: "forwarding"; address: string; from: string };

/** The two cards about this phone rather than the account. */
export type DeviceCard =
  | { key: "zone"; kind: "zone"; device: string; account: string }
  | { key: "notifications"; kind: "notifications" };

export type Card = ServerCard | DeviceCard;

export async function fetchNeeds(): Promise<ServerCard[] | null> {
  const sent = await send<{ cards: ServerCard[] }>("/v1/today/needs");
  return sent.status === 200 && sent.data ? sent.data.cards : null;
}

/** 023's strip condition, unchanged, as a card. */
export function zoneCard(
  me: { timeZone: string | null; followDevice: boolean; keptTimeZone: string | null },
  device: string,
): DeviceCard | null {
  const strip = zoneStrip(me, device);
  return strip ? { key: "zone", kind: "zone", device: strip.device, account: strip.account } : null;
}

/** The permission is off and a switch says something should reach this phone.
 *  Put off on this phone alone, until `putOffUntil`. */
export function notificationsCard(
  me: { notifyDueToday: boolean; notifyComingTomorrow: boolean; notifyPeopleRequests: boolean; notifySharedActivity: boolean },
  permitted: boolean,
  putOffUntil: string | null,
  now: Date,
): DeviceCard | null {
  if (permitted) return null;
  if (!me.notifyDueToday && !me.notifyComingTomorrow && !me.notifyPeopleRequests && !me.notifySharedActivity) return null;
  if (putOffUntil && new Date(putOffUntil).getTime() > now.getTime()) return null;
  return { key: "notifications", kind: "notifications" };
}

/** Account issues first, the server's calendar cards then this phone's zone
 *  and notifications cards, then people, questions and tips as the server
 *  ordered them. The device cards follow the Account issues switch. */
export function stackOf(server: ServerCard[], device: DeviceCard[], layout: Layout): Card[] {
  const calendar = server.filter((card) => card.kind === "calendar");
  const rest = server.filter((card) => card.kind !== "calendar");
  const mine = partOn(layout, "account")
    ? [...device].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "zone" ? -1 : 1))
    : [];
  return [...calendar, ...mine, ...rest];
}

/** What the stack draws once `gone` have been settled or put off: the card on
 *  top, *N of M* counted from the load, and the slivers under it. `loaded` is
 *  how many the load held, since a card can also leave by itself, the zone
 *  card once Keep is written, and the count goes on from where it was. */
export function stackView(
  cards: Card[],
  gone: Set<string>,
  loaded: number = cards.length,
): { current: Card | null; position: number; total: number; slivers: 0 | 1 | 2 } {
  const left = cards.filter((card) => !gone.has(card.key));
  const total = Math.max(loaded, cards.length);
  return {
    current: left[0] ?? null,
    position: total - left.length + 1,
    total,
    slivers: left.length >= 3 ? 2 : left.length === 2 ? 1 : 0,
  };
}

/** Until the start of tomorrow, or for good where that exists. */
export async function putOff(card: string, forGood?: boolean): Promise<boolean> {
  const sent = await send<{ ok: true }>("/v1/today/put-off", {
    method: "POST",
    body: JSON.stringify(forGood ? { card, forGood: true } : { card }),
  });
  return sent.status === 200;
}

// ---------------------------------------------------------------- + Today

export async function takeToday(contentId: string): Promise<boolean> {
  return (await send(`/v1/today/picks/${contentId}`, { method: "POST" })).status === 200;
}

export async function untakeToday(contentId: string): Promise<boolean> {
  return (await send(`/v1/today/picks/${contentId}`, { method: "DELETE" })).status === 200;
}

// ---------------------------------------------------------------- the layout

export type Part = "account" | "people" | "questions" | "tips";
export const PARTS: Part[] = ["account", "people", "questions", "tips"];
type Section = { kind: "needs_you"; parts: { kind: Part; on: boolean }[] } | { kind: "day"; on: boolean };
export interface Layout {
  version: 1;
  sections: Section[];
}

export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  sections: [{ kind: "needs_you", parts: PARTS.map((kind) => ({ kind, on: true })) }, { kind: "day", on: true }],
};

export function partOn(layout: Layout, part: Part): boolean {
  const needs = layout.sections.find((section) => section.kind === "needs_you");
  return needs?.kind === "needs_you" ? (needs.parts.find((p) => p.kind === part)?.on ?? true) : true;
}

export function dayOn(layout: Layout): boolean {
  const day = layout.sections.find((section) => section.kind === "day");
  return day?.kind === "day" ? day.on : true;
}

function onCount(layout: Layout): number {
  return layout.sections.reduce((n, section) => n + (section.kind === "day" ? Number(section.on) : section.parts.filter((p) => p.on).length), 0);
}

/** False for the one switch still on: Today is never blank. */
export function canSwitchOff(layout: Layout, key: Part | "day"): boolean {
  const on = key === "day" ? dayOn(layout) : partOn(layout, key);
  return !on || onCount(layout) > 1;
}

export function setSwitch(layout: Layout, key: Part | "day", on: boolean): Layout {
  if (!on && !canSwitchOff(layout, key)) return layout;
  return {
    version: 1,
    sections: layout.sections.map((section) =>
      section.kind === "day"
        ? key === "day"
          ? { ...section, on }
          : section
        : { ...section, parts: section.parts.map((p) => (p.kind === key ? { ...p, on } : p)) },
    ),
  };
}

export function moveSection(layout: Layout, kind: Section["kind"], step: -1 | 1): Layout {
  const from = layout.sections.findIndex((section) => section.kind === kind);
  const to = from + step;
  if (from < 0 || to < 0 || to >= layout.sections.length) return layout;
  const sections = [...layout.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved!);
  return { version: 1, sections };
}

/** The whole document, once per gesture. */
export async function saveLayout(layout: Layout): Promise<boolean> {
  const updated = await request<{ todayLayout: Layout }>("/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ todayLayout: layout }),
  });
  return updated !== null;
}

// ---------------------------------------------------------------- doors

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day an evening digest named, while it is still ahead; else null and
 *  the notification opens Today. */
export function dayOfPush(data: unknown, today: string): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const day = payload["day"];
  if (payload["send"] !== "evening" || typeof day !== "string" || !DAY.test(day)) return null;
  return day > today ? day : null;
}

// ---------------------------------------------------------------- the stepper's reset

type Reset = () => void;
const resets = new Set<Reset>();

/** The Today tab pressed while Today shows: back to Today. */
export function onTodayReset(listener: Reset): () => void {
  resets.add(listener);
  return () => resets.delete(listener);
}

export function resetToday(): void {
  for (const listener of resets) listener();
}
