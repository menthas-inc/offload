// Connections: finding somebody, asking, answering, ending it.
//
// Every write here is outward facing under OFF-6, confirmed by the control
// that calls it and undoable by nothing, because the other person's screen
// changes too. What this file guarantees instead is that the other person's
// screen changes in exactly the way the feature spec says and no more: a
// decline looks like silence, a block looks like silence, and a request that
// was never delivered looks, to the person who sent it, like every other.

import { sql } from "kysely";
import { db } from "../db.js";
import { initialsOf } from "../accounts/initials.js";
import { blockedEitherWay, connected, pairOf, relationOf, type Executor, type Relation } from "./access.js";

/** Thirty an hour. The lookup answers whether an address has an account,
 *  which is a question worth bounding however honest the answer. */
export const LOOKUPS_PER_HOUR = 30;
/** Every response to the lookup takes at least this long, hit or miss. */
export const LOOKUP_FLOOR_MS = 250;
export const REQUESTS_OUTSTANDING = 50;
export const REQUEST_DAYS = 30;
/** The same person may be asked again this long after the last request. */
export const REASK_DAYS = 7;

export interface Person {
  accountId: string;
  displayName: string | null;
  initials: string;
}

export function personOf(row: { id: string; display_name: string | null }): Person {
  return { accountId: row.id, displayName: row.display_name, initials: initialsOf(row.display_name ?? "") };
}

/** A pending request between two people, in one direction, still open. */
async function openRequest(fromId: string, toId: string, trx: Executor) {
  return trx
    .selectFrom("connection_requests")
    .select(["id", "created_at", "delivered"])
    .where("from_account_id", "=", fromId)
    .where("to_account_id", "=", toId)
    .where("accepted_at", "is", null)
    .where("withdrawn_at", "is", null)
    .where("expires_at", ">", sql<Date>`now()`)
    .executeTakeFirst();
}

export type LookupRelation = "none" | "you" | "connected" | "you_asked" | "asked_you";

export interface Found extends Person {
  email: string;
  relation: LookupRelation;
  requestId: string | null;
  since: Date | null;
}

export class RateLimited extends Error {}

/** One address, exactly and case-insensitively, one account or none.
 *
 *  Blocked in either direction is nothing, since "no offload account for
 *  that" is the one answer that tells a blocked person nothing. The lookup is
 *  counted before it is answered, so a refused one still counts. */
export async function lookup(viewerId: string, email: string): Promise<Found | null> {
  const recent = await db
    .selectFrom("people_lookups")
    .select(({ fn }) => fn.countAll<string>().as("n"))
    .where("account_id", "=", viewerId)
    .where("looked_up_at", ">", sql<Date>`now() - interval '1 hour'`)
    .executeTakeFirstOrThrow();
  if (Number(recent.n) >= LOOKUPS_PER_HOUR) throw new RateLimited();
  await db.insertInto("people_lookups").values({ account_id: viewerId }).execute();

  const row = await db
    .selectFrom("accounts")
    .select(["id", "display_name", "email"])
    .where(sql`lower(email)`, "=", email.trim().toLowerCase())
    .where("state", "=", "active")
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!row) return null;
  if (row.id === viewerId) return { ...personOf(row), email: row.email, relation: "you", requestId: null, since: null };
  if (await blockedEitherWay(viewerId, row.id)) return null;
  if (await connected(viewerId, row.id)) {
    return { ...personOf(row), email: row.email, relation: "connected", requestId: null, since: null };
  }
  const asked = await openRequest(viewerId, row.id, db);
  if (asked) return { ...personOf(row), email: row.email, relation: "you_asked", requestId: asked.id, since: asked.created_at };
  const askedYou = await openRequest(row.id, viewerId, db);
  if (askedYou?.delivered) {
    return { ...personOf(row), email: row.email, relation: "asked_you", requestId: askedYou.id, since: askedYou.created_at };
  }
  return { ...personOf(row), email: row.email, relation: "none", requestId: null, since: null };
}

export type RequestRefusal = "not_found" | "yourself" | "connected" | "pending" | "asked_you" | "too_soon" | "too_many";

/** Ask. Written even when the target has blocked the asker, undelivered, so
 *  the asker's side is indistinguishable from any other request. */
