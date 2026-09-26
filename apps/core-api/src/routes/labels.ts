// 025. The person's label routes.
//
// Every one is a session route, so every write is `via: "person"`, and no
// body can say otherwise: the schemas are strict and carry no such field.
// Membership, the thread a label and a row must share, and the limits are all
// in `threads/labels.ts`; this file turns requests into those calls and
// refusals into statuses. A label read returns the label with its count, since
// the chip that shows it shows the count.

import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { NotYours, memberOf } from "../threads/access.js";
import {
  LabelRefused,
  applyLabels,
  createLabel,
  deleteLabel,
  labelsOfThread,
  restoreLabel,
  updateLabel,
  type Actor,
} from "../threads/labels.js";

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
const refused = z.object({ error: z.enum(["bad_label_name", "label_taken", "label_limit", "label_gone"]) });

/** The largest list a person can tick in one save: the heavy thread of 001. */
const ROWS_PER_WRITE = 500;
const ids = z.array(z.string().uuid()).max(ROWS_PER_WRITE);
const rowSet = z.strictObject({ content: ids.optional(), notes: ids.optional() });

const labelView = z.object({ id: z.string(), name: z.string(), colour: z.number(), count: z.number() });
const previousView = z.object({ name: z.string(), colour: z.number() });
const rowsView = z.object({ content: z.array(z.string()), notes: z.array(z.string()) });

function guard<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | FastifyReply> {
  return run().catch((error: unknown) => {
    if (error instanceof NotYours) return reply.code(404).send({ error: "not_found" as const });
    if (error instanceof LabelRefused) {
      // A person's route never meets offload's refusals; one that did is a bug
      // and is left to fail loudly rather than dressed as a 409.
      // 409 rather than 400, as 020 decided: a 400 schema would also have to
      // serialise Fastify's own validation errors, and they do not fit it.
      if (
        error.reason === "bad_label_name" ||
        error.reason === "label_taken" ||
        error.reason === "label_limit" ||
        error.reason === "label_gone"
      ) {
        return reply.code(409).send({ error: error.reason });
      }
    }
    throw error;
  });
}

async function withCount(threadId: string, labelId: string) {
  const found = (await labelsOfThread(threadId)).find((l) => l.id === labelId);
  if (!found) throw new NotYours();
  return found;
}

/** The label's thread, for a member. A label deleted while somebody had its
 *  list open is `label_gone` to a member and not found to anybody else. */
async function threadOf(actor: Actor, labelId: string): Promise<string> {
  const row = await db.selectFrom("labels").select(["thread_id", "deleted_at"]).where("id", "=", labelId).executeTakeFirst();
  if (!row || !(await memberOf(actor.accountId, row.thread_id))) throw new NotYours();
  if (row.deleted_at !== null) throw new LabelRefused("label_gone");
  return row.thread_id;
}

const split = (rows: { kind: "content" | "note"; rowId: string }[]) => ({
  content: rows.filter((r) => r.kind === "content").map((r) => r.rowId),
  notes: rows.filter((r) => r.kind === "note").map((r) => r.rowId),
});

export async function labelRoutes(app: App): Promise<void> {
  const session = async (request: FastifyRequest, reply: FastifyReply): Promise<Actor | null> => {
    const accountId = await currentAccountId(request);
    if (!accountId) {
      void reply.code(401).send({ error: "unauthenticated" as const });
      return null;
    }
    return { accountId, via: "person" };
  };

  app.post(
    "/v1/threads/:id/labels",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          name: z.string().max(200),
          colour: z.number().int().min(1).max(10).optional(),
          // A new label from the label's list lands with what was ticked, in
          // the same transaction, so there is one write and one Undo.
          rows: rowSet.optional(),
        }),
        response: { 200: z.object({ label: labelView }), 401: unauthenticated, 404: notFound, 409: refused },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const actor = await session(request, reply);
        if (!actor) return reply;
        const threadId = request.params.id;
        const label = await db.transaction().execute(async (trx) => {
          const made = await createLabel(trx, actor, threadId, { name: request.body.name, colour: request.body.colour ?? null });
          const rows = request.body.rows;
          if (rows && (rows.content?.length ?? 0) + (rows.notes?.length ?? 0) > 0) {
            await applyLabels(trx, actor, threadId, rows, [made.id], []);
          }
          return made;
        });
        return reply.send({ label: await withCount(threadId, label.id) });
      }),
  );

  app.patch(
    "/v1/labels/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          name: z.string().max(200).optional(),
          colour: z.number().int().min(1).max(10).optional(),
        }),
        response: {
          200: z.object({ label: labelView, previous: previousView, swappedWith: z.string().nullable() }),
         
          401: unauthenticated,
          404: notFound,
          409: refused,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const actor = await session(request, reply);
        if (!actor) return reply;
        const out = await updateLabel(db, actor, request.params.id, request.body);
        return reply.send({ label: await withCount(out.label.threadId, out.label.id), previous: out.previous, swappedWith: out.swappedWith });
      }),
  );

  app.delete(
    "/v1/labels/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ deleted: z.literal(true) }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const actor = await session(request, reply);
        if (!actor) return reply;
        await deleteLabel(db, actor, request.params.id);
        return reply.send({ deleted: true as const });
      }),
  );

  app.post(
    "/v1/labels/:id/restore",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ label: labelView }), 401: unauthenticated, 404: notFound, 409: refused },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const actor = await session(request, reply);
        if (!actor) return reply;
        const label = await restoreLabel(db, actor, request.params.id);
        return reply.send({ label: await withCount(label.threadId, label.id) });
      }),
  );

  app.post(
    "/v1/labels/:id/rows",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          add: rowSet,
          remove: rowSet,
          // Save on an existing label's list writes its name and colour with
          // its rows, still one write and one Undo.
          name: z.string().max(200).optional(),
          colour: z.number().int().min(1).max(10).optional(),
        }),
        response: {
          200: z.object({
            label: labelView,
            changed: z.object({ added: rowsView, removed: rowsView }),
            previous: previousView.nullable(),
          }),
         
          401: unauthenticated,
          404: notFound,
          409: refused,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const actor = await session(request, reply);
        if (!actor) return reply;
        const labelId = request.params.id;
        const threadId = await threadOf(actor, labelId);
        const { add, remove, name, colour } = request.body;
        const result = await db.transaction().execute(async (trx) => {
          const previous =
            name !== undefined || colour !== undefined ? (await updateLabel(trx, actor, labelId, { name: name ?? null, colour: colour ?? null })).previous : null;
          const added = await applyLabels(trx, actor, threadId, add, [labelId], []);
          const removed = await applyLabels(trx, actor, threadId, remove, [], [labelId]);
          return { previous, added: added.applied, removed: removed.removed };
        });
        return reply.send({
          label: await withCount(threadId, labelId),
          changed: { added: split(result.added), removed: split(result.removed) },
          previous: result.previous,
        });
      }),
  );
}
