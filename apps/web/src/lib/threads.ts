// Threads, and what is in them.
//
// One module for every call the shell makes. Mirrors apps/core-api/src/routes/
// threads.ts, and the shapes are written out rather than inferred because a
// client that guesses the server's shape is a client that finds out it guessed
// wrong at runtime.

import { timeZoneHeader } from "./time-zone";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
import type { Invitation } from "./people";
import type { Label } from "./labels";

/** A request with no body.
 *
 *  **It must not claim a JSON content-type it has no body for.** Fastify's
 *  parser refuses an empty body when the header says JSON, so the call comes
 *  back 400, the helper reads that as a plain failure and the screen does
 *  nothing at all: a delete that silently does not delete.
 *
 *  That is not hypothetical. Four calls added in 008 used `json` below for
 *  bodyless deletes and restores, and both deletes were dead in production
 *  until the API log said so in as many words. `send` existed for this the
 *  whole time. */
const send = { credentials: "include" as const };

/** A request that carries one. */
const json = {
  credentials: "include" as const,
  headers: { "content-type": "application/json" },
};

export interface ThreadRow {
  id: string;
  name: string;
  icon: string | null;
  count: number;
  meta: string;
  /** The default thread, which cannot be deleted: everything with no obvious
   *  home lands there. The row shows the control unavailable rather than
   *  hiding it, so the rule is visible where somebody would go looking. */
  isDefault: boolean;
}

export type GroupKey = "now" | "always" | "older";

export interface ThreadGroup {
  key: GroupKey;
  threads: ThreadRow[];
}

export interface Member {
  accountId: string;
  displayName: string;
  initials: string;
  isYou: boolean;
}

/** A sentence a thread holds about itself.
 *
 *  What is true about the thread, and sometimes how it is handled. "Todo names
 *  in three words" is a note; so is "we are staying in Istanbul the 10th to the
 *  12th". "Chase the electrician" is a task. */
export interface Note {
  id: string;
  /** 025. The note's live labels, by id, in the thread's label order. */
  labels: string[];
  text: string;
  /** What was dumped when it did not fit in 200 characters. Never in a prompt,
   *  and never on the row: opening the note is what shows it. */
  body: string | null;
  /** `learned` is offload's own, and the row marks it. It also means offload
   *  wrote this text over somebody's longer words. */
  origin: "stated" | "learned";
  /** Null once the author deleted their account. The note stays in the shared
   *  thread it belongs to; the name comes off it. */
  authorId: string | null;
  /** False once the author left the thread or deleted their account, at which
   *  point every member may delete it. Computed server-side so the screen and
   *  the endpoint cannot disagree about who may do what. */
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
  /** That it comes round again. One note, a mark on every matching day. 023:
   *  an RFC 5545 rule, anchored on the occurrence. */
  rrule: string | null;
  /** When it was last written. What decides which notes reach offload when a
   *  thread holds more than the budget, and what the row shows. */
  writtenAt: string;
  /** Set aside by the daily job. Only ever set on the folded list. */
  supersededAt: string | null;
}

/** A hundred, matching NOTE_PROMPT_BUDGET in the Core API.
 *
 *  **Not a cap.** A thread holds as many notes as somebody dumps; this is how
 *  many of them reach offload, newest first. Past it the screen says which are
 *  not, because a note somebody believes is steering offload and is not is
 *  worse than one they know about. */
export const NOTE_BUDGET = 100;

/** 200, matching NOTE_TEXT_CHARS. */
export const NOTE_CHARS = 200;

/** 4000, matching NOTE_BODY_CHARS. */
export const NOTE_BODY_CHARS = 4000;



export interface ThreadBundle {
  id: string;
  name: string;
  icon: string | null;
  alwaysOn: boolean;
  /** `unlabelled` is 025's No label count. */
  counts: { active: number; archived: number; unlabelled: number };
  members: Member[];
  /** 025. The thread's labels in the order they were made, with counts. */
  labels: Label[];
  /** How this thread wants to look. Absent fields mean derived from content. */
  preference: { widgets?: string[]; hideDone?: boolean };
  /** What this thread holds about itself. Active only. */
  notes: Note[];
  /** Active and folded. The folded count is what the history control shows,
   *  and a thread with none of them draws no control. */
  noteCounts: { active: number; folded: number };
  /** 2026-09-29. What is open, by kind, and who with: the line My threads
   *  draws under the name. Empty for an empty thread of your own. */
  line: string;
  /** Null until something writes summaries, which nothing does. Typed as a
   *  nullable string rather than `null` so the screen that renders it is
   *  written and tested now: a branch typed unreachable is a branch nobody
   *  checks, and it would be discovered broken on the day it first fills. */
  standing: string | null;
  /** 022. False on the account's default thread, where Share is not drawn. */
  shareable: boolean;
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
  /** 027. False when the viewer neither made it nor was invited to it. */
  involved?: boolean;
}

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** The registrable domain of a URL, for a row that is a link.
 *
 *  The same string the source chip shows, and for the same reason: it is the
 *  part a person recognises, and it is ours rather than the page's. A title is
 *  written by whoever owns the page; a domain is not. */
