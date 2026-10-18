// 040. The Memories tab's routes.
//
// Every one is the session's account and nothing in a request names another:
// an id that is not one of its active memories, a thread note's included, is
// not found. The rules are all in `memories/store.ts`; this file turns
// requests into those calls. A refusal the editor shows under the field is a
// 200 with `ok: false`. Writes are JSON and from the app's own origin, as the
// export's are, since the session cookie spans the registrable domain.
//
// The log line is the route, the outcome and the kind. **Never the words.**

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { currentAccountId } from "../auth/current-account.js";
import { db } from "../db.js";
import { webOrigins } from "../env.js";
import { addMemory, changeMemory, forget, listMemories, restoreMemory } from "../memories/store.js";

function foreign(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  return Boolean(origin) && !webOrigins.includes(origin!);
}

function logged(route: string, outcome: string, kind: string | null = null): void {
  console.log(JSON.stringify({ level: "info", msg: "memories", route, outcome, kind }));
}

const kind = z.enum(["people", "things", "about", "rules", "patterns"]);
// Long enough to be refused as too_long by the store, which owns the 200.
const text = z.string().max(2_000);

const thread = z.object({ id: z.string(), name: z.string().nullable(), notInAThread: z.boolean() }).nullable();
const memoryView = z.object({
  id: z.string(),
  kind,
  text: z.string(),
  origin: z.enum(["stated", "learned", "answered"]),
  createdAt: z.date(),
  updatedAt: z.date(),
  changed: z.boolean(),
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("message"), thread }),
    z.object({ type: z.literal("note"), thread }),
    z.object({ type: z.literal("answer"), question: z.string().nullable() }),
    z.object({ type: z.literal("none") }),
  ]),
  place: z.object({ dx: z.number(), dy: z.number() }).nullable(),
  /** 042. Remind me on a birthday or an anniversary. */
  reminders: z.enum(["on", "off"]).nullable(),
});

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const crossed = z.object({ error: z.literal("origin") });
const notFound = z.object({ error: z.literal("not_found") });
const written = z.union([
  z.object({ ok: z.literal(true), id: z.string() }),
  z.object({ ok: z.literal(false), error: z.enum(["empty", "too_long", "never_list", "duplicate", "rules_full", "memories_full"]) }),
]);
const params = z.object({ id: z.string().uuid() });

export async function memoryRoutes(app: App): Promise<void> {
  app.get(
    "/v1/memories",
    {
      schema: {
        response: {
          200: z.object({
            memories: z.array(memoryView),
            kinds: z.array(z.object({ kind, x: z.number(), y: z.number() })),
            full: z.boolean(),
            rulesFull: z.boolean(),
          }),
          401: unauthenticated,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const listed = await listMemories(accountId);
      logged("list", "ok");
      return reply.send(listed);
    },
  );

  app.post(
    "/v1/memories",
    {
      schema: {
        body: z.strictObject({ text, kind: kind.optional() }),
        response: { 200: written, 401: unauthenticated, 403: crossed },
      },
    },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const outcome = await db.transaction().execute((trx) => addMemory(trx, { accountId, text: request.body.text, ...(request.body.kind ? { kind: request.body.kind } : {}) }));
      logged("add", outcome.ok ? "ok" : outcome.error, request.body.kind ?? "about");
      return reply.send(outcome);
    },
  );

  app.patch(
    "/v1/memories/:id",
    {
      schema: {
        params,
        body: z.strictObject({ text: text.optional(), kind: kind.optional() }).refine((b) => b.text !== undefined || b.kind !== undefined),
        response: { 200: written, 401: unauthenticated, 403: crossed, 404: notFound },
      },
    },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const outcome = await db.transaction().execute((trx) => changeMemory(trx, {
          accountId,
          id: request.params.id,
          ...(request.body.text !== undefined ? { text: request.body.text } : {}),
          ...(request.body.kind ? { kind: request.body.kind } : {}),
        }),
      );
      logged("change", outcome.ok ? "ok" : outcome.error, request.body.kind ?? null);
      if (!outcome.ok && outcome.error === "not_found") return reply.status(404).send({ error: "not_found" as const });
      return reply.send(outcome as z.infer<typeof written>);
    },
  );

  app.delete(
    "/v1/memories/:id",
    {
      schema: {
        params,
        response: { 200: z.object({ ok: z.literal(true), id: z.string() }), 401: unauthenticated, 403: crossed, 404: notFound },
      },
    },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const gone = await db.transaction().execute((trx) => forget(trx, { accountId, messageId: null, memoryId: request.params.id }));
      logged("forget", gone.ok ? "ok" : "not_found");
      if (!gone.ok) return reply.status(404).send({ error: "not_found" as const });
      return reply.send(gone);
    },
  );

  app.post(
    "/v1/memories/:id/restore",
    {
      schema: {
        params,
        response: { 200: z.object({ ok: z.literal(true), id: z.string() }), 401: unauthenticated, 403: crossed, 404: notFound },
      },
    },
    async (request, reply) => {
      if (foreign(request)) return reply.status(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" as const });
      const back = await db.transaction().execute((trx) => restoreMemory(trx, accountId, request.params.id));
      logged("restore", back ? "ok" : "not_found");
      if (!back) return reply.status(404).send({ error: "not_found" as const });
      return reply.send({ ok: true as const, id: request.params.id });
    },
  );
}
