// Activity, the record the bell opens. 024.
//
// Everything offload told you, in order, plus what it decided quietly and
// never told you about. A row is what was sent or would have been, never
// re-rendered. What each row opens, and which glyph and tag it carries, is
// decided here once so the screen only draws.

import { activityGlyph, activityTag, addUtcDays, dayIn, type ActivityKind, type ActivityReason } from "@offload/widgets";
import { fetchActivity, markActivitySeen, send } from "./api";

export type { ActivityKind };
export type Reason = ActivityReason;

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
  /** 025. A labelled row's Undo is offered while this is true. 026: and a
   *  filed email's, for a day. */
  undoable: boolean;
  undone: boolean;
  occurredAt: string;
  /** 026. Which of the five an email row is, and the email it came from. */
  mailOutcome?: "filed" | "asked" | "nothing" | "refused" | "over_limit" | null;
  messageId?: string | null;
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

/** The glyph and the tag are the shared package's rule, the same one the
 *  web draws from, so the two clients cannot drift on what a row looks like. */
export const glyphOf = activityGlyph;
export const tagOf = activityTag;

export type Door =
  | { pathname: "/today"; params?: { day: string } }
  | { pathname: "/settings/notifications" }
  | { pathname: "/settings/people" }
  | { pathname: "/invitations/[memberId]"; params: { memberId: string } }
  | { pathname: "/threads/[id]"; params: { id: string } }
  | { pathname: "/today"; params?: { day: string } }
  | { pathname: "/settings/[page]"; params: { page: "mail" | "privacy" } };

/** Where a row goes, or null for a row that is the record and nothing more.
 *  A digest's words are what was said, not what is true now; its door is
 *  Today, which is. */
/** 027. Where the person is now: an evening digest opens on the day it
 *  named while that day is still ahead. */
export interface DoorContext {
  today: string;
  zone: string | null;
}

export function doorOf(row: ActivityEntry, at?: DoorContext): Door | null {
  // 026. An email's row opens the thread it filed into, or Today, where the
  // conversation holding the email is; a refused email opens the Mail page,
  // which names the one address that works.
  if (row.kind === "mail") {
    if (row.mailOutcome === "refused") return { pathname: "/settings/[page]", params: { page: "mail" } };
    if (row.mailOutcome === "over_limit") return null;
    if (row.mailOutcome === "filed" && row.threadId) return { pathname: "/threads/[id]", params: { id: row.threadId } };
    return { pathname: "/today" };
  }
  if (!row.sent && row.reason !== "design") return { pathname: "/settings/notifications" };
  switch (row.kind) {
    // 2026-09-30: a digest opens Today, as its notification does.
    case "digest": {
      // 027. The evening send named the day after it went out.
      const named = row.send === "evening" && at ? addUtcDays(dayIn(new Date(row.occurredAt), at.zone), 1) : null;
      return named && named > at!.today ? { pathname: "/today", params: { day: named } } : { pathname: "/today" };
    }
    case "request":
      return { pathname: "/settings/people" };
    // 035. A ready copy opens where it is downloaded.
    case "export":
      return { pathname: "/settings/[page]", params: { page: "privacy" } };
    case "share":
      return row.memberId ? { pathname: "/invitations/[memberId]", params: { memberId: row.memberId } } : null;
    case "shared_activity":
    case "moved":
    case "acted":
    // 025. A sort opens the thread it sorted.
    case "labelled":
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

export type UndoOutcome = "undone" | "refused" | "failed";

/** 025. Undo on a labelled row: the sort taken back, for every member.
 *  Refused means it cannot happen, because another member undid it or its
 *  thirty days are over, so the row is drawn Undone rather than offered
 *  again. */
export async function undoActivity(id: string): Promise<UndoOutcome> {
  const { status } = await send<{ undone: true }>(`/v1/activity/${id}/undo`, { method: "POST" });
  if (status >= 200 && status < 300) return "undone";
  return status === 409 ? "refused" : "failed";
}
