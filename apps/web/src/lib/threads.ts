// Threads, and what is in them.
//
// One module for every call the shell makes. Mirrors apps/core-api/src/routes/
// threads.ts, and the shapes are written out rather than inferred because a
// client that guesses the server's shape is a client that finds out it guessed
// wrong at runtime.

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

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
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  /** That it comes round again. One note, a mark on every matching day. */
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  repeatsUntil: string | null;
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
  counts: { active: number; archived: number };
  members: Member[];
  /** How this thread wants to look. Absent fields mean derived from content. */
  preference: { widgets?: string[]; groupBy?: Record<string, string> };
  /** What this thread holds about itself. Active only. */
  notes: Note[];
  /** Active and folded. The folded count is what the history control shows,
   *  and a thread with none of them draws no control. */
  noteCounts: { active: number; folded: number };
  /** Null until something writes summaries, which nothing does. Typed as a
   *  nullable string rather than `null` so the screen that renders it is
   *  written and tested now: a branch typed unreachable is a branch nobody
   *  checks, and it would be discovered broken on the day it first fills. */
  standing: string | null;
}

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ContentRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
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
   *  mark on every matching day. */
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  repeatsUntil: string | null;
  isReminder: boolean;
  priority: number;
  priorityPinned: boolean;
  tags: string[];
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
  rows: ContentRow[];
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

export const fetchThread = (id: string): Promise<ThreadBundle | null> =>
  get<ThreadBundle>(`/v1/threads/${id}`);

export async function fetchContent(
  threadId: string,
  options: { cursor?: string; archived?: boolean } = {},
): Promise<ContentPage | null> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.archived) query.set("archived", "true");
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

export interface Edited {
  content: ContentRow;
  previous: { title: string; body: string | null };
}

export async function editContent(
  id: string,
  patch: { title?: string; body?: string | null },
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

/** Change a priority. Doing this pins it, so offload stops guessing. */
export async function setPriority(id: string, priority: number): Promise<boolean> {
  const response = await fetch(`${API}/v1/content/${id}/priority`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ priority }),
  });
  return response.ok;
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
  /** The rail's own day and its repeat box. Structured, not read from the
   *  words: offload has no tool that can change either once the row is
   *  written, so they have to be right from here. */
  options?: { day?: string; repeats?: boolean },
): Promise<{ id: string; kind: "content" | "note" } | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/quick-add`, {
    ...json,
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
  patch: { widgets?: string[] | null; groupBy?: Record<string, string> | null },
): Promise<boolean> {
  const response = await fetch(`${API}/v1/threads/${threadId}/preference`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return response.ok;
}
