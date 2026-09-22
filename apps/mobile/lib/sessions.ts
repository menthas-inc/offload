// Where you are signed in, and ending a session that should not be there.
//
// The privacy page promised this control from the start and no client had it
// (security review 2026-09-22, M8). The same two Better Auth endpoints the web
// reads, through the phone's own client, which sends the stored cookie.

import { describeDevice } from "@offload/markup";
import { authClient } from "./auth";

export interface SignedIn {
  token: string;
  device: string;
  since: Date;
  /** The session this phone holds. Ended by Sign out, not here. */
  current: boolean;
}

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

export async function endSignedIn(token: string): Promise<boolean> {
  const { error } = await authClient.revokeSession({ token });
  return !error;
}
