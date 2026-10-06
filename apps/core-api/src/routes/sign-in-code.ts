// 039. POST /api/sign-in/code: a review code, typed on the no-invite screen.
//
// The proof of who is asking is the refusal they were just handed: the signed
// `offload_attempt` value the gate sets when it turns a sign-in away, which
// names the address the provider asserted ten minutes ago at most. The web
// sends it as the cookie it is; the phones keep it from the refused response
// and send it back the same way. Nothing else is trusted for the address.
//
// Always 200, with one of three answers. `in`: the address is invited now, or
// already was, and signing in again opens first run. `refused`: the code did
// not work, or there have been too many tries; one answer, so the screen
// teaches a guesser nothing. `sign-in`: there is no live proof, so there is no
// address to let in.

import { z } from "zod";
import type { App } from "../app.js";
import { ATTEMPT_COOKIE, readCookie, unsealAttempt } from "../auth/attempt.js";
import { overLimit, redeem } from "../admin/review-codes.js";
import { env, isProduction } from "../env.js";

/** The proof is spent with a successful redemption, as the attempt read used
 *  to spend it. */
function cleared(): string {
  return [
    `${ATTEMPT_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(isProduction ? ["Secure"] : []),
    ...(env.COOKIE_DOMAIN !== "localhost" ? [`Domain=${env.COOKIE_DOMAIN}`] : []),
  ].join("; ");
}

export async function signInCodeRoutes(app: App): Promise<void> {
  app.post(
    "/api/sign-in/code",
    {
      schema: {
        body: z.object({ code: z.string().max(40) }),
        response: { 200: z.object({ status: z.enum(["in", "refused", "sign-in"]) }) },
      },
    },
    async (request, reply) => {
      const raw = readCookie(request.headers.cookie, ATTEMPT_COOKIE);
      const attempt = raw ? unsealAttempt(raw, Date.now()) : null;
      if (!attempt) return reply.send({ status: "sign-in" as const });
      // A disabled account is not reopened by a code. Said before anything is
      // counted, since there is nothing a try could change.
      if (attempt.reason === "disabled") return reply.send({ status: "refused" as const });

      if (await overLimit(attempt.email, request.ip)) return reply.send({ status: "refused" as const });

      const status = await redeem(attempt.email, request.body.code);
      if (status === "in") reply.header("set-cookie", cleared());
      return reply.send({ status });
    }
  );
}
