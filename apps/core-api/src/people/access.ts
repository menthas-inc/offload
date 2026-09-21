// Who may see whom, in one place.
//
// Every reader of a person, the lookup, the share sheet, the @ list, My
// people, the person page, the mark and the share tool, asks this and nothing
// else. The failure mode of a repeated visibility rule is the same as a
// repeated authorization rule: one copy differs and nobody can tell which is
// right (QUAL-2), and here the wrong one shows a stranger somebody's name.
//
// Two halves, tested as one. `visible_people` in the database says which
// relations exist between two accounts; this file adds what the view cannot
// say per row, that the account is still active and has not blocked the
// viewer. A view row with a dead account behind it is not a person you can see.

import { sql, type Kysely, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database, VisiblePeopleView } from "../schema.js";

export type Executor = Kysely<Database> | Transaction<Database>;
export type Relation = VisiblePeopleView["relation"];

/** Precedence when several rows match: a block you placed outranks the
 *  thread you still share; a connection outranks a request that is now moot. */
const ORDER: Relation[] = ["blocked", "connected", "asked_you", "you_asked", "thread"];

/** The strongest relation the viewer has with the account, or null when the
 *  viewer may not see them at all: no relation, a deleted or disabled
 *  account, or an account that has blocked the viewer. Never the viewer
 *  themselves, which every caller handles first. */
export async function relationOf(
  viewerId: string,
  accountId: string,
  trx: Executor = db,
): Promise<Relation | null> {
  if (viewerId === accountId) return null;
  const rows = await trx
    .selectFrom("visible_people")
    .innerJoin("accounts", "accounts.id", "visible_people.account_id")
    .select("visible_people.relation")
    .where("visible_people.viewer_account_id", "=", viewerId)
    .where("visible_people.account_id", "=", accountId)
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("blocks")
            .select("blocks.blocker_account_id")
            .where("blocks.blocker_account_id", "=", accountId)
            .where("blocks.blocked_account_id", "=", viewerId),
        ),
      ),
    )
    .execute();
  if (rows.length === 0) return null;
  const found = new Set(rows.map((row) => row.relation));
  return ORDER.find((relation) => found.has(relation)) ?? null;
}

export async function visibleTo(viewerId: string, accountId: string, trx: Executor = db): Promise<boolean> {
  return (await relationOf(viewerId, accountId, trx)) !== null;
}

/** The pair as `connections` stores it, smaller id first. */
export function pairOf(a: string, b: string): { account_a: string; account_b: string } {
  return a < b ? { account_a: a, account_b: b } : { account_a: b, account_b: a };
}

/** Accepted connection, per call, never cached. */
export async function connected(a: string, b: string, trx: Executor = db): Promise<boolean> {
  const pair = pairOf(a, b);
  const row = await trx
    .selectFrom("connections")
    .select("account_a")
    .where("account_a", "=", pair.account_a)
    .where("account_b", "=", pair.account_b)
    .executeTakeFirst();
  return row !== undefined;
}

/** A block in either direction. Sharing and requesting both stop at one. */
export async function blockedEitherWay(a: string, b: string, trx: Executor = db): Promise<boolean> {
  const row = await trx
    .selectFrom("blocks")
    .select("blocker_account_id")
    .where((eb) =>
      eb.or([
        eb.and([eb("blocker_account_id", "=", a), eb("blocked_account_id", "=", b)]),
        eb.and([eb("blocker_account_id", "=", b), eb("blocked_account_id", "=", a)]),
      ]),
    )
    .executeTakeFirst();
  return row !== undefined;
}

/** Every accepted connection of an account that is still an active account,
 *  as ids, in the order the sheet and the @ list draw them: by name. Fifty is
 *  the heavy case, so this is one query and no page. */
export async function connectionsOf(
  accountId: string,
  trx: Executor = db,
): Promise<{ accountId: string; displayName: string | null }[]> {
  const rows = await trx
    .selectFrom("connections")
    .innerJoin("accounts", (join) =>
      join.on(
        sql<boolean>`accounts.id = case when connections.account_a = ${accountId} then connections.account_b else connections.account_a end`,
      ),
    )
    .select(["accounts.id as accountId", "accounts.display_name as displayName"])
    .where((eb) => eb.or([eb("connections.account_a", "=", accountId), eb("connections.account_b", "=", accountId)]))
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .orderBy("accounts.display_name")
    .execute();
  return rows;
}
