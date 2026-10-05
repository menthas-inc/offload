// 028. What is not in a thread, from a phone.
//
// Stored in the account's default thread, which is never drawn as a thread:
// what it holds is drawn as things, sorted by what they are, newest first,
// each with at most one suggestion of where it could go. The server resolves
// the default thread from the session, so nothing here ever names its id.
//
// The words and the rules the screens draw are here rather than in them, so
// a test can see them: which chips show, what the All link says, the meta
// line, the count in words, the name a create will take.

import { noonUtc } from "@offload/widgets";
import { send } from "./api";
import { withPlaceId, type ContentRow, type Note } from "./threads";

// ------------------------------------------------------------------ types

export type ChipKey = "todo" | "link" | "photo" | "note" | "event" | "place" | "voice" | "file";

export interface Face {
  accountId: string;
  initials: string;
  displayName: string;
}

/** One button under a row. The thread's or the proposal's name is the
 *  server's current reading, so a rename since draws the new name. */
/** 037. A thread as a chip and a toast name it. */
export interface ThreadRef {
  id: string;
  name: string;
  icon: string;
  hue: number;
}

export type Suggestion =
  | {
      id: string;
      kind: "move";
      thread: ThreadRef;
      /** At most two other members, empty when the thread is not shared. */
      faces: Face[];
      /** How many more beyond the faces. */
      more: number;
    }
  | { id: string; kind: "create"; proposal: { id: string; name: string; count: number } };

export type LooseEntry =
  | { kind: "content"; row: ContentRow; suggestion: Suggestion | null }
  | { kind: "note"; note: Note; suggestion: Suggestion | null };

/** What My threads draws: the count, the chips' counts and the newest three. */
export interface LooseSummary {
  count: number;
  byType: Partial<Record<ChipKey, number>>;
  rows: LooseEntry[];
}

export interface LoosePage extends LooseSummary {
  nextCursor: string | null;
  /** Archived rows, for the foot row. */
  archived: number;
}

export interface Proposal {
  id: string;
  name: string;
  /** Every still-loose thing of the proposal, each without its suggestion. */
  entries: LooseEntry[];
}

// ------------------------------------------------------------------ chips

/** The chips, in the order they are drawn. `file` has no glyph of its own in
 *  the set, so Files takes the paperclip a file row already draws. */
export const CHIPS: { key: ChipKey; label: string; singular: string; glyph: string }[] = [
  { key: "todo", label: "To-dos", singular: "To-do", glyph: "square-check-big" },
  { key: "link", label: "Links", singular: "Link", glyph: "link" },
  { key: "photo", label: "Photos", singular: "Photo", glyph: "image" },
  { key: "note", label: "Notes", singular: "Note", glyph: "text-quote" },
  { key: "event", label: "Events", singular: "Event", glyph: "calendar" },
  { key: "place", label: "Places", singular: "Place", glyph: "map-pin" },
  { key: "voice", label: "Voice notes", singular: "Voice note", glyph: "mic" },
  { key: "file", label: "Files", singular: "File", glyph: "paperclip" },
];

const CHIP_OF_TYPE: Record<string, ChipKey> = {
  task: "todo",
  link: "link",
  image: "photo",
  screenshot: "photo",
  event: "event",
  location: "place",
  voice: "voice",
  file: "file",
};

export function chipOf(entry: LooseEntry): ChipKey | null {
  return entry.kind === "note" ? "note" : (CHIP_OF_TYPE[entry.row.type] ?? null);
}

/** The chips to draw: none unless two types or more are present. */
export function chipsFor(byType: Partial<Record<ChipKey, number>>): ((typeof CHIPS)[number] & { count: number })[] {
  const present = CHIPS.filter((chip) => (byType[chip.key] ?? 0) > 0).map((chip) => ({ ...chip, count: byType[chip.key] ?? 0 }));
  return present.length >= 2 ? present : [];
}