export async function request(
  fromId: string,
  toId: string,
): Promise<{ ok: true; requestId: string; since: Date } | { ok: false; error: RequestRefusal; requestId?: string }> {
  return db.transaction().execute(async (trx) => {
    if (fromId === toId) return { ok: false as const, error: "yourself" as const };
    const target = await trx
      .selectFrom("accounts")
      .select("id")
      .where("id", "=", toId)
      .where("state", "=", "active")
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!target) return { ok: false as const, error: "not_found" as const };
    // Blocked by the asker: they cannot see the person, so not found. Blocked
    // by the target: written, undelivered, below.
    const blockedByAsker = await trx
      .selectFrom("blocks")
      .select("blocker_account_id")
      .where("blocker_account_id", "=", fromId)
      .where("blocked_account_id", "=", toId)
      .executeTakeFirst();
    if (blockedByAsker) return { ok: false as const, error: "not_found" as const };
    if (await connected(fromId, toId, trx)) return { ok: false as const, error: "connected" as const };
    const mine = await openRequest(fromId, toId, trx);
    if (mine) return { ok: false as const, error: "pending" as const, requestId: mine.id };
    const theirs = await openRequest(toId, fromId, trx);
    if (theirs?.delivered) return { ok: false as const, error: "asked_you" as const, requestId: theirs.id };
    const recent = await trx
      .selectFrom("connection_requests")
      .select("id")
      .where("from_account_id", "=", fromId)
      .where("to_account_id", "=", toId)
      .where("created_at", ">", sql<Date>`now() - make_interval(days => ${REASK_DAYS})`)
      .executeTakeFirst();
    if (recent) return { ok: false as const, error: "too_soon" as const };
    const outstanding = await trx
      .selectFrom("connection_requests")
      .select(({ fn }) => fn.countAll<string>().as("n"))
      .where("from_account_id", "=", fromId)
      .where("accepted_at", "is", null)
      .where("withdrawn_at", "is", null)
      .where("expires_at", ">", sql<Date>`now()`)
      .executeTakeFirstOrThrow();
    if (Number(outstanding.n) >= REQUESTS_OUTSTANDING) return { ok: false as const, error: "too_many" as const };

    const blockedByTarget = await trx
      .selectFrom("blocks")
      .select("blocker_account_id")
      .where("blocker_account_id", "=", toId)
      .where("blocked_account_id", "=", fromId)
      .executeTakeFirst();
    const row = await trx
      .insertInto("connection_requests")
      .values({
        from_account_id: fromId,
        to_account_id: toId,
        delivered: blockedByTarget === undefined,
        expires_at: sql`now() + make_interval(days => ${REQUEST_DAYS})`,
      })
      .returning(["id", "created_at"])
      .executeTakeFirstOrThrow();
    return { ok: true as const, requestId: row.id, since: row.created_at };
  });
}

/** Accept: the pair, once, and any request the other way is moot. */
export async function accept(accountId: string, requestId: string): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("connection_requests")
      .select(["id", "from_account_id"])
      .where("id", "=", requestId)
      .where("to_account_id", "=", accountId)
      .where("delivered", "=", true)
      .where("accepted_at", "is", null)
      .where("withdrawn_at", "is", null)
      .where("expires_at", ">", sql<Date>`now()`)
      .executeTakeFirst();
    if (!row) return false;
    await trx
      .insertInto("connections")
      .values(pairOf(accountId, row.from_account_id))
      .onConflict((oc) => oc.columns(["account_a", "account_b"]).doNothing())
      .execute();
    await trx.updateTable("connection_requests").set({ accepted_at: sql`now()` }).where("id", "=", row.id).execute();
    await trx
      .updateTable("connection_requests")
      .set({ withdrawn_at: sql`now()` })
      .where("from_account_id", "=", accountId)
      .where("to_account_id", "=", row.from_account_id)
      .where("accepted_at", "is", null)
      .where("withdrawn_at", "is", null)
      .execute();
    return true;
  });
}

