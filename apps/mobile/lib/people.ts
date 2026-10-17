// People and sharing, over the wire. 022.
//
// Every read is `send` so a refusal is a status the screen can act on: a
// person who removed you a moment ago is a 404 on their page, not an empty
// one, and the screen says "Not here any more." rather than drawing nothing.

import { send } from "./api";
import { rememberMark } from "./marks";

export interface Person {
  accountId: string;
  displayName: string | null;
  initials: string;
}

export { dayMonth, firstNameOf, nameOf, stateOfLookup } from "@offload/widgets";

export type LookupRelation = "none" | "you" | "connected" | "you_asked" | "asked_you";

export interface Found extends Person {
  email: string;
  relation: LookupRelation;
  requestId: string | null;
  since: string | null;
  /** The mark, inline as base64 PNG: a person you have not connected to
   *  may not fetch it by id, and the found row draws it. */
  mark: string;
}

export type Lookup = { kind: "found"; found: Found | null } | { kind: "rate_limited" } | { kind: "failed" };

export async function lookup(email: string): Promise<Lookup> {
  // In the body, never the path: a query string is what request logs keep,
  // and this is somebody else's address (security review 2026-09-22, M15).
  const { status, data } = await send<{ found: Found | null }>("/v1/people/lookup", {
    method: "POST",
    body: JSON.stringify({ email: email.trim() }),
  });
  if (status === 429) return { kind: "rate_limited" };
  if (status !== 200 || !data) return { kind: "failed" };
  if (data.found) rememberMark(data.found.accountId, data.found.mark);
  return { kind: "found", found: data.found };
}

/** 031. The line a refused lookup draws. A fact the server stated, so it is
 *  said; the retry is not offered, because pressing it is refused again. */
export const LOOKUP_LIMITED = "Too many lookups. Try again in a few minutes.";

export type LookupState = { kind: "found"; found: Found } | { kind: "none" } | { kind: "limited" } | { kind: "failed" };

export type RequestOutcome =
  | { ok: true; requestId: string; since: string }
  | { ok: false; error: "yourself" | "not_found" | "connected" | "pending" | "asked_you" | "too_soon" | "too_many" | "failed"; requestId?: string };

export async function requestConnection(accountId: string): Promise<RequestOutcome> {
  const { status, data } = await send<{ requestId?: string; since?: string; error?: string }>("/v1/people/requests", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
  if (status === 200 && data?.requestId && data.since) return { ok: true, requestId: data.requestId, since: data.since };
  if (status === 400) return { ok: false, error: "yourself" };
  if (status === 404) return { ok: false, error: "not_found" };
  if (status === 409 && data?.error) {
    return { ok: false, error: data.error as "connected" | "pending" | "asked_you" | "too_soon" | "too_many", ...(data.requestId ? { requestId: data.requestId } : {}) };
  }
  return { ok: false, error: "failed" };
}

export async function answerRequest(requestId: string, answer: "accept" | "dismiss"): Promise<boolean> {
  const { status } = await send(`/v1/people/requests/${requestId}/${answer}`, { method: "POST" });
  return status === 200;
}

export async function withdrawRequest(requestId: string): Promise<boolean> {
  const { status } = await send(`/v1/people/requests/${requestId}`, { method: "DELETE" });
  return status === 200;
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
  const { data } = await send<PeoplePage>("/v1/people");
  return data;
}

export type Relation = "connected" | "asked_you" | "you_asked" | "thread" | "waiting" | "blocked";

export interface PersonPage extends Person {
  relation: Relation;
  shared: { id: string; name: string; icon: string; hue: number; count: number; lastActivityAt: string }[];
  requestId: string | null;
}

/** The page, or `gone` for somebody who cannot be seen any more. */
export async function fetchPerson(accountId: string): Promise<PersonPage | "gone" | null> {
  const { status, data } = await send<PersonPage>(`/v1/people/${accountId}`);
  if (status === 404) return "gone";
  return data;
}

export async function removeConnection(accountId: string): Promise<boolean> {
  const { status } = await send(`/v1/people/connections/${accountId}`, { method: "DELETE" });
  return status === 200;
}

export async function blockPerson(accountId: string): Promise<boolean> {
  const { status } = await send("/v1/people/blocks", { method: "POST", body: JSON.stringify({ accountId }) });
  return status === 200;
}

export async function unblockPerson(accountId: string): Promise<boolean> {
  const { status } = await send(`/v1/people/blocks/${accountId}`, { method: "DELETE" });
  return status === 200;
}

// ---------------------------------------------------------------- sharing

export interface ShareSheet {
  members: (Person & { since: string; added: { count: number; titles: string[] } })[];
  waiting: (Person & { memberId: string })[];
  connections: Person[];
}

export async function fetchShareSheet(threadId: string): Promise<ShareSheet | null> {
  const { data } = await send<ShareSheet>(`/v1/threads/${threadId}/share`);
  return data;
}

export type ShareRefusal = "unknown_thread" | "default_thread" | "not_connected" | "already_in" | "waiting" | "too_many";

export async function shareThread(
  threadId: string,
  accountIds: string[],
): Promise<{ accountId: string; ok: boolean; error?: ShareRefusal }[] | null> {
  const { data } = await send<{ outcomes: { accountId: string; ok: boolean; error?: ShareRefusal }[] }>(
    `/v1/threads/${threadId}/share`,
    { method: "POST", body: JSON.stringify({ accountIds }) },
  );
  return data?.outcomes ?? null;
}

/** Withdraw a waiting share, or take a member out. The server decides which
 *  from the row's state. */
export async function takeOut(threadId: string, accountId: string): Promise<{ withdrew: boolean; removed: boolean } | null> {
  const { data } = await send<{ withdrew: boolean; removed: boolean; died: boolean }>(
    `/v1/threads/${threadId}/members/${accountId}`,
    { method: "DELETE" },
  );
  return data;
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
  const { status, data } = await send<{ threadId: string }>(`/v1/invitations/${memberId}/accept`, { method: "POST" });
  if (status === 404) return "gone";
  return data;
}

/** The said share's tap. */
export async function answerShare(pendingId: string, answer: "confirm" | "decline"): Promise<boolean> {
  const { status } = await send(`/v1/shares/${pendingId}/${answer}`, { method: "POST" });
  return status === 200;
}
