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

/** Fastify preHandler. Answers 404, not 403: the admin panel does not confirm
 *  its own existence to someone who is signed in but not staff. */
export function requireStaff(minimum: StaffRole = "support") {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const staff = await currentStaff(request);
    if (!staff || (minimum === "owner" && staff.role !== "owner")) {
      await reply.status(404).send({ error: "not-found" });
      return;
    }
    request.staff = staff;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    staff?: Staff;
  }
}
