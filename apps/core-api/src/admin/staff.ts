// Who is allowed into the admin panel.
//
// The check is a join from the session to the staff table. It never reads an
// email out of the environment and compares it to a claim: env.ADMIN_EMAILS is
// read once by seed:admins and is not consulted on any request path, so an
// address in a variable can never become an authorization decision at runtime
// (SEC-1). Editing that variable grants nothing until someone runs the seed.
//
// It also uses the account id the session already resolved rather than
// re-deriving one from the token's email claim, because "the account this
// session belongs to" and "an account with this email" are two different
// questions, and only the first one is the session's.

import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import type { AuditKind } from "./audit.js";

export type StaffRole = "support" | "owner";

export interface Staff {
  accountId: string;
  role: StaffRole;
}

export async function currentStaff(request: FastifyRequest): Promise<Staff | null> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const row = await db
    .selectFrom("staff")
    .innerJoin("accounts", "accounts.id", "staff.account_id")
    .select(["staff.account_id as accountId", "staff.role as role"])
    .where("staff.account_id", "=", session.session.userId)
    // A disabled or deleted account loses admin with everything else. Without
    // these two clauses, revoking someone's access would mean remembering to
    // delete a second row.
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .executeTakeFirst();

  return row ? { accountId: row.accountId, role: row.role } : null;
}

/** The roles in order, least first. A check is a comparison of ranks, so a
 *  third role is a new entry here and not a new branch in every guard. */
const RANKS: readonly StaffRole[] = ["support", "owner"];

export function atLeast(role: StaffRole, minimum: StaffRole): boolean {
  return RANKS.indexOf(role) >= RANKS.indexOf(minimum);
}

/** The staff check, as a Fastify hook. Answers 404, not 403: the admin panel
 *  does not confirm its own existence to someone who is signed in but not
 *  staff, and support does not see an owner page refused, it does not see it.
 *
 *  034. Registered once as `onRequest` on the whole `/v1/admin` prefix and
 *  again, at `owner`, on the scope the owner pages live in, so a route nobody
 *  remembered to guard is refused anyway. A route that is owner-only inside a
 *  page support does see declares `config: { rank: "owner" }`, and this reads
 *  it: the floor is whichever of the two is higher. */
export function requireStaff(minimum: StaffRole = "support") {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
    const declared = request.routeOptions?.config?.rank;
    const floor = declared && atLeast(declared, minimum) ? declared : minimum;
    // The prefix's hook has already resolved the session by the time the
    // owner scope's runs; one lookup a request.
    const staff = request.staff ?? (await currentStaff(request));
    if (!staff || !atLeast(staff.role, floor)) {
      return reply.status(404).send({ error: "not-found" });
    }
    request.staff = staff;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    staff?: Staff;
  }
  interface FastifyContextConfig {
    /** 034. The least role that may call this route, where it is higher than
     *  its section's. Read by `requireStaff`. */
    rank?: StaffRole;
    /** 034. The audit entry this route writes. Every admin route that is not
     *  a GET declares one, and a test walks the route table to hold that. */
    audit?: AuditKind;
  }
}
