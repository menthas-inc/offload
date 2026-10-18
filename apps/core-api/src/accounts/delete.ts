// 035. Deleting an account.
//
// Every foreign key to `accounts` carries its own delete rule, so deleting the
// row is the delete and the database is what enforces it. This file does only
// what a cascade cannot, each step named in `ledger.ts`:
//
//   - a shared thread's key is handed to the members who stay, before the copy
//     that goes with the account goes;
//   - a thread nobody else is in is deleted, since nothing else would;
//   - what refers to the account without a foreign key is removed by name;
//   - a row in somebody else's Activity that names them goes, since the
//     cascade takes or clears the mention, request or membership that links
//     the row to them and leaves the row;
//   - a calendar grant is kept, sealed and nameless, until Google has taken it
//     back;
//   - a photo nothing references any more is put on the purge clock.
//
// One transaction, and nothing in it talks to anybody else: the storage delete
// and the revoke are jobs.

import { destroyParts } from "../exports/copy.js";
import { sql } from "kysely";
import { db } from "../db.js";
import { emit } from "../analytics.js";
import { passThreadKeyOn } from "../blobs/keys.js";
import { openOrNull, seal } from "../connectors/vault.js";
import { keepUnopenable } from "../connectors/tokens.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { codeAttemptHmac } from "../admin/review-codes.js";
import { attemptHmac } from "../routes/waitlist.js";
import { deleteNotesForThread } from "../threads/notes.js";
import { purgeNaming } from "../notifications/activity.js";
import { uuidv7 } from "../uuid.js";

/** The admin panel needs somebody who can open it. */
export class LastOwner extends Error {
  constructor() {
    super("The last staff owner cannot delete their account.");
  }
}

export interface Deleted {
  deleted: boolean;
  /** Where the notice goes. Null when there was no account. */
  email: string | null;
}

export interface DeleteOptions {
  /** Delete only while the account is marked and its time has come. The
   *  scheduled delete reads the mark before calling this, unlocked, so a
   *  cancel in between is caught here, under the lock. */
  onlyIfMarked?: boolean;
}

