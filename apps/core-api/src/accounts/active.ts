// 033. Whether an account has finished first run.
//
// A session exists from sign-in, while the account is still `invited` and has
// consented to nothing. First run only offers connecting a calendar and
// notifications after consent, and this is what makes the API agree: a route
// that brings anything in checks it rather than trusting the screen (SEC-2).

import type { FastifyInstance } from "fastify";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";

export async function isActive(accountId: string): Promise<boolean> {
  const row = await db.selectFrom("accounts").select("state").where("id", "=", accountId).executeTakeFirst();
  return row?.state === "active";
}

/** Every write behind a session, under these prefixes. A new route there is
 *  covered by being there, which is the point of one rule over per-route
 *  calls. `/internal/` is the agent's, `/api/auth/` is Better Auth's, and
 *  `/api/onboarding/complete` and `/api/me` are first run's own. */
const GUARDED = /^\/(v1|api\/connectors|api\/calendar)\//;

/** Writes an account in first run may make: joining the waitlist is public,
 *  and taking a push token away is part of signing out. */
const OPEN = new Set(["POST /v1/waitlist", "DELETE /v1/push-tokens"]);

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 033. Content waits for consent. Refused before the body is read, so the
 *  answer is the same whatever was sent; a request with no session is left to
 *  its route, which answers it as it always has. */
export function refuseWritesBeforeConsent(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (READS.has(request.method)) return;
    const path = request.url.split("?")[0] ?? "";
    if (!GUARDED.test(path) || OPEN.has(`${request.method} ${path}`)) return;

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const session = await auth.api.getSession({ headers });
    if (!session) return;
    // `state` is one of the session user's own fields (auth.ts), so this is
    // the read the route would make anyway.
    if ((session.user as { state?: string }).state === "active") return;
    // A string, so no route's response schema is consulted.
    return reply.code(403).type("application/json; charset=utf-8").send('{"error":"not_active"}');
  });
}
