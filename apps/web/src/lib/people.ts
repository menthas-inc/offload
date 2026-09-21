// People and sharing, over the wire. 022.
//
// Every read that can be refused is read by status, so a person who removed
// you a moment ago is "gone" and the pane says so rather than drawing
// nothing.

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const send = { credentials: "include" as const };
const json = { credentials: "include" as const, headers: { "content-type": "application/json" } };

export interface Person {
  accountId: string;
  displayName: string | null;
  initials: string;
}

/** What a sentence calls a person with no name. Never invents a letter. */
export function nameOf(person: { displayName: string | null }): string {
  return person.displayName ?? "Someone";
}

export function firstNameOf(person: { displayName: string | null }): string {
  return nameOf(person).split(/\s+/)[0] ?? "Someone";
}

export function avatarUrl(accountId: string): string {
  return `${API}/v1/avatars/${accountId}.png`;
}

export type LookupRelation = "none" | "you" | "connected" | "you_asked" | "asked_you";

export interface Found extends Person {
  email: string;
  relation: LookupRelation;
  requestId: string | null;
  since: string | null;
}

export type Lookup = { kind: "found"; found: Found | null } | { kind: "rate_limited" } | { kind: "failed" };

export async function lookup(email: string): Promise<Lookup> {
  const response = await fetch(`${API}/v1/people/lookup?email=${encodeURIComponent(email.trim())}`, send);
  if (response.status === 429) return { kind: "rate_limited" };
  if (!response.ok) return { kind: "failed" };
  const body = (await response.json()) as { found: Found | null };
  return { kind: "found", found: body.found };
}

export type RequestOutcome =
  | { ok: true; requestId: string; since: string }
  | {
      ok: false;
      error: "yourself" | "not_found" | "connected" | "pending" | "asked_you" | "too_soon" | "too_many" | "failed";
      requestId?: string;
    };

export async function requestConnection(accountId: string): Promise<RequestOutcome> {
  const response = await fetch(`${API}/v1/people/requests`, { ...json, method: "POST", body: JSON.stringify({ accountId }) });
  const body = (await response.json().catch(() => ({}))) as { requestId?: string; since?: string; error?: string };
  if (response.ok && body.requestId && body.since) return { ok: true, requestId: body.requestId, since: body.since };
  if (response.status === 400) return { ok: false, error: "yourself" };
  if (response.status === 404) return { ok: false, error: "not_found" };
  if (response.status === 409 && body.error) {
    return {
      ok: false,
      error: body.error as "connected" | "pending" | "asked_you" | "too_soon" | "too_many",
      ...(body.requestId ? { requestId: body.requestId } : {}),
    };
  }
  return { ok: false, error: "failed" };
}

export async function answerRequest(requestId: string, answer: "accept" | "dismiss"): Promise<boolean> {
  const response = await fetch(`${API}/v1/people/requests/${requestId}/${answer}`, { ...send, method: "POST" });
  return response.ok;
}

export async function withdrawRequest(requestId: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/people/requests/${requestId}`, { ...send, method: "DELETE" });
  return response.ok;
}

export interface RequestCard extends Person {
  id: string;
  since: string;
}

export interface ConnectionRow extends Person {
  threads: { id: string; name: string }[];
  threadCount: number;
}

export interface PeoplePage {
  requestsForYou: RequestCard[];
  connections: ConnectionRow[];
  pending: RequestCard[];
  blocked: Person[];
  count: number;
}

export async function fetchPeople(): Promise<PeoplePage | null> {
  const response = await fetch(`${API}/v1/people`, send);
  if (!response.ok) return null;
  return (await response.json()) as PeoplePage;
}

export type Relation = "connected" | "asked_you" | "you_asked" | "thread" | "blocked";

export interface PersonPage extends Person {
  relation: Relation;
  shared: { id: string; name: string; count: number; lastActivityAt: string }[];
  requestId: string | null;
}

export async function fetchPerson(accountId: string): Promise<PersonPage | "gone" | null> {
  const response = await fetch(`${API}/v1/people/${accountId}`, send);
  if (response.status === 404) return "gone";
  if (!response.ok) return null;
  return (await response.json()) as PersonPage;
}

export async function removeConnection(accountId: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/people/connections/${accountId}`, { ...send, method: "DELETE" });
  return response.ok;
}

export async function blockPerson(accountId: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/people/blocks`, { ...json, method: "POST", body: JSON.stringify({ accountId }) });
  return response.ok;
}

export async function unblockPerson(accountId: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/people/blocks/${accountId}`, { ...send, method: "DELETE" });
  return response.ok;
}

// ---------------------------------------------------------------- sharing

export interface ShareSheet {
  members: (Person & { since: string; added: { count: number; titles: string[] } })[];
  waiting: (Person & { memberId: string })[];
  connections: Person[];
}

export async function fetchShareSheet(threadId: string): Promise<ShareSheet | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/share`, send);
  if (!response.ok) return null;
  return (await response.json()) as ShareSheet;
}

export type ShareRefusal = "unknown_thread" | "default_thread" | "not_connected" | "already_in" | "waiting" | "too_many";

export async function shareThread(
  threadId: string,
  accountIds: string[],
): Promise<{ accountId: string; ok: boolean; error?: ShareRefusal }[] | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/share`, { ...json, method: "POST", body: JSON.stringify({ accountIds }) });
  if (!response.ok) return null;
  const body = (await response.json()) as { outcomes: { accountId: string; ok: boolean; error?: ShareRefusal }[] };
  return body.outcomes;
}

/** Withdraw a waiting share, or take a member out; the row's state decides. */
export async function takeOut(threadId: string, accountId: string): Promise<{ withdrew: boolean; removed: boolean } | null> {
  const response = await fetch(`${API}/v1/threads/${threadId}/members/${accountId}`, { ...send, method: "DELETE" });
  if (!response.ok) return null;
  return (await response.json()) as { withdrew: boolean; removed: boolean; died: boolean };
}

export interface Invitation {
  memberId: string;
  threadId: string;
  threadName: string;
  from: Person;
  preview: { count: number; titles: string[] };
  members: string[];
}

export async function acceptInvitation(memberId: string): Promise<{ threadId: string } | "gone" | null> {
  const response = await fetch(`${API}/v1/invitations/${memberId}/accept`, { ...send, method: "POST" });
  if (response.status === 404) return "gone";
  if (!response.ok) return null;
  return (await response.json()) as { threadId: string };
}

/** The said share's tap. */
export async function answerShare(pendingId: string, answer: "confirm" | "decline"): Promise<boolean> {
  const response = await fetch(`${API}/v1/shares/${pendingId}/${answer}`, { ...send, method: "POST" });
  return response.ok;
}

/** The line a person reads before sharing, unchanged since 5 September. */
export const SHARE_LINE =
  "A shared thread belongs to everyone in it. If somebody leaves offload, the thread and everything they added stay with the rest of you.";
