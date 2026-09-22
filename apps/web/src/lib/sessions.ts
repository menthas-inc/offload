"use client";

// Where you are signed in, and ending a session that should not be there.
//
// The privacy page promised this control from the start and no client had it
// (security review 2026-09-22, M8). Better Auth lists an account's live
// sessions and revokes one by its token; this is the thin layer the account
// pane reads, with the device in words rather than a user agent string.

import { describeDevice } from "@offload/markup";
import { authClient } from "./auth-client";

export { describeDevice };

export interface SignedIn {
  token: string;
  /** "Chrome on Mac", "The app on iPhone". */
  device: string;
  since: Date;
  /** The session this request was made with. Ended by Sign out, not here. */
  current: boolean;
}

/** Every live session, this device first, then newest first. */
export async function listSignedIn(): Promise<SignedIn[]> {
  const [listed, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
  const mine = current.data?.session?.token ?? null;
  const rows = (listed.data ?? []).map((session) => ({
    token: session.token,
    device: describeDevice(session.userAgent),
    since: new Date(session.createdAt),
    current: session.token === mine,
  }));
  return rows.sort((a, b) => Number(b.current) - Number(a.current) || b.since.getTime() - a.since.getTime());
}

/** End one session. The device it was on is signed out on its next request. */
export async function endSignedIn(token: string): Promise<boolean> {
  const { error } = await authClient.revokeSession({ token });
  return !error;
}