/** Not now. The card goes; the row stays open for the asker. */
export async function dismiss(accountId: string, requestId: string): Promise<boolean> {
  const result = await db
    .updateTable("connection_requests")
    .set({ dismissed_at: sql`now()` })
    .where("id", "=", requestId)
    .where("to_account_id", "=", accountId)
    .where("delivered", "=", true)
    .where("accepted_at", "is", null)
    .where("withdrawn_at", "is", null)
    .where("expires_at", ">", sql<Date>`now()`)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** The asker's Withdraw. */
export async function withdraw(accountId: string, requestId: string): Promise<boolean> {
  const result = await db
    .updateTable("connection_requests")
    .set({ withdrawn_at: sql`now()` })
    .where("id", "=", requestId)
    .where("from_account_id", "=", accountId)
    .where("accepted_at", "is", null)
    .where("withdrawn_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Everything between two people except their thread memberships: the pair,
 *  open requests either way, and waiting shares either way. Remove and Block
 *  both do exactly this. */
async function sever(a: string, b: string, trx: Executor): Promise<boolean> {
  const pair = pairOf(a, b);
  const gone = await trx
    .deleteFrom("connections")
    .where("account_a", "=", pair.account_a)
    .where("account_b", "=", pair.account_b)
    .executeTakeFirst();
  await trx
    .updateTable("connection_requests")
    .set({ withdrawn_at: sql`now()` })
    .where((eb) =>
      eb.or([
        eb.and([eb("from_account_id", "=", a), eb("to_account_id", "=", b)]),
        eb.and([eb("from_account_id", "=", b), eb("to_account_id", "=", a)]),
      ]),
    )
    .where("accepted_at", "is", null)
    .where("withdrawn_at", "is", null)
    .execute();
  // A waiting share was a promise the connection made. `expired` is the
  // schema's word for a share that ended without an answer.
  await trx
    .updateTable("thread_members")
    .set({ state: "expired", responded_at: sql`now()`, preview: null })
    .where("state", "=", "pending")
    .where((eb) =>
      eb.or([
        eb.and([eb("invited_by", "=", a), eb("account_id", "=", b)]),
        eb.and([eb("invited_by", "=", b), eb("account_id", "=", a)]),
      ]),
    )
    .execute();
  return Number(gone.numDeletedRows) > 0;
}

/** Remove a connection. Memberships and keys untouched, nothing sent. */
export async function remove(accountId: string, otherId: string): Promise<boolean> {
  return db.transaction().execute((trx) => sever(accountId, otherId, trx));
}

/** Block: Remove with a memory. Not found when the person cannot be seen,
 *  since blocking somebody you have never met is a list of strangers. */
export async function block(accountId: string, otherId: string): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const relation = await relationOf(accountId, otherId, trx);
    if (relation === null || relation === "blocked") return relation === "blocked";
    await sever(accountId, otherId, trx);
    await trx
      .insertInto("blocks")
      .values({ blocker_account_id: accountId, blocked_account_id: otherId })
      .onConflict((oc) => oc.columns(["blocker_account_id", "blocked_account_id"]).doNothing())
      .execute();
    return true;
  });
}

