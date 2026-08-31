// Logging configuration.
//
// OFF-1: no content in application logs, ever. Not a title, not a transcript,
// not a URL somebody dumped, not an email address. Logs carry ids, kinds,
// counts, durations and outcomes.
//
// This is enforced here rather than trusted to whoever writes the next log
// line, because "remember not to log the body" is not a control.

import type { FastifyRequest, FastifyServerOptions } from "fastify";
import { isProduction } from "./env.js";

/** Header and body fields that must never reach a log line. */
const REDACT = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']",
  "req.body.email",
  "req.body.password",
  "*.email",
  "*.token",
  "*.secret",
];

// NonNullable, not the raw option type. The raw one includes undefined, and
// under exactOptionalPropertyTypes that makes Fastify pick its HTTP/2 overload
// and then complain about a server type nobody asked for.
export const loggerOptions: NonNullable<FastifyServerOptions["logger"]> = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: { paths: REDACT, censor: "[redacted]" },
  // Request logging is narrowed to what is useful and nothing else. The default
  // serialiser logs full headers and query strings, both of which can carry
  // content in a product where people paste links.
  serializers: {
    req(request: FastifyRequest) {
      return {
        id: request.id,
        method: request.method,
        // The route pattern, not the resolved URL: /v1/accounts/:id rather
        // than an account id in every log line.
        route: request.routeOptions.url ?? request.url.split("?")[0],
      };
    },
    // Structural rather than FastifyReply: pino's response serialiser is handed
    // a narrowed shape whose routeOptions is optional, so the full reply type
    // does not fit. All we want is the status anyway.
    res(reply: { statusCode: number }) {
      return { statusCode: reply.statusCode };
    },
  },
  // Spread rather than `transport: undefined`. Under exactOptionalPropertyTypes
  // an explicit undefined is not the same as an absent key, and pino treats a
  // present-but-undefined transport as a configuration error.
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
};
