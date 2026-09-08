"use client";

// The calendars Settings draws, and the three answers you can give about one.
//
// **`available` is the first thing anything reads.** With no Google credentials
// configured the whole connector is inert by design, and a screen that offered
// Connect would be a button that cannot work. Same shape the Maps key already
// established.

import { useCallback, useEffect, useState } from "react";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export interface Calendar {
  id: string;
  summary: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  /** Whether offload could write here at all. A calendar you can only read is
   *  listed and marked rather than hidden: knowing it is there is the point. */
  writable: boolean;
  isShared: boolean;
  isPrimary: boolean;
  selected: boolean;
  threadId: string | null;
}

export interface Connection {
  id: string;
  email: string;
  state: "active" | "needs_reauth" | "revoked";
  calendars: Calendar[];
}

export interface Calendars {
  status: "loading" | "ready";
  available: boolean;
  connections: Connection[];
}

export function useCalendars(): Calendars & { reload: () => void } {
  const [state, setState] = useState<Calendars>({
    status: "loading",
    available: false,
    connections: [],
  });

  const reload = useCallback(() => {
    void fetch(`${API}/api/connectors/calendars`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as Omit<Calendars, "status">;
        setState({ status: "ready", ...body });
      })
      .catch(() => {
        // A network failure is not "no calendars". The pane keeps its last
        // answer and a reload retries, rather than drawing an empty state that
        // says something untrue about somebody's account.
      });
  }, []);

  useEffect(reload, [reload]);

  return { ...state, reload };
}

/** Where connecting starts. A full page navigation rather than fetch, because
 *  the next thing that happens is Google's consent screen. */
export function connectUrl(landing: "settings" | "first-run"): string {
  return `${API}/api/connectors/google/start?landing=${landing}`;
}

export async function updateCalendar(
  id: string,
  patch: { selected?: boolean; isShared?: boolean; threadId?: string | null }
): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/connectors/calendars/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Disconnecting, and separately, removing what was filed. Two answers because
 *  only one of them destroys anything. */
export async function disconnect(id: string, removeFiled: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/connectors/${id}/disconnect`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ removeFiled }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
