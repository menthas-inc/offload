// The calendars Settings draws, on the phones.
//
// Same three answers the web asks about a calendar, and the same first
// question: is this connector configured at all. With no credentials it is
// inert by design and the screen says so rather than offering Connect.

import { useCallback, useEffect, useState } from "react";
import { request } from "./api";
import { failed } from "./log";

export interface Calendar {
  id: string;
  summary: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
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

interface Payload {
  available: boolean;
  connections: Connection[];
}

export function useCalendars(): {
  loading: boolean;
  available: boolean;
  connections: Connection[];
  reload: () => void;
} {
  const [state, setState] = useState<{ loading: boolean } & Payload>({
    loading: true,
    available: false,
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

  return { ...state, reload };
}

export async function updateCalendar(
  id: string,
  patch: { selected?: boolean; isShared?: boolean; threadId?: string | null },
): Promise<boolean> {
  try {
    return (
      (await request(`/api/connectors/calendars/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })) !== null
    );
  } catch (error) {
    failed("calendars.update", error);
    return false;
  }
}

export async function disconnect(
  id: string,
  removeFiled: boolean,
): Promise<boolean> {
  try {
    return (
      (await request(`/api/connectors/${id}/disconnect`, {
        method: "POST",
        body: JSON.stringify({ removeFiled }),
      })) !== null
    );
  } catch (error) {
    failed("calendars.disconnect", error);
    return false;
  }
}
