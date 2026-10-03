"use client";

// One way to read the admin API, so every page has the same three states.
//
// A page is loading, or its read failed, or it has data and says when it was
// read. A failed read is never drawn as an empty list (034, section 0.1), and
// a refresh that fails leaves what was on screen where it was.
//
// A fourth, for the one page that is about a single record: `missing`, a 404.
// Trying again cannot bring it back, so it is not a failure with a retry. A
// caller asks for it by name; to every other caller a 404 is a failed read,
// which is why no page has a state it does not draw. The same caller is told
// when the record was here and is gone (a 410), with what the server says of
// it: that is `missing` too, with `gone` filled in.

import { useCallback, useEffect, useRef, useState } from "react";

export const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export interface AdminRead<T, Also extends string = never> {
  data: T | null;
  state: "loading" | "failed" | "ready" | Also;
  /** When what is on screen was read. */
  asOf: Date | null;
  /** What a 410 said, for a caller that asked to be told of `missing`. */
  gone: { deletedAt: string } | null;
  reload: () => void;
}

/** Read `/v1/admin<path>` with the session. Pass `null` to read nothing yet. */
export function useAdminRead<T>(path: string | null): AdminRead<T>;
export function useAdminRead<T>(path: string | null, options: { missing: true }): AdminRead<T, "missing">;
export function useAdminRead<T>(path: string | null, options?: { missing: true }): AdminRead<T, "missing"> {
  const tellMissing = options?.missing === true;
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<AdminRead<T, "missing">["state"]>("loading");
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [gone, setGone] = useState<{ deletedAt: string } | null>(null);
  // The newest request wins: a slow answer to an old path never lands on top
  // of a newer one.
  const latest = useRef(0);

  const load = useCallback(() => {
    if (path === null) return;
    const mine = ++latest.current;
    setState((current) => (current === "ready" ? "ready" : "loading"));
    fetch(`${API}/v1/admin${path}`, { credentials: "include" })
      .then(async (response) => {
        if ((response.status === 404 || response.status === 410) && tellMissing) {
          const said = response.status === 410 ? ((await response.json().catch(() => null)) as { deletedAt?: unknown } | null) : null;
          if (mine !== latest.current) return;
          setGone(typeof said?.deletedAt === "string" ? { deletedAt: said.deletedAt } : null);
          // What was on screen is about something that is no longer there.
          setData(null);
          setState("missing");
          return;
        }
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
  }, [path, tellMissing]);

  useEffect(load, [load]);

  return { data, state, asOf, gone, reload: load };
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
