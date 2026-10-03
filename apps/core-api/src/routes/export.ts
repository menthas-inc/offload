// 035 part B. A copy of everything the account can read.
//
// Beside `/api/me`, like the delete, and under the same origin rule: the
// session cookie spans the registrable domain, so SameSite alone does not
// make a request the app's own. The phones send no Origin. The account is the
// session's and nothing in a request names another (SEC-2).

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { webOrigins } from "../env.js";
import { objectStore } from "../blobs/store.js";
import { Readable } from "node:stream";
import { copyState, deleteCopy, requestCopy } from "../exports/copy.js";
import { openCopy } from "../exports/build.js";

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

function foreign(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  return Boolean(origin) && !webOrigins.includes(origin!);
}

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const crossed = z.object({ error: z.literal("origin") });
const state = z.object({
  state: z.enum(["idle", "making", "ready", "failed", "waiting"]),
  readyAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  nextAt: z.string().nullable(),
});

export async function exportRoutes(app: App): Promise<void> {
  app.get(
    "/api/me/export",
    { schema: { response: { 200: state, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      return reply.send(await copyState(accountId));
    },
  );

  // Asking. Refused inside seven days of the last request whatever the client
  // believes, and the refusal says when (AC-20).
  app.post(
    "/api/me/export",
    {
      schema: {
        response: {
          202: state,
          401: unauthenticated,
          403: crossed,
          409: z.object({ error: z.literal("too_soon"), nextAt: z.string() }),
          503: z.object({ error: z.literal("unavailable") }),
        },
      },
    },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      // Nowhere to keep it: refused, rather than built into a process that
      // will restart.
      if (!objectStore()) return reply.status(503).send({ error: "unavailable" as const });
      const asked = await requestCopy(accountId);
      if (!asked.ok) return reply.status(409).send({ error: "too_soon" as const, nextAt: asked.nextAt });
      request.log.info({ accountId }, "copy asked for");
      return reply.status(202).send(await copyState(accountId));
    },
  );

  app.delete(
    "/api/me/export",
    { schema: { response: { 204: z.null(), 401: unauthenticated, 403: crossed } } },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      await deleteCopy(accountId);
      return reply.status(204).send(null);
    },
  );

  // The copy itself. The session is the only way to it: there is no link to
  // hand on, and the parts are opened here, one at a time, on their way out.
  // Anything but the caller's own ready copy is the one 404.
  app.get(
    "/api/me/export/file",
    { schema: { response: { 401: unauthenticated, 404: z.object({ error: z.literal("not_found") }) } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      // A link has to work, so no Origin rule here; but a page on another
      // site could make a signed-in browser pull the whole archive over and
      // over. It could never read it. The app's own link is same-site and the
      // phones send no such header.
      if (request.headers["sec-fetch-site"] === "cross-site") return reply.status(404).send({ error: "not_found" as const });
      const copy = await openCopy(accountId);
      if (!copy) return reply.status(404).send({ error: "not_found" as const });
      request.log.info({ accountId }, "copy downloaded");
      return reply
        .header("content-type", "application/zip")
        .header("content-disposition", 'attachment; filename="offload.zip"')
        .header("content-length", String(copy.byteSize))
        .header("cache-control", "no-store")
        // A stream, which the response schemas above do not describe.
        .send(Readable.from(copy.parts) as never);
    },
  );
}
