// Where you are signed in, and ending a session that should not be there.
//
// The privacy page promised this control from the start and no client had it
// (security review 2026-09-22, M8). The same Better Auth endpoints the web
// reads, through the phone's own client, which sends the stored cookie.
//
// 031. **This device is read on its own, from the session the phone holds**,
// so it draws whatever the list does. The list used to carry it, and a failed
// list was caught as an empty one, which drew "Nothing else": the one answer
// that could never be true, since a list that worked always held this phone.

import { byDevice, describeDevice, type DeviceSessions } from "@offload/markup";
import { authClient } from "./auth";

export interface SignedIn {
  token: string;
  device: string;
  since: Date;
}

/** The session this phone holds, or null when there is none to read. Ended by
 *  Sign out, not by End. */
export async function thisDevice(): Promise<SignedIn | null> {
  const { data } = await authClient.getSession();
  const session = data?.session;
  if (!session) return null;
  return { token: session.token, device: describeDevice(session.userAgent), since: new Date(session.createdAt) };
}

/** Every other session, one entry per device, newest first. Throws when the read fails, so a
 *  failure is never drawn as an empty list. */
export async function listSignedIn(): Promise<DeviceSessions[]> {
  const [listed, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
  const mine = current.data?.session?.token ?? null;
  // Also when this phone's own session cannot be told apart from the rest:
  // listed among the others it would carry an End that signs this phone out.
  if (listed.error || !listed.data || !mine) throw new Error("sessions unread");
  return byDevice(listed.data.filter((session) => session.token !== mine));
}

/** Every session on one device. */
export async function endSignedIn(tokens: string[]): Promise<boolean> {
  const answers = await Promise.all(tokens.map((token) => authClient.revokeSession({ token })));
  return answers.every(({ error }) => !error);
}

/** Every session but this one. */
export async function endOthers(): Promise<boolean> {
  const { error } = await authClient.revokeOtherSessions();
  return !error;
}
