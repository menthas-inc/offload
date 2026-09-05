// Threads, content and memories, from a phone.
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

export interface Memory {
  id: string;
  text: string;
  origin: "stated" | "learned";
  authorId: string | null;
  /** False once the author left or deleted their account, at which point every
   *  member may delete it. Computed server-side. */
  authorIsMember: boolean;
  muted: boolean;
}

export const MAX_MEMORIES = 10;
export const MEMORY_CHARS = 200;

export interface ThreadBundle {
  id: string;
  name: string;
  icon: string | null;
  alwaysOn: boolean;
  counts: { active: number; archived: number };
  members: Member[];
  memories: Memory[];
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
  isReminder: boolean;
  priority: number;
  priorityPinned: boolean;
  tags: string[];
  place: Place | null;
  placeId: string | null;
  author: { accountId: string | null; displayName: string; isYou: boolean };
  canDelete: boolean;
  canMove: boolean;
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

// --------------------------------------------------------------- memories

/** Full at ten is a 409 and not a failure, so the screen can say which. */
export type AddedMemory =
  | { memory: Memory }
  | { full: true }
  | { tooLong: true }
  | null;

export async function addMemory(threadId: string, text: string): Promise<AddedMemory> {
  const { status, data } = await send<{ memory: Memory }>(
    `/v1/threads/${threadId}/memories`,
    { method: "POST", ...body({ text }) }
  );
  if (status === 409) return { full: true };
  if (status === 413) return { tooLong: true };
  return data;
}

export async function editMemory(
  id: string,
  text: string
): Promise<{ memory: Memory; previous: string } | null> {
  const { data } = await send<{ memory: Memory; previous: string }>(
    `/v1/memories/${id}`,
    { method: "PATCH", ...body({ text }) }
  );
  return data;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const { data } = await send<{ deleted: boolean }>(`/v1/memories/${id}`, {
    method: "DELETE",
  });
  return data?.deleted ?? false;
}

export async function restoreMemory(id: string): Promise<boolean> {
  const { status } = await send(`/v1/memories/${id}/restore`, { method: "POST" });
  return status === 200;
}

export async function muteMemory(id: string, muted: boolean): Promise<boolean> {
  const { status } = await send(`/v1/memories/${id}/mute`, {
    method: "POST",
    ...body({ muted }),
  });
  return status === 200;
}

