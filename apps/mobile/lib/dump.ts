// Sending a dump from a phone, and waiting for the answer.
//
// **The phone polls where the web streams.** `EventSource` is not in the React
// Native runtime, and the web's own `dump.ts` already calls the plain fetch
// "the one that cannot fail to arrive" and the stream "an optimisation over
// polling". So the phones ship on the thing the optimisation was optimising,
// and gain the stream when a polyfill is worth its weight.
//
// Numbers rather than "bounded", because nothing polls this route today: the
// web asks once per stream reconnect, the server is `pg_notify`-driven, and
// there is no rate limiter to catch an interval set too tight.

import { send } from "./api";
import { failed } from "./log";

export type MessageState = "queued" | "seen" | "answered" | "failed" | "partial";

export interface Sent {
  messageId: string;
  conversationId: string;
  state: MessageState;
  /** The undo unit. Carried from the send so the toast never has to ask. */
  turnId: string;
}

/** A thread a turn actually wrote to, from the content rows it produced rather
 *  than from parsing the reply, so a link can never point somewhere offload did
 *  not file anything. */
export interface TouchedThread {
  id: string;
  name: string;
}

export interface Answer {
  state: MessageState;
  reply: string | null;
  threads: TouchedThread[];
  /** Every thread whose contents the turn changed, a superset of `threads`.
   *  A move's source is here and not there: the screen has to reload it, and a
   *  pill saying the dump went there would be untrue. */
  changed: string[];
}

export interface TailMessage {
  id: string;
  role: "person" | "offload";
  text: string | null;
  state: MessageState;
  turnId: string;
}

export class DumpTooLong extends Error {
  constructor(readonly maxChars: number) {
    super("too long");
  }
}

/** How long the answer is worth waiting for, and how hard.
 *
 *  A second while the turn is live, which is what the web used before
 *  `pg_notify` and is comfortably inside how long a turn takes. After twenty
 *  misses it slows to five, because a turn still unanswered after twenty
 *  seconds is not about to be answered in the next one. */
const QUICK_MS = 1000;
const SLOW_MS = 5000;
const MISSES_BEFORE_SLOWING = 20;

const isFinal = (state: MessageState): boolean =>
  state === "answered" || state === "partial" || state === "failed";

/** Send it. The server stores it before anything else, so a resolved promise
 *  means the dump is safe even if nothing ever answers it. */
export async function sendDump(text: string, clientKey: string): Promise<Sent | null> {
  const { status, data } = await send<Sent>("/v1/dumps", {
    method: "POST",
    body: JSON.stringify({ text, clientKey }),
  });
  if (status === 413) throw new DumpTooLong(0);
  return data;
}

/** Ask once. */
export async function fetchAnswer(messageId: string): Promise<Answer | null> {
  const { data } = await send<{
    state: MessageState;
    reply: string | null;
    threads?: TouchedThread[];
    changed?: string[];
  }>(`/v1/messages/${messageId}`);
  if (!data) return null;
  return {
    state: data.state,
    reply: data.reply,
    threads: data.threads ?? [],
    changed: data.changed ?? [],
  };
}

/** Wait for the answer by asking, and stop asking when there is one.
 *
 *  Returns a cancel function, which the caller calls on unmount and when the
 *  app backgrounds. A poll left running behind a lock screen is a request every
 *  second that nobody is waiting for.
 */
export function awaitAnswer(
  messageId: string,
  onAnswer: (answer: Answer) => void
): { cancel: () => void; now: () => void } {
  let done = false;
  let misses = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    done = true;
    if (timer) clearTimeout(timer);
  };

  const ask = async (): Promise<void> => {
    if (done) return;
    const answer = await fetchAnswer(messageId);
    if (done) return;

    if (answer && isFinal(answer.state)) {
      stop();
      onAnswer(answer);
      return;
    }

    misses += 1;
    timer = setTimeout(
      () => void ask(),
      misses >= MISSES_BEFORE_SLOWING ? SLOW_MS : QUICK_MS
    );
  };

  void ask();

  return {
    cancel: stop,
    /** Ask right now rather than at the next tick. Called when the app comes
     *  back to the foreground: the answer may have landed while the poll was
     *  stopped, and waiting a full interval to notice is a visible delay
     *  between offload finishing and the screen saying so. */
    now: () => {
      if (done) return;
      if (timer) clearTimeout(timer);
      misses = 0;
      void ask();
    },
  };
}

/** The current conversation, so reopening the app does not look like a fresh
 *  account. */
export async function fetchCurrent(): Promise<TailMessage[]> {
  const { data } = await send<{ messages: TailMessage[] }>("/v1/conversations/current");
  return data?.messages ?? [];
}

/** Take back a whole turn: what you dumped, what offload filed, and what it
 *  said about it. */
export async function undoTurn(turnId: string): Promise<boolean> {
  const { data } = await send<{ undone: boolean }>(`/v1/turns/${turnId}/undo`, {
    method: "POST",
  });
  return data?.undone ?? false;
}

/** Finish a turn that stopped partway.
 *
 *  Not a re-send. The dump is still where it was and some of it is already
 *  filed; this asks offload to do the rest. */
export async function resumeDump(messageId: string): Promise<Sent | null> {
  const { data } = await send<Sent>(`/v1/dumps/${messageId}/resume`, { method: "POST" });
  return data;
}

/** End the current conversation, because somebody closed the sheet.
 *
 *  Fire and forget on purpose. Closing is instant on screen and must stay that
 *  way; if this never lands, the worst case is that the next dump joins the
 *  conversation somebody put away, which is what happened before it existed. */
export async function endConversation(): Promise<void> {
  try {
    await send<{ ended: boolean }>("/v1/conversations/current/end", { method: "POST" });
  } catch (error) {
    // A phone that was offline when somebody tidied the screen. The close has
    // already happened and there is nothing to say about it.
    failed("conversation.end", error);
  }
}
