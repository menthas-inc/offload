// 028. What is not in a thread.
//
// Stored in the account's default thread, which is never drawn as a thread: the
// things in it are drawn as themselves, sorted by what they are, each with at
// most one suggestion of where it could go. Mirrors apps/core-api/src/routes/
// loose.ts and loose/read.ts. "Loose" is the code's word only; nothing a
// person reads says it.

import { daysBetween, dayIn, noonUtc } from "@offload/widgets";
import type { ContentPage, ContentRow, Note } from "./threads";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const send = { credentials: "include" as const };
const json = { credentials: "include" as const, headers: { "content-type": "application/json" } };

export type ChipKey = "todo" | "link" | "photo" | "note" | "event" | "place" | "voice" | "file";

export interface Face {
  accountId: string;
  initials: string;
  displayName: string;
}

export type Suggestion =
  | {
      id: string;
      kind: "move";
      thread: { id: string; name: string };
      /** At most two of the thread's other members, empty when it is not
       *  shared, then how many more. */
      faces: Face[];
      more: number;
    }
  | { id: string; kind: "create"; proposal: { id: string; name: string; count: number } };

export type LooseItem =
  | { kind: "content"; row: ContentRow; suggestion: Suggestion | null }
  | { kind: "note"; note: Note; suggestion: Suggestion | null };

export type ByType = Partial<Record<ChipKey, number>>;

export interface LooseSummary {
  count: number;
  byType: ByType;
  /** The newest three. */
  rows: LooseItem[];
}

export interface LoosePage {
  rows: LooseItem[];
  nextCursor: string | null;
  count: number;
  byType: ByType;
  /** Archived rows, for the foot row. */
  archived: number;
}

export interface Proposal {
  id: string;
  name: string;
  /** Every thing of the proposal that is still not in a thread. */
  items: LooseItem[];
}

export interface ChipInfo {
  key: ChipKey;
  label: string;
  /** For *All 5 links*. */
  plural: string;
  /** For the meta, *Photo · Monday*. */
  singular: string;
  icon: string;
}

/** The chips, in the order they are drawn. The server sends the keys in this
 *  order too. A file is `paperclip`, the glyph the thread page draws for one:
 *  the icon set has no `file`. */
export const CHIPS: ChipInfo[] = [
  { key: "todo", label: "To-dos", plural: "to-dos", singular: "To-do", icon: "square-check-big" },
  { key: "link", label: "Links", plural: "links", singular: "Link", icon: "link" },
  { key: "photo", label: "Photos", plural: "photos", singular: "Photo", icon: "image" },
  { key: "note", label: "Notes", plural: "notes", singular: "Note", icon: "text-quote" },
  { key: "event", label: "Events", plural: "events", singular: "Event", icon: "calendar" },
  { key: "place", label: "Places", plural: "places", singular: "Place", icon: "map-pin" },
  { key: "voice", label: "Voice notes", plural: "voice notes", singular: "Voice note", icon: "mic" },
  { key: "file", label: "Files", plural: "files", singular: "File", icon: "paperclip" },
];

const CHIP = new Map(CHIPS.map((chip) => [chip.key, chip]));
export const chipInfo = (key: ChipKey): ChipInfo => CHIP.get(key)!;

const OF_TYPE: Record<string, ChipKey> = {
  task: "todo",
  link: "link",
  image: "photo",
  screenshot: "photo",
  event: "event",
  location: "place",
  voice: "voice",
  file: "file",
};

/** Which chip a thing is under. */
export function chipOf(item: LooseItem): ChipKey {
  return item.kind === "note" ? "note" : (OF_TYPE[item.row.type] ?? "file");
}

/** The chips drawn after All: only the types present, and none at all unless
 *  two are. */
export function chipsShown(byType: ByType): ChipKey[] {
  const present = CHIPS.filter((chip) => (byType[chip.key] ?? 0) > 0).map((chip) => chip.key);
  return present.length >= 2 ? present : [];
}