/** A chip from a route's parameter, which is anybody's string. */
export function asChip(value: unknown): ChipKey | null {
  return typeof value === "string" && CHIPS.some((chip) => chip.key === value) ? (value as ChipKey) : null;
}

/** The pick, kept while its type is still there and the chips still are;
 *  otherwise back to All. */
export function keepChip(chip: ChipKey | null, byType: Partial<Record<ChipKey, number>>): ChipKey | null {
  if (!chip) return null;
  return chipsFor(byType).some((one) => one.key === chip) ? chip : null;
}

/** How many the All link would open. */
export function listCount(summary: Pick<LooseSummary, "count" | "byType">, chip: ChipKey | null): number {
  return chip ? (summary.byType[chip] ?? 0) : summary.count;
}

/** My threads draws three. */
export const LOOSE_SHOWN = 3;

/** *All 14*, or *All 5 links* on a chip, and nothing when the list it would
 *  open holds no more than the group already draws. */
export function allLink(count: number, chip: ChipKey | null): string | null {
  if (count <= LOOSE_SHOWN) return null;
  const label = chip ? CHIPS.find((one) => one.key === chip)?.label.toLowerCase() : null;
  return label ? `All ${count} ${label}` : `All ${count}`;
}

/** The group's rows: the summary's three on All, and on a chip the first
 *  three of the page read by that type. Until that page comes back, or when
 *  it does not, the rows in hand of that type. */
export function groupRows(summary: LooseSummary, chip: ChipKey | null, page: LooseEntry[] | null): LooseEntry[] {
  if (!chip) return summary.rows.slice(0, LOOSE_SHOWN);
  return (page ?? summary.rows.filter((entry) => chipOf(entry) === chip)).slice(0, LOOSE_SHOWN);
}

/** The counts less what has left since they were read: what a row leaving
 *  looks like before the server is read again. The heading, the chips and
 *  the All link all count from here. */
export function withoutEntries<T extends Pick<LooseSummary, "count" | "byType">>(counts: T, left: readonly LooseEntry[]): T {
  if (left.length === 0) return counts;
  const byType = { ...counts.byType };
  for (const entry of left) {
    const chip = chipOf(entry);
    if (!chip) continue;
    const rest = (byType[chip] ?? 0) - 1;
    if (rest > 0) byType[chip] = rest;
    else delete byType[chip];
  }
  return { ...counts, count: Math.max(0, counts.count - left.length), byType };
}

/** One key across both tables, which the screen cannot tell apart by id. */
export function keyOf(entry: LooseEntry): string {
  return entry.kind === "note" ? `n:${entry.note.id}` : `c:${entry.row.id}`;
}

export function titleOf(entry: LooseEntry): string {
  return entry.kind === "note" ? entry.note.text : entry.row.title;
}

/** A note, as the row the list draws for it: the kit draws every loose thing
 *  as one kind of row, a tile, a title and the meta, so a note takes the
 *  content row's shape under its own type. Nothing in the default thread is
 *  shared, so it is the person's own; the server still decides. No labels:
 *  a label belongs to a thread, and this is not one. */
export function noteRow(note: Note): ContentRow {
  return {
    id: note.id,
    type: "note",
    title: note.text,
    body: null,
    url: null,
    imageUrl: null,
    photo: null,
    createdAt: note.createdAt,
    archivedAt: null,
    doneAt: null,
    dueAt: note.dueAt,
    occursAt: note.occursAt,
    occursEndAt: note.occursEndAt,
    rrule: note.rrule,
    isReminder: false,
    onCalendar: false,
    priority: note.priority,
    priorityPinned: false,
    labels: [],
    place: null,
    location: null,
    placeId: note.placeId,
    seriesRef: null,
    allDay: note.allDay,
    author: { accountId: note.authorId, displayName: "", isYou: true },
    canDelete: true,
    canMove: true,
    filingAt: null,
  };
}

// ------------------------------------------------------------------- rows

