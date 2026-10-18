// Today. 027.
//
// What the screen reads and writes, and the rules under it that a test can
// see: the layout's switches and moves, the order of the cards and the count
// over them, the two cards only this phone can know about, and the day a
// notification opens on. The screen draws from this and decides nothing.

import { MEMORY_PARAM, zoneStrip, type MonthCount, type ReminderEntry as Entry, type ReminderLine } from "@offload/widgets";
import { request, send } from "./api";
import { threadHref } from "./loose";
import type { ContentRow } from "./threads";

// ---------------------------------------------------------------- the day

export interface TodayRow extends ContentRow {
  threadId: string;
  /** 028. Null for a row not in a thread, which draws no pill. */
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
  mine: boolean;
  calendarName: string | null;
  link: string | null;
  threadId: string | null;
  threadName: string | null;
  threadIcon: string | null;
  threadHue: number | null;
  authorName: string | null;
}

export interface Day {
  date: string;
  events: TodayEvent[];
  eventCount: number;
  late: TodayRow[];
  lateMore: number;
  timed: TodayRow[];
  timedMore: number;
  rest: TodayRow[];
  restMore: number;
  everDumped: boolean;
  threadLabels: { id: string; name: string; colour: number }[];
}

/** One day, or null when it did not come back. */
export async function fetchDay(date: string): Promise<Day | null> {
  const sent = await send<Day>(`/v1/today/day?date=${encodeURIComponent(date)}`);
  return sent.status === 200 ? sent.data : null;
}

/** 2026-10-18. What each day in a window holds, for Today's month; null when
 *  it did not come back, so the grid draws without dots and asks again. */
export async function fetchMonth(from: string, to: string): Promise<MonthCount[] | null> {
  const sent = await send<{ days: MonthCount[] }>(`/v1/today/month?from=${from}&to=${to}`);
  return sent.status === 200 ? (sent.data?.days ?? null) : null;
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
      preview: { count: number };
    }
  | {
      key: string;
      kind: "question";
      since: string;
      question: { id: string; field: string; text: string; options: QuestionOption[]; ordinal: number };
      threadId: string | null;
      threadName: string | null;
      threadIcon: string | null;
      threadHue: number | null;
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
  me: { notifyDueToday: boolean; notifyComingTomorrow: boolean; notifyPeopleRequests: boolean; notifySharedActivity: boolean; notifyReminders?: boolean; notifyCalendar?: boolean },
  permitted: boolean,
  putOffUntil: string | null,
  now: Date,
): DeviceCard | null {
  if (permitted) return null;
  // 042. Reminders is one of the switches that reaches this phone, and since
  // 2026-10-10 Calendar.
  if (!me.notifyDueToday && !me.notifyComingTomorrow && !me.notifyPeopleRequests && !me.notifySharedActivity && !me.notifyReminders && !me.notifyCalendar) return null;
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

/** The stack's count and slivers, shared with the web. */
export { stackView } from "@offload/widgets";

/** Until the start of tomorrow, or for good where that exists. A card the
 *  server no longer has (settled somewhere else) is `gone`, not a failure. */
export async function putOff(card: string, forGood?: boolean): Promise<"ok" | "gone" | "failed"> {
  const sent = await send<{ ok: true }>("/v1/today/put-off", {
    method: "POST",
    body: JSON.stringify(forGood ? { card, forGood: true } : { card }),
  });
  return sent.status === 200 ? "ok" : sent.status === 404 ? "gone" : "failed";
}

/** A question only typing answers: no option is a value, so the card offers
 *  Answer and the composer takes the words. */
export function typedOnly(options: { label: string; kind: "value" | "plain" }[]): boolean {
  return options.every((option) => option.kind === "plain");
}

/** Make the conversation that asked the current one, for Answer. A 404 is a
 *  question already closed. */
export async function resumeQuestion(id: string): Promise<"ok" | "gone" | "failed"> {
  const sent = await send<{ conversationId: string }>(`/v1/questions/${id}/resume`, { method: "POST" });
  return sent.status === 200 ? "ok" : sent.status === 404 ? "gone" : "failed";
}

// ---------------------------------------------------------------- open in your threads

/** A page (design 2026-10-07): a thread's open to-dos with no date, its oldest
 *  four and how many it holds. `name` is null for Not in a thread, which
 *  carries `loose`. */
export interface OpenPage {
  threadId: string;
  name: string | null;
  icon: string | null;
  hue: number | null;
  people: Person[];
  todos: TodayRow[];
  count: number;
  loose: { inMind: number; holds: Record<string, number> } | null;
}

/** The pages in the server's order, or null when they did not come back. */
export async function fetchOpenThreads(): Promise<OpenPage[] | null> {
  const sent = await send<{ pages: OpenPage[] }>("/v1/today/threads");
  return sent.status === 200 && sent.data?.pages ? sent.data.pages : null;
}

// ---------------------------------------------------------------- reminders

export type ReminderWindow = "long" | "short" | "day";

/** 2026-10-11. Which of the thing's reminders is showing, and the day its
 *  next one comes, so a dismiss can name the one reminder it hides. */
interface Showing {
  window: ReminderWindow;
  next: string | null;
}

/** 042. A row in the section: the thread page's row, and the day it is
 *  reminded against, with "by" for a deadline or a task for something. */
export interface ReminderRow extends TodayRow, Showing {
  remindDay: string;
  remindBy: boolean;
}

/** A note or a memory: its name, its day, and its thread for a note. */
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

export interface TodayReminders {
  rows: ReminderRow[];
  others: ReminderOther[];
  /** Always 0 since 2026-10-11: the column shows everything that has begun. */
  more: number;
}

/** One reminder, as the screen showed it. */
export interface Dismissal {
  of: "content" | "note" | "memory";
  id: string;
  day: string;
  window: ReminderWindow;
}

async function postDismissal(path: "dismiss" | "undismiss", which: Dismissal): Promise<boolean> {
  const sent = await send(`/v1/today/reminders/${path}`, { method: "POST", body: JSON.stringify(which) });
  return sent.status === 200;
}

/** The x on a card: this reminder hidden, the thing and its next reminder
 *  untouched. True when it landed. */
export const dismissReminder = (which: Dismissal): Promise<boolean> => postDismissal("dismiss", which);

/** Undo. */
export const undismissReminder = (which: Dismissal): Promise<boolean> => postDismissal("undismiss", which);

/** Everything whose reminders have begun, or null when it did not come back. */
export async function fetchReminders(): Promise<TodayReminders | null> {
  const sent = await send<TodayReminders>("/v1/today/reminders");
  return sent.status === 200 && sent.data ? sent.data : null;
}

/** Rows, notes and memories in one list, put in order by widgets'
 *  `remindersInOrder`, the same way on the web. */
export type ReminderEntry = Entry<ReminderRow, ReminderOther>;

/** Where a line opens, as a route: a memory in Memories, a thread, and
 *  nowhere for a note with no thread, which is no button. */
export function reminderDoor(
  opens: ReminderLine["opens"],
): ReturnType<typeof threadHref> | { pathname: "/memories"; params: { [MEMORY_PARAM]: string } } | null {
  if (!opens) return null;
  if ("memory" in opens) return { pathname: "/memories", params: { [MEMORY_PARAM]: opens.memory } };
  return threadHref(opens.threadId, opens.threadName);
}

// ---------------------------------------------------------------- the layout

export type Part = "account" | "people" | "questions" | "tips";
export const PARTS: Part[] = ["account", "people", "questions", "tips"];
type Section =
  | { kind: "needs_you"; parts: { kind: Part; on: boolean }[] }
  | { kind: "day"; on: boolean }
  | { kind: "reminders"; on: boolean }
  | { kind: "open_threads"; on: boolean };
/** A section with a switch of its own. */
export type SectionSwitch = "day" | "reminders" | "open_threads";
export interface Layout {
  version: 1;
  sections: Section[];
}

export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  sections: [
    { kind: "needs_you", parts: PARTS.map((kind) => ({ kind, on: true })) },
    { kind: "day", on: true },
    { kind: "reminders", on: true },
    { kind: "open_threads", on: true },
  ],
};

