// Talking to Google Calendar.
//
// Everything that leaves this file is already shaped the way offload wants it,
// so the rest of the codebase never sees a Google payload. One place knows the
// API, and one place has to change when it moves.
//
// **Least privilege.** `calendar.calendarlist.readonly` to see which calendars
// exist and `calendar.events` to read and write events. Not `calendar`, which
// also grants access-list and calendar management this feature does not use:
// the sharing question is answered by the person, not by an ACL read.

import { env } from "../env.js";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export function callbackUrl(): string {
  return `${env.API_URL}/api/connectors/google/callback`;
}

export function consentUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CONNECTOR_CLIENT_ID ?? "",
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // Without both of these Google returns no refresh token on a repeat
    // consent, and a connection that cannot refresh dies silently in an hour.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH}?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  /** Absent on a refresh. Google reissues one sometimes and a client that keeps
   *  the old one is a connection that dies quietly in a month, so the caller
   *  overwrites when it is present rather than assuming it is stable. */
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

function toTokenSet(body: Record<string, unknown>): TokenSet {
  const expiresIn = typeof body["expires_in"] === "number" ? body["expires_in"] : null;
  return {
    accessToken: String(body["access_token"] ?? ""),
    refreshToken: typeof body["refresh_token"] === "string" ? body["refresh_token"] : null,
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000),
    scope: typeof body["scope"] === "string" ? body["scope"] : null,
  };
}

/** Thrown when Google says the grant is gone. Not a retry: it is somebody
 *  having revoked access, which is their decision and a state, not a fault. */
export class GrantRevoked extends Error {
  constructor() {
    super("connector grant revoked");
    this.name = "GrantRevoked";
  }
}

async function postForm(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    if (parsed["error"] === "invalid_grant") throw new GrantRevoked();
    throw new Error(`google token endpoint ${response.status}`);
  }
  return parsed;
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return toTokenSet(
    await postForm(
      TOKEN,
      new URLSearchParams({
        code,
        client_id: env.GOOGLE_CONNECTOR_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CONNECTOR_CLIENT_SECRET ?? "",
        redirect_uri: callbackUrl(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      })
    )
  );
}

export async function refreshAccess(refreshToken: string): Promise<TokenSet> {
  return toTokenSet(
    await postForm(
      TOKEN,
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CONNECTOR_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CONNECTOR_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      })
    )
  );
}

/** Hand the grant back to Google, not only forget it here.
 *
 *  Deleting our copy leaves the grant live on Google's side, so "disconnected"
 *  in offload would mean nothing where it counts. */
export async function revoke(token: string): Promise<void> {
  await fetch(REVOKE, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export interface GoogleCalendar {
  externalId: string;
  summary: string;
  timezone: string | null;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary: boolean;
}

const ROLES = new Set(["owner", "writer", "reader", "freeBusyReader"]);

export async function listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const response = await fetch(`${API}/users/me/calendarList?minAccessRole=freeBusyReader`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) throw new GrantRevoked();
  if (!response.ok) throw new Error(`google calendarList ${response.status}`);

  const body = (await response.json()) as { items?: Array<Record<string, unknown>> };
  return (body.items ?? []).map((item) => {
    const role = String(item["accessRole"] ?? "reader");
    return {
      externalId: String(item["id"] ?? ""),
      summary: String(item["summaryOverride"] ?? item["summary"] ?? "Calendar"),
      timezone: typeof item["timeZone"] === "string" ? item["timeZone"] : null,
      // An unrecognised role reads as the least privilege we know, which also
      // means `is_shared` cannot be turned off for it.
      accessRole: (ROLES.has(role) ? role : "reader") as GoogleCalendar["accessRole"],
      primary: item["primary"] === true,
    };
  });
}
