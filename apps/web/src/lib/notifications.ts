"use client";

// Activity and the agenda, from the browser. 024. The web sends nothing
// itself: browser push is a separate permission, transport and refusal
// state, and none of the four sends is worth opening it for. It reads the
// record and the agenda, and holds the same switches.

import { activityGlyph, activityTag, type ActivityKind } from "@offload/widgets";
import type { ContentRow } from "./threads";

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
  /** 025. A labelled row's Undo is offered while this is true. */
  undoable: boolean;
  undone: boolean;
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
  /** 025. The labels the rows above carry, and only those. */
  threadLabels: { id: string; name: string; colour: number }[];
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

/** The glyph and the tag are the shared package's rule, the same one the
 *  phones draw from, so the two clients cannot drift on what a row looks like. */
export const glyphOf = activityGlyph;
export const tagOf = activityTag;

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
