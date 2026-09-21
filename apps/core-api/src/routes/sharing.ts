// Sharing a thread over the wire: the sheet, the share, the x, and Add it.
//
// Refusals collapse as everywhere else: a thread you are not in, the default
// thread and a thread that does not exist are one 404, and a share that
// cannot happen says why per person, since the sheet draws one line per
// refusal and the person is looking at the row it is about.

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { emit } from "../analytics.js";
import { NotYours } from "../threads/access.js";
import { acceptInvitation, shareSheet, shareThread, takeOut } from "../threads/sharing.js";

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

async function subjectOf(accountId: string): Promise<string | null> {
  const row = await db.selectFrom("accounts").select("analytics_subject_id").where("id", "=", accountId).executeTakeFirst();
  return row?.analytics_subject_id ?? null;
}

function guard<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | FastifyReply> {
  return run().catch((error: unknown) => {
    if (error instanceof NotYours) return reply.code(404).send({ error: "not_found" as const });
    throw error;
  });
}

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const notFound = z.object({ error: z.literal("not_found") });
const uuid = z.string().uuid();

const face = z.object({ accountId: z.string(), displayName: z.string().nullable(), initials: z.string() });

export async function sharingRoutes(app: App): Promise<void> {
  app.get(
    "/v1/threads/:id/share",
    {
      schema: {
        params: z.object({ id: uuid }),
        response: {
          200: z.object({
            members: z.array(
              face.extend({ since: z.coerce.date(), added: z.object({ count: z.number(), titles: z.array(z.string()) }) }),
            ),
            waiting: z.array(face.extend({ memberId: z.string() })),
            connections: z.array(face),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        return reply.send(await shareSheet(accountId, request.params.id));
      }),
  );

  app.post(
    "/v1/threads/:id/share",
    {
      schema: {
        params: z.object({ id: uuid }),
        body: z.object({ accountIds: z.array(uuid).min(1).max(20) }),
        response: {
          200: z.object({
            outcomes: z.array(
              z.object({
                accountId: z.string(),
                ok: z.boolean(),
                error: z.enum(["unknown_thread", "default_thread", "not_connected", "already_in", "waiting", "too_many"]).optional(),
              }),
            ),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const outcomes = [];
        let shared = 0;
        for (const target of request.body.accountIds) {
          const result = await db.transaction().execute((trx) => shareThread(trx, accountId, request.params.id, target));
          if (!result.ok && result.error === "unknown_thread") throw new NotYours();
          if (!result.ok && result.error === "default_thread") throw new NotYours();
          outcomes.push(result.ok ? { accountId: target, ok: true } : { accountId: target, ok: false, error: result.error });
          if (result.ok) shared++;
        }
        if (shared > 0) await emit({ name: "thread_shared", subjectId: await subjectOf(accountId), properties: { count: shared } });
        return reply.send({ outcomes });
      }),
  );

  // The x on a lifted row: a waiting share is withdrawn, a member is taken
  // out. Which one is the row's state, never the caller's say-so.
  app.delete(
    "/v1/threads/:id/members/:accountId",
    {
      schema: {
        params: z.object({ id: uuid, accountId: uuid }),
        response: {
          200: z.object({ withdrew: z.boolean(), removed: z.boolean(), died: z.boolean() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const result = await takeOut(accountId, request.params.id, request.params.accountId);
        if (result.removed) await emit({ name: "member_removed", subjectId: await subjectOf(accountId) });
        return reply.send(result);
      }),
  );

  app.post(
    "/v1/invitations/:memberId/accept",
    {
      schema: {
        params: z.object({ memberId: uuid }),
        response: { 200: z.object({ threadId: z.string() }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const result = await acceptInvitation(accountId, request.params.memberId);
      if (!result) return reply.code(404).send({ error: "not_found" as const });
      await emit({ name: "share_accepted", subjectId: await subjectOf(accountId) });
      return reply.send(result);
    },
  );
}
