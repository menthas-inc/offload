// The dump.
//
// A person types, presses send, and this is where it lands. Three routes: take
// a dump, read one message, and stream one message's answer as it arrives.
//
// The shape of the write is the whole point. The message is stored first and
// unconditionally, in the same transaction as the job that will answer it, so
// there is no window where a dump exists and nothing is coming for it, and none
// where a job references a message that is not committed. Everything after that
// can fail without losing what somebody handed us, which is the one promise
// this product cannot break.

import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { emit } from "../analytics.js";

/** Longer than anything the composer is designed for, and short enough that a
 *  paste cannot run up a bill. Refused before anything is written, and never
 *  silently truncated: quietly dropping half of what someone dumped is worse
 *  than telling them it was too long. */
const MAX_DUMP_CHARS = 10_000;

/** A dump joins the newest conversation if it is under this old, and starts a
 *  new one otherwise. Six hours is a working session: a morning of dumps is one
 *  conversation and tomorrow morning is a new one. */
const CONVERSATION_GAP = "6 hours";

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

const dumpBody = z.object({
  text: z.string().min(1),
  /** The outbox idempotency key. A device that retried without hearing the
   *  response must not create the dump twice. */
  clientKey: z.string().max(200).optional(),
});

const dumpResponse = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  state: z.enum(["queued", "seen", "answered", "failed"]),
});

const messageResponse = z.object({
  id: z.string(),
  conversationId: z.string(),
  state: z.enum(["queued", "seen", "answered", "failed"]),
  text: z.string().nullable(),
  reply: z.string().nullable(),
});

const tooLong = z.object({ error: z.literal("too_long"), maxChars: z.number() });
const notFound = z.object({ error: z.literal("not_found") });
const unauthenticated = z.object({ error: z.literal("unauthenticated") });

/** The reply to a person's message, if it has been answered.
 *
 *  Matched on turn_id rather than by taking the newest offload message in the
 *  conversation: with two dumps in flight the newest is not necessarily the
 *  answer to this one, and showing somebody the wrong answer under their
 *  message is worse than showing none. */
async function replyFor(turnId: string, accountId: string): Promise<string | null> {
  const row = await db
    .selectFrom("messages")
    .select("text")
    .where("turn_id", "=", turnId)
    .where("role", "=", "offload")
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return row?.text ?? null;
}

export async function dumpRoutes(app: App): Promise<void> {
  app.post(
    "/v1/dumps",
    {
      schema: {
        body: dumpBody,
        response: { 202: dumpResponse, 401: unauthenticated, 413: tooLong },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const { text, clientKey } = request.body;

      // Before the write, not after. AC-14.
      if (text.length > MAX_DUMP_CHARS) {
        return reply.code(413).send({ error: "too_long" as const, maxChars: MAX_DUMP_CHARS });
      }

      // Idempotency first, so a retry never reaches the conversation logic and
      // cannot start a second conversation on the six-hour boundary.
      if (clientKey) {
        const existing = await db
          .selectFrom("messages")
          .select(["id", "conversation_id", "state"])
          .where("account_id", "=", accountId)
          .where("client_key", "=", clientKey)
          .executeTakeFirst();
        if (existing) {
          return reply.code(202).send({
            messageId: existing.id,
            conversationId: existing.conversation_id,
            state: existing.state,
          });
        }
      }

      const turnId = randomUUID();

      const result = await db.transaction().execute(async (trx) => {
        // The join and the insert in one statement each, inside one
        // transaction, so two dumps a millisecond apart cannot disagree about
        // whether they were within the window.
        const recent = await trx
          .selectFrom("conversations")
          .select("id")
          .where("account_id", "=", accountId)
          .where("deleted_at", "is", null)
          .where(sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`)
          .orderBy("last_message_at", "desc")
          .limit(1)
          .executeTakeFirst();

        const conversationId =
          recent?.id ??
          (
            await trx
              .insertInto("conversations")
              .values({ account_id: accountId })
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id;

        const message = await trx
          .insertInto("messages")
          .values({
            conversation_id: conversationId,
            account_id: accountId,
            role: "person",
            type: "text",
            turn_id: turnId,
            text,
            // seen, not queued: offload has it. queued is internal and never
            // reaches a client.
            state: "seen",
            client_key: clientKey ?? null,
          })
          .returning(["id", "state"])
          .executeTakeFirstOrThrow();

        await trx
          .updateTable("conversations")
          .set({ last_message_at: sql`now()` })
          .where("id", "=", conversationId)
          .execute();

        // Same transaction as the write that caused it. A job that references
        // an uncommitted message is a job that fails on a race nobody can
        // reproduce.
        //
        // Ids only in the payload. The text stays in its row: a payload is the
        // thing that ends up in a log line when somebody debugs the queue, and
        // OFF-1 says content does not go there.
        await enqueue({
          kind: "dump.answer",
          accountId,
          payload: { messageId: message.id, conversationId, turnId },
          priority: PRIORITY.interactive,
          tx: trx,
        });

        // The pseudonym, not the account id: an event never carries one
        // (OFF-1). Read inside the transaction and emitted inside it too, so a
        // dump that rolls back does not leave an event claiming it happened.
        const subject = await trx
          .selectFrom("accounts")
          .select("analytics_subject_id")
          .where("id", "=", accountId)
          .executeTakeFirst();

        await emit({
          name: "dump_sent",
          subjectId: subject?.analytics_subject_id ?? null,
          platform: "web",
          tx: trx,
        });

        return { messageId: message.id, conversationId, state: message.state };
      });

      return reply.code(202).send(result);
    }
  );

  app.get(
    "/v1/messages/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: messageResponse, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "text", "turn_id"])
        .where("id", "=", request.params.id)
        // Scoped, so another account's id is not found rather than forbidden:
        // a 403 confirms the row exists.
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message) return reply.code(404).send({ error: "not_found" as const });

      return reply.send({
        id: message.id,
        conversationId: message.conversation_id,
        state: message.state,
        text: message.text,
        reply: message.state === "answered" ? await replyFor(message.turn_id, accountId) : null,
      });
    }
  );
}

export const DUMP_LIMITS = { MAX_DUMP_CHARS, CONVERSATION_GAP } as const;
