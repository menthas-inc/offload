// The three gate layers, exercised as the library will call them.
//
// T-AC5: a refusal has no side effects. No account, no identity row, nothing
//        that makes a second attempt behave differently from the first.
// T-AC9: a session that commits after its account was disabled is deleted
//        straight away, so the disable's own session delete cannot be raced.
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
      before({ email: "stranger@example.com", emailVerified: true, name: "A" } as any)
    ).resolves.toBe(false);
  });

  it("leaves no account behind after a refused sign-in", async () => {
    const before = hooks.user!.create!.before!;
    await before({ email: "stranger@example.com", emailVerified: true } as any);
    const rows = await db.selectFrom("accounts").selectAll().execute();
    expect(rows).toHaveLength(0);
  });
});

describe("AC-5 a refusal creates no identity row", () => {
  const before = () => hooks.account!.create!.before!;

  it("refuses an account still on the waitlist", async () => {
    const id = await account("waiting@example.com", "waitlist");
    await expect(before()(identity(id) as any)).resolves.toBe(false);
    expect(await db.selectFrom("account_identities").selectAll().execute()).toHaveLength(0);
  });

  it("refuses a disabled account", async () => {
    const id = await account("gone@example.com", "disabled");
    await expect(before()(identity(id) as any)).resolves.toBe(false);
  });

  it("allows an invited one, which is the whole point of the gate", async () => {
    const id = await account("invited@example.com", "invited");
    const verdict = await before()(identity(id) as any);
    expect(verdict).not.toBe(false);
  });
});

describe("AC-9 a session is not issued to, or kept by, an account that may not hold one", () => {
  const create = () => hooks.session!.create!.before!;
  const created = () => hooks.session!.create!.after!;

  // A real row, because the after-hook runs once the insert has committed and
  // what it is given is that row.
  async function issued(accountId: string) {
    return db
      .insertInto("sessions")
      .values({ account_id: accountId, token: uuidv7(), expires_at: new Date(Date.now() + 60_000) })
      .returning(["id", "token", "expires_at"])
      .executeTakeFirstOrThrow();
  }

  const asCreated = (accountId: string, row: { id: string; token: string; expires_at: Date }) => ({
    id: row.id,
    userId: accountId,
    token: row.token,
    expiresAt: row.expires_at,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const stillThere = async (id: string) =>
    (await db.selectFrom("sessions").select("id").where("id", "=", id).executeTakeFirst()) !== undefined;

  it("refuses to issue one for a waitlisted account", async () => {
    const id = await account("waiting@example.com", "waitlist");
    await expect(create()(session(id) as any)).resolves.toBe(false);
  });

  it("issues one for an invited account, so first sign-in works", async () => {
    const id = await account("invited@example.com", "invited");
    await expect(create()(session(id) as any)).resolves.not.toBe(false);
  });

  it("deletes a session that committed after its account was disabled", async () => {
    // The race: the sign-in passed create.before, the account was disabled and
    // its sessions deleted, and then this insert committed. Nothing else would
    // ever remove it, and it would be good for thirty days.
    const id = await account("raced@example.com", "disabled");
    const row = await issued(id);
    await created()(asCreated(id, row) as any);
    expect(await stillThere(row.id)).toBe(false);
  });

  it("deletes a session that committed after its account was deleted", async () => {
    const id = await account("erased@example.com", "active");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", id).execute();
    const row = await issued(id);
    await created()(asCreated(id, row) as any);
    expect(await stillThere(row.id)).toBe(false);
  });

  it("keeps the session of an active account", async () => {
    const id = await account("live@example.com", "active");
    const row = await issued(id);
    await created()(asCreated(id, row) as any);
    expect(await stillThere(row.id)).toBe(true);
  });
});

// The provider tokens, which two comments claimed were blanked by a hook that
// did not exist. Google and Apple access and refresh tokens were sitting in
// account_identities in plaintext: a live third-party credential at rest, in a
// database whose content is deliberately not encrypted (OFF-2), and a
// credential is not what OFF-2's ceiling covers.
describe("provider tokens never reach the database", () => {
  const create = () => hooks.account!.create!.before!;
  const update = () => hooks.account!.update!.before!;

  const withTokens = (accountId: string) => ({
    ...identity(accountId),
    accessToken: "ya29.a0-live-access-token",
    refreshToken: "1//0e-live-refresh-token",
    idToken: "eyJ-live-id-token",
    accessTokenExpiresAt: new Date(),
    refreshTokenExpiresAt: new Date(),
    scope: "openid email profile",
  });

  it("strips them on the way in, not after the row is written", async () => {
    const id = await account("invited@example.com", "invited");
    const verdict = await create()(withTokens(id) as any);

    expect(verdict).not.toBe(false);
    const data = (verdict as { data: Record<string, unknown> }).data;
    for (const field of [
      "accessToken",
      "refreshToken",
      "idToken",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "scope",
    ]) {
      expect(data[field], `${field} must not be persisted`).toBeNull();
    }
  });

  it("strips them again on a second sign-in, which updates rather than creates", async () => {
    const id = await account("returning@example.com", "active");
    const verdict = await update()(withTokens(id) as any);

    const data = (verdict as { data: Record<string, unknown> }).data;
    expect(data["accessToken"]).toBeNull();
    expect(data["refreshToken"]).toBeNull();
    expect(data["idToken"]).toBeNull();
  });

  it("keeps the parts of the identity that are not credentials", async () => {
    const id = await account("keeps@example.com", "invited");
    const row = withTokens(id);
    const verdict = await create()(row as any);

    const data = (verdict as { data: Record<string, unknown> }).data;
    // The provider and its subject are how the identity is found again, so
    // stripping is targeted rather than a blanket wipe.
    expect(data["providerId"]).toBe(row.providerId);
    expect(data["accountId"]).toBe(row.accountId);
    expect(data["userId"]).toBe(id);
  });
});
