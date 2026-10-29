// 048. Who hears about a change.
//
// The triggers in `0096_live_changes.sql` say `kind:id` on `offload_change`
// for every write a screen can see. This turns those into one `changes` event
// per account with a connection open, on a fixed half-second clock.
//
// **Resolved at delivery, never cached.** A `thread` change goes to whoever is
// an accepted member of that thread when the event goes out, read in one query
// bounded by the accounts watching. A connection never holds a list of its
// threads: a cached list is the obvious way to keep telling somebody about a
// thread they were taken out of (OFF-3, SEC-2). Every other kind names its
// account already.
//
// **A fixed clock, not a debounce**, so the connection never says when a
// member did something more finely than half a second (feature spec, Who hears
// what), and a burst of writes is one event.
//
// **Nothing is stored.** The buffer is memory, cleared on every flush. A
// connection that missed something reads again when it comes back.

import { sql } from "kysely";
import type { ChangeKind, Changes } from "@offload/widgets";
import { db } from "../db.js";
import { ensureListening, isListening, onChange } from "../dumps/answers.js";

export interface Live {
  send: (changes: Changes) => void;
  close: () => void;
}

/** A phone and three tabs. Opening a fifth closes the oldest.
 *  shortcut: counted per process, not across replicas; make it a shared count
 *  when the Core API runs more than one replica. */
export const MAX_PER_ACCOUNT = 4;
export const TICK_MS = 500;

const EVERYTHING: Changes = { kinds: ["all"] };

const connections = new Map<string, Live[]>();

let threads = new Set<string>();
let byAccount = new Map<string, Set<ChangeKind>>();
let removed = new Map<string, Set<string>>();

let clock: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let retryAt = 0;
let backoff = 1000;
let wasListening = false;
let flushing = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Take one payload off the channel. Anything unexpected is dropped: one bad
 *  id would fail the membership read's uuid cast for everybody in the tick. */
function heard(payload: string): void {
  const [kind, id, account] = payload.split(":");
  if (!id || !UUID.test(id) || (account !== undefined && !UUID.test(account))) return;
  if (kind === "thread") threads.add(id);
  else if (kind === "removed" && account) {
    const ids = removed.get(account) ?? new Set<string>();
    removed.set(account, ids.add(id));
  } else if (kind === "invitation" || kind === "conversation" || kind === "memories" || kind === "people" || kind === "activity" || kind === "today") {
    const kinds = byAccount.get(id) ?? new Set<ChangeKind>();
    byAccount.set(id, kinds.add(kind));
  }
}

function broadcast(changes: Changes): void {
  for (const lives of connections.values()) for (const live of lives) live.send(changes);
}

type MembersRead = (threadIds: string[], accountIds: string[]) => Promise<{ thread_id: string; account_id: string }[]>;

const membersOf: MembersRead = async (threadIds, accountIds) => {
  const { rows } = await sql<{ thread_id: string; account_id: string }>`
    select thread_id, account_id from thread_members
     where thread_id = any(${threadIds}::uuid[])
       and account_id = any(${accountIds}::uuid[])
       and state = 'accepted'`.execute(db);
  return rows;
};

/** Send what the buffer holds. Exported so tests can run the tick by hand;
 *  `read` is the membership read, replaceable so a test can make it fail. */
export async function flush(read: MembersRead = membersOf): Promise<void> {
  // One at a time. A read slower than the tick would otherwise start a second
  // against a pool that is already slow; what arrives meanwhile waits for the
  // next tick in the buffer.
  if (flushing) return;
  flushing = true;
  try {
    await send(read);
  } finally {
    flushing = false;
  }
}

