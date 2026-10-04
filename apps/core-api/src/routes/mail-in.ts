/** 026. POST /v1/mail/resend: Resend's webhook for an email it received on
 *  to.offload.club.
 *
 *  Resend receives on an MX record for the subdomain alone, so the root
 *  domain's mail stays Google Workspace's. Its webhook carries metadata
 *  only and is signed with Svix; the route verifies that signature on the raw
 *  body, fetches the received email from Resend's API, downloads its raw
 *  bytes and hands them to the sender check, which verifies the sender's own
 *  DKIM signature itself rather than trusting Resend's verdict.
 *
 *  Accepted and refused are answered identically. 503 is the one other
 *  answer, for an email whose check could not be run, whose bytes could not
 *  be fetched, or that arrived while `MAX_IN_FLIGHT` others were being
 *  handled, so Resend delivers the webhook again later.
 *
 *  Nothing from the email is logged: not the body, which the request
 *  serialiser never reads, not the email's id, and not an error's message,
 *  which this scope's error handler replaces with its code (OFF-1). */

import type { FastifyInstance, FastifyReply } from "fastify";
import { Webhook } from "svix";
import { ADDRESS, type Resolver } from "../mail-in/sender.js";
import { receiveMail } from "../mail-in/receive.js";

export const MAX_MAIL_BYTES = 26 * 1024 * 1024;
/** How many deliveries this process fetches and parses at once. Anybody can
 *  cause one by emailing the address, and each is a download of up to
 *  `MAX_MAIL_BYTES` and a parse, before any account or cap is known. Past
 *  this, Resend is asked to bring it back later, which it does. */
export const MAX_IN_FLIGHT = 4;
const RESEND_API = "https://api.resend.com";

type Fetch = typeof fetch;

/** The received email's raw bytes, "too_big", or null when Resend could not
 *  be reached, which the caller answers with a retry. */
async function rawEmail(id: string, apiKey: string, fetcher: Fetch): Promise<Buffer | "too_big" | null> {
  try {
    const meta = await fetcher(`${RESEND_API}/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!meta.ok) return null;
    const url = ((await meta.json()) as { raw?: { download_url?: string } }).raw?.download_url;
    if (!url) return null;
    const download = await fetcher(url);
    if (!download.ok) return null;
    const declared = Number(download.headers.get("content-length") ?? 0);
    if (declared > MAX_MAIL_BYTES) return "too_big";
    const bytes = Buffer.from(await download.arrayBuffer());
    return bytes.length > MAX_MAIL_BYTES ? "too_big" : bytes;
  } catch {
    return null;
  }
}

function answer(reply: FastifyReply, status: number) {
  return reply.code(status).type("application/json; charset=utf-8").send("{}");
}

export async function mailInRoutes(
  app: FastifyInstance,
  opts: {
    secret?: string | undefined;
    apiKey?: string | undefined;
    fetch?: Fetch | undefined;
    resolver?: Resolver | undefined;
  },
): Promise<void> {
  // The raw body as a string: Svix's signature covers it byte for byte.
  app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 1024 * 1024 }, (_request, body, done) =>
    done(null, body),
  );

  app.setErrorHandler((error, request, reply) => {
    const { code, statusCode } = (error ?? {}) as { code?: string; statusCode?: number };
    request.log.warn({ code: code ?? "unknown", status: statusCode ?? 500 }, "mail webhook refused");
    return answer(reply, statusCode ?? 500);
  });

  let inFlight = 0;

  app.post("/v1/mail/resend", async (request, reply) => {
    const body = typeof request.body === "string" ? request.body : "";
    if (!opts.secret || !opts.apiKey) {
      request.log.warn({ outcome: "not_configured" }, "mail webhook refused");
      return answer(reply, 401);
    }
    try {
      new Webhook(opts.secret).verify(body, {
        "svix-id": String(request.headers["svix-id"] ?? ""),
        "svix-timestamp": String(request.headers["svix-timestamp"] ?? ""),
        "svix-signature": String(request.headers["svix-signature"] ?? ""),
      });
    } catch {
      request.log.warn({ outcome: "unauthenticated" }, "mail webhook refused");
      return answer(reply, 401);
    }

    const event = JSON.parse(body) as {
      type?: string;
      data?: { email_id?: string; to?: string[]; cc?: string[] };
    };
    const recipients = [...(event.data?.to ?? []), ...(event.data?.cc ?? [])].map((a) => a.toLowerCase());
    if (event.type !== "email.received" || !event.data?.email_id || !recipients.some((a) => a.includes(ADDRESS))) {
      request.log.info({ outcome: "ignored" }, "mail webhook");
      return answer(reply, 200);
    }

    if (inFlight >= MAX_IN_FLIGHT) {
      request.log.warn({ outcome: "busy" }, "mail webhook");
      return answer(reply, 503);
    }
    inFlight += 1;
    try {
      const raw = await rawEmail(event.data.email_id, opts.apiKey, opts.fetch ?? fetch);
      if (raw === null) {
        request.log.warn({ outcome: "resend_unreachable" }, "mail webhook");
        return answer(reply, 503);
      }
      if (raw === "too_big") {
        request.log.info({ outcome: "too_big" }, "mail received");
        return answer(reply, 200);
      }
      const outcome = await receiveMail(raw, { resolver: opts.resolver });
      request.log.info({ outcome }, "mail received");
      return answer(reply, outcome === "key_unavailable" ? 503 : 200);
    } finally {
      inFlight -= 1;
    }
  });
}
