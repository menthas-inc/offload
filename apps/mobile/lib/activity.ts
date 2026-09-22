// Activity, the record the bell opens. 024.
//
// Everything offload told you, in order, plus what it decided quietly and
// never told you about. A row is what was sent or would have been, never
// re-rendered. What each row opens, and which glyph and tag it carries, is
// decided here once so the screen only draws.

import { fetchActivity, markActivitySeen } from "./api";

export type ActivityKind = "digest" | "request" | "share" | "shared_activity" | "expired" | "moved" | "acted";
export type Reason = "setting" | "permission" | "design";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  sent: boolean;
  reason: Reason | null;
  title: string;
  body: string | null;
  send: "morning" | "evening" | null;
  threadId: string | null;
  contentId: string | null;
  memberId: string | null;
  requestId: string | null;
  occurredAt: string;
}

export interface ActivityPage {
  rows: ActivityEntry[];
  next: string | null;
}

export async function loadActivity(cursor: string | null): Promise<ActivityPage | null> {
  return fetchActivity<ActivityPage>(cursor);
}

export async function seen(): Promise<void> {
  await markActivitySeen();
}

/** The kind's glyph: the two digests by their hour of day, people by the
 *  faces, a moved date by the calendar, a verb by its tick, an expiry by the
 *  cross, and a switch that silenced something by the bell. */
export function glyphOf(row: ActivityEntry): string {
  if (row.kind === "digest") {
    if (!row.sent && row.reason !== "design") return "bell";
    return row.send === "evening" ? "moon" : "sunrise";
  }
  if (row.kind === "moved") return "calendar";
  if (row.kind === "acted") return "check";
  if (row.kind === "expired") return "x";
  return "users";
}

/** Not sent is a fact, not an apology. Noticed where a setting or the
 *  permission caused it, and that row is a door to the setting; quiet where
 *  the product chose silence by design, and those rows are not doors. */
export function tagOf(row: ActivityEntry): { label: string; tone: "noticed" | "quiet" } | null {
  if (row.sent) return null;
  return { label: "Not sent", tone: row.reason === "design" ? "quiet" : "noticed" };
}

export type Door =
  | { pathname: "/settings/notifications" }
  | { pathname: "/settings/people" }
  | { pathname: "/invitations/[memberId]"; params: { memberId: string } }
  | { pathname: "/threads/[id]"; params: { id: string } };

/** Where a row goes, or null for a row that is the record and nothing more:
 *  a digest holds what was said, not what is true now. */
export function doorOf(row: ActivityEntry): Door | null {
  if (!row.sent && row.reason !== "design") return { pathname: "/settings/notifications" };
  switch (row.kind) {
    case "request":
      return { pathname: "/settings/people" };
    case "share":
      return row.memberId ? { pathname: "/invitations/[memberId]", params: { memberId: row.memberId } } : null;
    case "shared_activity":
    case "moved":
    case "acted":
      return row.threadId ? { pathname: "/threads/[id]", params: { id: row.threadId } } : null;
    default:
      return null;
  }
}

/** Today, Yesterday, Earlier: by the day the row happened, in the zone the
 *  screen draws in. */
export function sectionOf(occurredAt: string, today: string, yesterday: string, dayOf: (iso: string) => string): "Today" | "Yesterday" | "Earlier" {
  const day = dayOf(occurredAt);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return "Earlier";
}

/** The time on a row: the clock today and yesterday, the weekday before. */
export function whenOf(occurredAt: string, section: "Today" | "Yesterday" | "Earlier", zone: string | null, locale?: string): string {
  const at = new Date(occurredAt);
  if (section === "Earlier") return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: zone ?? undefined }).format(at);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone ?? undefined }).format(at);
}
