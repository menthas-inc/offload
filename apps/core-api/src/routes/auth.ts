// Mounting Better Auth on Fastify.
//
// Better Auth speaks the web Fetch API. Fastify speaks Node streams. This is
// the adapter between them, and it is deliberately thin: every decision worth
// making lives in auth.ts and gate.ts, not here.

import type { FastifyReply, FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { ATTEMPT_COOKIE, seal, withAttempt, type AttemptReason } from "../auth/attempt.js";
import { env, isProduction } from "../env.js";

const ATTEMPT_MAX_AGE = 10 * 60;

function attemptCookie(email: string, reason: AttemptReason | null): string {
  const parts = [
    `${ATTEMPT_COOKIE}=${encodeURIComponent(seal(email, Date.now(), reason))}`,
    "Path=/",
    `Max-Age=${ATTEMPT_MAX_AGE}`,
    "HttpOnly",
    // Lax, not Strict: the browser arrives here on a top-level redirect back
    // from Google or Apple, and Strict would drop the cookie on exactly that
    // navigation.
    "SameSite=Lax",
  ];
  if (isProduction) parts.push("Secure");
  if (env.COOKIE_DOMAIN !== "localhost") parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  return parts.join("; ");
}

export async function authRoutes(app: App): Promise<void> {
  // Better Auth owns everything under its base path: the provider redirects,
  // the callbacks, session reads and sign-out.
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request: FastifyRequest, reply: FastifyReply) {
      const url = new URL(request.url, env.API_URL);

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
      }
      // The one address Fastify trusts, and nothing else. Better Auth reads
      // this header itself and, with no trusted proxies configured, accepts
      // it only when it holds exactly one address; a chain or a missing header
      // sent the request to a bucket shared by everyone it could not place,
      // which is the warning the API log carried on 2026-09-23. Fastify has
      // already resolved the client under trustProxy, so that is what it gets.
      headers.set("x-forwarded-for", request.ip);

      // The store is opened here so the gate's refusal, several layers down
      // inside Better Auth, can hand the attempted address back out.
      const { response, attempt, reason } = await withAttempt(async (store) => ({
        response: await auth.handler(
          new Request(url, {
            method: request.method,
            headers,
            ...(request.method === "GET" || request.method === "HEAD"
              ? {}
              : { body: JSON.stringify(request.body ?? {}) }),
          })
        ),
        attempt: store.email,
        reason: store.reason,
      }));

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // set-cookie may legitimately appear more than once, and header() would
        // overwrite rather than append.
        if (key.toLowerCase() === "set-cookie") reply.header("set-cookie", value);
        else reply.header(key, value);
      });

      // Only ever set on a refusal, and only on the redirect that carries the
      // browser to the no-invite screen.
      if (attempt) reply.header("set-cookie", attemptCookie(attempt, reason));

      return reply.send(response.body ? await response.text() : null);
    },
  });
}
