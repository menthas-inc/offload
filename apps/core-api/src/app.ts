// The Fastify application, built as a factory so tests get an instance without
// binding a port.

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env, webOrigins } from "./env.js";
import { loggerOptions } from "./logger.js";
import { healthRoutes } from "./routes/health.js";
import { waitlistRoutes } from "./routes/waitlist.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/session.js";
import { adminRoutes } from "./routes/admin.js";
import { dumpRoutes } from "./routes/dumps.js";
import { internalRoutes } from "./routes/internal.js";
import { toolRoutes } from "./routes/tools.js";
import { connectorRoutes } from "./routes/connectors.js";
import { threadRoutes } from "./routes/threads.js";
import { labelRoutes } from "./routes/labels.js";
import { wellKnownRoutes } from "./routes/well-known.js";
import { blobRoutes } from "./routes/blobs.js";
import { peopleRoutes } from "./routes/people.js";
import { notificationRoutes } from "./routes/notifications.js";
import { todayRoutes } from "./routes/today.js";
import { looseRoutes } from "./routes/loose.js";
import { sharingRoutes } from "./routes/sharing.js";
import { MAX_PHOTO_BYTES } from "./blobs/photos.js";
import { mailInRoutes } from "./routes/mail-in.js";
import type { Writable } from "node:stream";
import type { Resolver } from "./mail-in/sender.js";

/** The app carries the Zod type provider, so routes get their schemas inferred
 *  rather than restated. Naming it keeps that off every call site. */
export type App = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface AppOptions {
  /** See `env.INTERNAL_HOST`. An option rather than only the variable so a
   *  test can build an app with it set. */
  internalHost?: string | undefined;
  /** A test's sink for the log lines, in place of stdout. */
  logStream?: Writable;
  /** 026. Resend's webhook secret and API key, the environment's by default,
   *  and the fetch that reaches Resend; a test's stand-in otherwise. */
  resendWebhookSecret?: string;
  resendApiKey?: string;
  mailFetch?: typeof fetch;
  /** 026. DNS for the sender check; the system's by default. */
  mailResolver?: Resolver;
}

/** The logger's options without its pretty-printing transport, which cannot
 *  be combined with a stream of the caller's. */
function withoutTransport(options: typeof loggerOptions): Record<string, unknown> {
  const { transport: _transport, ...rest } = options as Record<string, unknown>;
  return rest;
}

export async function buildApp(options: AppOptions = {}): Promise<App> {
  const internalHost = options.internalHost ?? env.INTERNAL_HOST;
  const app = Fastify({
    logger: options.logStream ? { ...withoutTransport(loggerOptions), stream: options.logStream } : loggerOptions,
    // Trust the proxy so rate limiting sees the real client address rather
    // than Railway's edge. The waitlist endpoint is public and rate limited
    // per IP, so getting this wrong makes that limit meaningless.
    trustProxy: true,
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // The internal routes on the private name only, decided before the token
  // is read: a request for `/internal/*` by the public name is not found.
  if (internalHost) {
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith("/internal/") && request.hostname !== internalHost) {
        // A string, so the matched route's response schema is not consulted:
        // every internal route declares its own 404 shape and this is none of
        // them, deliberately.
        return reply.code(404).type("application/json; charset=utf-8").send('{"error":"not_found"}');
      }
    });
  }

  // On every answer, whatever route wrote it (security review 2026-09-22, M4).
  // HSTS so a first visit over http is not a downgrade point; nosniff so a
  // declared type is a fact; no framing, no referrer, and nothing cached
  // unless a route said otherwise, which the blob routes do.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
  });

  // The web app and the API are different origins sharing a session cookie,
  // so this is explicit rather than defaulted. Never a wildcard: a browser
  // refuses credentialed requests against one anyway.
  await app.register(cors, {
    origin: webOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    // 027. Launch waits as long as a Retry-After asks, and a browser on the
    // web app's origin can only read a header it is told it may.
    exposedHeaders: ["retry-after"],
    // **The preflight is cached, because it was half the wait.** A JSON POST
    // from the web app is not a simple request, so the browser asks OPTIONS
    // first, and without a max-age it asks again five seconds later. Traced
    // on 2026-09-16: a dump took two round trips to a US region from Lisbon,
    // one of them the preflight, against 18ms of server time. Two hours is
    // Chrome's ceiling; a cached preflight still sends the real request with
    // its cookie, so nothing about authorisation is cached with it.
    maxAge: 7200,
  });

  // 020. One photo per request, bounded before a byte is kept. The limit is
  // the server's own; the client checks it first as a courtesy.
  await app.register(multipart, {
    limits: { fileSize: MAX_PHOTO_BYTES, files: 2, fields: 4, parts: 8 },
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(waitlistRoutes);
  await app.register(adminRoutes);
  await app.register(dumpRoutes);
  await app.register(internalRoutes);
  await app.register(toolRoutes);
  await app.register(threadRoutes);
  await app.register(labelRoutes);
  await app.register(connectorRoutes);
  await app.register(wellKnownRoutes);
  await app.register(blobRoutes);
  await app.register(peopleRoutes);
  await app.register(notificationRoutes);
  await app.register(todayRoutes);
  await app.register(looseRoutes);
  await app.register(sharingRoutes);
  await app.register(mailInRoutes, {
    secret: options.resendWebhookSecret ?? env.RESEND_WEBHOOK_SECRET,
    apiKey: options.resendApiKey ?? env.RESEND_API_KEY,
    fetch: options.mailFetch,
    resolver: options.mailResolver,
  });

  return app;
}
