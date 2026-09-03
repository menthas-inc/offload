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

/** Every tick re-checks the session, so this is also the window in which a
 *  revoked session keeps receiving. Short enough to be honest, long enough not
 *  to hammer the session check. */
const STREAM_TICK_MS = 15_000;

/** Then the client reconnects. Bounds the revocation gap above and keeps a
 *  proxy from closing the stream first and making it look like a failure. */
const STREAM_LIFETIME_MS = 300_000;

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


/** What an open stream should do right now.
 *
 *  Extracted from the stream itself so it can be tested: Better Auth signs its
 *  session cookie, so driving the endpoint from a test would mean replicating
 *  that signing, which is a test that breaks when the library changes rather
 *  than when the behaviour does. The authorization around this is covered by
 *  its own 401 and 404 cases; this is the part with the states in it.
 */
export type StreamStep =
  | { do: "answered"; reply: string | null }
  | { do: "failed" }
  | { do: "close" }
  | { do: "wait" };

export async function streamStep(messageId: string, accountId: string): Promise<StreamStep> {
  const account = await db
    .selectFrom("accounts")
    .select("state")
    .where("id", "=", accountId)
    .executeTakeFirst();

  // Disabling an account has to reach an open stream. 002 enforces revocation
  // at Better Auth's refresh, which fires on a request, and a stream makes
  // none once it is open (AC-17).
  if (!account || account.state === "disabled") return { do: "close" };

  const current = await db
    .selectFrom("messages")
    .select(["state", "turn_id"])
    .where("id", "=", messageId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!current) return { do: "close" };
  if (current.state === "answered") {
    return { do: "answered", reply: await replyFor(current.turn_id, accountId) };
  }
  if (current.state === "failed") return { do: "failed" };
  return { do: "wait" };
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

  // The answer, pushed rather than polled.
  //
  // This reverses a recorded decision, that "the queue carries the response, so
  // there is no second channel... and no reconnection or resumption cases".
  // It is a second channel and it does have those cases. Logged in
  // decisions.md with its cost.
  //
  // **It is an optimisation over polling, not a replacement for it.** GET
  // /v1/messages/:id stays, and the client falls back to it whenever the stream
  // closes without an answer. That is what makes it safe to be an optimisation:
  // nothing is lost if the stream never connects at all.
  app.get(
    "/v1/messages/:id/stream",
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "state", "turn_id"])
        .where("id", "=", request.params.id)
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message) return reply.code(404).send({ error: "not_found" as const });

      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Nginx and friends buffer by default, which turns a stream into one
        // large response delivered at the end.
        "x-accel-buffering": "no",
      });

      const send = (event: string, data: unknown): void => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      let closed = false;
      const finish = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        reply.raw.end();
      };
      request.raw.on("close", finish);

      /** One look at the message, and at whether this person may still see it.
       *
       *  The session check runs on every tick and not only at connect. 002
       *  enforces revocation at Better Auth's refresh, which fires on a
       *  request, and an open stream makes none: without this, disabling an
       *  account would leave its stream delivering conversation updates for as
       *  long as it stayed open. The tick interval is therefore the exposure,
       *  and it is stated rather than discovered. */
      const tick = async (): Promise<void> => {
        if (closed) return;

        // The session, every tick and not only at connect.
        const stillAllowed = await currentAccountId(request);
        if (stillAllowed !== accountId) return finish();

        const step = await streamStep(message.id, accountId);
        if (step.do === "answered") {
          send("done", { state: "answered", reply: step.reply });
          return finish();
        }
        if (step.do === "failed") {
          send("failed", { state: "failed" });
          return finish();
        }
        if (step.do === "close") return finish();

        // A comment frame. Keeps an idle proxy from dropping a stream that is
        // legitimately waiting on a model.
        reply.raw.write(": keep-alive\n\n");
      };

      send("thinking", { state: message.state });
      const timer = setInterval(() => void tick(), STREAM_TICK_MS);

      // Bounded. The client reconnects, which re-runs the authorization above
      // and bounds how stale an open stream's view of a session can be.
      setTimeout(finish, STREAM_LIFETIME_MS);

      // Answered before the first tick, which is common on a fast model.
      await tick();

      return reply;
    }
  );
}

export const DUMP_LIMITS = { MAX_DUMP_CHARS, CONVERSATION_GAP } as const;
