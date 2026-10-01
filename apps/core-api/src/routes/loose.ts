// 028. Not in a thread: the full list, and the writes on a suggestion.
//
// Every route here resolves the caller's own default thread on the server and
// takes no thread id from the client (SEC-2), so the only things it can reach
// are the caller's. Writes re-check authorship per row and membership of the
// destination through the same functions every other move goes through.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { contentRow, loosePageSchema } from "./threads.js";
import { CHIP_KEYS, archivedCount, defaultThreadOf, looseArchived, looseCounts, loosePage } from "../loose/read.js";

async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const result = await auth.api.getSession({ headers });
  return result?.session.userId ?? null;
}

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const badRequest = z.object({ error: z.string() });

const archivedPage = z.object({ rows: z.array(contentRow), nextCursor: z.string().nullable() });

export async function looseRoutes(app: App): Promise<void> {
  app.get(
    "/v1/loose",
    {
      schema: {
        querystring: z.object({
          type: z.enum(CHIP_KEYS).optional(),
          // An id, since the list is ordered by id: anything else is a 400.
          cursor: z.string().uuid().optional(),
          archived: z.enum(["true", "false"]).default("false"),
        }),
        response: { 200: z.union([loosePageSchema, archivedPage]), 400: badRequest, 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      if (request.query.archived === "true") {
        return reply.send(await looseArchived(accountId, request.query.cursor));
      }

      const threadId = await defaultThreadOf(accountId);
      if (!threadId) return reply.send({ rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 });
      const [page, counts, archived] = await Promise.all([
        loosePage(accountId, { type: request.query.type, cursor: request.query.cursor }),
        looseCounts(threadId),
        archivedCount(threadId),
      ]);
      return reply.send({ ...page, ...counts, archived });
    }
  );
}
