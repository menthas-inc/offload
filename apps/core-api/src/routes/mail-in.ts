/** 026. POST /v1/mail/inbound: the one public door the mail Worker uses.
 *
 *  Its own secret, never `INTERNAL_SERVICE_TOKEN`: the Worker runs on
 *  Cloudflare, outside Railway's private network, and a token that opens the
 *  internal routes must never leave it. The Worker signs a timestamp and the
 *  body's hash; a request older than five minutes is refused, and a replay
 *  inside that window resubmits a signature the sender check has already
 *  spent.
 *
 *  Accepted and refused are answered identically, so the Worker never learns
 *  which and neither does anything that can read its logs. 503 is the one
 *  other answer, for a check that could not be run, so the Worker retries.
 *
 *  Nothing from the email is logged: not the body, which the request
 *  serialiser never reads, and not an error's message, which this scope's
 *  error handler replaces with its code (OFF-1). */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Resolver } from "../mail-in/sender.js";
import { receiveMail } from "../mail-in/receive.js";

export const MAX_MAIL_BYTES = 26 * 1024 * 1024;
const WINDOW_MS = 5 * 60 * 1000;

function signatureMatches(secrets: string[], timestamp: string, body: Buffer, presented: string): boolean {
  const given = Buffer.from(presented, "utf8");
  const digest = createHash("sha256").update(body).digest("hex");
  let ok = false;
  for (const secret of secrets) {
    const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${digest}`).digest("hex"), "utf8");
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}

export async function mailInRoutes(app: FastifyInstance, opts: { secrets: string[]; resolver?: Resolver }): Promise<void> {
  app.addContentTypeParser("message/rfc822", { parseAs: "buffer", bodyLimit: MAX_MAIL_BYTES }, (_request, body, done) =>
    done(null, body),
  );

  app.setErrorHandler((error, request, reply) => {
    const { code, statusCode } = (error ?? {}) as { code?: string; statusCode?: number };
    request.log.warn({ code: code ?? "unknown", status: statusCode ?? 500 }, "mail inbound refused");
    return reply.code(statusCode ?? 500).type("application/json; charset=utf-8").send("{}");
  });

  app.post("/v1/mail/inbound", async (request, reply) => {
    const timestamp = String(request.headers["x-mail-timestamp"] ?? "");
    const signature = String(request.headers["x-mail-signature"] ?? "");
    const body = request.body;
    const at = Number(timestamp);
    if (
      opts.secrets.length === 0 ||
      !Buffer.isBuffer(body) ||
      !signature ||
      !Number.isFinite(at) ||
      Math.abs(Date.now() - at) > WINDOW_MS ||
      !signatureMatches(opts.secrets, timestamp, body, signature)
    ) {
      request.log.warn({ outcome: "unauthenticated" }, "mail inbound refused");
      return reply.code(401).type("application/json; charset=utf-8").send("{}");
    }
    const outcome = await receiveMail(body, opts.resolver ? { resolver: opts.resolver } : {});
    request.log.info({ outcome }, "mail received");
    return reply
      .code(outcome === "key_unavailable" ? 503 : 200)
      .type("application/json; charset=utf-8")
      .send("{}");
  });
}
