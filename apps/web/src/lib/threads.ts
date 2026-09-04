// Threads, and what is in them.
//
// One module for every call the shell makes. Mirrors apps/core-api/src/routes/
// threads.ts, and the shapes are written out rather than inferred because a
// client that guesses the server's shape is a client that finds out it guessed
// wrong at runtime.

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

const send = { credentials: "include" as const };
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

/** A standing fact a thread holds about itself.
 *
 *  Not content: "todo names in three words" is a memory, "chase the
 *  electrician" is a task. Ten per thread, so this never grows the bundle. */
export interface Memory {
  id: string;
  text: string;
  /** `learned` is offload's own, and the chip marks it. */
  origin: "stated" | "learned";
  /** Null once the author deleted their account. The memory stays in the
   *  shared thread it belongs to; the name comes off it. */
  authorId: string | null;
  /** False once the author left the thread or deleted their account, at which
   *  point every member may delete it. Computed server-side so the screen and
   *  the endpoint cannot disagree about who may do what. */
  authorIsMember: boolean;
  muted: boolean;
}

/** Ten, matching MAX_MEMORIES_PER_THREAD in the Core API. */
export const MAX_MEMORIES = 10;

/** 200, matching MEMORY_TEXT_CHARS. */
export const MEMORY_CHARS = 200;

/** Above this the chip truncates. Below it the chip is the whole memory.
 *
 *  A truncation rather than a second stored field: at a 200 character cap a
 *  model-written short label would save a line and a half and cost a job, a
 *  failure mode, and a second thing that can go stale. */
export const MEMORY_CHIP_CHARS = 60;

/** The chip's label. Truncated on a word boundary, never mid-word, because a
 *  rule cut in half reads as a different rule. */
export function chipLabel(text: string): string {
  if (text.length <= MEMORY_CHIP_CHARS) return text;
  const cut = text.slice(0, MEMORY_CHIP_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

export interface ThreadBundle {
  id: string;
  name: string;
  icon: string | null;
  alwaysOn: boolean;
  counts: { active: number; archived: number };
  members: Member[];
  /** How this thread wants to look. Absent fields mean derived from content. */
  preference: { widgets?: string[]; groupBy?: Record<string, string> };
  /** The thread's standing rules. At most ten. */
  memories: Memory[];
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
  isReminder: boolean;
  priority: number;
  priorityPinned: boolean;
  tags: string[];
  place: Place | null;
  /** `accountId` is null once the author deleted their account. Their content
   *  stays in the threads they shared, per OFF-3, and the name comes off it.
   *  `displayName` falls back to "Someone" server-side, so the screen never
   *  has to decide what a missing author looks like. */
  author: { accountId: string | null; displayName: string; isYou: boolean };
  /** Both computed by the server, using the same predicate it enforces. The
   *  client never decides what somebody is allowed to do. */
  canDelete: boolean;
  canMove: boolean;
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

export function fetchContent(
  threadId: string,
  options: { cursor?: string; archived?: boolean } = {},
): Promise<ContentPage | null> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.archived) query.set("archived", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return get<ContentPage>(`/v1/threads/${threadId}/content${suffix}`);
}

export const fetchOne = (id: string): Promise<ContentDetail | null> =>
  get<ContentDetail>(`/v1/content/${id}`);

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

/** Add a memory. Any member. Refused at ten, and 409 carries the limit and
 *  never any text. */
export async function addMemory(
  threadId: string,
  text: string,
): Promise<{ memory: Memory } | { full: true } | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/memories`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ text }),
  });
  if (response.status === 409) return { full: true };
  if (!response.ok) return null;
  return (await response.json()) as { memory: Memory };
}

/** Edit the full text, never the shortened form the chip shows. Any member,
 *  and it does not change whose memory it is. */
export async function editMemory(
  id: string,
  text: string,
): Promise<{ memory: Memory; previous: string } | null> {
  const response = await fetch(`${API}/v1/memories/${id}`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { memory: Memory; previous: string };
}

/** Delete. The author's alone, per OFF-3, which is why the control only
 *  renders on your own. */
export async function deleteMemory(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/memories/${id}`, { ...json, method: "DELETE" });
  if (!response.ok) return false;
  return ((await response.json()) as { deleted: boolean }).deleted;
}

/** Undo the delete. */
export async function restoreMemory(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/memories/${id}/restore`, { ...json, method: "POST" });
  return response.ok;
}

/** Mute or unmute. Any member, thread-wide. What everybody who is not the
 *  author gets instead of delete: it stops the rule reaching offload without
 *  destroying something somebody else wrote. */
export async function muteMemory(id: string, muted: boolean): Promise<boolean> {
  const response = await fetch(`${API}/v1/memories/${id}/mute`, {
    ...json,
    method: "POST",
    body: JSON.stringify({ muted }),
  });
  return response.ok;
}

/** Leave a thread, which deletes it when nobody else is in it.
 *
 *  One call for both, because on a thread you are alone in they are the same
 *  act. `deleted` says which happened, so the screen can say the true thing. */
export async function deleteThread(
  id: string,
): Promise<{ left: boolean; deleted: boolean } | null> {
  const response = await fetch(`${API}/v1/threads/${id}`, { ...json, method: "DELETE" });
  if (!response.ok) return null;
  return (await response.json()) as { left: boolean; deleted: boolean };
}

/** Undo, inside the eight seconds. After that the purge job has taken it. */
export async function restoreThread(id: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/threads/${id}/restore`, { ...json, method: "POST" });
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
