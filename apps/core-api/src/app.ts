// The Fastify application, built as a factory so tests get an instance without
// binding a port.

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./env.js";
import { loggerOptions } from "./logger.js";
import { healthRoutes } from "./routes/health.js";

/** The app carries the Zod type provider, so routes get their schemas inferred
 *  rather than restated. Naming it keeps that off every call site. */
export type App = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export async function buildApp(): Promise<App> {
  const app = Fastify({
    logger: loggerOptions,
    // Trust the proxy so rate limiting sees the real client address rather
    // than Railway's edge. The waitlist endpoint is public and rate limited
    // per IP, so getting this wrong makes that limit meaningless.
    trustProxy: true,
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // The web app and the API are different origins sharing a session cookie,
  // so this is explicit rather than defaulted. Never a wildcard: a browser
  // refuses credentialed requests against one anyway.
  await app.register(cors, {
    origin: [env.WEB_URL],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(healthRoutes);

  return app;
}
