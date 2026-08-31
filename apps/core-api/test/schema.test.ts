// Tests against the real migrated schema, not a mock.
//
// The invariants here are the ones the security review found missing, so they
// are checked by the database rather than trusted to the code that writes the
// next insert.

import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const email = (n: string) => `${n}-${Date.now()}@example.test`;

describe("accounts.email uniqueness", () => {
  it("rejects the same address in a different case", async () => {
    const address = email("dupe");
    await db.insertInto("accounts").values({ email: address.toUpperCase() }).execute();
    await expect(
      db.insertInto("accounts").values({ email: address.toLowerCase() }).execute()
    ).rejects.toThrow(/accounts_email_key/);
  });

  it("frees the address once the account is soft deleted", async () => {
    const address = email("reuse");
    const first = await db
      .insertInto("accounts").values({ email: address }).returning(["id"]).executeTakeFirstOrThrow();
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", first.id).execute();
    // Partial on deleted_at IS NULL, so a deleted account does not hold an
    // address hostage forever.
    await expect(db.insertInto("accounts").values({ email: address }).execute()).resolves.toBeDefined();
  });
});

describe("state and role constraints", () => {
  it("refuses an account state outside the four", async () => {
    // Cast through the column's own type rather than `any`: the point is that
    // the database rejects it, not that TypeScript can be silenced.
    const banned = "banned" as unknown as "active";
    await expect(
      db.insertInto("accounts").values({ email: email("badstate"), state: banned }).execute()
    ).rejects.toThrow();
  });

  it("refuses a staff role outside support and owner", async () => {
    const account = await db
      .insertInto("accounts").values({ email: email("staff") }).returning(["id"]).executeTakeFirstOrThrow();
    const notARole = "admin" as unknown as "owner";
    await expect(
      db.insertInto("staff").values({ account_id: account.id, role: notARole }).execute()
    ).rejects.toThrow();
  });
});

describe("identity uniqueness", () => {
  it("refuses the same provider subject twice", async () => {
    const account = await db
      .insertInto("accounts").values({ email: email("ident") }).returning(["id"]).executeTakeFirstOrThrow();
    const subject = `sub-${Date.now()}`;
    await db.insertInto("account_identities")
      .values({ account_id: account.id, provider: "google", subject }).execute();
    await expect(
      db.insertInto("account_identities")
        .values({ account_id: account.id, provider: "google", subject }).execute()
    ).rejects.toThrow(/account_identities_provider_subject_key/);
  });
});

describe("uuid_v7", () => {
  it("is time-ordered across milliseconds and carries version 7", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const row = await db
        .selectNoFrom((eb) => eb.fn<string>("uuid_v7", []).as("id"))
        .executeTakeFirstOrThrow();
      ids.push(row.id);
      await new Promise((r) => setTimeout(r, 3));
    }
    expect([...ids].sort()).toEqual(ids);
    // Position 14 is the version nibble in the canonical text form.
    expect(ids.every((id) => id[14] === "7")).toBe(true);
  });
});
