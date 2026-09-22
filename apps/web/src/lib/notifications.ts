"use client";

// Activity and the agenda, from the browser. 024. The web sends nothing
// itself: browser push is a separate permission, transport and refusal
// state, and none of the four sends is worth opening it for. It reads the
// record and the agenda, and holds the same switches.

import type { ContentRow } from "./threads";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export type ActivityKind = "digest" | "request" | "share" | "shared_activity" | "expired" | "moved" | "acted";

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
  occurredAt: string;
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

export interface AgendaRow extends ContentRow {
  /** The thread the row lives in, where its modal and Undo are. */
  threadId: string;
  threadName: string;
}

export interface Agenda {
  overdue: AgendaRow[];
  today: AgendaRow[];
  tomorrow: AgendaRow[];
  overdueMore: number;
  everDumped: boolean;
}

export async function fetchToday(): Promise<Agenda | null> {
  try {
    const response = await fetch(`${API}/v1/today`, { credentials: "include" });
    if (!response.ok) return null;
    return (await response.json()) as Agenda;
  } catch {
    return null;
  }
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

export function tagOf(row: ActivityEntry): { label: string; tone: "noticed" | "quiet" } | null {
  if (row.sent) return null;
  return { label: "Not sent", tone: row.reason === "design" ? "quiet" : "noticed" };
}

/** Where a row goes, or null for a row that is the record and nothing more. */
export function doorOf(row: ActivityEntry): string | null {
  if (!row.sent && row.reason !== "design") return "/settings/notifications";
  switch (row.kind) {
    case "request":
      return "/settings/people";
    case "share":
      // The invitation waits at the top of My threads, where its card opens.
      return "/threads";
    case "shared_activity":
    case "moved":
    case "acted":
      return row.threadId ? `/threads/${row.threadId}` : null;
    default:
      return null;
  }
}