export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export interface ContentRow {
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
  /** What 006 extracts. All of it may be null or empty, which is what a thread
   *  of plain notes looks like and is why 007's widgets are earned rather than
   *  configured. */
  doneAt: string | null;
  dueAt: string | null;
  occursAt: string | null;
  /** The other end of a span, so the rail draws a thing on every day it
   *  covers. Written since 0011 and read by nothing until 015. */
  occursEndAt: string | null;
  /** That it comes round again, as a rule the calendar expands. One row, a
   *  mark on every matching day. 023: an RFC 5545 rule in the closed grammar
   *  of `@offload/widgets`, the server's own serialisation. */
  rrule: string | null;
  isReminder: boolean;
  /** 023. Written to a calendar, so its time is Google's: no When on it. */
  onCalendar: boolean;
  priority: number;
  priorityPinned: boolean;
  /** 025. The row's live labels, by id, in the thread's label order. */
  labels: string[];
  place: Place | null;
  /** The same place, as the id the shared widget rule takes. Derived in
   *  `fetchContent` rather than sent twice, so nothing above has to know that
   *  the server holds a key where this holds an object. */
  placeId: string | null;
  /** The repeating series this occurrence belongs to, or null for a one off.
   *  A timeline collapses a series to one entry; a calendar draws every one. */
  seriesRef: string | null;
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  /** `accountId` is null once the author deleted their account. Their content
   *  stays in the threads they shared, per OFF-3, and the name comes off it.
   *  `displayName` falls back to "Someone" server-side, so the screen never
   *  has to decide what a missing author looks like. */
  author: { accountId: string | null; displayName: string; isYou: boolean };
  /** Both computed by the server, using the same predicate it enforces. The
   *  client never decides what somebody is allowed to do. */
  canDelete: boolean;
  canMove: boolean;
  /** Typed straight in and not read by offload yet. */
  filingAt: string | null;
}

export interface ContentDetail extends ContentRow {
  threadId: string;
  threadName: string;
  from: { messageId: string; text: string | null; at: string } | null;
}

export interface ContentPage {
  /** `ticked` only when the label's list asked, with `ticksFor`. */
  rows: (ContentRow & { ticked?: boolean })[];
  nextCursor: string | null;
}

