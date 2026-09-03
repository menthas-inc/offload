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

export interface ThreadBundle {
  id: string;
  name: string;
  icon: string | null;
  alwaysOn: boolean;
  counts: { active: number; archived: number };
  members: Member[];
  /** Always null today. offload does not summarise a thread yet and nothing
   *  writes a standing memory. The field is here so the empty state renders
   *  from a value rather than from an absence, and so the day something writes
   *  one, no client changes. */
  standing: null;
}

export interface ContentRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  archivedAt: string | null;
  author: { accountId: string; displayName: string; isYou: boolean };
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
