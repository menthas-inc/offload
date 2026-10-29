"use client";

// 048. Hearing that something changed, so an open screen can read itself
// again instead of showing what it held until a reload.
//
// Two halves, and the first needs no server: a tab that comes back reads
// everything, so a laptop that slept is stale only until somebody looks at it.
// The second is one EventSource on `/v1/changes`, which says what kind of thing
// changed and which threads, never what. The browser reconnects it on its own
// after the server ends it, and a reconnect is coming back too, since whatever
// changed while it was down was never heard.

import { EVERYTHING, type Changes } from "@offload/widgets";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

/** A server's `all` lands somewhere in this window. It is sent to every
 *  connection at once after a failed flush or a relisten, and every screen
 *  reading again in the same second would make the recovery a spike. */
const SPREAD_MS = 2_000;

/** A tab switch fires both visibility and focus. One read, not two. */
const BACK_MS = 1_000;

/** After the browser gives up on the stream for good, which it does on any
 *  answer but a 200 (a 502 mid-deploy), it is opened again from here. */
const RETRY_MS = 1_000;
const RETRY_MAX_MS = 30_000;

const open = new Set<() => void>();

/** Hear every change; returns the way to stop. */
export function openLive(onChanges: (changes: Changes) => void): () => void {
  let lastBack = -Infinity;
  const back = (): void => {
    if (document.visibilityState === "hidden" || Date.now() - lastBack < BACK_MS) return;
    lastBack = Date.now();
    onChanges(EVERYTHING);
  };
  document.addEventListener("visibilitychange", back);
  window.addEventListener("focus", back);

  const spread = new Set<ReturnType<typeof setTimeout>>();
  // `open` fires on every connect, the browser's own reconnects and ours, so
  // it is the reconnect signal rather than any frame the server sends.
  let connected = false;
  let wait = RETRY_MS;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let source: EventSource | null = null;
  const connect = (): void => {
    source = new EventSource(`${API}/v1/changes`, { withCredentials: true });
    source.addEventListener("open", () => {
      if (connected) onChanges(EVERYTHING);
      connected = true;
      wait = RETRY_MS;
    });
    source.addEventListener("error", () => {
      if (source?.readyState !== EventSource.CLOSED) return;
      retry = setTimeout(connect, wait);
      wait = Math.min(wait * 2, RETRY_MAX_MS);
    });
    source.addEventListener("changes", (event) => {
      let changes: Changes;
      try {
        changes = JSON.parse((event as MessageEvent<string>).data) as Changes;
      } catch {
        return;
      }
      if (!Array.isArray(changes?.kinds)) return;
      if (!changes.kinds.includes("all")) return onChanges(changes);
      const timer = setTimeout(() => {
        spread.delete(timer);
        onChanges(changes);
      }, Math.random() * SPREAD_MS);
      spread.add(timer);
    });
  };
  // No EventSource is the same as no connection: coming back still works.
  if (typeof EventSource !== "undefined") connect();

  const close = (): void => {
    open.delete(close);
    document.removeEventListener("visibilitychange", back);
    window.removeEventListener("focus", back);
    clearTimeout(retry);
    source?.close();
    for (const timer of spread) clearTimeout(timer);
    spread.clear();
  };
  open.add(close);
  return close;
}

/** Sign-out's half: the server ends the stream at its next session check, and
 *  this ends it now. */
export function closeLive(): void {
  for (const close of [...open]) close();
}
