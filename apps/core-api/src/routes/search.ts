// 049. The Search page's one route.
//
// POST, with the query in the body: an address is recorded by the edge, any
// proxy and the browser's history, whatever our own logger drops, and a query
// is content. Fastify's request line carries the route and the status; this
// file logs nothing else. Every rule about who sees what is in `search/page.ts`
// and what it reads through; the request names no account and no thread.

import type { FastifyRequest } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import type { App } from "../app.js";
import { currentAccountId } from "../auth/current-account.js";
import { db } from "../db.js";
import { webOrigins } from "../env.js";
import { embedQuery } from "../search/embed.js";
import { EMPTY, QUERY_CHARS, searchPage } from "../search/page.js";

/** Per statement, on one connection: up to twelve with meaning (names, four
 *  content arms and their read, two note arms and theirs, two memory arms and
 *  theirs), so at worst about three seconds held. A heavy account's two-letter
 *  rows arm measured 21 ms. */
const STATEMENT_TIMEOUT = "250ms";
/** Searches one account may have in flight. A person typing has one words
 *  read and one meaning read out; more is a script, and each holds a pooled
 *  connection. */
const IN_FLIGHT = 3;
const inFlight = new Map<string, number>();
const CANCELLED = "57014";

function foreign(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  // A browser says where a request came from even when it sends no Origin;
  // the phones send neither.
  const site = request.headers["sec-fetch-site"];
  return (Boolean(origin) && !webOrigins.includes(origin!)) || site === "cross-site";
}

const row = z.object({
  id: z.string(),
  threadId: z.string(),
  loose: z.boolean(),
  type: z.string(),
  title: z.string(),
  dueAt: z.string().nullable(),
  occursAt: z.string().nullable(),
  occursEndAt: z.string().nullable(),
  allDay: z.boolean(),
  rrule: z.string().nullable(),
  archived: z.boolean(),
});
const answer = z.object({
  threads: z.array(z.object({ id: z.string(), name: z.string() })),
  loose: z.boolean(),
  rows: z.array(row),
  notes: z.array(z.object({ id: z.string(), threadId: z.string(), loose: z.boolean(), text: z.string() })),
  memories: z.array(z.object({ id: z.string(), kind: z.enum(["people", "things", "about", "rules", "patterns"]), text: z.string() })),
});

export async function searchRoutes(app: App): Promise<void> {
  app.post(
    "/v1/search",
    {
      schema: {
        // Cut, never refused: a long paste still searches its first 128.
        body: z.strictObject({ q: z.string().transform((q) => q.slice(0, QUERY_CHARS)), meaning: z.boolean().default(false) }),
        response: {
          200: answer,
          401: z.object({ error: z.literal("unauthenticated") }),
          403: z.object({ error: z.literal("origin") }),
          429: z.object({ error: z.literal("busy") }),
        },
      },
    },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const { q, meaning } = request.body;
      const out = inFlight.get(accountId) ?? 0;
      if (out >= IN_FLIGHT) return reply.status(429).send({ error: "busy" as const });
      inFlight.set(accountId, out + 1);
      try {
        // Outside the transaction: a connection is never held waiting on Voyage.
        const vector = meaning ? await embedQuery(accountId, q) : null;
        const found = await db.transaction().execute(async (trx) => {
          await sql.raw(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`).execute(trx);
          return searchPage(accountId, q, { vector }, trx);
        });
        return reply.send(found);
      } catch (error) {
        // A cancelled statement aborts the transaction, so nothing partial is
        // kept: the client still has its last answer and the names it drew.
        if ((error as { code?: unknown }).code === CANCELLED) return reply.send(EMPTY);
        throw error;
      } finally {
        const left = (inFlight.get(accountId) ?? 1) - 1;
        if (left > 0) inFlight.set(accountId, left);
        else inFlight.delete(accountId);
      }
    },
  );
}