async function get<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API}${path}`, send);
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export async function fetchThreads(): Promise<ThreadGroup[]> {
  const body = await get<{ groups: ThreadGroup[] }>("/v1/threads");
  return body?.groups ?? [];
}

/** 022. The list and the strips in one read, which is what My threads draws. */
export const fetchThreadsAndInvitations = (): Promise<{ groups: ThreadGroup[]; invitations: Invitation[] } | null> =>
  get<{ groups: ThreadGroup[]; invitations: Invitation[] }>("/v1/threads");

export const fetchThread = (id: string): Promise<ThreadBundle | null> =>
  get<ThreadBundle>(`/v1/threads/${id}`);

export const fetchThreadCalendars = (id: string): Promise<ThreadCalendars | null> =>
  get<ThreadCalendars>(`/v1/threads/${id}/calendars`);

export async function setThreadCalendar(
  threadId: string,
  calendarId: string,
  picked: boolean,
): Promise<ThreadCalendars | null> {
  try {
    const response = await fetch(`${API}/v1/threads/${threadId}/calendars/${calendarId}`, {
      ...json,
      method: "PATCH",
      body: JSON.stringify({ picked }),
    });
    if (!response.ok) return null;
    return (await response.json()) as ThreadCalendars;
  } catch {
    // Offline, or the request never left. The popover draws the line and the
    // box stays as it was.
    return null;
  }
}

/** The events on the thread's calendars between two days, inclusive. */
/** Null when the read failed, so a month can be asked for again. */
export async function fetchThreadEvents(threadId: string, from: string, to: string): Promise<ThreadEvent[] | null> {
  const body = await get<{ events: ThreadEvent[] }>(`/v1/threads/${threadId}/events?from=${from}&to=${to}`);
  return body?.events ?? null;
}

export async function fetchContent(
  threadId: string,
  options: { cursor?: string; archived?: boolean; labels?: string[]; unlabelled?: boolean; ticksFor?: string } = {},
): Promise<ContentPage | null> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.archived) query.set("archived", "true");
  // 025. The filter bar's pick, read on the server because the list is paged.
  if (options.labels?.length) query.set("labels", options.labels.join(","));
  if (options.unlabelled) query.set("unlabelled", "true");
  if (options.ticksFor) query.set("ticksFor", options.ticksFor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const page = await get<ContentPage>(`/v1/threads/${threadId}/content${suffix}`);
  if (!page) return null;
  // The one place the server's shape and the shared rule's shape meet.
  return { ...page, rows: page.rows.map(withPlaceId) };
}

/** The shared widget rule asks whether a row has a place; the API sends the
 *  place itself. One line, once, at the edge. */
function withPlaceId(row: ContentRow): ContentRow {
  return { ...row, placeId: row.place?.id ?? null };
}

export async function fetchOne(id: string): Promise<ContentDetail | null> {
  const row = await get<ContentDetail>(`/v1/content/${id}`);
  return row ? { ...row, placeId: row.place?.id ?? null } : null;
}

// ------------------------------------------------------------------ writes
//
// Each returns what the row was, so Undo is one more call with the old value
// and nothing has to be held across a reload.

/** 023. Every previous value, so Undo is one request with it as the body. */
export interface ContentSnapshot {
  title: string;
  body: string | null;
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
  isReminder: boolean;
  labels: string[];
}

/** The refusals the route names; the screen is put back with one clause. */
export type EditRefusal = "bad_date" | "bad_rule" | "on_calendar";

export interface Edited {
  content: ContentRow;
  previous: ContentSnapshot;
}

/** 023. The nine fields a sheet may write. Absent leaves a field alone and
 *  null clears it; what comes back is every previous value, so Undo is one
 *  request. */
export interface ContentPatch {
  title?: string;
  body?: string | null;
  dueAt?: string | null;
  occursAt?: string | null;
  occursEndAt?: string | null;
  allDay?: boolean;
  rrule?: string | null;
  isReminder?: boolean;
  /** 025. The row's labels as a full set. */
  labels?: string[];
}

export async function editContent(
  id: string,
  patch: ContentPatch,
): Promise<Edited | null> {
  const response = await fetch(`${API}/v1/content/${id}`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!response.ok) return null;
  return (await response.json()) as Edited;
}

export async function setArchived(id: string, archived: boolean): Promise<boolean> {
  const response = await fetch(
    `${API}/v1/content/${id}/${archived ? "archive" : "restore"}`,
    { ...send, method: "POST" },
  );
  return response.ok;
}

export interface Moved {
  content: ContentRow;
  previous: { threadId: string };
}

export async function moveContent(id: string, threadId: string): Promise<Moved | null> {
  const response = await fetch(`${API}/v1/content/${id}/move`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ threadId }),
  });
  if (!response.ok) return null;
  return (await response.json()) as Moved;
}

export async function deleteContent(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/content/${id}`, { ...send, method: "DELETE" });
  if (!response.ok) return false;
  const body = (await response.json()) as { deleted: boolean };
  return body.deleted;
}

export interface Renamed {
  thread: { id: string; name: string };
  previous: { name: string };
}

export async function renameThread(id: string, name: string): Promise<Renamed | null> {
  const response = await fetch(`${API}/v1/threads/${id}`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return null;
  return (await response.json()) as Renamed;
}

/** Tick something off, or put it back. Any member; nothing is destroyed. */
export async function completeContent(id: string, done: boolean): Promise<boolean> {
  const response = await fetch(`${API}/v1/content/${id}/complete`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ done }),
  });
  return response.ok;
}

/** Change a priority. Doing this pins it, so offload stops guessing.
 *
 *  Returns what it was, so a drag is undone by the same call with the old
 *  number. */
export async function setPriority(
  id: string,
  priority: number,
): Promise<{ previous: { priority: number; priorityPinned: boolean } } | null> {
  const response = await fetch(`${API}/v1/content/${id}/priority`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ priority }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { previous: { priority: number; priorityPinned: boolean } };
}

/** Move a note within its section. The same scale as content and the same
 *  reversible shape; it never touches when the note was written. */
