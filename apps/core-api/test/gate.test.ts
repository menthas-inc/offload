// The invite gate. This is the product's entire access control, so it is
// tested as a decision table rather than as a happy path.
//
// AC-5: a valid provider login for an identity nobody invited provisions
//       nothing and is refused.
// AC-6: a second provider whose verified email matches an existing account
//       links to it. An unverified email never links.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { decideLink } from "../src/auth/gate.js";
import { auth } from "../src/auth/auth.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

type State = "waitlist" | "invited" | "active" | "disabled";

async function account(email: string, state: State): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email, state, email_verified: true })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  return row.id;
}

async function identity(accountId: string, provider: "google" | "apple"): Promise<void> {
  await db
    .insertInto("account_identities")
    // issuer as well as provider, which is what Better Auth writes: 1.7 scopes
    // an identity by issuer, and for a social provider the two are the same.
    .values({ account_id: accountId, provider, issuer: provider, subject: uuidv7(), email_verified: true })
    .execute();
}

// AC-5, from the direction that actually runs. decideLink is what the account
// hook calls when an invited person signs in for the very first time, and the
// bug it was written to fix made that impossible: the hook asked a function
// that needed an email it did not have, found no identity row because there
// was not one yet, and told every invited person they had no invite.
describe("AC-5 attaching a first identity to an existing account", () => {
  it("lets an invited account through, which is first sign-in", async () => {
    const id = await account("invited@example.com", "invited");
    await expect(decideLink(id)).resolves.toMatchObject({ allow: true, accountId: id });
  });

  it("lets an active account gain a second provider", async () => {
    const id = await account("active@example.com", "active");
    await expect(decideLink(id)).resolves.toMatchObject({ allow: true });
  });

  it("refuses an account still on the waitlist", async () => {
    const id = await account("waiting@example.com", "waitlist");
    // The address rides on the verdict so the no-invite screen can name it.
    // This is the likeliest way onto that screen: join the waitlist, get
    // impatient, tap Sign in.
    await expect(decideLink(id)).resolves.toEqual({
      allow: false,
      reason: "waitlisted",
      email: "waiting@example.com",
    });
  });

  it("refuses a disabled account", async () => {
    const id = await account("gone@example.com", "disabled");
    await expect(decideLink(id)).resolves.toEqual({
      allow: false,
      reason: "disabled",
      email: "gone@example.com",
    });
  });

  it("refuses a soft-deleted account", async () => {
    const id = await account("erased@example.com", "active");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", id).execute();
    // Soft-deleted reads as no account at all, so there is no address to name
    // and the screen falls back to its address-less copy.
    await expect(decideLink(id)).resolves.toEqual({
      allow: false,
      reason: "no-invite",
      email: null,
    });
  });

  it("refuses an account id that does not exist", async () => {
    await expect(decideLink("00000000-0000-7000-8000-000000000000")).resolves.toEqual({
      allow: false,
      reason: "no-invite",
      email: null,
    });
  });
});

describe("linking a provider onto a staff account", () => {
  it("is refused once that account already has one", async () => {
    const id = await account("support@example.com", "active");
    await identity(id, "google");
    await db.insertInto("staff").values({ account_id: id, role: "support" }).execute();

    // Fails closed. Anyone who can get a provider to assert a staff member's
    // address would otherwise inherit the admin panel with one button.
    await expect(decideLink(id)).resolves.toEqual({
      allow: false,
      reason: "staff-linking",
      email: "support@example.com",
    });
  });

  // The application check and the database constraint are not redundant.
    // decideLink's SELECT ... FOR UPDATE runs outside any transaction this code
    // owns, because Better Auth calls the hook and then, separately, the
    // INSERT. The row lock is released before the insert happens, so the window
    // the comment claimed to close was open. The trigger runs inside that
    // INSERT, which is the only place it can actually be closed.
    it("is refused by the database too, not only by the gate", async () => {
      const id = await account("locked@example.com", "active");
      await identity(id, "google");
      await db.insertInto("staff").values({ account_id: id, role: "support" }).execute();

      await expect(identity(id, "apple")).rejects.toThrow(/second identity/i);
    });

    it("still allows the first one, so a new admin can sign in at all", async () => {
    const id = await account("newadmin@example.com", "invited");
    await db.insertInto("staff").values({ account_id: id, role: "owner" }).execute();
    await expect(decideLink(id)).resolves.toMatchObject({ allow: true });
  });
});

// AC-6 lives in Better Auth's linking rule, not in our code, so this asserts
// the configuration rather than a function. Three settings decide whether an
// invited person can sign in and whether an unverified address can claim an
// account, and all three are easy to change without noticing either effect.
describe("AC-6 the account linking configuration", () => {
  // Read through the library's option type rather than the literal passed in,
  // so a setting the literal never names can still be asserted absent.
  const linking: NonNullable<BetterAuthOptions["account"]>["accountLinking"] = auth.options.account?.accountLinking;

  it("is enabled, because a first identity is attached by linking", () => {
    expect(linking?.enabled).toBe(true);
  });

  it("names no trusted provider, which would waive the provider's own email check", () => {
    // better-auth refuses to link when (!isTrustedProvider && !providerEmailVerified).
    // Listing a provider here turns off the left side, and the provider's
    // verified email is the single assertion this gate rests on.
    expect(linking?.trustedProviders ?? []).toEqual([]);
  });

  it("does not require our own email_verified, which is false at invite time", () => {
    // An admin typed the address; we have not confirmed it. Left at its
    // default of true, every invited person is refused at first sign-in.
    expect(linking?.requireLocalEmailVerified).toBe(false);
  });

  it("does not disable implicit linking", () => {
    expect(linking?.disableImplicitLinking ?? false).toBe(false);
  });
});
