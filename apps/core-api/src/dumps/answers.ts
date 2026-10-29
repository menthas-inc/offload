// Waiting for an answer without asking for it.
//
// **Polling was the wrong shape, and shrinking the interval only moved the
// cost.** At fifteen seconds a reply sat in the database while somebody watched
// a thinking indicator. At one second the answer arrives quickly and every open
// stream asks a question per second that is almost always answered "not yet".
//
// A duplex socket does not fix this either, and it is worth saying why, because
// it is the obvious next suggestion. WebSockets change how the server talks to
// the browser; they do nothing about how the server learns. The write happens in
// a different process, so a bidirectional pipe would leave this one polling the
// database exactly as before and pushing the result down a different kind of
// connection.
//
// The thing that has to stop polling is the server, and Postgres already offers
// it: `pg_notify` in the same transaction as the write, `LISTEN` here. The
// answer is pushed the instant it commits, nothing asks anything, and the
// existing SSE stream is untouched because it was never the problem.
//
// One connection for the whole process, not one per waiter. A dedicated client
// outside the pool, because a connection that is listening cannot be handed
// back to serve a query.

import pg from "pg";
import { env } from "../env.js";

/** The channel the Core API notifies on when a turn is written. */
export const ANSWER_CHANNEL = "offload_answer";

/** 048. The channel every write a screen can see notifies on, from the
 *  triggers in `0096_live_changes.sql`. Same connection, since a second one
 *  would be a second thing to keep alive for no gain. */
export const CHANGE_CHANNEL = "offload_change";

type Heard = (payload: string) => void;
const changeListeners = new Set<Heard>();

type Waiter = () => void;

const waiting = new Map<string, Set<Waiter>>();

let client: pg.Client | null = null;
let connecting: Promise<void> | null = null;

/** Wake everybody waiting on one message. */
function wake(messageId: string): void {
  const listeners = waiting.get(messageId);
  if (!listeners) return;
  // Copied before iterating: a waiter unsubscribes itself as it runs.
  for (const listener of [...listeners]) listener();
}

async function connect(): Promise<void> {
  const next = new pg.Client({ connectionString: env.DATABASE_URL });

  // A listener that dies silently is a product that hangs. A dropped connection
  // clears itself and wakes everybody currently waiting, so they re-read once:
  // re-reading is cheap and correct, and sleeping through a missed notification
  // is neither.
  const dropped = (): void => {
    client = null;
    connecting = null;
    for (const messageId of [...waiting.keys()]) wake(messageId);
  };
  next.on("error", dropped);
  // 048. A terminated backend can end the client with no error first, and the
  // hub reads `isListening` to know when to listen again.
  next.on("end", () => {
    if (client === next) dropped();
  });

  next.on("notification", (message) => {
    if (!message.payload) return;
    if (message.channel === ANSWER_CHANNEL) wake(message.payload);
    else if (message.channel === CHANGE_CHANNEL) for (const heard of changeListeners) heard(message.payload);
  });

  try {
    await next.connect();
    await next.query(`listen ${ANSWER_CHANNEL}`);
    await next.query(`listen ${CHANGE_CHANNEL}`);
  } catch (error) {
    // Connected and half listening is a connection nobody holds: close it, or
    // the hub's retries leak one per failure.
    await next.end().catch(() => undefined);
    throw error;
  }
  client = next;
}

/** Connect if nobody has. Exported for the live hub, which, unlike a waiter,
 *  has to listen again on its own after a drop: nothing else would call this
 *  while no dump is out. */
export async function ensureListening(): Promise<void> {
  if (client) return;
  connecting ??= connect().catch((error: unknown) => {
    connecting = null;
    throw error;
  });
  await connecting;
}

/** Wait until this message's turn is written, or until the caller gives up.
 *
 *  Returns an unsubscribe function. The caller must call it: a stream that goes
 *  away without unsubscribing leaves a closure in a map for the life of the
 *  process, which is the same leak as an EventSource nobody closes.
 */
export async function onAnswer(messageId: string, woken: Waiter): Promise<() => void> {
  await ensureListening();

  const listeners = waiting.get(messageId) ?? new Set<Waiter>();
  listeners.add(woken);
  waiting.set(messageId, listeners);

  return () => {
    const current = waiting.get(messageId);
    if (!current) return;
    current.delete(woken);
    if (current.size === 0) waiting.delete(messageId);
  };
}

/** Whether the connection is up. The hub reads it on its clock. */
export const isListening = (): boolean => client !== null;

/** 048. Hear every `offload_change` payload. Returns the unsubscribe. */
export function onChange(heard: Heard): () => void {
  changeListeners.add(heard);
  return () => changeListeners.delete(heard);
}

/** For tests and for shutdown. */
export async function stopListening(): Promise<void> {
  waiting.clear();
  const open = client;
  client = null;
  connecting = null;
  if (open) await open.end();
}

/** How many messages have somebody waiting on them. */
export const waiterCount = (): number => waiting.size;
