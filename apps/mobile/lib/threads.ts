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
  /** Where it sits in the section, 0 to 100 and higher first. Moved by
   *  dragging the row, and by nothing else. */
  priority: number;
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
  preference: { widgets?: string[]; groupBy?: Record<string, string>; hideDone?: boolean };
  standing: string | null;
  /** 019. The viewer's picks and approved count, and whether anybody has
   *  picked here, which earns the rail. Null when the account has no calendar
   *  connection at all, which hides the glyph. */
  calendars: { picked: number; total: number; anyPicked: boolean } | null;
}

/** 019. One of the viewer's approved calendars, against a thread. */
export interface ThreadCalendar {
  id: string;
  name: string;
  colour: string | null;
  writable: boolean;
  sharedWithYou: boolean;
  primary: boolean;
  picked: boolean;
  /** The account's address, when two rows share a name. */
  note: string | null;
}

export interface ThreadCalendars {
  calendars: ThreadCalendar[];
  /** Other members with picks here: named, their calendars counted. */
  others: Array<{ displayName: string; count: number }>;
}

/** 019. An event on one of the thread's calendars, for the rail. A title and
 *  a time: never the guests, never the place. */
export interface ThreadEvent {
  id: string;
  sourceRef: string;
  calendarId: string;
  calendarName: string;
  colour: string | null;
  title: string;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  untrusted: boolean;
}

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** Satisfies `Sortable` so the shared widget rule takes it unchanged. */
/** The registrable domain of a URL, for a row that is a link.
 *
 *  The same string the source chip shows, and for the same reason: it is the
 *  part a person recognises, and it is ours rather than the page's. A title is
 *  written by whoever owns the page; a domain is not.
 *
 *  Null rather than a guess when it cannot be parsed, so a row never claims to
 *  be somewhere it is not. */
