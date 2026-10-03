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
    // The route the router chose, never the raw URL: the router decodes a
    // segment, so `/%76%31/dumps` reaches `/v1/dumps` while `request.url`
    // still reads `/%76%31/...`. No route, nothing to guard: it is a 404.
    const path = request.routeOptions.url;
    if (!path || !GUARDED.test(path) || OPEN.has(`${request.method} ${path}`)) return;

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const session = await auth.api.getSession({ headers });
    if (!session) return;
    // The row, not the session user's copy of it: a session cache turned on
    // later would make that a cookie read, stale both ways across first run.
    if (await isActive(session.session.userId)) return;
    // A string, so no route's response schema is consulted.
    return reply.code(403).type("application/json; charset=utf-8").send('{"error":"not_active"}');
  });
}