export async function unblock(accountId: string, otherId: string): Promise<boolean> {
  const result = await db
    .deleteFrom("blocks")
    .where("blocker_account_id", "=", accountId)
    .where("blocked_account_id", "=", otherId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/** Open, delivered, unanswered: what dots the gear. */
export async function requestsWaiting(accountId: string, trx: Executor = db): Promise<number> {
  const row = await trx
    .selectFrom("connection_requests")
    .select(({ fn }) => fn.countAll<string>().as("n"))
    .where("to_account_id", "=", accountId)
    .where("delivered", "=", true)
    .where("accepted_at", "is", null)
    .where("withdrawn_at", "is", null)
    .where("dismissed_at", "is", null)
    .where("expires_at", ">", sql<Date>`now()`)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export interface RequestCard extends Person {
  id: string;
  since: Date;
}

export interface ConnectionRow extends Person {
  threads: { id: string; name: string }[];
  threadCount: number;
}

export interface PeoplePage {
  requestsForYou: RequestCard[];
  connections: ConnectionRow[];
  pending: RequestCard[];
  blocked: Person[];
  count: number;
}

/** The threads two accounts are both accepted members of, most recently
 *  active first. */
async function sharedThreads(a: string, b: string, trx: Executor) {
  return trx
    .selectFrom("thread_members as ma")
    .innerJoin("thread_members as mb", (join) =>
      join.onRef("mb.thread_id", "=", "ma.thread_id").on("mb.account_id", "=", b).on("mb.state", "=", "accepted"),
    )
    .innerJoin("threads", "threads.id", "ma.thread_id")
    .select(["threads.id as id", "threads.name as name", "threads.content_count as count", "threads.last_activity_at as lastActivityAt"])
    .where("ma.account_id", "=", a)
    .where("ma.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .orderBy("threads.last_activity_at", "desc")
    .execute();
}

export async function people(accountId: string): Promise<PeoplePage> {
  const cards = await db
    .selectFrom("connection_requests")
    .innerJoin("accounts", "accounts.id", "connection_requests.from_account_id")
    .select(["connection_requests.id as id", "connection_requests.created_at as since", "accounts.id as accountId", "accounts.display_name as display_name"])
    .where("connection_requests.to_account_id", "=", accountId)
    .where("connection_requests.delivered", "=", true)
    .where("connection_requests.accepted_at", "is", null)
    .where("connection_requests.withdrawn_at", "is", null)
    .where("connection_requests.dismissed_at", "is", null)
    .where("connection_requests.expires_at", ">", sql<Date>`now()`)
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .orderBy("connection_requests.created_at", "desc")
    .execute();

  const connectionRows = await db
    .selectFrom("connections")
    .innerJoin("accounts", (join) =>
      join.on(
        sql<boolean>`accounts.id = case when connections.account_a = ${accountId} then connections.account_b else connections.account_a end`,
      ),
    )
    .select(["accounts.id as id", "accounts.display_name as display_name"])
    .where((eb) => eb.or([eb("connections.account_a", "=", accountId), eb("connections.account_b", "=", accountId)]))
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .orderBy("accounts.display_name")
    .execute();
  const connections: ConnectionRow[] = [];
  for (const row of connectionRows) {
    const threads = await sharedThreads(accountId, row.id, db);
    connections.push({
      ...personOf(row),
      threads: threads.slice(0, 2).map((t) => ({ id: t.id, name: t.name })),
      threadCount: threads.length,
    });
  }

  const pending = await db
    .selectFrom("connection_requests")
    .innerJoin("accounts", "accounts.id", "connection_requests.to_account_id")
    .select(["connection_requests.id as id", "connection_requests.created_at as since", "accounts.id as accountId", "accounts.display_name as display_name"])
    .where("connection_requests.from_account_id", "=", accountId)
    .where("connection_requests.accepted_at", "is", null)
    .where("connection_requests.withdrawn_at", "is", null)
    .where("connection_requests.expires_at", ">", sql<Date>`now()`)
    .where("accounts.deleted_at", "is", null)
    .orderBy("connection_requests.created_at", "desc")
    .execute();

  const blocked = await db
    .selectFrom("blocks")
    .innerJoin("accounts", "accounts.id", "blocks.blocked_account_id")
    .select(["accounts.id as id", "accounts.display_name as display_name"])
    .where("blocks.blocker_account_id", "=", accountId)
    .where("accounts.deleted_at", "is", null)
    .orderBy("accounts.display_name")
    .execute();

  return {
    requestsForYou: cards.map((row) => ({ ...personOf({ id: row.accountId, display_name: row.display_name }), id: row.id, since: row.since })),
    connections,
    pending: pending.map((row) => ({ ...personOf({ id: row.accountId, display_name: row.display_name }), id: row.id, since: row.since })),
    blocked: blocked.map(personOf),
    count: connections.length,
  };
}

export interface PersonPage extends Person {
  relation: Relation;
  shared: { id: string; name: string; count: number; lastActivityAt: Date }[];
  /** The open request between you, whichever way, for the card's controls. */
  requestId: string | null;
}

export async function person(viewerId: string, accountId: string): Promise<PersonPage | null> {
  const relation = await relationOf(viewerId, accountId);
  if (relation === null) return null;
  const row = await db
    .selectFrom("accounts")
    .select(["id", "display_name"])
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  const shared = await sharedThreads(viewerId, accountId, db);
  let requestId: string | null = null;
  if (relation === "asked_you") requestId = (await openRequest(accountId, viewerId, db))?.id ?? null;
  if (relation === "you_asked") requestId = (await openRequest(viewerId, accountId, db))?.id ?? null;
  return { ...personOf(row), relation, shared, requestId };
}

/** The daily sweep: expiry made explicit, and the record of who asked whom
 *  kept exactly as long as the seven-day rule needs it. */
export async function sweepPeople(): Promise<void> {
  await db
    .updateTable("connection_requests")
    .set({ withdrawn_at: sql`expires_at` })
    .where("accepted_at", "is", null)
    .where("withdrawn_at", "is", null)
    .where("expires_at", "<=", sql<Date>`now()`)
    .execute();
  await db
    .deleteFrom("connection_requests")
    .where((eb) =>
      eb.or([
        eb("accepted_at", "<", sql<Date>`now() - make_interval(days => ${REASK_DAYS})`),
        eb("withdrawn_at", "<", sql<Date>`now() - make_interval(days => ${REASK_DAYS})`),
      ]),
    )
    .where("created_at", "<", sql<Date>`now() - make_interval(days => ${REASK_DAYS})`)
    .execute();
  await db
    .updateTable("thread_members")
    .set({ state: "expired", responded_at: sql`now()`, preview: null })
    .where("state", "=", "pending")
    .where("expires_at", "<=", sql<Date>`now()`)
    .execute();
  await db
    .deleteFrom("people_lookups")
    .where("looked_up_at", "<", sql<Date>`now() - interval '1 day'`)
    .execute();
  await db
    .updateTable("pending_shares")
    .set({ declined_at: sql`expires_at` })
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .where("expires_at", "<=", sql<Date>`now()`)
    .execute();
}
