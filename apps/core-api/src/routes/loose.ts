// 028. Not in a thread: the full list, and the writes on a suggestion.
//
// Every route here resolves the caller's own default thread on the server and
// takes no thread id from the client (SEC-2), so the only things it can reach
// are the caller's. Writes re-check authorship per row and membership of the
// destination through the same functions every other move goes through.

import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { NotYours } from "../threads/access.js";
import { NoteDuplicate, moveNoteIn } from "../threads/notes.js";
import { withNoteLabels } from "../threads/labels.js";
import { contentRow, looseEntrySchema, loosePageSchema, noteSchema } from "./threads.js";
import { CHIP_KEYS, archivedCount, defaultThreadOf, looseArchived, looseCounts, loosePage } from "../loose/read.js";
import {
  LooseRefused,
  acceptSuggestion,
  createFromProposal,
  dismissSuggestion,
  readProposal,
  undoProposal,
  undoSuggestion,
} from "../loose/suggestions.js";

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

const notFound = z.object({ error: z.literal("not_found") });
const conflict = z.object({ error: z.enum(["too_late", "changed", "duplicate"]) });
const ok = z.object({ ok: z.literal(true) });
const threadRef = z.object({ thread: z.object({ id: z.string(), name: z.string(), icon: z.string(), hue: z.number() }) });
const idParams = z.object({ id: z.string().uuid() });

/** One refusal for every reason a thing is not the caller's (404); the shape
 *  answers a person can act on are their own codes. */
function refusing<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | FastifyReply> {
  return run().catch((error: unknown) => {
    if (error instanceof NotYours) return reply.code(404).send({ error: "not_found" as const });
    if (error instanceof NoteDuplicate) return reply.code(409).send({ error: "duplicate" as const });
    if (error instanceof LooseRefused) {
      if (error.code === "too_late" || error.code === "changed") return reply.code(409).send({ error: error.code });
      return reply.code(400).send({ error: error.code });
    }
    throw error;
  });
}

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

  // ------------------------------------------------------------ suggestions

  app.post(
    "/v1/suggestions/:id/accept",
    { schema: { params: idParams, response: { 200: threadRef, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => reply.send(await acceptSuggestion(accountId, request.params.id)));
    }
  );

  app.post(
    "/v1/suggestions/:id/undo",
    { schema: { params: idParams, response: { 200: ok, 401: unauthenticated, 404: notFound, 409: conflict } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => {
        await undoSuggestion(accountId, request.params.id);
        return reply.send({ ok: true as const });
      });
    }
  );

  app.delete(
    "/v1/suggestions/:id",
    { schema: { params: idParams, response: { 200: ok, 401: unauthenticated, 404: notFound } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => {
        await dismissSuggestion(accountId, request.params.id);
        return reply.send({ ok: true as const });
      });
    }
  );

  // -------------------------------------------------------------- proposals

  app.get(
    "/v1/proposals/:id",
    {
      schema: {
        params: idParams,
        response: {
          200: z.object({ id: z.string(), name: z.string(), entries: z.array(looseEntrySchema) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => reply.send(await readProposal(accountId, request.params.id)));
    }
  );

  app.post(
    "/v1/proposals/:id/create",
    {
      schema: {
        params: idParams,
        body: z.object({
          name: z.string().max(200),
          contentIds: z.array(z.string().uuid()).max(10),
          noteIds: z.array(z.string().uuid()).max(10),
        }),
        response: { 200: threadRef, 400: badRequest, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => reply.send(await createFromProposal(accountId, request.params.id, request.body)));
    }
  );

  app.post(
    "/v1/proposals/:id/undo",
    { schema: { params: idParams, response: { 200: ok, 401: unauthenticated, 404: notFound, 409: conflict } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => {
        await undoProposal(accountId, request.params.id);
        return reply.send({ ok: true as const });
      });
    }
  );

  // ------------------------------------------------------------ a note moves

  app.post(
    "/v1/notes/:id/move",
    {
      schema: {
        params: idParams,
        body: z.object({ threadId: z.string().uuid() }),
        response: {
          200: z.object({ note: noteSchema, previous: z.object({ threadId: z.string() }) }),
          401: unauthenticated,
          404: notFound,
          409: conflict,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      return refusing(reply, async () => {
        const moved = await db.transaction().execute((trx) => moveNoteIn(trx, accountId, request.params.id, request.body.threadId));
        const [note] = await withNoteLabels([moved.note]);
        return reply.send({ note: note!, previous: moved.previous });
      });
    }
  );
}
