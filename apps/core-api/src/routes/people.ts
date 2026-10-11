// People: finding somebody, asking, answering, the list, a person, and their
// mark.
//
// Every route here resolves the session server-side and asks `people/access`
// who may see whom. Refusals collapse to one answer per route: a person you
// may not see and a person who does not exist are both not found, because a
// caller who could tell them apart could probe for accounts by id.

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { emit, subjectOf } from "../analytics.js";
import { markOf } from "../accounts/avatar.js";
import { pictureCache } from "../blobs/cache.js";
import { visibleTo } from "../people/access.js";
import {
  LOOKUP_FLOOR_MS,
  RateLimited,
  accept,
  block,
  dismiss,
  lookup,
  people,
  person,
  remove,
  request as requestConnection,
  unblock,
  withdraw,
} from "../people/people.js";

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

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const notFound = z.object({ error: z.literal("not_found") });
const ok = z.object({ ok: z.literal(true) });

const personSchema = z.object({
  accountId: z.string(),
  displayName: z.string().nullable(),
  initials: z.string(),
});

const cardSchema = personSchema.extend({ id: z.string(), since: z.coerce.date() });

const uuid = z.string().uuid();

const emailField = z.string().trim().toLowerCase().email().max(254);

const lookupResponse = {
  200: z.object({
    found: personSchema
      .extend({
        email: z.string(),
        relation: z.enum(["none", "you", "connected", "you_asked", "asked_you"]),
        requestId: z.string().nullable(),
        since: z.coerce.date().nullable(),
        mark: z.string(),
      })
      .nullable(),
  }),
  401: unauthenticated,
  429: z.object({ error: z.literal("rate_limited") }),
};

/** One address, one answer, whichever door it came through. */
async function answerLookup(request: FastifyRequest, reply: FastifyReply, email: string) {
  const accountId = await currentAccountId(request);
  if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
  // Hit and miss take the same floor, so the clock says nothing the
  // answer does not.
  const started = Date.now();
  let found;
  try {
    found = await lookup(accountId, email);
  } catch (error) {
    if (error instanceof RateLimited) return reply.code(429).send({ error: "rate_limited" as const });
    throw error;
  }
  const remaining = LOOKUP_FLOOR_MS - (Date.now() - started);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return reply.send({ found });
}

