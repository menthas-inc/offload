// The calendars Settings draws, on the phones.
//
// Same answers the web asks about a calendar, and the same first question: is
// this connector configured at all. With no credentials it is inert by design
// and the screen says so rather than offering Connect.
//
// 019: a calendar is approved or not, and that is the whole of what Settings
// says about one. Which thread reads it is the thread's question, asked from
// inside the thread; who can see it is Google's answer, kept as a count the
// screen never draws.

import { useCallback, useEffect, useState } from "react";
import { request } from "./api";
import { failed } from "./log";

export interface Calendar {
  id: string;
  /** Worded once on the server: the person's name for a primary calendar,
   *  Google's summary otherwise. */
  name: string;
  colour: string | null;
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

interface Payload {
  available: boolean;
  /** Every calendar write is put to the person first. One switch for the
   *  offload account. */
  askFirst: boolean;
  connections: Connection[];
}

export function useCalendars(): {
  loading: boolean;
  available: boolean;
  askFirst: boolean;
  connections: Connection[];
  reload: () => void;
  settle: (change: Settled) => void;
} {
  const [state, setState] = useState<{ loading: boolean } & Payload>({
    loading: true,
    available: false,
    askFirst: false,
    connections: [],
  });

  const reload = useCallback(() => {
    void (async () => {
      try {
        const data = await request<Payload>("/api/connectors/calendars");
        if (data) setState({ loading: false, ...data });
        else setState((prev) => ({ ...prev, loading: false }));
      } catch (error) {
        // A failure is not "no calendars". The screen keeps its last answer.
        failed("calendars.fetch", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    })();
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

export async function approveCalendar(id: string, selected: boolean): Promise<boolean> {
  try {
    return (
      (await request(`/api/connectors/calendars/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected }),
      })) !== null
    );
  } catch (error) {
    failed("calendars.update", error);
    return false;
  }
}

export async function setAskFirst(askFirst: boolean): Promise<boolean> {
  try {
    return (
      (await request("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarAskFirst: askFirst }),
      })) !== null
    );
  } catch (error) {
    failed("calendars.askFirst", error);
    return false;
  }
}

/** One answer since 019: the grant goes back to Google and the copy and the
 *  picks go with it. The screen confirms before calling this. */
export async function disconnect(id: string): Promise<boolean> {
  try {
    return (await request(`/api/connectors/${id}/disconnect`, { method: "POST" })) !== null;
  } catch (error) {
    failed("calendars.disconnect", error);
    return false;
  }
}

/** Answer a calendar write offload proposed but did not make.
 *
 *  **Nothing has reached Google until this returns.** The outward test is run
 *  again on the server against live state, because minutes may have passed and
 *  a calendar can be shared in them. */
export async function answerPending(
  id: string,
  answer: "confirm" | "decline",
): Promise<boolean> {
  try {
    return (
      (await request(`/api/calendar/pending/${id}/${answer}`, {
        method: "POST",
      })) !== null
    );
  } catch (error) {
    failed("calendar.pending", error);
    return false;
  }
}
