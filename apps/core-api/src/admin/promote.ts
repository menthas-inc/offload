// Promotion: turning a waiting address into an account that can sign in.
//
// One transaction, because a half-promoted account is worse than an
// unpromoted one. Someone with state 'invited' and no Miscellaneous thread
// signs in successfully and lands on a Today that cannot accept a dump, and
// nothing about that state says which step failed.
//
// It is idempotent by construction rather than by a preceding read: every
// write is conditional on the thing it creates not already existing. Two
// admins clicking the same row at the same moment produce one thread, one
// email and one event.
//
// The seed calls this too. That is a deliberate constraint from the task list
// and not tidiness: if the first owner were assembled by a second code path,
// the path that assembles everyone else would be the one that is never run
// against a fresh database.

import type { Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { emit } from "../analytics.js";
import { audit } from "./audit.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { generateKey, ROOT_NAME, unwrap, wrap } from "../crypto/keys.js";

export type PromotionOutcome =
  /** The account is now invited and an email is on its way. */
  | { status: "invited"; accountId: string }
  /** Already invited or active. Nothing was written and nothing was sent. */
  | { status: "already-in"; accountId: string }
  /** Disabled accounts are not promoted back in by the waitlist page. */
  | { status: "refused"; accountId: string; reason: "disabled" };

/** The thread every account starts with. Named, not a special row type: it is
 *  an ordinary thread that accounts.default_thread_id happens to point at. */
const DEFAULT_THREAD = { name: "Miscellaneous", icon: "lasso", always_on: true } as const;

export async function promote(
  email: string,
  options: { invitedBy?: string | null } = {}
): Promise<PromotionOutcome> {
  const address = email.trim().toLowerCase();

  return db.transaction().execute(async (tx) => {
    // Lock the account row for the length of the transaction, so a second
    // admin promoting the same person waits here rather than racing past the
    // state check below.
    const existing = await tx
      .selectFrom("accounts")
      .select(["id", "state", "default_thread_id", "analytics_subject_id"])
      .where((eb) => eb(eb.fn("lower", ["email"]), "=", address))
      .where("deleted_at", "is", null)
      .forUpdate()
      .executeTakeFirst();

    if (existing?.state === "disabled") {
      return { status: "refused", accountId: existing.id, reason: "disabled" } as const;
    }
    if (existing && existing.state !== "waitlist") {
      return { status: "already-in", accountId: existing.id } as const;
    }

    const account = existing
      ? await tx
          .updateTable("accounts")
          .set({ state: "invited", updated_at: new Date() })
          .where("id", "=", existing.id)
          .returning(["id", "default_thread_id", "analytics_subject_id"])
          .executeTakeFirstOrThrow()
      : // Promoting an address nobody submitted is legitimate: it is how the
        // first owner and any direct invite get in. The account is created
        // straight into 'invited' rather than through the waitlist.
        await tx
          .insertInto("accounts")
          .values({ email: address, state: "invited" })
          .returning(["id", "default_thread_id", "analytics_subject_id"])
          .executeTakeFirstOrThrow();

    const accountKey = await ensureAccountKey(tx, account.id);
    await ensureDefaultThread(tx, account.id, account.default_thread_id, accountKey);

    await enqueue({
      kind: "email.invited",
      accountId: account.id,
      payload: { accountId: account.id },
      priority: PRIORITY.interactive,
      // One invite email per account, enforced by the queue rather than by the
      // handler having to remember.
      idempotencyKey: `email.invited:${account.id}`,
      tx,
    });

    await emit({
      name: "invite_sent",
      subjectId: account.analytics_subject_id,
      properties: { invited_by_staff: Boolean(options.invitedBy) },
      tx,
    });

    // 034. Who let them in, in the transaction that did it. Only when this
    // call changed something: inviting twice is inviting once.
    if (options.invitedBy) {
      await audit(tx, { staff: { accountId: options.invitedBy }, kind: "invited", targetAccountId: account.id });
    }

    return { status: "invited", accountId: account.id } as const;
  });
}

/** The account's data key, wrapped by the root. Returned unwrapped because the
 *  thread key created moments later is wrapped by it, and reading it back out
 *  of the row we just wrote would be a second round trip for the same bytes. */
async function ensureAccountKey(tx: Transaction<Database>, accountId: string): Promise<Buffer> {
  const key = generateKey();
  const inserted = await tx
    .insertInto("account_keys")
    .values({ account_id: accountId, wrapped_dek: wrap(key), wrapped_by: ROOT_NAME })
    .onConflict((oc) => oc.column("account_id").doNothing())
    .returning(["account_id"])
    .executeTakeFirst();

  if (inserted) return key;

  // Someone already has a key. Never overwrite it: replacing an account key
  // orphans everything wrapped under it, which is data loss dressed up as a
  // retry.
  const row = await tx
    .selectFrom("account_keys")
    .select(["wrapped_dek"])
    .where("account_id", "=", accountId)
    .executeTakeFirstOrThrow();
  return unwrap(Buffer.from(row.wrapped_dek));
}

async function ensureDefaultThread(
  tx: Transaction<Database>,
  accountId: string,
  existingThreadId: string | null,
  accountKey: Buffer
): Promise<void> {
  if (existingThreadId) return;

  const thread = await tx
    .insertInto("threads")
    .values({ ...DEFAULT_THREAD, created_by_account_id: accountId })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  await tx
    .updateTable("accounts")
    .set({ default_thread_id: thread.id, updated_at: new Date() })
    .where("id", "=", accountId)
    .execute();

  // Accepted, not pending. Threads have members and no owner (OFF-3), so the
  // account's own default thread is a membership like any other; it is just
  // one nobody had to accept.
  await tx
    .insertInto("thread_members")
    .values({ thread_id: thread.id, account_id: accountId, state: "accepted" })
    .onConflict((oc) => oc.columns(["thread_id", "account_id"]).doNothing())
    .execute();

  // The thread key is wrapped once per member, by that member's account key.
  // That is what lets a member leave without rekeying the thread for everyone
  // else, and what makes the thread unreadable to them afterwards.
  await tx
    .insertInto("thread_keys")
    .values({ thread_id: thread.id, account_id: accountId, wrapped_tk: wrap(generateKey(), accountKey) })
    .onConflict((oc) => oc.columns(["thread_id", "account_id"]).doNothing())
    .execute();
}