export async function peopleRoutes(app: App): Promise<void> {
  // The address travels in the body, not the query string. A query string is
  // what the platform's request logs record, and this one is somebody else's
  // address typed by a person looking for them; the page says logs never
  // carry what was in a request (security review 2026-09-22, M15).
  app.post(
    "/v1/people/lookup",
    { schema: { body: z.object({ email: emailField }), response: lookupResponse } },
    async (request, reply) => answerLookup(request, reply, request.body.email),
  );

  // The older door, for phone builds that predate the body form. Nothing new
  // calls it; it goes once those builds are gone.
  app.get(
    "/v1/people/lookup",
    { schema: { querystring: z.object({ email: emailField }), response: lookupResponse } },
    async (request, reply) => answerLookup(request, reply, request.query.email),
  );

  app.post(
    "/v1/people/requests",
    {
      schema: {
        body: z.object({ accountId: uuid }),
        response: {
          200: z.object({ requestId: z.string(), since: z.coerce.date() }),
          400: z.object({ error: z.literal("yourself") }),
          401: unauthenticated,
          404: notFound,
          409: z.object({
            error: z.enum(["connected", "pending", "asked_you", "too_soon", "too_many"]),
            requestId: z.string().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const result = await requestConnection(accountId, request.body.accountId);
      if (result.ok) {
        // The actor's pseudonym and nothing about the other person (OFF-1).
        await emit({ name: "connection_requested", subjectId: await subjectOf(accountId) });
        return reply.send({ requestId: result.requestId, since: result.since });
      }
      if (result.error === "yourself") return reply.code(400).send({ error: "yourself" as const });
      if (result.error === "not_found") return reply.code(404).send({ error: "not_found" as const });
      return reply
        .code(409)
        .send(result.requestId ? { error: result.error, requestId: result.requestId } : { error: result.error });
    },
  );

  app.post(
    "/v1/people/requests/:id/:answer",
    {
      schema: {
        params: z.object({ id: uuid, answer: z.enum(["accept", "dismiss"]) }),
        response: { 200: ok, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const done =
        request.params.answer === "accept"
          ? await accept(accountId, request.params.id)
          : await dismiss(accountId, request.params.id);
      if (done && request.params.answer === "accept") {
        await emit({ name: "connection_accepted", subjectId: await subjectOf(accountId) });
      }
      return done ? reply.send({ ok: true as const }) : reply.code(404).send({ error: "not_found" as const });
    },
  );

  app.delete(
    "/v1/people/requests/:id",
    { schema: { params: z.object({ id: uuid }), response: { 200: ok, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const done = await withdraw(accountId, request.params.id);
      return done ? reply.send({ ok: true as const }) : reply.code(404).send({ error: "not_found" as const });
    },
  );

  app.get(
    "/v1/people",
    {
      schema: {
        response: {
          200: z.object({
            requestsForYou: z.array(cardSchema),
            connections: z.array(
              personSchema.extend({
                threads: z.array(z.object({ id: z.string(), name: z.string() })),
                threadCount: z.number(),
              }),
            ),
            pending: z.array(cardSchema),
            blocked: z.array(personSchema),
            count: z.number(),
          }),
          401: unauthenticated,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return reply.send(await people(accountId));
    },
  );

  app.get(
    "/v1/people/:accountId",
    {
      schema: {
        params: z.object({ accountId: uuid }),
        response: {
          200: personSchema.extend({
            relation: z.enum(["connected", "asked_you", "you_asked", "thread", "waiting", "blocked"]),
            shared: z.array(
              z.object({ id: z.string(), name: z.string(), icon: z.string(), hue: z.number(), count: z.number(), lastActivityAt: z.coerce.date() }),
            ),
            requestId: z.string().nullable(),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const page = await person(accountId, request.params.accountId);
      return page ? reply.send(page) : reply.code(404).send({ error: "not_found" as const });
    },
  );

  app.delete(
    "/v1/people/connections/:accountId",
    { schema: { params: z.object({ accountId: uuid }), response: { 200: ok, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const done = await remove(accountId, request.params.accountId);
      if (done) await emit({ name: "connection_removed", subjectId: await subjectOf(accountId) });
      return done ? reply.send({ ok: true as const }) : reply.code(404).send({ error: "not_found" as const });
    },
  );

  app.post(
    "/v1/people/blocks",
    { schema: { body: z.object({ accountId: uuid }), response: { 200: ok, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const done = await block(accountId, request.body.accountId);
      if (done) await emit({ name: "person_blocked", subjectId: await subjectOf(accountId) });
      return done ? reply.send({ ok: true as const }) : reply.code(404).send({ error: "not_found" as const });
    },
  );

  app.delete(
    "/v1/people/blocks/:accountId",
    { schema: { params: z.object({ accountId: uuid }), response: { 200: ok, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const done = await unblock(accountId, request.params.accountId);
      return done ? reply.send({ ok: true as const }) : reply.code(404).send({ error: "not_found" as const });
    },
  );

  // The mark, drawn on first read and written once, in `markOf`.
  app.get(
    "/v1/avatars/:accountId.png",
    // No response schema: the 200 is bytes, as the blob routes serve them.
    { schema: { params: z.object({ accountId: uuid }) } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const target = request.params.accountId;
      if (target !== accountId && !(await visibleTo(accountId, target))) {
        return reply.code(404).send({ error: "not_found" as const });
      }
      const exists = await db
        .selectFrom("accounts")
        .select("id")
        .where("id", "=", target)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!exists) return reply.code(404).send({ error: "not_found" as const });
      return reply
        .header("Content-Type", "image/png")
        // A browser keeps it for good, since it never changes; a phone keeps
        // its own copy and its HTTP stack none (`pictureCache`).
        .header("Cache-Control", pictureCache(request, "private, max-age=31536000, immutable"))
        .header("X-Content-Type-Options", "nosniff")
        .send(await markOf(target));
    },
  );
}
