// The three gate layers, exercised as the library will call them.
//
// T-AC5: a refusal has no side effects. No account, no identity row, nothing
//        that makes a second attempt behave differently from the first.
// T-AC9: disabling an account stops an existing session at its next refresh,
//        not at token expiry.
//
// These call the hooks off auth.options directly. That is deliberate: a test
// that reimplements the decision proves the test, and a full OAuth round trip
// needs a provider. The hooks are the seam where our decision meets theirs.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { auth } from "../src/auth/auth.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

const hooks = auth.options.databaseHooks!;

type State = "waitlist" | "invited" | "active" | "disabled";

async function account(email: string, state: State): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email, state })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  return row.id;
}

const identity = (accountId: string) => ({
  id: uuidv7(),
  userId: accountId,
  providerId: "google",
  accountId: uuidv7(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

const session = (accountId: string) => ({
  id: uuidv7(),
  userId: accountId,
  token: uuidv7(),
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("AC-5 nothing provisions an account", () => {
  it("refuses to create a user, whatever the provider asserts", async () => {
    const before = hooks.user!.create!.before!;
    await expect(
      before({ email: "stranger@example.com", emailVerified: true, name: "A" } as any, undefined as never)
    ).resolves.toBe(false);
  });

  it("leaves no account behind after a refused sign-in", async () => {
    const before = hooks.user!.create!.before!;
    await before({ email: "stranger@example.com", emailVerified: true } as any, undefined as never);
    const rows = await db.selectFrom("accounts").selectAll().execute();
    expect(rows).toHaveLength(0);
  });
});

describe("AC-5 a refusal creates no identity row", () => {
  const before = () => hooks.account!.create!.before!;

  it("refuses an account still on the waitlist", async () => {
    const id = await account("waiting@example.com", "waitlist");
    await expect(before()(identity(id) as any, undefined as never)).resolves.toBe(false);
    expect(await db.selectFrom("account_identities").selectAll().execute()).toHaveLength(0);
  });

  it("refuses a disabled account", async () => {
    const id = await account("gone@example.com", "disabled");
    await expect(before()(identity(id) as any, undefined as never)).resolves.toBe(false);
  });

  it("allows an invited one, which is the whole point of the gate", async () => {
    const id = await account("invited@example.com", "invited");
    const verdict = await before()(identity(id) as any, undefined as never);
    expect(verdict).not.toBe(false);
  });
});

describe("AC-9 a session is not issued or extended for an account that may not hold one", () => {
  const create = () => hooks.session!.create!.before!;
  const update = () => hooks.session!.update!.before!;

  it("refuses to issue one for a waitlisted account", async () => {
    const id = await account("waiting@example.com", "waitlist");
    await expect(create()(session(id) as any, undefined as never)).resolves.toBe(false);
  });

  it("issues one for an invited account, so first sign-in works", async () => {
    const id = await account("invited@example.com", "invited");
    await expect(create()(session(id) as any, undefined as never)).resolves.not.toBe(false);
  });

  it("refuses to extend a live session once the account is disabled", async () => {
    const id = await account("live@example.com", "active");
    const live = session(id);

    await expect(update()(live as any, undefined as never)).resolves.not.toBe(false);

    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();

    // The refresh is where a session that should have died gets its extension,
    // so refusing here is what makes disabling take effect in minutes rather
    // than at the end of a thirty day cookie.
    await expect(update()(live as any, undefined as never)).resolves.toBe(false);
  });

  it("refuses to extend a session whose account was deleted", async () => {
    const id = await account("erased@example.com", "active");
    const live = session(id);
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", id).execute();
    await expect(update()(live as any, undefined as never)).resolves.toBe(false);
  });
});
