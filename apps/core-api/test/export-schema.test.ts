// 035 part B. What the database itself holds a copy to.
//
// AC-18 one row per account, and the key it is sealed under is on the row.
// AC-19 the row goes with the account.
// AC-15 Activity may say a copy is ready.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { ACCOUNT_LEDGER } from "../src/accounts/ledger.js";
import { account, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(async () => {
  await db.deleteFrom("exports").execute();
  await wipe();
});

function copy(accountId: string, state = "making") {
  return db
    .insertInto("exports")
    .values({ account_id: accountId, state: state as "making", wrapped_key: Buffer.from("k") })
    .returning(["id", "requested_at", "expires_at", "parts", "byte_size", "thread_ids"])
    .executeTakeFirstOrThrow();
}

describe("the exports table", () => {
  it("starts making, with the clock at the request and seven days on it", async () => {
    const me = await account();
    const row = await copy(me);
    expect(row.parts).toBe(0);
    expect(Number(row.byte_size)).toBe(0);
    expect(row.thread_ids).toEqual([]);
    const days = (row.expires_at!.getTime() - row.requested_at!.getTime()) / 86_400_000;
    expect(days).toBe(7);
  });

  it("holds one row per account", async () => {
    const me = await account();
    await copy(me);
    await expect(copy(me)).rejects.toThrow(/exports_account_id_key/);
  });

  it("refuses a state it does not know", async () => {
    const me = await account();
    await expect(copy(me, "emailed")).rejects.toThrow(/exports_state_check/);
  });

  it("goes with the account, and the ledger says so", async () => {
    const me = await account();
    await copy(me);
    await db.deleteFrom("accounts").where("id", "=", me).execute();
    expect(await db.selectFrom("exports").select("id").execute()).toEqual([]);
    expect(ACCOUNT_LEDGER["exports.account_id"]?.fate).toBe("cascade");
  });

  it("lets Activity say a copy is ready", async () => {
    const me = await account();
    await db
      .insertInto("activity")
      .values({ account_id: me, kind: "export", sent: false, reason: "design", title: "Your copy is ready", body: null })
      .execute();
    const rows = await db.selectFrom("activity").select("kind").where("account_id", "=", me).execute();
    expect(rows).toEqual([{ kind: "export" }]);
  });
});