/** Only an archived row has a meta line, saying when it was archived, as the
 *  thread page's archived rows do. A live row's tile already says what it is
 *  (2026-10-05). */
export function metaOf(entry: LooseEntry, dayOf: (iso: string) => string): string | undefined {
  if (entry.kind === "content" && entry.row.archivedAt) return `archived ${dateOf(dayOf(entry.row.archivedAt))}`;
  return undefined;
}

/** *3 Oct*, in the order the person's locale puts it. */
function dateOf(day: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(noonUtc(day));
}

// ------------------------------------------------------------ suggestions

/** The button's accessible name is the action; the name inside it is a
 *  label and hidden from assistive tech. */
export function suggestionName(suggestion: Suggestion, title: string): string {
  return suggestion.kind === "move"
    ? `Move ${title} to ${suggestion.thread.name}`
    : `Create ${suggestion.proposal.name} and move ${suggestion.proposal.count} into it`;
}

/** Who will see it: two initials marks at most, then the rest as *+N*. */
export function facesOf(suggestion: Extract<Suggestion, { kind: "move" }>): { faces: Face[]; more: string | null } {
  return { faces: suggestion.faces.slice(0, 2), more: suggestion.more > 0 ? `+${suggestion.more}` : null };
}

/** The marks are hidden from a screen reader, which hears this instead. */
export function sharedHint(suggestion: Extract<Suggestion, { kind: "move" }>): string | undefined {
  const names = suggestion.faces.slice(0, 2).map((face) => face.displayName);
  if (names.length === 0) return undefined;
  return suggestion.more > 0 ? `Shared with ${names.join(", ")} and ${suggestion.more} more` : `Shared with ${names.join(" and ")}`;
}

export const movedCopy = (thread: string): string => `Moved to ${thread}`;
export const duplicateCopy = (thread: string): string => `That's already in ${thread}`;

// ------------------------------------------------------------ create sheet

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** *two* to *ten*, which is every size a proposal can be. */
export function countInWords(n: number): string {
  return WORDS[n] ?? String(n);
}

export function createLine(count: number): string {
  return `These ${countInWords(count)} look like they belong together.`;
}

export const NAME_CHARS = 60;

/** 1 to 60 once trimmed, no control characters: what the server will take. */
export function nameOk(name: string): boolean {
  const clean = name.trim();
  return clean.length > 0 && [...clean].length <= NAME_CHARS && !/[\u0000-\u001f\u007f]/.test(clean);
}

/** Flip one tick, except the last: a thread is never made empty. */
export function toggleTick(ticked: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(ticked);
  if (next.has(key)) {
    if (next.size === 1) return ticked;
    next.delete(key);
  } else next.add(key);
  return next;
}

// ----------------------------------------------------------------- routes

/** The default thread's page opens the list instead, from its loading state. */
export function redirectFor(bundle: { isDefault: boolean } | null): "/threads/loose" | null {
  return bundle?.isDefault ? "/threads/loose" : null;
}

/** Where a row's thread opens: the thread, or the list when it has no name. */
export function threadHref(
  threadId: string,
  threadName: string | null,
): "/threads/loose" | { pathname: "/threads/[id]"; params: { id: string } } {
  return threadName === null ? "/threads/loose" : { pathname: "/threads/[id]", params: { id: threadId } };
}

/** Today's action to a row's thread; a row with none opens the list. */
export function openThreadLabel(threadName: string | null): string {
  return threadName === null ? "Open Not in a thread" : "Open the thread";
}

/** An answer's found result: the thread, or the state. */
export function foundHead(threadName: string | null): string {
  return threadName ?? "Not in a thread";
}

export function foundFoot(more: number, threadName: string | null): string {
  return threadName === null ? `${more} more not in a thread.` : `${more} more in ${threadName}.`;
}

// ------------------------------------------------------------------ reads

const withPlace = (entry: LooseEntry): LooseEntry =>
  entry.kind === "content" ? { ...entry, row: withPlaceId(entry.row) } : entry;

