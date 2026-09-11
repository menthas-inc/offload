// Threads, content and notes, from a phone.
//
// The web's `lib/threads.ts` in the shape this app already has: every call goes
// through `send`, which carries the session out of secure storage and sets a
// content type only when there is a body.
//
// **The types are the API's, not a second opinion about it.** Where the server
// computes something the screen would otherwise have to work out, `canDelete`,
// `isDefault`, `authorIsMember`, the phone renders the answer rather than
// deriving one. A client that decides who may delete something is a client that
// can disagree with the server, and the server is the one that enforces it.

import { send } from "./api";
import type { Sortable } from "@offload/widgets";

export interface ThreadRow {
  id: string;
  name: string;
  icon: string | null;
  count: number;
  meta: string;
  /** The default thread, which cannot be deleted: everything with no obvious
   *  home lands there. From the server, never inferred from a name. */
  isDefault: boolean;
}

export interface ThreadGroup {
  key: "now" | "always" | "older";
  threads: ThreadRow[];
}

export interface Member {
  accountId: string;
  displayName: string;
  initials: string;
  isYou: boolean;
}

/** A sentence a thread holds about itself: what is true about it, and
 *  sometimes how it is handled. */
export interface Note {
  id: string;
  text: string;
  /** What was dumped when it did not fit in 200 characters. Never in a prompt,
   *  and never on the row. */
  body: string | null;
  origin: "stated" | "learned";
  authorId: string | null;
  /** False once the author left or deleted their account, at which point every
   *  member may delete it. Computed server-side. */
  authorIsMember: boolean;
  muted: boolean;
  occursAt: string | null;
  occursEndAt: string | null;
  dueAt: string | null;
  placeId: string | null;
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  /** That it comes round again. One note, a mark on every matching day. */
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  repeatsUntil: string | null;
  /** When it was last written. Decides which notes reach offload when a thread
   *  holds more than the budget. */
  writtenAt: string;
  supersededAt: string | null;
}

/** A hundred, matching NOTE_PROMPT_BUDGET. **Not a cap**: it is how many of a
 *  thread's notes reach offload, and nothing refuses the next one. */
export const NOTE_BUDGET = 100;
export const NOTE_CHARS = 200;
export const NOTE_BODY_CHARS = 4000;

export interface ThreadBundle {
  id: string;
  name: string;
  icon: string | null;
  alwaysOn: boolean;
  counts: { active: number; archived: number };
  members: Member[];
  notes: Note[];
  noteCounts: { active: number; folded: number };
  preference: { widgets?: string[]; groupBy?: Record<string, string> };
  standing: string | null;
}

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** Satisfies `Sortable` so the shared widget rule takes it unchanged. */
export interface ContentRow extends Sortable {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  archivedAt: string | null;
  doneAt: string | null;
  dueAt: string | null;
  occursAt: string | null;
  /** The other end of a span, so the rail draws a thing on every day it
   *  covers. Written since 0011 and read by nothing until 015. */
  occursEndAt: string | null;
  /** That it comes round again, as a rule the calendar expands. One row, a
   *  mark on every matching day. */
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  repeatsUntil: string | null;
  isReminder: boolean;
  priority: number;
  priorityPinned: boolean;
  tags: string[];
  place: Place | null;
  placeId: string | null;
  /** The repeating series this occurrence belongs to, or null for a one off.
   *  A timeline collapses a series to one entry; a calendar draws every one. */
  seriesRef: string | null;
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  author: { accountId: string | null; displayName: string; isYou: boolean };
  canDelete: boolean;
  canMove: boolean;
  /** Typed straight in and not read by offload yet. */
  filingAt: string | null;
}

export interface ContentPage {
  rows: ContentRow[];
  nextCursor: string | null;
}

/** The shared rule asks whether a row has a place; the API sends the place
 *  itself. One line, once, at the edge, exactly as the web does it. */
const withPlaceId = (row: ContentRow): ContentRow => ({
  ...row,
  placeId: row.place?.id ?? null,
});

// ------------------------------------------------------------------- reads

export async function fetchThreads(): Promise<ThreadGroup[]> {
  const { data } = await send<{ groups: ThreadGroup[] }>("/v1/threads");
  return data?.groups ?? [];
}

export async function fetchThread(id: string): Promise<ThreadBundle | null> {
  const { data } = await send<ThreadBundle>(`/v1/threads/${id}`);
  return data;
}

export async function fetchContent(
  threadId: string,
  options: { cursor?: string; archived?: boolean } = {}
): Promise<ContentPage | null> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.archived) query.set("archived", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const { data } = await send<ContentPage>(`/v1/threads/${threadId}/content${suffix}`);
  if (!data) return null;
  return { ...data, rows: data.rows.map(withPlaceId) };
}

// ------------------------------------------------------------------ writes
//
// Each returns what the row was, so Undo is one more call with the old value
// and nothing has to be held across a screen.

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

export async function completeContent(id: string, done: boolean): Promise<boolean> {
  const { status } = await send(`/v1/content/${id}/complete`, {
    method: "POST",
    ...body({ done }),
  });
  return status === 200;
}

