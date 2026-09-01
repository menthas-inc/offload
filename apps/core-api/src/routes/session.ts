// Who am I, and finishing first run.
//
// Three small routes that the web and mobile shells both need before they can
// render anything: the current account, the address a refused sign-in used,
// and the write that ends onboarding.

import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { ATTEMPT_COOKIE, readCookie, unseal } from "../auth/attempt.js";
import { db } from "../db.js";
import { emit } from "../analytics.js";
import { env, isProduction } from "../env.js";

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

/** The signed-in account id, or null. Reads the session through Better Auth
 *  rather than the sessions table directly, so cookie signing and expiry are
 *  checked by the thing that issued them. */
async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

/** Declared on every authenticated route, because the type provider narrows
 *  reply.send() to the shapes the schema names and an undeclared 401 does not
 *  compile. That is the schema doing its job. */
const unauthenticated = z.object({ error: z.literal("unauthenticated") });

const meResponse = z.object({
  state: z.enum(["invited", "active"]),
  displayName: z.string().nullable(),
  email: z.string(),
  /** invited means the account exists and has never finished first run. The
   *  client does not get to decide this; it is the account's state. */
  needsFirstRun: z.boolean(),
});

/** invited -> active, plus the event, in one transaction.
 *
 *  Idempotent by the where clause rather than by a read-then-write: the update
 *  only matches an account still in `invited`, so a double tap or a reload of
 *  the last screen flips nothing a second time and emits nothing a second
 *  time. Two concurrent requests are the same case as one slow one. */
export async function completeFirstRun(accountId: string): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const flipped = await tx
      .updateTable("accounts")
      .set({ state: "active", updated_at: new Date() })
      .where("id", "=", accountId)
      .where("state", "=", "invited")
      .returning("analytics_subject_id")
      .executeTakeFirst();

    if (!flipped) return;

    await emit({
      name: "onboarding_completed",
      subjectId: flipped.analytics_subject_id,
      platform: "web",
      tx,
    });
  });
}

export async function sessionRoutes(app: App): Promise<void> {
  app.get("/api/me", { schema: { response: { 200: meResponse, 401: unauthenticated } } }, async (request, reply) => {
    const accountId = await currentAccountId(request);
    if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

    const account = await db
      .selectFrom("accounts")
      .select(["state", "display_name", "email"])
      .where("id", "=", accountId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    // A session outliving its account, or an account disabled since the
    // session was issued. Both are 401 rather than 200-with-a-flag: there is
    // nothing for the shell to render either way.
    if (!account || (account.state !== "invited" && account.state !== "active")) {
      return reply.status(401).send({ error: "unauthenticated" });
    }

    return reply.send({
      state: account.state,
      displayName: account.display_name,
      email: account.email,
      needsFirstRun: account.state === "invited",
    });
  });

  // The address a refused sign-in used, read once and then cleared. No session
  // is required, because by definition the person holding this cookie does not
  // have one. The cookie itself is the authorization, and all it unlocks is
  // an address they authenticated with a minute ago.
  app.get(
    "/api/sign-in/attempt",
    { schema: { response: { 200: z.object({ email: z.string().nullable() }) } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = readCookie(request.headers.cookie, ATTEMPT_COOKIE);
      const email = raw ? unseal(raw, Date.now()) : null;

      const cleared = [
        `${ATTEMPT_COOKIE}=`,
        "Path=/",
        "Max-Age=0",
        "HttpOnly",
        "SameSite=Lax",
        ...(isProduction ? ["Secure"] : []),
        ...(env.COOKIE_DOMAIN !== "localhost" ? [`Domain=${env.COOKIE_DOMAIN}`] : []),
      ].join("; ");
      reply.header("set-cookie", cleared);

      return reply.send({ email });
    }
  );

  // Finishing first run is a server-side write, not a flag the client keeps.
  // Skipping and completing are the same call: the three screens are an
  // introduction, not a form, so there is nothing to collect and nothing that
  // makes a skipped run less finished than a read one.
  app.post(
    "/api/onboarding/complete",
    { schema: { response: { 200: z.object({ state: z.literal("active") }), 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      await completeFirstRun(accountId);
      return reply.send({ state: "active" as const });
    }
  );
}
