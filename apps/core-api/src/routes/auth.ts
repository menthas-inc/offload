// Mounting Better Auth on Fastify.
//
// Better Auth speaks the web Fetch API. Fastify speaks Node streams. This is
// the adapter between them, and it is deliberately thin: every decision worth
// making lives in auth.ts and gate.ts, not here.

import type { FastifyReply, FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { env } from "../env.js";

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

      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(request.method === "GET" || request.method === "HEAD"
            ? {}
            : { body: JSON.stringify(request.body ?? {}) }),
        })
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // set-cookie may legitimately appear more than once, and header() would
        // overwrite rather than append.
        if (key.toLowerCase() === "set-cookie") reply.header("set-cookie", value);
        else reply.header(key, value);
      });

      return reply.send(response.body ? await response.text() : null);
    },
  });
}
