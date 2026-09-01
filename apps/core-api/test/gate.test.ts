// The invite gate. This is the product's entire access control, so it is
// tested as a decision table rather than as a happy path.
//
// AC-5: a valid provider login for an identity nobody invited provisions
//       nothing and is refused.
// AC-6: a second provider whose verified email matches an existing account
//       links to it. An unverified email never links.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { decide, link, type ProviderIdentity } from "../src/auth/gate.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
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

const google = (subject: string, email: string | null, verified = true): ProviderIdentity => ({
  provider: "google",
  subject,
  email,
  emailVerified: verified,
});

describe("AC-5 nobody gets in who was not invited", () => {
  it("refuses an identity with no account at all", async () => {
    const verdict = await decide(google("sub-1", "stranger@example.test"));
    expect(verdict).toEqual({ allow: false, reason: "no-invite" });
  });

  it("provisions nothing when it refuses", async () => {
    await decide(google("sub-2", "stranger@example.test"));
    const accounts = await db.selectFrom("accounts").selectAll().execute();
    const identities = await db.selectFrom("account_identities").selectAll().execute();
    expect(accounts).toHaveLength(0);
    expect(identities).toHaveLength(0);
  });

  it("refuses someone who is on the waitlist but not through it", async () => {
    await account("waiting@example.test", "waitlist");
    const verdict = await decide(google("sub-3", "waiting@example.test"));
    expect(verdict).toEqual({ allow: false, reason: "waitlisted" });
  });

  it("leaves no identity row behind for a waitlisted refusal", async () => {
    await account("waiting@example.test", "waitlist");
    await decide(google("sub-4", "waiting@example.test"));
    // The refusal must have no side effects. A disabled or waitlisted account
    // silently gaining an unreviewed provider identity is a landmine for
    // whoever looks at it later.
    const identities = await db.selectFrom("account_identities").selectAll().execute();
    expect(identities).toHaveLength(0);
  });

  it("refuses a disabled account, by email and by known identity alike", async () => {
    const id = await account("gone@example.test", "disabled");
    expect(await decide(google("sub-5", "gone@example.test"))).toEqual({
      allow: false,
      reason: "disabled",
    });

    await db
      .insertInto("account_identities")
      .values({ account_id: id, provider: "google", subject: "sub-6", email_verified: true })
      .execute();
    expect(await decide(google("sub-6", "gone@example.test"))).toEqual({
      allow: false,
      reason: "disabled",
    });
  });
});

describe("AC-6 one person, several providers", () => {
  it("links a new provider onto an invited account on a verified email", async () => {
    const id = await account("invited@example.test", "invited");
    const verdict = await decide(google("sub-7", "invited@example.test"));
    expect(verdict).toEqual({ allow: true, accountId: id, link: true });
  });

  it("never links on an unverified email", async () => {
    await account("invited@example.test", "invited");
    const verdict = await decide(google("sub-8", "invited@example.test", false));
    expect(verdict).toEqual({ allow: false, reason: "unverified-email" });
  });

  it("matches an address regardless of case or surrounding space", async () => {
    const id = await account("mixed@example.test", "active");
    const verdict = await decide(google("sub-9", "  Mixed@Example.TEST  "));
    expect(verdict).toEqual({ allow: true, accountId: id, link: true });
  });

  it("recognises an already linked identity without linking again", async () => {
    const id = await account("known@example.test", "active");
    await link(id, google("sub-10", "known@example.test"));

    const verdict = await decide(google("sub-10", "known@example.test"));
    expect(verdict).toEqual({ allow: true, accountId: id, link: false });

    await link(id, google("sub-10", "known@example.test"));
    const identities = await db.selectFrom("account_identities").selectAll().execute();
    expect(identities).toHaveLength(1);
  });

  it("reaches the same account from two different providers", async () => {
    const id = await account("both@example.test", "active");

    const first = await decide(google("g-1", "both@example.test"));
    expect(first).toMatchObject({ allow: true, accountId: id });
    await link(id, google("g-1", "both@example.test"));

    const second = await decide({
      provider: "apple",
      subject: "a-1",
      email: "both@example.test",
      emailVerified: true,
    });
    expect(second).toMatchObject({ allow: true, accountId: id, link: true });
  });

  it("cannot be reached by an Apple relay address, which is a documented limit", async () => {
    await account("real@example.test", "active");
    const verdict = await decide({
      provider: "apple",
      subject: "a-2",
      email: "abc123@privaterelay.appleid.com",
      emailVerified: true,
    });
    // Not a bug. The relay address matches no account, so the person sees the
    // no-invite screen and is told why, rather than failing silently.
    expect(verdict).toEqual({ allow: false, reason: "no-invite" });
  });
});
