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
// say per row, that the account is still active, and that a block the other
// way hides what it ended. A view row with a dead account behind it is not a
// person you can see.
//
// **A block the other way hides the connection and the request it ended, and
// nothing else.** The thread you still share stays as it is, so the face on
// its head stays a person; the request you sent them stays Pending, because
// it was written undelivered so that nothing on your side would tell. Hiding
// either would be the tell: a blank mark on a row the screen is drawing. The
// lookup is the one door that reads a block either way as not found, and it
// answers the same for an address that is not on offload at all.

import { sql, type Kysely, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database, VisiblePeopleView } from "../schema.js";

export type Executor = Kysely<Database> | Transaction<Database>;
export type Relation = VisiblePeopleView["relation"];

/** Precedence when several rows match: a block you placed outranks the
 *  thread you still share; a connection outranks a request that is now moot;
 *  a share still waiting on them comes last. */
const ORDER: Relation[] = ["blocked", "connected", "asked_you", "you_asked", "thread", "waiting"];

/** What a block by the account takes from the viewer's sight. */
const ENDED_BY_THEIR_BLOCK = new Set<Relation>(["connected", "asked_you"]);

/** The strongest relation the viewer has with the account, or null when the
 *  viewer may not see them at all: no relation, a deleted or disabled
 *  account, or only a relation that the account's own block has ended. Never
 *  the viewer themselves, which every caller handles first. */
export async function relationOf(
  viewerId: string,
  accountId: string,
  trx: Executor = db,
): Promise<Relation | null> {
  if (viewerId === accountId) return null;
  const rows = await trx
    .selectFrom("visible_people")
    .innerJoin("accounts", "accounts.id", "visible_people.account_id")
    .select((eb) => [
      "visible_people.relation",
      eb
        .exists(
          eb
            .selectFrom("blocks")
            .select("blocks.blocker_account_id")
            .where("blocks.blocker_account_id", "=", accountId)
            .where("blocks.blocked_account_id", "=", viewerId),
        )
        .as("theirBlock"),
    ])
    .where("visible_people.viewer_account_id", "=", viewerId)
    .where("visible_people.account_id", "=", accountId)
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .execute();
  const found = new Set(rows.filter((row) => !(row.theirBlock && ENDED_BY_THEIR_BLOCK.has(row.relation))).map((row) => row.relation));
  if (found.size === 0) return null;
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
    // A block either way ends the connection for every purpose here: the
    // pair row may linger for an instant, and a blocked person is never
    // offered.
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("blocks")
            .select("blocks.blocker_account_id")
            .where((eb) =>
              eb.or([
                eb.and([eb("blocks.blocker_account_id", "=", accountId), eb("blocks.blocked_account_id", "=", eb.ref("accounts.id"))]),
                eb.and([eb("blocks.blocked_account_id", "=", accountId), eb("blocks.blocker_account_id", "=", eb.ref("accounts.id"))]),
              ]),
            ),
        ),
      ),
    )
    .orderBy("accounts.display_name")
    .execute();
  return rows;
}