export async function setNotePriority(
  id: string,
  priority: number,
): Promise<{ previous: { priority: number } } | null> {
  const response = await fetch(`${API}/v1/notes/${id}/priority`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ priority }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { previous: { priority: number } };
}

/** How long a row may claim to be filing before the spinner gives up.
 *
 *  Mirrors the server's own constant. Nothing sweeps the column, so a worker
 *  that died leaves a timestamp behind; the row is a perfectly good row either
 *  way and the only thing that has to expire is the spinner. */
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
    rrule: null,
    onCalendar: false,
    isReminder: false,
    priority: 0,
    priorityPinned: false,
    labels: [],
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
    labels: [],
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
    rrule: null,
    writtenAt: new Date().toISOString(),
    supersededAt: null,
  };
}

/** Type something straight into a thread, without going through the composer.
 *
 *  Resolves as soon as the row is written, which is before offload has read it:
 *  the point of this is that the words are saved first and tidied second, so
 *  waiting for the model here would give back the one thing it was built to
 *  avoid. */
export async function quickAdd(
  threadId: string,
  text: string,
  section: string,
  /** The rail's own day, and only that. Structured because it is the heading
   *  they pressed + on rather than something they said; how often a thing comes
   *  round is something they say, and the model reads it as it writes the
   *  row. */
  options?: { day?: string },
): Promise<{ id: string; kind: "content" | "note" } | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/quick-add`, {
    ...json,
    // The row is read by the model, which needs to know what day it is where
    // they are.
    headers: { ...json.headers, ...timeZoneHeader() },
    method: "POST",
    body: JSON.stringify({ text, section, ...options }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { id: string; kind: "content" | "note" };
}

/** Write one. **It always lands**: there is no cap and nothing to refuse. */
export async function addNote(
  threadId: string,
  text: string,
): Promise<{ note: Note } | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/notes`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ text }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { note: Note };
}

/** Edit the text, and the body with it. Any member, and it does not change
 *  whose note it is. `body` omitted leaves it alone. */
export async function editNote(
  id: string,
  text: string,
  body?: string | null,
): Promise<{ note: Note; previous: string } | null> {
  const response = await fetch(`${API}/v1/notes/${id}`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify(body === undefined ? { text } : { text, body }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { note: Note; previous: string };
}

/** Delete. The author's alone, per OFF-3, which is why the control only
 *  renders on your own. */
export async function deleteNote(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/notes/${id}`, { ...send, method: "DELETE" });
  if (!response.ok) return false;
  return ((await response.json()) as { deleted: boolean }).deleted;
}

/** Undo the delete. */
export async function restoreNote(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/notes/${id}/restore`, { ...send, method: "POST" });
  return response.ok;
}

/** Mute or unmute. Any member, thread-wide. What everybody who is not the
 *  author gets instead of delete: it stops the note reaching offload without
 *  destroying something somebody else wrote. */
export async function muteNote(id: string, muted: boolean): Promise<boolean> {
  const response = await fetch(`${API}/v1/notes/${id}/mute`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ muted }),
  });
  return response.ok;
}

/** What the daily job folded. Read, not worked with: there is no restore.
 *
 *  Paginated because it is the one list on a thread with no ceiling. */
export async function foldedNotes(
  threadId: string,
  cursor?: string | null,
): Promise<{ notes: Note[]; cursor: string | null } | null> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await fetch(`${API}/v1/threads/${threadId}/notes/folded${query}`, send);
  if (!response.ok) return null;
  return (await response.json()) as { notes: Note[]; cursor: string | null };
}

/** Leave a thread, which deletes it when nobody else is in it.
 *
 *  One call for both, because on a thread you are alone in they are the same
 *  act. `deleted` says which happened, so the screen can say the true thing. */
export async function deleteThread(
  id: string,
): Promise<{ left: boolean; deleted: boolean } | null> {
  const response = await fetch(`${API}/v1/threads/${id}`, { ...send, method: "DELETE" });
  if (!response.ok) return null;
  return (await response.json()) as { left: boolean; deleted: boolean };
}

/** Undo, inside the eight seconds. After that the purge job has taken it. */
export async function restoreThread(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/threads/${id}/restore`, { ...send, method: "POST" });
  return response.ok;
}

export async function setPreference(
  threadId: string,
  patch: {
    widgets?: string[] | null;
    hideDone?: boolean | null;
  },
): Promise<boolean> {
  const response = await fetch(`${API}/v1/threads/${threadId}/preference`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return response.ok;
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