async function send(read: MembersRead): Promise<void> {
  const pending = { threads, byAccount, removed };
  threads = new Set();
  byAccount = new Map();
  removed = new Map();

  const watching = [...connections.keys()];
  if (watching.length === 0) return;

  const out = new Map<string, { kinds: Set<ChangeKind>; threads: Set<string>; removed: Set<string> }>();
  const to = (account: string) => {
    let entry = out.get(account);
    if (!entry) out.set(account, (entry = { kinds: new Set(), threads: new Set(), removed: new Set() }));
    return entry;
  };

  if (pending.threads.size > 0) {
    let rows: Awaited<ReturnType<MembersRead>>;
    try {
      rows = await read([...pending.threads], watching);
    } catch {
      // Unable to say who, so say nothing about which: every screen reads
      // again, and no id goes anywhere it might not belong. What is already
      // addressed to an account, a removal above all, still goes below.
      broadcast(EVERYTHING);
      rows = [];
    }
    for (const row of rows) {
      const entry = to(row.account_id);
      entry.kinds.add("thread");
      entry.threads.add(row.thread_id);
    }
  }
  for (const [account, kinds] of pending.byAccount) {
    if (!connections.has(account)) continue;
    for (const kind of kinds) to(account).kinds.add(kind);
  }
  for (const [account, ids] of pending.removed) {
    if (!connections.has(account)) continue;
    const entry = to(account);
    entry.kinds.add("removed");
    for (const id of ids) entry.removed.add(id);
  }

  for (const [account, entry] of out) {
    const changes: Changes = { kinds: [...entry.kinds] };
    if (entry.threads.size > 0) changes.threads = [...entry.threads];
    if (entry.removed.size > 0) changes.removed = [...entry.removed];
    for (const live of connections.get(account) ?? []) live.send(changes);
  }
}

/** Keep listening while anybody is watching. `answers.ts` connects only when
 *  a waiter asks, so after a drop with no dump out nothing else would. Every
 *  time it is back, everybody reads again: what was said in between is lost. */
async function keepListening(): Promise<void> {
  if (isListening()) return;
  const now = Date.now();
  if (now < retryAt) return;
  try {
    await ensureListening();
    backoff = 1000;
    if (wasListening) broadcast(EVERYTHING);
    wasListening = true;
  } catch {
    retryAt = now + backoff;
    backoff = Math.min(backoff * 2, 30_000);
  }
}

function tick(): void {
  void keepListening()
    .then(() => flush())
    .catch(() => undefined);
}

/** Register a connection. Returns the detach the caller must call when the
 *  stream ends, or the entry outlives the socket. */
export async function attach(accountId: string, live: Live): Promise<() => void> {
  unsubscribe ??= onChange(heard);
  await ensureListening();
  wasListening = true;
  clock ??= setInterval(tick, TICK_MS);

  const lives = connections.get(accountId) ?? [];
  lives.push(live);
  connections.set(accountId, lives);
  while (lives.length > MAX_PER_ACCOUNT) lives.shift()?.close();

  return () => {
    const current = connections.get(accountId);
    if (!current) return;
    const at = current.indexOf(live);
    if (at >= 0) current.splice(at, 1);
    if (current.length === 0) connections.delete(accountId);
    // Nobody watching: stop hearing as well as flushing, or a night of writes
    // collects in the buffer and becomes one wide read when somebody opens.
    if (connections.size === 0) {
      if (clock) clearInterval(clock);
      clock = null;
      unsubscribe?.();
      unsubscribe = null;
      threads = new Set();
      byAccount = new Map();
      removed = new Map();
    }
  };
}

/** How many connections are open, for one account or all. */
export function openCount(accountId?: string): number {
  if (accountId) return connections.get(accountId)?.length ?? 0;
  let total = 0;
  for (const lives of connections.values()) total += lives.length;
  return total;
}

/** How many ids are waiting for the next flush, for tests. */
export const buffered = (): number => threads.size + byAccount.size + removed.size;

/** For tests and shutdown. */
export function stopHub(): void {
  if (clock) clearInterval(clock);
  clock = null;
  unsubscribe?.();
  unsubscribe = null;
  connections.clear();
  threads = new Set();
  byAccount = new Map();
  removed = new Map();
  wasListening = false;
}