export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export interface ContentRow extends Sortable {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Where it came from, when it came from a page. The row opens it, which is
   *  the whole reason somebody dumps a link. Null on everything else. */
  url: string | null;
  /** A picture the page publishes about itself, as an address. **Loaded from
   *  the site by this device**, so the site learns who looked and when: that is
   *  the cost of the cheap shape and it is disclosed in the privacy policy
   *  rather than hidden in a comment. Null on everything that is not a link. */
  imageUrl: string | null;
  /** 020. The picture a photo row carries, as the id a rendition URL is built
   *  from. `ready` is whether the renditions exist yet. Null on everything
   *  that is not a photo. */
  photo: { blobId: string; width: number; height: number; ready: boolean } | null;
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

export async function fetchThreadCalendars(id: string): Promise<ThreadCalendars | null> {
  const { data } = await send<ThreadCalendars>(`/v1/threads/${id}/calendars`);
  return data;
}

export async function setThreadCalendar(
  threadId: string,
  calendarId: string,
  picked: boolean
): Promise<ThreadCalendars | null> {
  const { data } = await send<ThreadCalendars>(`/v1/threads/${threadId}/calendars/${calendarId}`, {
    method: "PATCH",
    ...body({ picked }),
  });
  return data;
}

/** The events on the thread's calendars between two days, inclusive. */
export async function fetchThreadEvents(threadId: string, from: string, to: string): Promise<ThreadEvent[]> {
  const { data } = await send<{ events: ThreadEvent[] }>(`/v1/threads/${threadId}/events?from=${from}&to=${to}`);
  return data?.events ?? [];
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

/** Change a priority, which pins it so the planner leaves it alone. Returns
 *  what it was, so a drag is undone by the same call with the old number. */
export async function setPriority(
  id: string,
  priority: number
): Promise<{ previous: { priority: number; priorityPinned: boolean } } | null> {
  const { data } = await send<{ previous: { priority: number; priorityPinned: boolean } }>(
    `/v1/content/${id}/priority`,
    { method: "POST", ...body({ priority }) }
  );
  return data;
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

/** How the thread wants to look. Co-owned, like its name, and merged on the
 *  server, so sending one field leaves the others as they were. */
export async function setPreference(
  threadId: string,
  patch: { widgets?: string[] | null; groupBy?: Record<string, string> | null; hideDone?: boolean | null }
): Promise<boolean> {
  const { data } = await send<unknown>(`/v1/threads/${threadId}/preference`, {
    method: "PATCH",
    ...body(patch),
  });
  return data !== null;
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

// ------------------------------------------------------- provisional rows
//
// A row drawn at the press, before the server has written it. It is the row
// the server is about to write, with a made-up id: the same words, the same
// type, the same spinner a typed-in row carries while offload reads it. The
// screen swaps the id for the real one when the write lands, and takes the
// row away with a word if it does not.

const PROVISIONAL = "provisional:";

/** An id for a row that only this screen knows about yet. */
export function provisionalId(): string {
  return `${PROVISIONAL}${Math.random().toString(36).slice(2, 10)}`;
}

/** Whether a row is one this screen made up. Such a row offers nothing: no
 *  tick, no tools, no link, because there is nothing on the server to act on. */
export function isProvisional(id: string): boolean {
  return id.startsWith(PROVISIONAL);
}

/** What a section's + writes, mirroring the server's own table. A sentence
 *  with no widget type to start as is a note. */
export function startsAs(section: string): "task" | "location" | "event" | null {
  switch (section) {
    case "todo":
      return "task";
    case "map":
      return "location";
    case "timeline":
      return "event";
    default:
      return null;
  }
}

/** The row a quick add is about to be, drawn from the words alone. */
export function provisionalRow(
  text: string,
  type: "task" | "location" | "event",
  author: { accountId: string | null; displayName: string },
  day?: string,
): ContentRow {
  const now = new Date().toISOString();
  return {
    id: provisionalId(),
    type,
    title: text,
    body: null,
    url: null,
    imageUrl: null,
    createdAt: now,
    archivedAt: null,
    doneAt: null,
    dueAt: null,
    // Noon UTC, as the server writes a bare day, so it reads back as the same
    // calendar day almost everywhere.
    occursAt: day ? `${day}T12:00:00.000Z` : null,
    occursEndAt: null,
    repeats: null,
    repeatsUntil: null,
    isReminder: false,
    priority: 0,
    priorityPinned: false,
    tags: [],
    place: null,
    placeId: null,
    seriesRef: null,
    allDay: day !== undefined,
    photo: null,
    author: { ...author, isYou: true },
    canDelete: true,
    canMove: true,
    filingAt: now,
  };
}

/** The note a typed sentence is about to be. */
export function provisionalNote(text: string, authorId: string | null): Note {
  return {
    id: provisionalId(),
    text,
    body: null,
    origin: "stated",
    authorId,
    authorIsMember: true,
    muted: false,
    occursAt: null,
    occursEndAt: null,
    dueAt: null,
    placeId: null,
    priority: 50,
    allDay: false,
    repeats: null,
    repeatsUntil: null,
    writtenAt: new Date().toISOString(),
    supersededAt: null,
  };
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
  /** The rail's own day. Structured, because a day heading's + is a choice
   *  about where the row goes rather than something said in the words. How
   *  often it comes round is not: "weekly on Monday at 2pm" says that, and the
   *  model reads it at the moment it writes the row. */
  options?: { day?: string },
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

/** Move a note within its section. The same scale as content and the same
 *  reversible shape; it never touches when the note was written. */
export async function setNotePriority(
  id: string,
  priority: number
): Promise<{ previous: { priority: number } } | null> {
  const { data } = await send<{ previous: { priority: number } }>(
    `/v1/notes/${id}/priority`,
    { method: "POST", ...body({ priority }) }
  );
  return data;
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

/** A span of the day in the kit's shape: the meridiem once, on the end, so
 *  the time column stays even, and "to" between, never a dash. */
export function rangeOf(startIso: string, endIso: string | null): string {
  const format = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const clock = (iso: string, meridiem: boolean) =>
    format
      .formatToParts(new Date(iso))
      .filter((part) => meridiem || part.type !== "dayPeriod")
      .map((part) => (part.type === "dayPeriod" ? part.value.toLowerCase() : part.value))
      .join("")
      .replace(/\s+(am|pm)$/, "$1")
      .trim();
  return endIso ? `${clock(startIso, false)} to ${clock(endIso, true)}` : clock(startIso, true);
}
