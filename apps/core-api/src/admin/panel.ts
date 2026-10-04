// The panel's own session (going-public 17b).
//
// The app's session alone was the panel: whoever held one staff member's
// cookie, or a phone's token, held every staff write. The panel now opens
// only for a staff session that signed in a few minutes ago, on a pass that
// is bound to that one session and runs out. A session that has been sitting
// in a browser for a week is staff in the app and nobody here until it signs
// in again.
//
// The pass is a signed value and not a row: it names the session it was made
// for, so it dies with it. Signing out, being signed out everywhere, being
// disabled or losing the staff row each close the panel with nothing more to
// revoke, since the staff check still runs on every request.

import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedKey } from "../crypto/derived.js";
import { isProduction } from "../env.js";

export const PANEL_COOKIE = "offload_admin";
/** How long the panel stays open after one fresh sign-in. */
export const PANEL_TTL_MS = 12 * 60 * 60 * 1000;
/** How recently the session must have signed in for the panel to open. */
export const PANEL_FRESH_MS = 10 * 60 * 1000;

/** Its own key, so a pass cannot be made from any other signed value here. */
const KEY = derivedKey("admin-panel-pass");

const sign = (sessionId: string, accountId: string, expiresAt: number): string =>
  createHmac("sha256", KEY).update(`${sessionId}.${accountId}.${expiresAt}`).digest("base64url");

/** `expiry.mac`. The session and the account are in the signature and not in
 *  the value: the request has to bring them itself. */
export function sealPanel(sessionId: string, accountId: string, now: number): string {
  const expiresAt = now + PANEL_TTL_MS;
  return `${expiresAt}.${sign(sessionId, accountId, expiresAt)}`;
}

/** Every value sent under the pass's name. A cookie of the same name set for
 *  the parent domain arrives beside the real one, and reading only the first
 *  would lock staff out with nothing to say why. */
function passes(cookieHeader: string | undefined): string[] {
  const out: string[] = [];
  for (const pair of (cookieHeader ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at === -1 || pair.slice(0, at).trim() !== PANEL_COOKIE) continue;
    try {
      out.push(decodeURIComponent(pair.slice(at + 1).trim()));
    } catch {
      // Not valid percent-encoding, so not a cookie this service set.
    }
  }
  return out;
}

export function panelOpen(cookieHeader: string | undefined, sessionId: string, accountId: string, now: number): boolean {
  return passes(cookieHeader).some((value) => passGood(value, sessionId, accountId, now));
}

function passGood(value: string, sessionId: string, accountId: string, now: number): boolean {
  const [expiresAt, mac, ...rest] = value.split(".");
  if (!expiresAt || !mac || rest.length > 0) return false;
  const until = Number(expiresAt);
  if (!Number.isFinite(until) || until < now) return false;
  const expected = Buffer.from(sign(sessionId, accountId, until));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Sent to the panel's own routes and nowhere else, and never to a request
 *  another site started. Host-only: the web app has no use for it. */
export function panelCookie(value: string): string {
  return [
    `${PANEL_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/v1/admin",
    `Max-Age=${PANEL_TTL_MS / 1000}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(isProduction ? ["Secure"] : []),
  ].join("; ");
}
