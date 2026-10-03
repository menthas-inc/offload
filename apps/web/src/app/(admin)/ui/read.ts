"use client";

// One way to read the admin API, so every page has the same three states.
//
// A page is loading, or its read failed, or it has data and says when it was
// read. A failed read is never drawn as an empty list (034, section 0.1), and
// a refresh that fails leaves what was on screen where it was.

import { useCallback, useEffect, useRef, useState } from "react";

export const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export interface AdminRead<T> {
  data: T | null;
  state: "loading" | "failed" | "ready";
  /** When what is on screen was read. */
  asOf: Date | null;
  reload: () => void;
}

/** Read `/v1/admin<path>` with the session. Pass `null` to read nothing yet. */
export function useAdminRead<T>(path: string | null): AdminRead<T> {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<AdminRead<T>["state"]>("loading");
  const [asOf, setAsOf] = useState<Date | null>(null);
  // The newest request wins: a slow answer to an old path never lands on top
  // of a newer one.
  const latest = useRef(0);

  const load = useCallback(() => {
    if (path === null) return;
    const mine = ++latest.current;
    setState((current) => (current === "ready" ? "ready" : "loading"));
    fetch(`${API}/v1/admin${path}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as T;
        if (mine !== latest.current) return;
        setData(body);
        setAsOf(new Date());
        setState("ready");
      })
      .catch(() => {
        if (mine === latest.current) setState("failed");
      });
  }, [path]);

  useEffect(load, [load]);

  return { data, state, asOf, reload: load };
}

/** A write to `/v1/admin<path>`. The caller reads the status: a failed write
 *  puts the screen back and says what did not happen. */
export function adminWrite(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<Response> {
  return fetch(`${API}/v1/admin${path}`, {
    method,
    credentials: "include",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}