/** *All 14*, or *All 5 links* with a chip on. */
export function allLabel(count: number, chip: ChipKey | null): string {
  return chip ? `All ${count} ${chipInfo(chip).plural}` : `All ${count}`;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** *These three look like one project.* A proposal holds two to ten. */
export function countInWords(n: number): string {
  return WORDS[n] ?? String(n);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** When a thing was put down, in the fewest words: today, yesterday, the
 *  weekday within the week, then weeks and months, in the account's clock. */
export function putDown(iso: string, today: string, zone: string | null): string {
  const day = dayIn(new Date(iso), zone);
  const ago = daysBetween(day, today);
  if (ago <= 0) return "today";
  if (ago === 1) return "yesterday";
  if (ago < 7) return WEEKDAYS[noonUtc(day).getUTCDay()]!;
  if (ago < 14) return "last week";
  if (ago < 28) return `${Math.floor(ago / 7)} weeks ago`;
  const months = Math.max(1, Math.round(ago / 30));
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/** When it was put down. A note read without `createdAt` uses when it was
 *  written, which for most notes is the same. */
export function createdOf(item: LooseItem): string {
  return item.kind === "note" ? (item.note.createdAt ?? item.note.writtenAt) : item.row.createdAt;
}

/** *Photo · Monday*. */
export function metaLine(item: LooseItem, today: string, zone: string | null): string {
  return `${chipInfo(chipOf(item)).singular} · ${putDown(createdOf(item), today, zone)}`;
}

export function itemTitle(item: LooseItem): string {
  return item.kind === "note" ? item.note.text : item.row.title;
}

export function itemId(item: LooseItem): string {
  return item.kind === "note" ? item.note.id : item.row.id;
}

/** Unique across both tables. */
export function itemKey(item: LooseItem): string {
  return `${item.kind}:${itemId(item)}`;
}

/** The suggestion button's accessible name: the action, never the label. */
export function suggestionName(title: string, suggestion: Suggestion): string {
  return suggestion.kind === "move"
    ? `Move ${title} to ${suggestion.thread.name}`
    : `Create ${suggestion.proposal.name} and move ${suggestion.proposal.count} into it`;
}

export const THREAD_NAME_CHARS = 60;

/** 1 to 60 characters once trimmed, one line, as the server checks. */
export function validThreadName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && [...trimmed].length <= THREAD_NAME_CHARS && !/[\u0000-\u001f\u007f]/.test(trimmed);
}

/** The summary less one thing, its counts with it: what a row leaving looks
 *  like before the server is read again. Any list with counts, so the full
 *  list's page uses it as well. */
export function withoutItem<T extends LooseSummary>(summary: T, item: LooseItem): T {
  const key = itemKey(item);
  const chip = chipOf(item);
  const byType: ByType = { ...summary.byType };
  const left = (byType[chip] ?? 0) - 1;
  if (left > 0) byType[chip] = left;
  else delete byType[chip];
  return {
    ...summary,
    count: Math.max(0, summary.count - 1),
    byType: ordered(byType),
    rows: summary.rows.filter((one) => itemKey(one) !== key),
  };
}

/** The same thing back where it was: a write that was refused, or Undo. */
export function withItem<T extends LooseSummary>(summary: T, item: LooseItem, at: number): T {
  const key = itemKey(item);
  if (summary.rows.some((one) => itemKey(one) === key)) return summary;
  const chip = chipOf(item);
  const rows = [...summary.rows];
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, item);
  return {
    ...summary,
    count: summary.count + 1,
    byType: ordered({ ...summary.byType, [chip]: (summary.byType[chip] ?? 0) + 1 }),
    rows,
  };
}

/** Keys in the chips' order, as the server sends them. */
function ordered(byType: ByType): ByType {
  const next: ByType = {};
  for (const chip of CHIPS) if (byType[chip.key]) next[chip.key] = byType[chip.key];
  return next;
}

// ------------------------------------------------------------------ reads

async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API}${path}`, send);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** A page of the full list, newest first, optionally of one type. */
export function fetchLoose(options: { type?: ChipKey | null; cursor?: string | null }): Promise<LoosePage | null> {
  const query = new URLSearchParams();
  if (options.type) query.set("type", options.type);
  if (options.cursor) query.set("cursor", options.cursor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return get<LoosePage>(`/v1/loose${suffix}`);
}

/** The default thread's archived rows, in the thread page's own shape. */
export function fetchLooseArchived(cursor?: string | null): Promise<ContentPage | null> {
  const query = new URLSearchParams({ archived: "true" });
  if (cursor) query.set("cursor", cursor);
  return get<ContentPage>(`/v1/loose?${query.toString()}`);
}

/** What the create modal lists. */
export const fetchProposal = (id: string): Promise<Proposal | null> => get<Proposal>(`/v1/proposals/${id}`);

// ------------------------------------------------------------------ writes

async function post(path: string, body?: unknown, method = "POST"): Promise<Response | null> {
  try {
    return await fetch(`${API}${path}`, body === undefined ? { ...send, method } : { ...json, method, body: JSON.stringify(body) });
  } catch {
    return null;
  }
}

async function errorOf(response: Response): Promise<string | null> {
  try {
    return ((await response.json()) as { error?: string }).error ?? null;
  } catch {
    return null;
  }
}

/** Move to: the thread it went to, or null when refused. */
export async function acceptSuggestion(id: string): Promise<{ id: string; name: string } | null> {
  const response = await post(`/v1/suggestions/${id}/accept`);
  if (!response?.ok) return null;
  return ((await response.json()) as { thread: { id: string; name: string } }).thread;
}

/** Back where it was, with its suggestion. False after the window. */
export async function undoSuggestion(id: string): Promise<boolean> {
  return (await post(`/v1/suggestions/${id}/undo`))?.ok === true;
}

export async function dismissSuggestion(id: string): Promise<boolean> {
  return (await post(`/v1/suggestions/${id}`, undefined, "DELETE"))?.ok === true;
}

export async function createFromProposal(
  id: string,
  body: { name: string; contentIds: string[]; noteIds: string[] },
): Promise<{ ok: true; thread: { id: string; name: string } } | { ok: false }> {
  const response = await post(`/v1/proposals/${id}/create`, body);
  if (!response?.ok) return { ok: false };
  return { ok: true, thread: ((await response.json()) as { thread: { id: string; name: string } }).thread };
}

/** `changed` once anything else has happened in the new thread. */
export async function undoProposal(id: string): Promise<"ok" | "changed" | "failed"> {
  const response = await post(`/v1/proposals/${id}/undo`);
  if (!response) return "failed";
  if (response.ok) return "ok";
  return response.status === 409 && (await errorOf(response)) === "changed" ? "changed" : "failed";
}

/** 028. A note moves between threads as a row does. Undo is the same call
 *  with `previous.threadId`. */
export async function moveNote(
  id: string,
  threadId: string,
): Promise<{ ok: true; previous: { threadId: string } } | { ok: false; duplicate: boolean }> {
  const response = await post(`/v1/notes/${id}/move`, { threadId });
  if (!response) return { ok: false, duplicate: false };
  if (response.ok) return { ok: true, previous: ((await response.json()) as { previous: { threadId: string } }).previous };
  return { ok: false, duplicate: response.status === 409 && (await errorOf(response)) === "duplicate" };
}
