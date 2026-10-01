// 027 Today: one day, Needs you, putting a card off, and + Today.
//
// Every route resolves the session's account and nothing else (SEC-2). An id
// that is not the account's answers 404, the same as one that does not exist
// or is already settled, so no route is an oracle. Writes are POST and DELETE,
// never GET, since the session cookie is `sameSite: lax`. 024's `/v1/today`
// stays in `notifications.ts` for phones built before this.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { NotYours } from "../threads/access.js";
import { Refused } from "../threads/refusals.js";
import { dayResponse, readDay } from "../today/day.js";
import { needsCard, needsYou, putOff } from "../today/needs.js";
import { takeToday, undoTakeToday } from "../today/picks.js";
import { agendaRow } from "../today/rows.js";

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
const notFound = z.object({ error: z.literal("not_found") });
const ok = z.object({ ok: z.literal(true) });
/** A 400 is either this route's own refusal or the schema's, whose body is
 *  Fastify's; both carry `error`, and neither may become a 500 on the way out. */
const badRequest = z.object({ error: z.string() });

export async function todayRoutes(app: App): Promise<void> {
  app.get(
    "/v1/today/day",
    {
      schema: {
        querystring: z.object({ date: z.string().max(10) }),
        response: { 200: dayResponse, 400: badRequest, 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const day = await readDay(accountId, request.query.date);
      return day === "bad_date" ? reply.status(400).send({ error: "bad_date" as const }) : reply.send(day);
    },
  );

  app.get(
    "/v1/today/needs",
    { schema: { response: { 200: z.object({ cards: z.array(needsCard) }), 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      return reply.send({ cards: await needsYou(accountId) });
    },
  );

  app.post(
    "/v1/today/put-off",
    {
      schema: {
        body: z.object({ card: z.string().max(64), forGood: z.boolean().optional() }).strict(),
        response: { 200: ok, 400: badRequest, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const outcome = await putOff(accountId, request.body.card, request.body.forGood ?? false);
      if (outcome === "bad_card") return reply.status(400).send({ error: "bad_card" as const });
      if (outcome === "not_found") return reply.status(404).send({ error: "not_found" as const });
      return reply.send({ ok: true as const });
    },
  );

  const picked = { params: z.object({ contentId: z.string().uuid() }) };

  app.post(
    "/v1/today/picks/:contentId",
    {
      schema: {
        ...picked,
        response: { 200: agendaRow, 400: badRequest, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      try {
        return reply.send(await takeToday(accountId, request.params.contentId));
      } catch (error) {
        if (error instanceof NotYours) return reply.status(404).send({ error: "not_found" as const });
        if (error instanceof Refused) return reply.status(400).send({ error: error.code });
        throw error;
      }
    },
  );

  app.delete(
    "/v1/today/picks/:contentId",
    {
      schema: {
        ...picked,
        response: { 200: ok, 400: badRequest, 401: unauthenticated, 404: notFound, 409: z.object({ error: z.literal("not_undoable") }) },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      try {
        const outcome = await undoTakeToday(accountId, request.params.contentId);
        if (outcome === "not_undoable") return reply.status(409).send({ error: "not_undoable" as const });
        return reply.send({ ok: true as const });
      } catch (error) {
        if (error instanceof NotYours) return reply.status(404).send({ error: "not_found" as const });
        if (error instanceof Refused) return reply.status(400).send({ error: error.code });
        throw error;
      }
    },
  );
}
