"use client";

// Where you are signed in, and ending a session that should not be there.
//
// The privacy page promised this control from the start and no client had it
// (security review 2026-09-22, M8). Better Auth lists an account's live
// sessions and revokes one by its token; this is the thin layer the account
// pane reads, with the device in words rather than a user agent string.
//
// 031: this device and the others are two reads. This device comes from the
// session the client already holds, so it draws whatever the list does; the
// list throws when it fails, because an empty answer here was drawn as
// "Nothing else" and the page told somebody there was nothing when it could
// not see.

import { describeDevice } from "@offload/markup";
import { authClient } from "./auth-client";

export { describeDevice };

export interface SignedIn {
  token: string;
  /** "Chrome on Mac", "The app on iPhone". */
  device: string;
  since: Date;
}

/** The session this browser holds, in words. Never fails: with no answer
 *  from the server it is still this browser, and the browser can say what it
 *  is. */
export async function thisDevice(): Promise<{ device: string }> {
  const agent = typeof navigator === "undefined" ? null : navigator.userAgent;
  try {
    const current = await authClient.getSession();
    return { device: describeDevice(current.data?.session?.userAgent ?? agent) };
  } catch {
    return { device: describeDevice(agent) };
  }
}

/** Every other live session, newest first. Throws when the list cannot be
 *  read, and when this session cannot be told apart from the rest, since
 *  listing it with an End beside it would be wrong. */
export async function listSignedIn(): Promise<SignedIn[]> {
  const [listed, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
  const mine = current.data?.session?.token;
  if (listed.error || !listed.data || !mine) throw new Error("signed-in list unavailable");
  return listed.data
    .filter((session) => session.token !== mine)
    .map((session) => ({
      token: session.token,
      device: describeDevice(session.userAgent),
      since: new Date(session.createdAt),
    }))
    .sort((a, b) => b.since.getTime() - a.since.getTime());
}

/** End one session. The device it was on is signed out on its next request. */
export async function endSignedIn(token: string): Promise<boolean> {
  const { error } = await authClient.revokeSession({ token });
  return !error;
}

/** End every session but this one. */
export async function endOthers(): Promise<boolean> {
  try {
    const { error } = await authClient.revokeOtherSessions();
    return !error;
  } catch {
    return false;
  }
}