export async function setArchived(id: string, archived: boolean): Promise<boolean> {
  const { status } = await send(
    `/v1/content/${id}/${archived ? "archive" : "restore"}`,
    { method: "POST" }
  );
  return status === 200;
}

export async function editContent(
  id: string,
  fields: { title?: string; body?: string | null }
): Promise<{ previous: { title: string; body: string | null } } | null> {
  const { data } = await send<{ previous: { title: string; body: string | null } }>(
    `/v1/content/${id}`,
    { method: "PATCH", ...body(fields) }
  );
  return data;
}

export async function deleteContent(id: string): Promise<boolean> {
  const { data } = await send<{ deleted: boolean }>(`/v1/content/${id}`, {
    method: "DELETE",
  });
  return data?.deleted ?? false;
}

export async function moveContent(
  id: string,
  threadId: string
): Promise<{ previous: { threadId: string } } | null> {
  const { data } = await send<{ previous: { threadId: string } }>(
    `/v1/content/${id}/move`,
    { method: "POST", ...body({ threadId }) }
  );
  return data;
}

export async function renameThread(
  id: string,
  name: string
): Promise<{ previous: { name: string } } | null> {
  const { data } = await send<{ previous: { name: string } }>(`/v1/threads/${id}`, {
    method: "PATCH",
    ...body({ name }),
  });
  return data;
}

/** Leave a thread, which deletes it when nobody else is in it.
 *
 *  `deleted` says which of the two happened, so the toast can say the true
 *  thing rather than always saying Deleted. */
export async function deleteThread(
  id: string
): Promise<{ left: boolean; deleted: boolean } | null> {
  const { data } = await send<{ left: boolean; deleted: boolean }>(
    `/v1/threads/${id}`,
    { method: "DELETE" }
  );
  return data;
}

export async function restoreThread(id: string): Promise<boolean> {
  const { status } = await send(`/v1/threads/${id}/restore`, { method: "POST" });
  return status === 200;
}

// ------------------------------------------------------------------- notes

/** How long a row may claim to be filing before the spinner gives up.
 *  Mirrors the server's constant; nothing sweeps the column, and the row is a
 *  perfectly good row either way. */
export const FILING_PATIENCE_MS = 2 * 60 * 1000;

/** The most a section heading's + will take. */
export const QUICK_ADD_CHARS = 500;

/** Whether offload is still reading a row somebody typed in. */
export function isFiling(filingAt: string | null): boolean {
  if (!filingAt) return false;
  return Date.now() - new Date(filingAt).getTime() < FILING_PATIENCE_MS;
}

/** Type something straight into a thread, without going through the composer.
 *
 *  Resolves as soon as the row is written, which is before offload has read it:
 *  the words are saved first and tidied second, so waiting for the model here
 *  would give back the one thing this was built to avoid. */
export async function quickAdd(
  threadId: string,
  text: string,
  section: string,
  /** The rail's own day and its repeat tick. Structured, not read from the
   *  words: offload has no tool that can change either once the row is
   *  written, so they have to be right from here. */
  options?: { day?: string; repeats?: boolean },
): Promise<{ id: string; kind: "content" | "note" } | null> {
  const { data } = await send<{ id: string; kind: "content" | "note" }>(
    `/v1/threads/${threadId}/quick-add`,
    { method: "POST", ...body({ text, section, ...options }) }
  );
  return data;
}

/** Write one. **It always lands.** 008 had a 409 at ten and the screen said
 *  so; there is no cap now, so the only refusal left is a sentence too long to
 *  be one. */
export type AddedNote = { note: Note } | { tooLong: true } | null;

export async function addNote(threadId: string, text: string): Promise<AddedNote> {
  const { status, data } = await send<{ note: Note }>(
    `/v1/threads/${threadId}/notes`,
    { method: "POST", ...body({ text }) }
  );
  if (status === 413) return { tooLong: true };
  return data;
}

export async function editNote(
  id: string,
  text: string,
  noteBody?: string | null
): Promise<{ note: Note; previous: string } | null> {
  const { data } = await send<{ note: Note; previous: string }>(
    `/v1/notes/${id}`,
    { method: "PATCH", ...body(noteBody === undefined ? { text } : { text, body: noteBody }) }
  );
  return data;
}

export async function deleteNote(id: string): Promise<boolean> {
  const { data } = await send<{ deleted: boolean }>(`/v1/notes/${id}`, {
    method: "DELETE",
  });
  return data?.deleted ?? false;
}

export async function restoreNote(id: string): Promise<boolean> {
  const { status } = await send(`/v1/notes/${id}/restore`, { method: "POST" });
  return status === 200;
}

export async function muteNote(id: string, muted: boolean): Promise<boolean> {
  const { status } = await send(`/v1/notes/${id}/mute`, {
    method: "POST",
    ...body({ muted }),
  });
  return status === 200;
}

/** What the daily job folded. Read, not worked with: there is no restore. */
export async function foldedNotes(
  threadId: string,
  cursor?: string | null
): Promise<{ notes: Note[]; cursor: string | null } | null> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data } = await send<{ notes: Note[]; cursor: string | null }>(
    `/v1/threads/${threadId}/notes/folded${query}`
  );
  return data;
}

