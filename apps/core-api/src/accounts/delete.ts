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
import { open, seal } from "../connectors/vault.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { codeAttemptHmac } from "../admin/review-codes.js";
import { attemptHmac } from "../routes/waitlist.js";
import { deleteNotesForThread } from "../threads/notes.js";
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

export async function deleteAccount(accountId: string): Promise<Deleted> {
  return db.transaction().execute(async (trx) => {
    // Ours to lock: this transaction is the whole delete.
    const account = await trx
      .selectFrom("accounts")
      .select(["id", "email", "analytics_subject_id", "time_zone"])
      .where("id", "=", accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!account) return { deleted: false, email: null };

    const staff = await trx.selectFrom("staff").select("role").where("account_id", "=", accountId).executeTakeFirst();
    if (staff?.role === "owner") {
      // Locked, so two owners leaving at once are counted one after the other
      // and the second finds itself the last.
      const owners = await trx.selectFrom("staff").select("account_id").where("role", "=", "owner").forUpdate().execute();
      if (owners.length <= 1) throw new LastOwner();
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
        ? open(Buffer.from(grant.refresh), grant.id, "refresh_token")
        : open(Buffer.from(grant.access), grant.id, "access_token");
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
