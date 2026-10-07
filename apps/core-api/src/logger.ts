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
  // 039. A review code lets somebody in. A native sign-in carries it in the
  // body's additional data, beside the token.
  "reviewCode",
  "*.reviewCode",
  "req.body.additionalData",
];

/** A SQLSTATE: what a Postgres error carries in `code`. */
const SQLSTATE = /^[0-9A-Z]{5}$/;

/** An error, as a log line may carry it.
 *
 *  **A database error is its kind and its code, and nothing it says.** Postgres
 *  puts the row it refused in `detail` ("Failing row contains (...)"), names
 *  the column and the table, and some of its messages quote the value they
 *  rejected. pino's default copies every one of those, which put a typed
 *  row's title into a request's error line (security review of 032). The
 *  SQLSTATE says what went wrong, and the row is in the database.
 *
 *  An error of our own keeps its message and stack: those are written by us. */
function fromDatabase(error: unknown): error is Error & { code: string } {
  const code = (error as { code?: unknown } | null)?.code;
  return error instanceof Error && typeof code === "string" && SQLSTATE.test(code);
}

function safeError(error: unknown): { type: string; message: string; stack: string; [key: string]: unknown } {
  if (!(error instanceof Error)) return { type: typeof error, message: "", stack: "" };
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown };
  const database = fromDatabase(error);
  return {
    type: error.constructor?.name ?? "Error",
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof statusCode === "number" ? { statusCode } : {}),
    message: database ? `database error ${code}` : error.message,
    stack: database ? "" : (error.stack ?? ""),
  };
}

// NonNullable, not the raw option type. The raw one includes undefined, and
// under exactOptionalPropertyTypes that makes Fastify pick its HTTP/2 overload
// and then complain about a server type nobody asked for.
export const loggerOptions: NonNullable<FastifyServerOptions["logger"]> = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: { paths: REDACT, censor: "[redacted]" },
  // The same rule for the line's own message. Fastify's error handler logs a
  // failed request with the error's message as the message, which a
  // serializer never sees.
  hooks: {
    logMethod(args, method) {
      const [first, second] = args as unknown[];
      // A bare error logged on its own: pino would make its message the line's.
      if (fromDatabase(first)) {
        return method.apply(this, [{ err: first }, `database error ${first.code}`] as never);
      }
      const error = (first as { err?: unknown; error?: unknown } | null)?.err ?? (first as { error?: unknown } | null)?.error;
      if (fromDatabase(error) && typeof second === "string" && second.includes(error.message)) {
        return method.apply(this, [first, `database error ${error.code}`] as never);
      }
      return method.apply(this, args);
    },
  },
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
    err: safeError,
    error: safeError,
  },
  // Spread rather than `transport: undefined`. Under exactOptionalPropertyTypes
  // an explicit undefined is not the same as an absent key, and pino treats a
  // present-but-undefined transport as a configuration error.
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
};
