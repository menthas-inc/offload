// 033. Whether an account has finished first run.
//
// A session exists from sign-in, while the account is still `invited` and has
// consented to nothing. First run only offers connecting a calendar and
// notifications after consent, and this is what makes the API agree: a route
// that brings anything in checks it rather than trusting the screen (SEC-2).
//
// 034 added the rule for the other direction: whether offload does anything
// for an account in the background.

import type { FastifyInstance } from "fastify";
import { currentAccountId } from "../auth/current-account.js";
import { sql, type RawBuilder } from "kysely";
import { db } from "../db.js";
import type { Executor } from "../threads/access.js";

export async function isActive(accountId: string): Promise<boolean> {
  const row = await db.selectFrom("accounts").select("state").where("id", "=", accountId).executeTakeFirst();
  return row?.state === "active";
}

/** 034. Whether offload works for an account when nobody is asking: the
 *  nightly pass, a digest, a push, a calendar sync, mail in. **One rule for
 *  every scheduled job**, so disabling somebody, or marking them for
 *  deletion, stops all of it without one check per job to forget.
 *
 *  As a fragment, for a query that joins `accounts` under `alias`. */
export function inBackground(alias = "accounts"): RawBuilder<boolean> {
  const column = (name: string) => sql.ref(`${alias}.${name}`);
  return sql<boolean>`(${column("state")} = 'active' and ${column("deleted_at")} is null and ${column("delete_after")} is null)`;
}

/** The same rule for one account. */
export async function worksInBackground(accountId: string, trx: Executor = db): Promise<boolean> {
  const row = await trx.selectFrom("accounts").select("id").where("id", "=", accountId).where(inBackground()).executeTakeFirst();
  return row !== undefined;
}

/** 034. An account the panel counts as a person: it has signed in at least
 *  once, it is active or disabled, and it has not been removed. People's list
 *  and stats, a person's page and Costs' per-account figure all count this
 *  set, so no two of them can disagree about how many there are.
 *
 *  As a fragment, for a query that reads `accounts` under `alias`. */
export function signedIn(alias = "accounts"): RawBuilder<boolean> {
  const column = (name: string) => sql.ref(`${alias}.${name}`);
  return sql<boolean>`(${column("first_signed_in_at")} is not null and ${column("state")} in ('active', 'disabled') and ${column("deleted_at")} is null)`;
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
    // 034. The admin API answers for itself: its guard lets in only staff
    // whose account is active (`admin/staff.ts`), which is this rule and
    // more, and it answers 404 to everything else. A second lookup here
    // would answer first, and in its own words, when the session cannot be
    // read.
    if (path.startsWith("/v1/admin/")) return;

    const accountId = await currentAccountId(request);
    if (!accountId) return;
    // The row, not the session user's copy of it: a session cache turned on
    // later would make that a cookie read, stale both ways across first run.
    if (await isActive(accountId)) return;
    // A string, so no route's response schema is consulted.
    return reply.code(403).type("application/json; charset=utf-8").send('{"error":"not_active"}');
  });
}
