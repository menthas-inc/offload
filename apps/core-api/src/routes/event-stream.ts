// The head of a server-sent event stream, for every stream the Core API holds:
// one message's answer (003) and the live connection (048).

import type { FastifyReply, FastifyRequest } from "fastify";
import { webOrigins } from "../env.js";

/** How often the stream re-checks the session and sends a keep-alive.
 *
 *  **Nothing polls for the answer any more.** The stream reads once when it
 *  opens, then waits to be woken by `pg_notify` from the transaction that
 *  writes the reply, so an answer arrives the instant it commits and no
 *  question is asked in the meantime. See `../dumps/answers.ts`.
 *
 *  This interval is only two things now, and both genuinely want a clock. 002
 *  enforces session revocation at Better Auth's refresh, which fires on a
 *  request, and an open stream makes none, so **this interval is the window in
 *  which a disabled account keeps receiving its own conversation updates**. And
 *  an idle proxy drops a connection that has said nothing for long enough. */
export const STREAM_SESSION_MS = 15_000;

/** Refuse a stream to a page on an origin that may not read it. Without this
 *  the browser blocks the read while the socket stays open, held for nobody
 *  and counted against the account's live connections. A request with no
 *  Origin is a phone or a test, and passes. True when it refused. */
export function refuseOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || webOrigins.includes(origin)) return false;
  void reply.code(403).send({ error: "forbidden" as const });
  return true;
}

/** Take the socket from Fastify and write a stream's headers.
 *
 *  The caller writes the body to `reply.raw` and ends it. */
export function openEventStream(request: FastifyRequest, reply: FastifyReply): void {
  // Fastify otherwise passes whatever an async handler resolves with to
  // reply.send() once the promise settles, which for a stream that is still
  // waiting means sending a response on top of one already in flight.
  reply.hijack();

  // CORS, by hand, because hijacking bypasses the plugin that would
  // otherwise add it.
  //
  // **This is why the composer never received an answer in a browser.**
  // `reply.hijack()` takes the socket away from Fastify, and
  // `reply.raw.writeHead` writes exactly the headers listed here, so the
  // `access-control-allow-origin` @fastify/cors sets on the reply object
  // never reaches the wire. Same-origin callers, including every test in
  // this repo, never notice. A browser on a different origin blocks the
  // response, the EventSource errors, and the person watches a thinking
  // indicator until they reload.
  //
  // The origin is echoed only when it is on the same allowlist the plugin
  // uses, so this cannot become a way around it.
  const requestOrigin = request.headers.origin;
  const allowed =
    typeof requestOrigin === "string" && webOrigins.includes(requestOrigin)
      ? requestOrigin
      : null;

  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // Nginx and friends buffer by default, which turns a stream into one
    // large response delivered at the end.
    "x-accel-buffering": "no",
    // What the `onSend` hook in app.ts puts on every other answer, which a
    // hijacked reply never reaches (security review of 048).
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    ...(allowed
      ? {
          "access-control-allow-origin": allowed,
          "access-control-allow-credentials": "true",
          // The origin decides the body, so a shared cache must not serve
          // one origin's response to another.
          vary: "Origin",
        }
      : {}),
  });
}
