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

export type MessageState =
  | "queued"
  | "seen"
  | "answered"
  | "failed"
  /** offload stopped by accident. The composer offers Finish. */
  | "partial"
  /** Somebody stopped it. The composer offers nothing, because offering to undo
   *  their own decision is the product arguing with them. */
  | "cancelled";

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

/** A calendar write offload proposed and nobody has answered yet.
 *
 *  Only ever set on a write that reaches somebody else: guests, or a calendar
 *  the person has marked shared. A write nobody learns about just happens and
 *  carries the ordinary Undo instead. */
export interface WaitingOn {
  id: string;
  /** Who finds out, in the words the screen shows. */
  because: string;
}

/** One read from an answer: a thread, and the rows it holds.
 *
 *  Grouped by the server in the order it read them. Two subjects is two
 *  results, never one blended list, because which trip is which is most of the
 *  answer. */
export interface FoundResult {
  threadId: string;
  threadName: string;
  /** The read hit its page. The tail becomes the thread rather than a control
   *  that would expand into rows nobody fetched. */
  truncated: boolean;
  rows: FoundRow[];
}

export interface FoundRow {
  contentId: string;
  threadId: string;
  threadName: string;
  type: string;
  title: string;
  body: string | null;
  done: boolean;
}

/** 016. Where a fact in a turn came from. Two fields, and the omissions are the
 *  point: a provider's citation also carries the page's title and a quoted
 *  excerpt, and both are written by whoever owns the page. */
export interface Source {
  domain: string;
  url: string;
}

export interface Answer {
  state: MessageState;
  reply: string | null;
  threads: TouchedThread[];
  sources: Source[];
  /** Every thread whose contents the turn changed, a superset of `threads`.
   *  A move's source is here and not there: the screen has to reload it, and a
   *  pill saying the dump went there would be untrue. */
  changed: string[];
  waiting?: WaitingOn | null;
  /** What an answer showed. Empty on a dump, which files rather than answers.
   *
   *  Resolved by the server on every read, so a row ticked or deleted elsewhere
   *  is never stale inside a reply from last week. */
  found?: FoundResult[];
}

export interface TailMessage {
  id: string;
  role: "person" | "offload";
  text: string | null;
  state: MessageState;
  turnId: string;
  waiting?: WaitingOn | null;
  found?: FoundResult[];
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
/** @param threadId The thread on screen, if any. A filing default, not a
 *  destination: the server checks membership and the prompt lets the words
 *  override it. */
export async function sendDump(
  text: string,
  clientKey: string,
  threadId?: string,
): Promise<Sent | null> {
  const { status, data } = await send<Sent>("/v1/dumps", {
    method: "POST",
    body: JSON.stringify({ text, clientKey, ...(threadId ? { threadId } : {}) }),
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
    sources?: Source[];
    changed?: string[];
    waiting?: WaitingOn | null;
    // **The rows, which this used to drop on the floor.** `awaitAnswer` is the
    // only way an open app learns its turn is done, so leaving `found` out of
    // the parsed shape meant every answer rendered its sentence and none of its
    // rows. It looked like the server finding nothing, and it came back after a
    // force quit because the cold start reads `fetchCurrent` instead.
    found?: FoundResult[];
  }>(`/v1/messages/${messageId}`);
  if (!data) return null;
  return {
    state: data.state,
    reply: data.reply,
    threads: data.threads ?? [],
    sources: data.sources ?? [],
    changed: data.changed ?? [],
    waiting: data.waiting ?? null,
    found: data.found ?? [],
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
