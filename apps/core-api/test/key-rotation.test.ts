// 047. Rotating the root, and one account's key.
//
// Railway exposed every service's variables on 2026-10-22, DATA_ROOT_KEY
// among them. Swapping the variable alone would brick every account, because
// each account key is wrapped by the root and unwrap fails on any other. So
// two roots can be held at once, each row says which one wrapped it, and a
// script moves the rows across one transaction at a time.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql, type Transaction } from "kysely";
import { randomBytes } from "node:crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { env } from "../src/env.js";
import type { Database } from "../src/schema.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { generateKey, rootName, unwrap, unwrapFromRoot, wrap } from "../src/crypto/keys.js";
import { accountKey, mintObjectKey, objectKeyOf, passThreadKeyOn, threadKey } from "../src/blobs/keys.js";
import { rewrapRoot, rotateAccountKey } from "../src/rotate-keys.js";
import { wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(async () => {
  // Rows wrapped under this file's throwaway roots would not open for anything after it.
  await clear();
  await closeDb();
});

const OLD = randomBytes(32).toString("base64");
const NEW = randomBytes(32).toString("base64");
const saved = { current: env.DATA_ROOT_KEY, previous: env.DATA_ROOT_KEY_PREVIOUS };

function roots(current: string | undefined, previous?: string): void {
  env.DATA_ROOT_KEY = current;
  env.DATA_ROOT_KEY_PREVIOUS = previous;
}

async function clear(): Promise<void> {
  await db.deleteFrom("exports").execute();
  await db.deleteFrom("content_blobs").execute();
  await db.deleteFrom("blob_keys").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("account_keys").execute();
  await wipe();
}

beforeEach(async () => {
  roots(OLD);
  await clear();
});

afterEach(() => roots(saved.current, saved.previous));

async function person(): Promise<{ id: string; threadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  const row = await db
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", outcome.accountId)
    .executeTakeFirstOrThrow();
  return { id: outcome.accountId, threadId: row.default_thread_id! };
}

const keyRow = (accountId: string) =>
  db.selectFrom("account_keys").selectAll().where("account_id", "=", accountId).executeTakeFirstOrThrow();

const open = <T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> => db.transaction().execute(fn);

async function blob(accountId: string): Promise<{ id: string; key: Buffer }> {
  const made = await db
    .insertInto("blobs")
    .values({ account_id: accountId, message_id: null, client_key: uuidv7(), name: null, content_type: "image/jpeg", byte_size: 1, width: 1, height: 1, sha256: Buffer.alloc(32) } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  const key = await db.transaction().execute((trx) => mintObjectKey(trx, made.id, accountId));
  return { id: made.id, key };
}

describe("unwrap by the root a row names", () => {
  it("names the root a row was wrapped by, and opens it after the root moves on", async () => {
    const ana = await person();
    const before = await keyRow(ana.id);
    const dek = unwrapFromRoot(before);

    roots(NEW, OLD);
    expect(rootName()).not.toBe(before.wrapped_by);
    expect(unwrapFromRoot(await keyRow(ana.id)).equals(dek)).toBe(true);
    expect(await open((trx) => threadKey(trx, ana.threadId))).toHaveLength(32);

    // A new account is wrapped by the new root, under its name.
    const bea = await person();
    expect((await keyRow(bea.id)).wrapped_by).toBe(rootName());
  });

  it("reads db:v1, the name every row had before rotation, as the previous root when one is set", async () => {
    const ana = await person();
    const dek = unwrapFromRoot(await keyRow(ana.id));
    await db.updateTable("account_keys").set({ wrapped_by: "db:v1" }).where("account_id", "=", ana.id).execute();

    expect(unwrapFromRoot(await keyRow(ana.id)).equals(dek)).toBe(true);
    roots(NEW, OLD);
    expect(unwrapFromRoot(await keyRow(ana.id)).equals(dek)).toBe(true);
  });

  it("fails loudly when the root a row names is not held", async () => {
    const ana = await person();
    roots(NEW);
    await expect(open((trx) => accountKey(trx, ana.id))).rejects.toThrow(/No root key named/);
  });
});

describe("rewrapRoot", () => {
  it("moves every row to the new root, keeps every account key, and does nothing the second time", async () => {
    const ana = await person();
    const bea = await person();
    const deks = [unwrapFromRoot(await keyRow(ana.id)), unwrapFromRoot(await keyRow(bea.id))];

    roots(NEW, OLD);
    expect(await rewrapRoot(db)).toEqual({ moved: 2, failed: 0, remaining: 0 });

    const rows = [await keyRow(ana.id), await keyRow(bea.id)];
    for (const [i, row] of rows.entries()) {
      expect(row.wrapped_by).toBe(rootName());
      expect(row.rotated_at).not.toBeNull();
      expect(row.version).toBe(1);
      expect(unwrapFromRoot(row).equals(deks[i]!)).toBe(true);
    }
    expect(await rewrapRoot(db)).toEqual({ moved: 0, failed: 0, remaining: 0 });

    // The previous root can go.
    roots(NEW);
    expect(await open((trx) => threadKey(trx, ana.threadId))).toHaveLength(32);
  });

  it("picks up where a run that stopped half way left off", async () => {
    const people = [await person(), await person(), await person()];
    roots(NEW, OLD);
    // What the run leaves behind for the one row it finished before it died.
    const done = await keyRow(people[0]!.id);
    await db
      .updateTable("account_keys")
      .set({ wrapped_dek: wrap(unwrapFromRoot(done), Buffer.from(NEW, "base64")), wrapped_by: rootName(), rotated_at: new Date() })
      .where("account_id", "=", people[0]!.id)
      .execute();

    expect(await rewrapRoot(db)).toEqual({ moved: 2, failed: 0, remaining: 0 });
  });

  it("leaves a row it cannot open as it was, and says so", async () => {
    const ana = await person();
    const bea = await person();
    const broken = Buffer.from(wrap(generateKey(), randomBytes(32)));
    await db.updateTable("account_keys").set({ wrapped_dek: broken }).where("account_id", "=", bea.id).execute();

    roots(NEW, OLD);
    expect(await rewrapRoot(db)).toEqual({ moved: 1, failed: 1, remaining: 1 });
    expect(Buffer.from((await keyRow(bea.id)).wrapped_dek).equals(broken)).toBe(true);
    expect((await keyRow(ana.id)).wrapped_by).toBe(rootName());
  });
});

describe("rotateAccountKey", () => {
  it("gives the account a new key and rewraps everything under it, and only its own", async () => {
    const ana = await person();
    const bea = await person();
    const photo = await blob(ana.id);
    const theirs = await blob(bea.id);
    const copyKey = generateKey();
    const oldDek = unwrapFromRoot(await keyRow(ana.id));
    await db.insertInto("exports").values({ account_id: ana.id, wrapped_key: wrap(copyKey, oldDek) }).execute();
    const tk = await open((trx) => threadKey(trx, ana.threadId));
    const beaBefore = await keyRow(bea.id);

    expect(await rotateAccountKey(db, ana.id)).toEqual({ threadKeys: 1, copies: 1, objectKeys: 1 });

    const after = await keyRow(ana.id);
    const newDek = unwrapFromRoot(after);
    expect(newDek.equals(oldDek)).toBe(false);
    expect(after.version).toBe(2);
    expect(after.rotated_at).not.toBeNull();

    const tkRow = await db.selectFrom("thread_keys").select("wrapped_tk").where("account_id", "=", ana.id).executeTakeFirstOrThrow();
    expect(unwrap(Buffer.from(tkRow.wrapped_tk), newDek).equals(tk)).toBe(true);
    const copy = await db.selectFrom("exports").select("wrapped_key").where("account_id", "=", ana.id).executeTakeFirstOrThrow();
    expect(unwrap(Buffer.from(copy.wrapped_key), newDek).equals(copyKey)).toBe(true);
    expect((await open((trx) => objectKeyOf(trx, photo.id))).equals(photo.key)).toBe(true);

    expect(Buffer.from((await keyRow(bea.id)).wrapped_dek).equals(Buffer.from(beaBefore.wrapped_dek))).toBe(true);
    expect((await open((trx) => objectKeyOf(trx, theirs.id))).equals(theirs.key)).toBe(true);
  });

  it("changes nothing when one of the account's wraps does not open", async () => {
    const ana = await person();
    const before = await keyRow(ana.id);
    await db.updateTable("thread_keys").set({ wrapped_tk: Buffer.from(wrap(generateKey(), randomBytes(32))) }).where("account_id", "=", ana.id).execute();

    await expect(rotateAccountKey(db, ana.id)).rejects.toThrow();
    expect(Buffer.from((await keyRow(ana.id)).wrapped_dek).equals(Buffer.from(before.wrapped_dek))).toBe(true);
  });

  it("waits for a request holding the old key, so what it wraps under that key is rewrapped too", async () => {
    const ana = await person();
    const made = await db
      .insertInto("blobs")
      .values({ account_id: ana.id, message_id: null, client_key: uuidv7(), name: null, content_type: "image/jpeg", byte_size: 1, width: 1, height: 1, sha256: Buffer.alloc(32) } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    const objectKey = generateKey();

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let read!: () => void;
    const hasRead = new Promise<void>((resolve) => (read = resolve));
    // The window every wrap under an account key has: the key read, then the
    // insert a statement later.
    const request = db.transaction().execute(async (trx) => {
      const dek = await accountKey(trx, ana.id);
      read();
      await held;
      await trx
        .insertInto("blob_keys")
        .values({ blob_id: made.id, scope: "account", scope_id: ana.id, wrapped_object_key: wrap(objectKey, dek) })
        .execute();
    });

    await hasRead;
    const rotation = rotateAccountKey(db, ana.id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await request;
    await rotation;

    expect((await open((trx) => objectKeyOf(trx, made.id))).equals(objectKey)).toBe(true);
  });

  // What the rotation does, by hand, so a request can be caught between its
  // first read and the account key: lock the row, rewrap, commit.
  async function rotatingWhile(accountId: string, request: () => Promise<unknown>): Promise<unknown> {
    let rotated!: () => void;
    const locked = new Promise<void>((resolve) => (rotated = resolve));
    let started!: Promise<unknown>;
    const rotation = db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom("account_keys").select(["wrapped_dek", "wrapped_by"]).where("account_id", "=", accountId).forUpdate().executeTakeFirstOrThrow();
      started = request();
      started.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const old = unwrapFromRoot(row);
      const fresh = generateKey();
      for (const t of await trx.selectFrom("thread_keys").selectAll().where("account_id", "=", accountId).execute()) {
        await trx.updateTable("thread_keys").set({ wrapped_tk: wrap(unwrap(Buffer.from(t.wrapped_tk), old), fresh) }).where("thread_id", "=", t.thread_id).where("account_id", "=", accountId).execute();
      }
      for (const o of await trx.selectFrom("blob_keys").selectAll().where("scope", "=", "account").where("scope_id", "=", accountId).execute()) {
        await trx.updateTable("blob_keys").set({ wrapped_object_key: wrap(unwrap(Buffer.from(o.wrapped_object_key), old), fresh) }).where("blob_id", "=", o.blob_id).where("scope", "=", "account").execute();
      }
      await trx.updateTable("account_keys").set({ wrapped_dek: wrap(fresh, Buffer.from(OLD, "base64")) }).where("account_id", "=", accountId).execute();
      rotated();
    });
    await locked;
    await rotation;
    return started;
  }

  it("reads a thread key copy only once it holds the account key, so a rotation in between cannot strand it", async () => {
    const ana = await person();
    await expect(rotatingWhile(ana.id, () => open((trx) => passThreadKeyOn(trx, ana.threadId, ana.id)))).resolves.toBeUndefined();
    await expect(rotatingWhile(ana.id, () => open((trx) => threadKey(trx, ana.threadId)))).resolves.toHaveLength(32);
  });

  it("reads a photo's account wrap only once it holds the account key", async () => {
    const ana = await person();
    const photo = await blob(ana.id);
    const got = (await rotatingWhile(ana.id, () => open((trx) => objectKeyOf(trx, photo.id)))) as Buffer;
    expect(got.equals(photo.key)).toBe(true);
  });
});

// Everything sealed under a key is a bytea named wrapped_*. A new one sealed
// under an account key that `rotateAccountKey` does not rewrap would be lost
// for good the next time it runs, so a new column fails here until it is
// looked at.
it("knows every wrapped column there is", async () => {
  const { rows } = await sql<{ c: string }>`
    select table_name || '.' || column_name as c from information_schema.columns
    where table_schema = 'public' and data_type = 'bytea' and column_name like 'wrapped%'
    order by 1`.execute(db);
  expect(rows.map((r) => r.c)).toEqual([
    "account_keys.wrapped_dek", // the root: rewrapRoot
    "blob_keys.wrapped_object_key", // scope account: rotateAccountKey; scope thread: under the thread key
    "exports.wrapped_key", // rotateAccountKey
    "thread_keys.wrapped_tk", // rotateAccountKey
  ]);
});
