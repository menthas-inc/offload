// The invite gate.
//
// Authentication and authorization are separate steps and the order matters.
// The provider proves who someone is. We decide whether they may in, and the
// answer is no unless an admin already made them an account.
//
// This module is the decision. It runs in two places on purpose, see auth.ts.

import { db } from "../db.js";

export type GateVerdict =
  | { allow: true; accountId: string; link: boolean }
  | { allow: false; reason: "no-invite" | "waitlisted" | "disabled" | "unverified-email" };

export interface ProviderIdentity {
  provider: "google" | "apple";
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

/** Decide whether a provider identity may sign in, and whether doing so links
 *  a new identity onto an existing account. Never provisions anything. */
export async function decide(identity: ProviderIdentity): Promise<GateVerdict> {
  // 1. A known identity signs in as itself.
  const existing = await db
    .selectFrom("account_identities")
    .innerJoin("accounts", "accounts.id", "account_identities.account_id")
    .select(["accounts.id as accountId", "accounts.state as state"])
    .where("account_identities.provider", "=", identity.provider)
    .where("account_identities.subject", "=", identity.subject)
    .executeTakeFirst();

  if (existing) {
    if (existing.state === "disabled") return { allow: false, reason: "disabled" };
    if (existing.state === "waitlist") return { allow: false, reason: "waitlisted" };
    return { allow: true, accountId: existing.accountId, link: false };
  }

  // 2. An unknown identity may link to an account, but only on a verified
  //    email. Linking on an unverified one means anyone who can claim an
  //    address at a sloppy provider can claim the account behind it.
  const email = identity.email?.trim().toLowerCase();
  if (!email || !identity.emailVerified) {
    return { allow: false, reason: email ? "unverified-email" : "no-invite" };
  }

  const account = await db
    .selectFrom("accounts")
    .select(["id", "state"])
    .where((eb) => eb(eb.fn("lower", ["email"]), "=", email))
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!account) return { allow: false, reason: "no-invite" };

  switch (account.state) {
    case "disabled":
      return { allow: false, reason: "disabled" };
    case "waitlist":
      // On the list but not through it. They see the no-invite screen, and
      // crucially no identity row is created: a refusal has no side effects.
      return { allow: false, reason: "waitlisted" };
    default:
      return { allow: true, accountId: account.id, link: true };
  }
}

/** Record a newly linked provider identity. Only ever called after decide()
 *  returned link: true. */
export async function link(accountId: string, identity: ProviderIdentity): Promise<void> {
  await db
    .insertInto("account_identities")
    .values({
      account_id: accountId,
      provider: identity.provider,
      subject: identity.subject,
      email: identity.email,
      email_verified: identity.emailVerified,
    })
    .onConflict((oc) => oc.columns(["provider", "subject"]).doNothing())
    .execute();
}

/** The verdict for attaching a provider identity to an account that already
 *  exists, which is the ordinary first sign-in of an invited person.
 *
 *  Better Auth has already matched the provider's verified email to that
 *  account by this point, so the only question left is whether the account is
 *  allowed to gain an identity at all. It is deliberately not the same
 *  function as decide(): decide() answers "which account is this identity?"
 *  and needs an email to do it, and at this moment in the flow we do not have
 *  one: the identity row being created carries a provider subject, not an
 *  address. Asking decide() here returned no-invite for every invited person,
 *  which made first sign-in impossible. */
export async function decideLink(accountId: string): Promise<GateVerdict> {
  const account = await db
    .selectFrom("accounts")
    .select(["id", "state"])
    .where("id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!account) return { allow: false, reason: "no-invite" };
  switch (account.state) {
    case "disabled":
      return { allow: false, reason: "disabled" };
    case "waitlist":
      return { allow: false, reason: "waitlisted" };
    default:
      return { allow: true, accountId: account.id, link: true };
  }
}
