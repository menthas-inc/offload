// 048. Hearing that something changed, on a phone.
//
// **Coming back is catching up.** The app returning to the foreground says
// everything changed, at once and with no connection at all, so a phone that
// was in a pocket is never stale for longer than it takes to look at it.
//
// **While it is in front, one stream says what changed**, ids and kinds only
// (`@offload/widgets` `live.ts`). React Native has no `EventSource` and its
// `fetch` does not stream, so the body is read by hand over `expo/fetch`,
// which ships in the `expo` package already in the binary: no store build.
// The cookie goes in a header, as `api.ts` sends it, never in the URL. The
// stream closes when the app leaves the foreground: a backgrounded phone holds
// no connection and catches up when it is opened.

import { AppState } from "react-native";
import { fetch } from "expo/fetch";
import { EVERYTHING, isFinal, type Changes } from "@offload/widgets";
import { API_URL, authHeaders } from "./api";
import { onSignedOut } from "./session-end";

const FIRST_WAIT_MS = 1000;
const LAST_WAIT_MS = 30_000;
/** A server's `all` is a recovery (a failed flush, a relisten) reaching every
 *  phone at once, so each waits a random part of this before it reads. */
const SPREAD_MS = 2000;

export interface Frame {
  event: string;
  data: string;
}

/** The whole frames in what has arrived, and the half frame to keep for the
 *  next chunk. A comment (`: keep-alive`) is no frame. */
export function frames(buffer: string): { frames: Frame[]; rest: string } {
  const parts = buffer.replace(/\r/g, "").split("\n\n");
  const rest = parts.pop() ?? "";
  const read: Frame[] = [];
  for (const part of parts) {
    let event = "";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (event) read.push({ event, data: data.join("\n") });
  }
  return { frames: read, rest };
}

/** Hear changes until the returned function is called or the session ends. */
export function openLive(onChanges: (changes: Changes) => void): () => void {
  let stream: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const later = new Set<ReturnType<typeof setTimeout>>();
  let wait = FIRST_WAIT_MS;
  // A ready after a reconnect: whatever changed in between was not heard.
  let missed = false;

  const stop = (): void => {
    stream?.abort();
    stream = null;
    if (retry) clearTimeout(retry);
    retry = null;
    for (const timer of later) clearTimeout(timer);
    later.clear();
  };

  const hear = (frame: Frame): void => {
    if (frame.event === "ready") {
      wait = FIRST_WAIT_MS;
      if (missed) onChanges(EVERYTHING);
      missed = false;
      return;
    }
    if (frame.event !== "changes") return;
    let changes: Changes;
    try {
      changes = JSON.parse(frame.data) as Changes;
    } catch {
      return;
    }
    if (!Array.isArray(changes?.kinds)) return;
    if (!changes.kinds.includes("all")) return onChanges(changes);
    const timer = setTimeout(() => {
      later.delete(timer);
      onChanges(changes);
    }, Math.random() * SPREAD_MS);
    later.add(timer);
  };

  const connect = async (): Promise<void> => {
    retry = null;
    const mine = new AbortController();
    stream = mine;
    try {
      const headers = await authHeaders();
      if (stream !== mine) return;
      // Signed out: nothing to hear until somebody signs in, which opens it again.
      if (!headers["cookie"]) {
        stream = null;
        return;
      }
      const response = await fetch(`${API_URL}/v1/changes`, {
        headers: { ...headers, accept: "text/event-stream" },
        signal: mine.signal,
      });
      const reader = response.ok ? response.body?.getReader() : undefined;
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        if (!reader) break;
        const { done, value } = await reader.read();
        if (done || stream !== mine) break;
        const read = frames(buffer + decoder.decode(value, { stream: true }));
        buffer = read.rest;
        read.frames.forEach(hear);
      }
    } catch {
      // Dropped, refused or aborted: the same as an end.
    }
    if (stream !== mine) return;
    stream = null;
    missed = true;
    retry = setTimeout(() => void connect(), wait);
    wait = Math.min(wait * 2, LAST_WAIT_MS);
  };

  const begin = (): void => {
    wait = FIRST_WAIT_MS;
    missed = false;
    void connect();
  };

  const sub = AppState.addEventListener("change", (state) => {
    if (state !== "active") return stop();
    onChanges(EVERYTHING);
    if (!stream && !retry) begin();
  });
  if (AppState.currentState !== "background") begin();

  const close = (): void => {
    stop();
    sub.remove();
    forget();
  };
  const forget = onSignedOut(close);
  return close;
}

// ------------------------------------------------- the conversation (M3)

/** The tail's turns this screen does not hold, or null when the tail is
 *  another conversation (the thirty minute rule), which leaves the screen
 *  alone. Matched on the turn's id, which a sent message and its reply share
 *  on every path: the phone names its own live reply `<messageId>-reply`, and
 *  the tail has the reply's real id. An empty screen takes the whole tail, as
 *  a reload would. */
export function elsewhereOf<T extends { turnId?: string | undefined }>(shown: readonly T[], tail: readonly T[]): T[] | null {
  const held = new Set(shown.map((turn) => turn.turnId).filter(Boolean));
  if (shown.length > 0 && !tail.some((turn) => held.has(turn.turnId))) return null;
  return tail.filter((turn) => !held.has(turn.turnId));
}

/** The questions as the tail has them, on the turns this screen holds: a
 *  question answered on another device goes here too. A turn the tail does
 *  not hold, such as a reply drawn under its live id, is left alone. */
export function questionsFrom<T extends { id: string; question?: unknown }>(shown: readonly T[], tail: readonly { id: string; question?: unknown }[]): T[] {
  const asked = new Map(tail.map((turn) => [turn.id, turn.question ?? null]));
  return shown.map((turn) => (asked.has(turn.id) && asked.get(turn.id) !== (turn.question ?? null) ? { ...turn, question: asked.get(turn.id) } : turn));
}

/** A dump from another device whose answer has not landed. */
export function outElsewhere(turn: { from: string; elsewhere?: boolean | undefined; state?: string | undefined }): boolean {
  return turn.elsewhere === true && turn.from === "you" && turn.state !== undefined && !isFinal(turn.state);
}
