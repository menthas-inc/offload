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

/** One occurrence, already flattened. A recurring series arrives expanded,
 *  exceptions included, because `singleEvents` asks Google to do that work. */
export interface GoogleEvent {
  externalId: string;
  seriesId: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  title: string;
  location: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  timezone: string | null;
  /** **Did this account write it.** The whole trust decision rests on this:
   *  an event somebody else organised is untrusted text wherever it sits,
   *  including on a calendar nobody else can see, because that is what an
   *  invitation is. Absent reads as not-yours, which fails closed. */
  organizedByMe: boolean;
  attendees: Array<{ name: string | null; email: string | null; response: string | null }>;
}

function whenOf(slot: Record<string, unknown> | undefined): { at: Date | null; allDay: boolean; tz: string | null } {
  if (!slot) return { at: null, allDay: false, tz: null };
  const dateTime = slot["dateTime"];
  const date = slot["date"];
  const tz = typeof slot["timeZone"] === "string" ? slot["timeZone"] : null;
  if (typeof dateTime === "string") return { at: new Date(dateTime), allDay: false, tz };
  // An all-day event is a date, and a date is not midnight anywhere. Parsed as
  // UTC midnight and flagged, so nothing renders somebody's birthday a day out
  // for half the planet.
  if (typeof date === "string") return { at: new Date(`${date}T00:00:00Z`), allDay: true, tz };
  return { at: null, allDay: false, tz };
}

export interface EventPage {
  events: GoogleEvent[];
  nextSyncToken: string | null;
}

/** Events in a window, or everything that changed since a sync token.
 *
 *  A `410` means the token is too old to be useful, which is not an error: the
 *  answer is a full re-read, and the caller is told by a null token rather than
 *  a throw it would have to interpret. */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  options: { syncToken?: string | null; timeMin?: Date; timeMax?: Date }
): Promise<EventPage | "resync"> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
    if (options.syncToken) params.set("syncToken", options.syncToken);
    else {
      if (options.timeMin) params.set("timeMin", options.timeMin.toISOString());
      if (options.timeMax) params.set("timeMax", options.timeMax.toISOString());
    }
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (response.status === 410) return "resync";
    if (response.status === 401) throw new GrantRevoked();
    if (!response.ok) throw new Error(`google events.list ${response.status}`);

    const body = (await response.json()) as {
      items?: Array<Record<string, unknown>>;
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    for (const item of body.items ?? []) {
      const organizer = (item["organizer"] ?? {}) as Record<string, unknown>;
      const start = whenOf(item["start"] as Record<string, unknown> | undefined);
      const end = whenOf(item["end"] as Record<string, unknown> | undefined);
      events.push({
        externalId: String(item["id"] ?? ""),
        seriesId: typeof item["recurringEventId"] === "string" ? item["recurringEventId"] : null,
        status: (item["status"] as GoogleEvent["status"]) ?? "confirmed",
        title: String(item["summary"] ?? "Untitled"),
        location: typeof item["location"] === "string" ? item["location"] : null,
        startsAt: start.at,
        endsAt: end.at,
        allDay: start.allDay,
        timezone: start.tz,
        organizedByMe: organizer["self"] === true,
        attendees: ((item["attendees"] as Array<Record<string, unknown>>) ?? []).map((a) => ({
          name: typeof a["displayName"] === "string" ? a["displayName"] : null,
          email: typeof a["email"] === "string" ? a["email"] : null,
          response: typeof a["responseStatus"] === "string" ? a["responseStatus"] : null,
        })),
      });
    }

    pageToken = body.nextPageToken;
    nextSyncToken = body.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

export interface EventDraft {
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  timezone?: string | null;
  location?: string | null;
  attendees?: string[];
  /** RRULE lines, as Google takes them. */
  recurrence?: string[] | null;
}

function bodyFor(draft: EventDraft): Record<string, unknown> {
  const when = (at: Date) =>
    draft.allDay
      ? { date: at.toISOString().slice(0, 10) }
      : { dateTime: at.toISOString(), ...(draft.timezone ? { timeZone: draft.timezone } : {}) };

  return {
    summary: draft.title,
    start: when(draft.startsAt),
    end: when(draft.endsAt),
    ...(draft.location ? { location: draft.location } : {}),
    ...(draft.attendees?.length ? { attendees: draft.attendees.map((email) => ({ email })) } : {}),
    ...(draft.recurrence?.length ? { recurrence: draft.recurrence } : {}),
  };
}

async function call(
  accessToken: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) throw new GrantRevoked();
  // 404 and 410 on a delete mean it is already gone, which is the outcome the
  // caller wanted.
  if (method === "DELETE" && (response.status === 404 || response.status === 410)) return {};
  if (!response.ok) throw new Error(`google calendar ${method} ${response.status}`);
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export async function createEvent(
  accessToken: string,
  calendarId: string,
  draft: EventDraft,
  notify: boolean
): Promise<string> {
  const created = await call(
    accessToken,
    "POST",
    // sendUpdates decides whether Google mails the guests. It is driven by the
    // same fact the confirmation is: whether anybody else is going to find out.
    `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${notify ? "all" : "none"}`,
    bodyFor(draft)
  );
  return String(created["id"] ?? "");
}

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: Record<string, unknown>,
  notify: boolean
): Promise<void> {
  await call(
    accessToken,
    "PATCH",
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${notify ? "all" : "none"}`,
    patch
  );
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  notify: boolean
): Promise<void> {
  await call(
    accessToken,
    "DELETE",
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${notify ? "all" : "none"}`
  );
}

/** One occurrence, as Google holds it. Read before a write so the outward test
 *  can see who was already invited. */
export async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<{
  attendees: string[];
  seriesId: string | null;
  startsAt: Date | null;
  /** The series' own rule lines. Needed to end a series without inventing one:
   *  guessing FREQ=WEEKLY would rewrite a monthly event as a weekly one. */
  recurrence: string[];
} | null> {
  try {
    const event = await call(
      accessToken,
      "GET",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    );
    const start = event["start"] as Record<string, unknown> | undefined;
    const when = typeof start?.["dateTime"] === "string" ? String(start["dateTime"]) : null;
    return {
      attendees: ((event["attendees"] as Array<Record<string, unknown>>) ?? [])
        .map((a) => String(a["email"] ?? ""))
        .filter(Boolean),
      seriesId: typeof event["recurringEventId"] === "string" ? event["recurringEventId"] : null,
      startsAt: when ? new Date(when) : null,
      recurrence: Array.isArray(event["recurrence"])
        ? (event["recurrence"] as unknown[]).map(String)
        : [],
    };
  } catch (error) {
    // **Absent and unreadable are not the same answer**, and collapsing them
    // was a hole. `call` returns `{}` for a 404 on a delete and throws
    // otherwise, so anything reaching here is a failure to read rather than an
    // event that is not there. Returning null told the outward test there were
    // no attendees, which made an invited event look private and skipped the
    // confirmation. It throws now and the caller fails closed.
    throw error;
  }
}
