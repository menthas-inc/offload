// Rotate the root key, or one account's key. 047.
//
// Railway exposed every service's variables on 2026-10-22, DATA_ROOT_KEY with
// them. `root` moves every account key from whichever root wrapped it to the
// current one, a transaction per row, picking out what is left by
// `wrapped_by`, so a run that stops is finished by running it again.
// `account <email>` gives one account a new key and rewraps everything that
// sits under it: its thread key copies, its copies' keys, and its photos'
// account wraps. Neither touches a blob. docs/specs/047-key-rotation says what
// each one does and does not protect.
//
// **In production this runs inside the API's container**, like `api-role.ts`:
//
//   railway ssh --service core-api -- node apps/core-api/dist/rotate-keys.js root
//   railway ssh --service core-api -- node apps/core-api/dist/rotate-keys.js account <email>
//
// It prints counts and nothing else: no key, no name of one, no account id.

import type { Kysely } from "kysely";
import { generateKey, rootName, unwrap, unwrapFromRoot, wrap, wrapUnderRoot } from "./crypto/keys.js";
import type { Database } from "./schema.js";

/** Every account key onto the current root. A row that will not open under
 *  the root it names is left exactly as it was and counted. */
export async function rewrapRoot(db: Kysely<Database>): Promise<{ moved: number; failed: number; remaining: number }> {
  const current = rootName();
  const pending = await db.selectFrom("account_keys").select("account_id").where("wrapped_by", "<>", current).execute();

  let moved = 0;
  let failed = 0;
  for (const { account_id } of pending) {
    try {
      const did = await db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom("account_keys")
          .select(["wrapped_dek", "wrapped_by"])
          .where("account_id", "=", account_id)
          .where("wrapped_by", "<>", current)
          .forUpdate()
          .executeTakeFirst();
        // Moved by another run, or the account went.
        if (!row) return false;
        await trx
          .updateTable("account_keys")
          .set({ ...wrapUnderRoot(unwrapFromRoot(row)), rotated_at: new Date() })
          .where("account_id", "=", account_id)
          .execute();
        return true;
      });
      if (did) moved++;
    } catch {
      failed++;
    }
  }

  const left = await db
    .selectFrom("account_keys")
    .select(db.fn.countAll<string>().as("n"))
    .where("wrapped_by", "<>", current)
    .executeTakeFirstOrThrow();
  return { moved, failed, remaining: Number(left.n) };
}

/** A new key for one account, and everything wrapped by the old one rewrapped
 *  under it, in one transaction: a wrap that will not open changes nothing. */
export async function rotateAccountKey(
  db: Kysely<Database>,
  accountId: string,
): Promise<{ threadKeys: number; copies: number; objectKeys: number }> {
  return db.transaction().execute(async (trx) => {
    // Waits for every transaction holding the old key: `accountKey` share-locks this row.
    const row = await trx
      .selectFrom("account_keys")
      .select(["wrapped_dek", "wrapped_by"])
      .where("account_id", "=", accountId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const old = unwrapFromRoot(row);
    const fresh = generateKey();
    const rewrap = (sealed: Buffer) => wrap(unwrap(Buffer.from(sealed), old), fresh);

    const threadKeys = await trx.selectFrom("thread_keys").select(["thread_id", "wrapped_tk"]).where("account_id", "=", accountId).execute();
    for (const t of threadKeys) {
      await trx
        .updateTable("thread_keys")
        .set({ wrapped_tk: rewrap(t.wrapped_tk) })
        .where("thread_id", "=", t.thread_id)
        .where("account_id", "=", accountId)
        .execute();
    }

    const copies = await trx.selectFrom("exports").select(["id", "wrapped_key"]).where("account_id", "=", accountId).execute();
    for (const c of copies) {
      await trx.updateTable("exports").set({ wrapped_key: rewrap(c.wrapped_key) }).where("id", "=", c.id).execute();
    }

    const objectKeys = await trx
      .selectFrom("blob_keys")
      .select(["blob_id", "wrapped_object_key"])
      .where("scope", "=", "account")
      .where("scope_id", "=", accountId)
      .execute();
    for (const o of objectKeys) {
      await trx
        .updateTable("blob_keys")
        .set({ wrapped_object_key: rewrap(o.wrapped_object_key) })
        .where("blob_id", "=", o.blob_id)
        .where("scope", "=", "account")
        .where("scope_id", "=", accountId)
        .execute();
    }

    await trx
      .updateTable("account_keys")
      .set((eb) => ({ ...wrapUnderRoot(fresh), version: eb("version", "+", 1), rotated_at: new Date() }))
      .where("account_id", "=", accountId)
      .execute();

    return { threadKeys: threadKeys.length, copies: copies.length, objectKeys: objectKeys.length };
  });
}

async function main(): Promise<void> {
  const { db } = await import("./db.js");
  const [mode, email] = process.argv.slice(2);

  if (mode === "root") {
    const { moved, failed, remaining } = await rewrapRoot(db);
    console.log(`  moved ${moved}, failed ${failed}, still on an older root ${remaining}`);
    if (failed || remaining) process.exitCode = 1;
  } else if (mode === "account" && email) {
    const account = await db
      .selectFrom("accounts")
      .select("id")
      .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
      .executeTakeFirst();
    if (!account) {
      console.log("  no account with that email");
      process.exitCode = 1;
    } else {
      const { threadKeys, copies, objectKeys } = await rotateAccountKey(db, account.id);
      console.log(`  new account key; rewrapped ${threadKeys} thread keys, ${copies} copies, ${objectKeys} photo keys`);
    }
  } else {
    console.log("  usage: rotate-keys.js root | rotate-keys.js account <email>");
    process.exitCode = 1;
  }
  await db.destroy();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
