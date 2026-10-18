// 027 Today: one day, Needs you, putting a card off, and (2026-10-07) open
// in your threads, which replaced If you have time and + Today.
//
// Every route resolves the session's account and nothing else (SEC-2). An id
// that is not the account's answers 404, the same as one that does not exist
// or is already settled, so no route is an oracle. Writes are POST and DELETE,
// never GET, since the session cookie is `sameSite: lax`. 024's `/v1/today`
// stays in `notifications.ts` for phones built before this.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { currentAccountId } from "../auth/current-account.js";
import { dayResponse, readDay } from "../today/day.js";
import { needsCard, needsYou, putOff } from "../today/needs.js";
import { openResponse, openThreads } from "../today/threads.js";
import { dismissal, dismissReminder, remindersResponse, todayReminders, undismissReminder } from "../today/reminders.js";

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

  // 042. Reminders: what has begun and not ended, nearest first.
  app.get(
    "/v1/today/reminders",
    { schema: { response: { 200: remindersResponse, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      return reply.send(await todayReminders(accountId));
    },
  );

  // 2026-10-11. The x on a card: this reminder hidden, the thing untouched;
  // and Undo. Both say 404 for anything that is not showing on Today.
  app.post(
    "/v1/today/reminders/dismiss",
    { schema: { body: dismissal, response: { 200: ok, 400: badRequest, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      if (!(await dismissReminder(accountId, request.body))) return reply.status(404).send({ error: "not_found" as const });
      return reply.send({ ok: true as const });
    },
  );

  app.post(
    "/v1/today/reminders/undismiss",
    { schema: { body: dismissal, response: { 200: ok, 400: badRequest, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      if (!(await undismissReminder(accountId, request.body))) return reply.status(404).send({ error: "not_found" as const });
      return reply.send({ ok: true as const });
    },
  );

  app.get(
    "/v1/today/threads",
    { schema: { response: { 200: openResponse, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      return reply.send(await openThreads(accountId));
    },
  );
}
