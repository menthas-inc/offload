// The invite gate.
//
// Authentication and authorization are separate steps and the order matters.
// The provider proves who someone is. We decide whether they may in, and the
// answer is no unless an admin already made them an account.
//
// This module is the decision, and it is the only one. An earlier draft also
// carried decide(), which answered "which account is this identity?" by
// matching a verified email itself. It was deleted rather than kept for later:
// once Better Auth resolves the identity, a second unreachable implementation
// of the same decision is the two-sources-of-truth problem auth.ts opens by
// warning about, and its tests were reading as coverage of a live path.

import { db } from "../db.js";

export type GateVerdict =
  | { allow: true; accountId: string; link: boolean }
  | { allow: false; reason: "no-invite" | "waitlisted" | "disabled" | "staff-linking" };

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
  if (account.state === "disabled") return { allow: false, reason: "disabled" };
  if (account.state === "waitlist") return { allow: false, reason: "waitlisted" };

  // Attaching a provider to a staff account is a privilege escalation with a
  // sign-in button on it: anyone who can get a provider to assert a staff
  // member's address inherits the admin panel. The spec calls for notifying
  // the existing identities and requiring a second admin's approval; until
  // that flow exists this fails closed instead, which is stricter than the
  // flow it stands in for. A staff member who loses a provider is unblocked by
  // another admin, not by a self-service link.
  const alreadyHasIdentity = await db
    .selectFrom("staff")
    .innerJoin("account_identities", "account_identities.account_id", "staff.account_id")
    .select("staff.account_id")
    .where("staff.account_id", "=", account.id)
    .executeTakeFirst();

  if (alreadyHasIdentity) return { allow: false, reason: "staff-linking" };

  return { allow: true, accountId: account.id, link: true };
}
