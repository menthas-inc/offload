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

import { recordAttempt } from "./attempt.js";
import { db } from "../db.js";

export type GateVerdict =
  | { allow: true; accountId: string; link: boolean }
  | {
      allow: false;
      reason: "no-invite" | "waitlisted" | "disabled" | "staff-linking";
      /** The address on the account that was refused, for the no-invite
       *  screen to name. Null when there is no account to read one from.
       *
       *  Carried on the verdict rather than fetched again by the caller
       *  because this function has the row in hand, and because a refusal
       *  that cannot say which address it checked is the dead end the
       *  attempt cookie exists to avoid. */
      email: string | null;
    };

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
    .select(["id", "state", "email"])
    .where("id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!account) return { allow: false, reason: "no-invite", email: null };
  if (account.state === "disabled")
    return { allow: false, reason: "disabled", email: account.email };
  if (account.state === "waitlist")
    return { allow: false, reason: "waitlisted", email: account.email };

  // Attaching a provider to a staff account is a privilege escalation with a
  // sign-in button on it: anyone who can get a provider to assert a staff
  // member's address inherits the admin panel. The spec calls for notifying
  // the existing identities and requiring a second admin's approval; until
  // that flow exists this fails closed instead, which is stricter than the
  // flow it stands in for. A staff member who loses a provider is unblocked by
  // another admin, not by a self-service link.
  // This read is what turns a refusal into one the gate can explain. It does
  // not close the race: Better Auth runs this hook and its insert as separate
  // statements, so no lock taken here would still be held when the insert
  // runs. The database holds the rest, partly: 0007's trigger on
  // account_identities refuses a staff account a second identity once one has
  // committed, and 0075's mirror on staff refuses staff to an account that has
  // two. Two first identities landing in the same instant are not serialised:
  // the trigger's check runs under READ COMMITTED, cannot see the other's
  // uncommitted row, and nothing makes account_id unique, so both can commit.
  // Closing that is held for a migration.
  const alreadyHasIdentity = await db
    .selectFrom("staff")
    .innerJoin("account_identities", "account_identities.account_id", "staff.account_id")
    .select("staff.account_id")
    .where("staff.account_id", "=", account.id)
    .executeTakeFirst();

  if (alreadyHasIdentity)
    return { allow: false, reason: "staff-linking", email: account.email };

  return { allow: true, accountId: account.id, link: true };
}

/** Whether an account may hold a session, asked at every sign-in.
 *
 *  A disabled account is told so: the refusal rides out with its address, and
 *  the screen says the account is disabled. Without it the person read "you
 *  are not on the list yet" about an account that exists, beside a button for
 *  a waitlist they are not on. A soft-deleted account and one still waiting
 *  are refused in silence, as before. */
export async function maySignIn(accountId: string): Promise<boolean> {
  const account = await db
    .selectFrom("accounts")
    .select(["state", "email"])
    .where("id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (account?.state === "disabled") recordAttempt(account.email, "disabled");
  return account?.state === "invited" || account?.state === "active";
}