export async function deleteAccount(accountId: string, options: DeleteOptions = {}): Promise<Deleted> {
  return db.transaction().execute(async (trx) => {
    // Ours to lock: this transaction is the whole delete.
    let query = trx
      .selectFrom("accounts")
      .select(["id", "email", "analytics_subject_id", "time_zone"])
      .where("id", "=", accountId);
    if (options.onlyIfMarked) query = query.where("delete_after", "<=", sql<Date>`now()`);
    const account = await query.forUpdate().executeTakeFirst();
    if (!account) return { deleted: false, email: null };

    const staff = await trx.selectFrom("staff").select("role").where("account_id", "=", accountId).executeTakeFirst();
    if (staff?.role === "owner") {
      // Locked, so two owners leaving at once are counted one after the other
      // and the second finds itself the last.
      const owners = await trx.selectFrom("staff").select("account_id").where("role", "=", "owner").forUpdate().execute();
      // Only owners whose account still works count, as in the admin paths: a
      // disabled account is not somebody who can open the panel.
      const others = owners.map((owner) => owner.account_id).filter((id) => id !== accountId);
      const working =
        others.length === 0
          ? []
          : await trx.selectFrom("accounts").select("id").where("id", "in", others).where("state", "=", "active").where("deleted_at", "is", null).execute();
      if (working.length === 0) throw new LastOwner();
    }

    // The grants, before the cascade takes the only copy of each token.
    const grants = await trx
      .selectFrom("connector_secrets")
      .innerJoin("connector_connections", "connector_connections.id", "connector_secrets.connection_id")
      .select(["connector_secrets.connection_id as id", "connector_secrets.refresh_token as refresh", "connector_secrets.access_token as access"])
      .where("connector_connections.account_id", "=", accountId)
      // Locked, so a refresh in flight finishes first and this reads the
      // token Google last issued rather than the one it replaced.
      .forUpdate()
      .execute();
    for (const grant of grants) {
      const token = grant.refresh
        ? openOrNull(Buffer.from(grant.refresh), grant.id, "refresh_token")
        : openOrNull(Buffer.from(grant.access), grant.id, "access_token");
      // One sealed under a key no longer held cannot be handed back, and is
      // never a reason for the account to stay. It is kept, marked (S27).
      if (token === null) {
        await keepUnopenable(trx, grant.id, Buffer.from(grant.refresh ?? grant.access));
        continue;
      }
      const id = uuidv7();
      await trx
        .insertInto("pending_revocations")
        .values({ id, provider: "google", sealed_token: seal(token, id, "refresh_token") })
        .execute();
    }

    // Threads: hand the key on where somebody stays, delete where nobody does.
    // Each thread row is locked first, as accepting a share and taking
    // somebody out lock it, so who is in it cannot change under the count.
    // In id order, so two deletes that share threads cannot deadlock.
    await trx
      .selectFrom("threads")
      .select("threads.id")
      .where("threads.id", "in", (eb) =>
        eb.selectFrom("thread_members").select("thread_id").where("account_id", "=", accountId).where("state", "=", "accepted"),
      )
      .orderBy("threads.id")
      .forUpdate()
      .execute();
    const memberships = await trx
      .selectFrom("thread_members as mine")
      .select((eb) => [
        "mine.thread_id as threadId",
        eb
          .selectFrom("thread_members as others")
          .select(({ fn }) => fn.countAll<string>().as("n"))
          .whereRef("others.thread_id", "=", "mine.thread_id")
          .where("others.account_id", "!=", accountId)
          .where("others.state", "=", "accepted")
          .as("others"),
      ])
      .where("mine.account_id", "=", accountId)
      .where("mine.state", "=", "accepted")
      .execute();
    // Every row in somebody else's Activity that names them. Most name them only
    // through a mention, a request or a membership, which the cascade takes or
    // clears and leaves the row, so these go by name while the link is there.
    // After the threads, which leaving locks before it purges, and in id order,
    // before the thread deletes below cascade into any of them out of order.
    // The requests and memberships that link a row to them are locked first:
    // a notice being written holds its link until it commits, so this waits
    // for it and the purge then sees its row; one written later waits behind
    // this transaction and finds its request gone. A membership they sent
    // stays with `invited_by` cleared, so a share notice that read their name
    // before this began can still land after it: that check is the writer's.
    // FOR UPDATE on the rows the purge reads would lock only the rows it could
    // already see.
    await trx
      .selectFrom("connection_requests")
      .select("id")
      .where((r) => r.or([r("from_account_id", "=", accountId), r("to_account_id", "=", accountId)]))
      .orderBy("id")
      .forUpdate()
      .execute();
    await trx
      .selectFrom("thread_members")
      .select("id")
      .where((m) => m.or([m("account_id", "=", accountId), m("invited_by", "=", accountId)]))
      .orderBy("id")
      .forUpdate()
      .execute();
    await purgeNaming(accountId, trx);
    const gone: string[] = [];
    let unopened = 0;
    for (const membership of memberships) {
      if (Number(membership.others) > 0) {
        // A copy that will not open hands nothing on, and the delete goes
        // ahead: key state the person cannot see may not keep their account.
        // What it could have opened was already closed to everyone.
        await passThreadKeyOn(trx, membership.threadId, accountId).catch(() => {
          unopened += 1;
        });
        continue;
      }
      gone.push(membership.threadId);
      await deleteNotesForThread(membership.threadId, trx);
      await trx.deleteFrom("threads").where("id", "=", membership.threadId).execute();
    }
    // A share still waiting carries the sharer's own titles as its preview and
    // cannot be accepted once the sharer is gone. Withdrawn, as leaving does.
    await trx
      .updateTable("thread_members")
      .set({ state: "expired", responded_at: sql`now()`, preview: null })
      .where("invited_by", "=", accountId)
      .where("state", "=", "pending")
      .execute();

    // Their photos, by id, while the rows still say whose they were.
    const blobs = await trx.selectFrom("blobs").select("id").where("account_id", "=", accountId).execute();

    // What no foreign key reaches.
    await trx
      .deleteFrom("notes")
      .where("scope", "in", ["account", "person"])
      .where((eb) => eb.or([eb("account_id", "=", accountId), eb.and([eb("scope", "=", "account"), eb("subject_id", "=", accountId)])]))
      .execute();
    await trx.deleteFrom("blob_keys").where("scope", "=", "account").where("scope_id", "=", accountId).execute();
    await trx.deleteFrom("analytics_events").where("subject_id", "=", account.analytics_subject_id).execute();
    await trx.deleteFrom("waitlist_attempts").where("email_hmac", "=", attemptHmac(account.email)).execute();
    await trx.deleteFrom("review_code_attempts").where("email_hmac", "=", codeAttemptHmac(account.email)).execute();

    // Their copy, if there is one: the row goes with the account, and its
    // sealed parts are booked for removal while the row still says how many.
    const copy = await trx.selectFrom("exports").select(["id", "parts"]).where("account_id", "=", accountId).executeTakeFirst();
    if (copy) await destroyParts(trx, copy.id, copy.parts);

    // The delete. Everything in the ledger marked cascade or set-null happens here.
    await trx.deleteFrom("accounts").where("id", "=", accountId).execute();

    // A thread wrap with no row left carrying the photo, then the photos
    // nothing carries at all. The object itself is the purge job's.
    // Only the threads this delete removed: every other thread's wraps are
    // somebody else's key material.
    if (gone.length > 0) {
      await trx.deleteFrom("blob_keys").where("scope", "=", "thread").where("scope_id", "in", gone).execute();
    }
    if (unopened > 0) {
      console.error(JSON.stringify({ level: "error", msg: "thread keys not handed on", threads: unopened }));
    }
    const unreferenced =
      blobs.length === 0
        ? []
        : await trx
            .updateTable("blobs")
            .set({ deleted_at: sql`now()`, purge_after: sql`now()` })
            .where("id", "in", blobs.map((blob) => blob.id))
            .where("deleted_at", "is", null)
            .where((eb) =>
              eb.not(eb.exists(eb.selectFrom("content_blobs").select("blob_id").whereRef("content_blobs.blob_id", "=", "blobs.id"))),
            )
            .returning("id")
            .execute();
    if (unreferenced.length > 0) {
      await enqueue({ kind: "blob.purge", payload: {}, priority: PRIORITY.background, tx: trx });
    }

    if (grants.length > 0) {
      await enqueue({ kind: "connector.revoke", payload: {}, priority: PRIORITY.background, tx: trx });
    }
    // The address rides in the payload because the account it belonged to no
    // longer exists to look it up from. Sealed, and the handler empties the
    // payload once it has sent: a job row outlives its work by thirty days.
    const notice = uuidv7();
    await enqueue({
      kind: "email.account_deleted",
      // When, in the zone the account kept, so the notice can say it: with no
      // second sign-in, the mail is how its owner tells their own delete from
      // somebody else's.
      payload: {
        id: notice,
        to: seal(account.email, notice, "notice_address").toString("base64"),
        at: new Date().toISOString(),
        zone: account.time_zone,
      },
      tx: trx,
    });
    await emit({ name: "account_deleted", tx: trx });

    return { deleted: true, email: account.email };
  });
}