/** A page of the list, newest first; by chip with `type`. Null when it did
 *  not come back, so the screen can say so and offer Try again. */
export async function fetchLoose(options: { type?: ChipKey | null; cursor?: string | null }): Promise<LoosePage | null> {
  const query = new URLSearchParams();
  if (options.type) query.set("type", options.type);
  if (options.cursor) query.set("cursor", options.cursor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const { status, data } = await send<LoosePage>(`/v1/loose${suffix}`);
  if (status !== 200 || !data) return null;
  return { ...data, rows: data.rows.map(withPlace) };
}

/** The archived rows, in the thread page's own shape and cursor. */
export async function fetchLooseArchived(cursor?: string | null): Promise<{ rows: ContentRow[]; nextCursor: string | null } | null> {
  const query = new URLSearchParams({ archived: "true" });
  if (cursor) query.set("cursor", cursor);
  const { status, data } = await send<{ rows: ContentRow[]; nextCursor: string | null }>(`/v1/loose?${query.toString()}`);
  if (status !== 200 || !data) return null;
  return { ...data, rows: data.rows.map(withPlaceId) };
}

export async function fetchProposal(id: string): Promise<Proposal | null> {
  const { status, data } = await send<Proposal>(`/v1/proposals/${id}`);
  if (status !== 200 || !data) return null;
  return { ...data, entries: data.entries.map(withPlace) };
}

// ----------------------------------------------------------------- writes

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

/** Move to: the thread it went to, or null when it was refused. */
export async function acceptSuggestion(id: string): Promise<ThreadRef | null> {
  const { status, data } = await send<{ thread: ThreadRef }>(`/v1/suggestions/${id}/accept`, { method: "POST" });
  return status === 200 && data ? data.thread : null;
}

/** Back with its suggestion; `too_late` after the window. */
export async function undoSuggestion(id: string): Promise<"ok" | "too_late" | "failed"> {
  const { status } = await send(`/v1/suggestions/${id}/undo`, { method: "POST" });
  if (status === 200) return "ok";
  return status === 409 ? "too_late" : "failed";
}

export async function dismissSuggestion(id: string): Promise<boolean> {
  const { status } = await send(`/v1/suggestions/${id}`, { method: "DELETE" });
  return status === 200;
}

/** Make the thread and move the ticked things into it. Keys are `keyOf`'s. */
export async function createFromProposal(
  id: string,
  name: string,
  ticked: ReadonlySet<string>,
): Promise<{ ok: true; thread: ThreadRef } | { ok: false }> {
  const keys = [...ticked];
  const { status, data } = await send<{ thread: ThreadRef }>(`/v1/proposals/${id}/create`, {
    method: "POST",
    ...body({
      name: name.trim(),
      contentIds: keys.filter((key) => key.startsWith("c:")).map((key) => key.slice(2)),
      noteIds: keys.filter((key) => key.startsWith("n:")).map((key) => key.slice(2)),
    }),
  });
  return status === 200 && data ? { ok: true, thread: data.thread } : { ok: false };
}

/** Undo a create. Refused once anything else happened in the new thread, or
 *  after the window; nothing in it is destroyed either way. */
export async function undoProposal(id: string): Promise<"ok" | "refused" | "failed"> {
  const { status } = await send(`/v1/proposals/${id}/undo`, { method: "POST" });
  if (status === 200) return "ok";
  return status === 409 ? "refused" : "failed";
}

/** A note to another thread. Undo is the same call with where it was. */
export async function moveNote(id: string, threadId: string): Promise<{ previous: { threadId: string } } | "duplicate" | null> {
  const { status, data } = await send<{ previous: { threadId: string } }>(`/v1/notes/${id}/move`, {
    method: "POST",
    ...body({ threadId }),
  });
  if (status === 409) return "duplicate";
  return status === 200 && data ? { previous: data.previous } : null;
}