/** What `/api/me` resolved, or the defaults before it has said. Builds
 *  before open_threads read `todayLayout`, which never names it; builds
 *  before reminders read `todayLayoutV2` (042), which never names that. */
export function layoutOf(me: { todayLayoutV2?: Layout; todayLayoutV3?: Layout } | null | undefined): Layout {
  return me?.todayLayoutV3 ?? me?.todayLayoutV2 ?? DEFAULT_LAYOUT;
}

export function partOn(layout: Layout, part: Part): boolean {
  const needs = layout.sections.find((section) => section.kind === "needs_you");
  return needs?.kind === "needs_you" ? (needs.parts.find((p) => p.kind === part)?.on ?? true) : true;
}

function sectionOn(layout: Layout, kind: SectionSwitch): boolean {
  const found = layout.sections.find((section) => section.kind === kind);
  return found && found.kind !== "needs_you" ? found.on : true;
}

export const dayOn = (layout: Layout): boolean => sectionOn(layout, "day");
export const openThreadsOn = (layout: Layout): boolean => sectionOn(layout, "open_threads");
export const remindersOn = (layout: Layout): boolean => sectionOn(layout, "reminders");

const isSection = (key: Part | SectionSwitch): key is SectionSwitch => key === "day" || key === "reminders" || key === "open_threads";

function onCount(layout: Layout): number {
  return layout.sections.reduce((n, section) => n + (section.kind === "needs_you" ? section.parts.filter((p) => p.on).length : Number(section.on)), 0);
}

/** False for the one switch still on: Today is never blank. */
export function canSwitchOff(layout: Layout, key: Part | SectionSwitch): boolean {
  const on = isSection(key) ? sectionOn(layout, key) : partOn(layout, key);
  return !on || onCount(layout) > 1;
}

export function setSwitch(layout: Layout, key: Part | SectionSwitch, on: boolean): Layout {
  if (!on && !canSwitchOff(layout, key)) return layout;
  return {
    version: 1,
    sections: layout.sections.map((section) =>
      section.kind === "needs_you"
        ? { ...section, parts: section.parts.map((p) => (p.kind === key ? { ...p, on } : p)) }
        : section.kind === key
          ? { ...section, on }
          : section,
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
