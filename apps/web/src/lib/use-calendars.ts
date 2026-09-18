"use client";

// The calendars Settings draws, and the two answers you can give about one.
//
// **`available` is the first thing anything reads.** With no Google credentials
// configured the whole connector is inert by design, and a screen that offered
// Connect would be a button that cannot work. Same shape the Maps key already
// established.
//
// 019: a calendar is approved or not, and that is the whole of what Settings
// says about one. Which thread reads it is the thread's question, asked from
// inside the thread; who can see it is Google's answer, kept as a count the
// screen never draws.

import { useCallback, useEffect, useState } from "react";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export interface Calendar {
  id: string;
  /** Worded once on the server: the person's name for a primary calendar,
   *  Google's summary otherwise. */
  name: string;
  colour: string | null;
  /** Whether offload could write here at all. A calendar you can only read is
   *  listed and marked rather than hidden: knowing it is there is the point. */
  writable: boolean;
  /** Somebody else owns it. The note says so without naming them. */
  sharedWithYou: boolean;
  primary: boolean;
  /** Approved: offload may read it. Adds it to no thread. */
  selected: boolean;
}

export interface Connection {
  id: string;
  email: string;
  state: "active" | "needs_reauth" | "revoked";
  connectedAt: string;
  /** The grant lacks the sharing scope. Every calendar on it counts as more
   *  than one participant until they sign in again; nothing else stops. */
  needsScope: boolean;
  calendars: Calendar[];
}

export interface Calendars {
  status: "loading" | "ready";
  available: boolean;
  /** Every calendar write is put to the person first. One switch for the
   *  offload account. */
  askFirst: boolean;
  connections: Connection[];
}

export function useCalendars(): Calendars & { reload: () => void; settle: (change: Settled) => void } {
  const [state, setState] = useState<Calendars>({
    status: "loading",
    available: false,
    askFirst: false,
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

  // A change the server accepted is drawn now, not after the reload answers:
  // a tick that snaps back and then flips is a tick that looks refused.
  const settle = useCallback((change: Settled) => {
    setState((prev) =>
      "askFirst" in change
        ? { ...prev, askFirst: change.askFirst }
        : {
            ...prev,
            connections: prev.connections.map((connection) => ({
              ...connection,
              calendars: connection.calendars.map((calendar) =>
                calendar.id === change.calendarId ? { ...calendar, selected: change.selected } : calendar
              ),
            })),
          }
    );
  }, []);

  return { ...state, reload, settle };
}

type Settled = { calendarId: string; selected: boolean } | { askFirst: boolean };

/** Where connecting starts. A full page navigation rather than fetch, because
 *  the next thing that happens is Google's consent screen. */
export function connectUrl(landing: "settings" | "first-run"): string {
  return `${API}/api/connectors/google/start?landing=${landing}`;
}

export async function approveCalendar(id: string, selected: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/connectors/calendars/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selected }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function setAskFirst(askFirst: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ calendarAskFirst: askFirst }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** One answer since 019: the grant goes back to Google and the copy and the
 *  picks go with it. The pane confirms before calling this. */
export async function disconnect(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/connectors/${id}/disconnect`, {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}
