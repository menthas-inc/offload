"use client";

// Activity, from the browser. 024. The web sends nothing itself: browser push
// is a separate permission, transport and refusal state, and none of the four
// sends is worth opening it for. It reads the record and holds the same
// switches. 024's agenda read went with 027: Today reads `lib/today.ts`.

import { activityGlyph, activityTag, addUtcDays, dayIn, type ActivityKind } from "@offload/widgets";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export type { ActivityKind };

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  sent: boolean;
  reason: "setting" | "permission" | "design" | null;
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

export async function fetchActivity(cursor: string | null): Promise<{ rows: ActivityEntry[]; next: string | null } | null> {
  try {
    const response = await fetch(`${API}/v1/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { credentials: "include" });
    if (!response.ok) return null;
    return (await response.json()) as { rows: ActivityEntry[]; next: string | null };
  } catch {
    return null;
  }
}

export async function markActivitySeen(): Promise<void> {
  try {
    await fetch(`${API}/v1/activity/seen`, { method: "POST", credentials: "include" });
  } catch {
    // The dot is a hint; the next open reads it again.
  }
}

/** The glyph and the tag are the shared package's rule, the same one the
 *  phones draw from, so the two clients cannot drift on what a row looks like. */
export const glyphOf = activityGlyph;
export const tagOf = activityTag;

/** Where a row goes, or null for a row that is the record and nothing more.
 *  `zone` and `today` are the account's clock, for the evening digest's day. */
export function doorOf(row: ActivityEntry, zone: string | null = null, today: string = dayIn(new Date(), zone)): string | null {
  // 026. An email's row opens what landed: the row, the thread when several
  // landed there, or the email itself, which the web draws under the composer
  // on every page. A refused email opens the Mail block, which names the one
  // address that works.
  if (row.kind === "mail") {
    if (row.mailOutcome === "refused") return "/settings/apps";
    if (row.mailOutcome === "over_limit") return null;
    if (row.contentId) return `/content/${row.contentId}`;
    if (row.threadId) return `/threads/${row.threadId}`;
    return "/today";
  }
  if (!row.sent && row.reason !== "design") return "/settings/notifications";
  switch (row.kind) {
    // 2026-09-30: a digest opens Today, as its notification does. 027: the
    // evening one named tomorrow, so it opens that day, the row's own day in
    // the account's zone plus one, and Today once that day has come.
    case "digest": {
      if (row.send !== "evening") return "/today";
      const named = addUtcDays(dayIn(new Date(row.occurredAt), zone), 1);
      return named > today ? `/today?day=${named}` : "/today";
    }
    case "request":
      return "/settings/people";
    // 035. A ready copy opens where it is downloaded.
    case "export":
      return "/settings/privacy";
    case "share":
      // The invitation waits at the top of My threads, where its card opens.
      return "/threads";
    case "shared_activity":
    case "moved":
    case "acted":
    // 025. A sort opens the thread it sorted.
    case "labelled":
      return row.threadId ? `/threads/${row.threadId}` : null;
    default:
      return null;
  }
}

export type UndoOutcome = "undone" | "refused" | "failed";

/** 025. Undo on a labelled row: the sort taken back, for every member.
 *  Refused means it cannot happen, because another member undid it or its
 *  thirty days are over, so the row is drawn Undone rather than offered
 *  again. */
export async function undoActivity(id: string): Promise<UndoOutcome> {
  try {
    const response = await fetch(`${API}/v1/activity/${id}/undo`, { method: "POST", credentials: "include" });
    if (response.ok) return "undone";
    return response.status === 409 ? "refused" : "failed";
  } catch {
    return "failed";
  }
}
