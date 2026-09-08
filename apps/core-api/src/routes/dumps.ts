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
import { webOrigins } from "../env.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { onAnswer } from "../dumps/answers.js";
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

/** How often the stream re-checks the session and sends a keep-alive.
 *
 *  **Nothing polls for the answer any more.** The stream reads once when it
 *  opens, then waits to be woken by `pg_notify` from the transaction that
 *  writes the reply, so an answer arrives the instant it commits and no
 *  question is asked in the meantime. See `../dumps/answers.ts`.
 *
 *  This interval is only two things now, and both genuinely want a clock. 002
 *  enforces session revocation at Better Auth's refresh, which fires on a
 *  request, and an open stream makes none, so **this interval is the window in
 *  which a disabled account keeps receiving its own conversation updates**. And
 *  an idle proxy drops a connection that has said nothing for long enough. */
const STREAM_SESSION_MS = 15_000;

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

async function currentAccountId(
  request: FastifyRequest,
): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

const dumpBody = z.object({
  text: z.string().min(1),
  /** The outbox idempotency key. A device that retried without hearing the
   *  response must not create the dump twice. */
  clientKey: z.string().max(200).optional(),
});

type MessageState = "queued" | "seen" | "answered" | "failed" | "partial";

/** One list, used by every response that carries a state, so a value added to
 *  the CHECK constraint cannot reach one endpoint and not another. */
const messageState = z.enum(["queued", "seen", "answered", "failed", "partial"]);

const dumpResponse = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  state: messageState,
  /** The undo unit, returned at send time so the composer never has to ask for
   *  it later. Undo is offered eight seconds after the reply, and a round trip
   *  inside that window is a round trip that can miss it. */
  turnId: z.string(),
});

/** The threads a turn actually wrote to.
 *
 *  From the `content` rows it produced, not from parsing the reply. offload
 *  naming a thread it did not write to is the failure 004 exists to prevent,
 *  so the composer's links come from the record of what happened rather than
 *  from the sentence describing it. If the two ever disagree, the links are
 *  right and the sentence is the bug. */
const touchedThreads = z.array(z.object({ id: z.string(), name: z.string() }));

const messageResponse = z.object({
  id: z.string(),
  conversationId: z.string(),
  state: messageState,
  text: z.string().nullable(),
  reply: z.string().nullable(),
  threads: touchedThreads,
  /** Thread ids whose contents this turn changed, a superset of `threads`.
   *  A move's source is in here and not in `threads`: the screen has to reload
   *  it, and a pill saying the dump went there would be untrue. */
  changed: z.array(z.string()),
});

/** One screenful. The composer is not a scrollback and the heavy case at 200
 *  messages is already more than it should draw at once. */
const TAIL = 50;

const currentConversation = z.object({
  conversationId: z.string().nullable(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["person", "offload"]),
      text: z.string().nullable(),
      state: messageState,
      /** What an Undo would reverse. The whole turn, not this row. */
      turnId: z.string(),
    })
  ),
});

const undoResponse = z.object({ undone: z.boolean() });
const notFinishable = z.object({ error: z.literal("not_finishable") });

const tooLong = z.object({
  error: z.literal("too_long"),
  maxChars: z.number(),
});
const notFound = z.object({ error: z.literal("not_found") });
const unauthenticated = z.object({ error: z.literal("unauthenticated") });

/** The reply to a person's message, if it has been answered.
 *
 *  Matched on turn_id rather than by taking the newest offload message in the
 *  conversation: with two dumps in flight the newest is not necessarily the
 *  answer to this one, and showing somebody the wrong answer under their
 *  message is worse than showing none. */
/** Which threads a turn's content landed in, deduplicated, in the order it
 *  filed them. One indexed lookup on `content(derived_from_message_id)`.
 *
 *  From the rows, never from the reply. offload naming a thread it did not
 *  write to is the failure 004 exists to prevent, so the composer's links come
 *  from the record of what happened rather than from the sentence describing
 *  it. If the two ever disagree, the links are right and the sentence is a bug.
 */
/** Where a turn's content is now, and every thread it changed.
 *
 *  Two lists because they answer different questions and one of them is a claim
 *  surface. `landed` is what the reply's pills may name and what earns the Done
 *  mark: the turn's content is in these threads. `changed` is every thread
 *  whose contents moved, which the screen needs in order to reload and which
 *  includes the thread a move took something *out of*.
 *
 *  The content join stays for messages written before `message_threads`
 *  existed. Their turns filed rather than edited, because filing was the only
 *  thing that left a record, so the older answer is still the right one for
 *  them. */
async function threadsFor(
  messageId: string,
  accountId: string,
): Promise<{ landed: { id: string; name: string }[]; changed: string[] }> {
  const [filed, noted] = await Promise.all([
    db
      .selectFrom("content")
      .innerJoin("threads", "threads.id", "content.thread_id")
      .select(["threads.id as id", "threads.name as name"])
      .where("content.derived_from_message_id", "=", messageId)
      .where("content.account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .orderBy("content.created_at")
      .execute(),
    db
      .selectFrom("message_threads")
      .innerJoin("threads", "threads.id", "message_threads.thread_id")
      // Membership, not authorship: a turn can act on a shared thread's
      // contents, and the name is only shown to somebody already in it.
      .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
      .select(["threads.id as id", "threads.name as name", "message_threads.landed as landed"])
      .where("message_threads.message_id", "=", messageId)
      .where("thread_members.account_id", "=", accountId)
      .where("threads.deleted_at", "is", null)
      .orderBy("message_threads.created_at")
      .execute(),
  ]);

  const landed: { id: string; name: string }[] = [];
  const changed = new Set<string>();
  const seen = new Set<string>();

  for (const row of [...filed.map((r) => ({ ...r, landed: true })), ...noted]) {
    changed.add(row.id);
    if (!row.landed || seen.has(row.id)) continue;
    seen.add(row.id);
    landed.push({ id: row.id, name: row.name });
  }

  return { landed, changed: [...changed] };
}

async function replyFor(
  turnId: string,
  accountId: string,
): Promise<string | null> {
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
export interface TouchedThread {
  id: string;
  name: string;
}

export type StreamStep =
  | { do: "answered"; reply: string | null; threads: TouchedThread[]; changed: string[] }
  | { do: "partial"; reply: string | null; threads: TouchedThread[]; changed: string[] }
  | { do: "failed" }
  | { do: "close" }
  | { do: "wait" };

export async function streamStep(
  messageId: string,
  accountId: string,
): Promise<StreamStep> {
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
  if (current.state === "answered" || current.state === "partial") {
    const [reply, touched] = await Promise.all([
      replyFor(current.turn_id, accountId),
      threadsFor(messageId, accountId),
    ]);
    return {
      do: current.state === "answered" ? "answered" : "partial",
      reply,
      threads: touched.landed,
      changed: touched.changed,
    };
  }
  if (current.state === "failed") return { do: "failed" };
  return { do: "wait" };
}

/** Take a dump: find or start its conversation, store it, and queue the answer.
 *
 *  Extracted from the route so it can be tested. Better Auth signs its session
 *  cookie, so driving the endpoint from a test would mean replicating that
 *  signing, and that is a test which breaks when the library changes rather than
 *  when this behaviour does. The route keeps the parts that are genuinely about
 *  the request: who is asking, and how long the body is.
 */
export async function takeDump(
  accountId: string,
  text: string,
  clientKey?: string,
): Promise<{
  messageId: string;
  conversationId: string;
  state: MessageState;
  turnId: string;
}> {
  const turnId = randomUUID();

  return db.transaction().execute(async (trx) => {
    // The join and the insert in one statement each, inside one
    // transaction, so two dumps a millisecond apart cannot disagree about
    // whether they were within the window.
    const recent = await trx
      .selectFrom("conversations")
      .select("id")
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      // Closing the composer ends the conversation, so the next dump starts a
      // new one however soon it arrives. Six hours of silence was the only
      // thing that used to end one, which meant somebody who deliberately put
      // a conversation away and began a new subject got answers about the old
      // one.
      .where("ended_at", "is", null)
      .where(
        sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`,
      )
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

    // onConflict, not just the check above.
    //
    // That check is a select followed by an insert, and the case it exists
    // for is a device retrying because it never heard the response, which
    // is exactly the case where two requests can be in flight together.
    // Both pass the select, the second hits the unique index, and a person
    // whose network hiccuped gets a 500 for asking twice. The index is the
    // real guarantee; the select just saves the round trip when the retry
    // is late rather than concurrent.
    const inserted = await trx
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
      .onConflict((oc) =>
      // The index is partial, on client_key is not null, because most messages
      // have none. Postgres will only infer a partial index when the conflict
      // target repeats its predicate, so this is not decoration: without the
      // where clause it raises "no unique or exclusion constraint matching the
      // ON CONFLICT specification" on every insert.
      oc
        .columns(["account_id", "client_key"])
        .where("client_key", "is not", null)
        .doNothing()
    )
      .returning(["id", "state"])
      .executeTakeFirst();

    if (!inserted) {
      // The other request won. Return its message rather than a new one,
      // and enqueue nothing: it already did.
      const existing = await trx
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "turn_id"])
        .where("account_id", "=", accountId)
        .where("client_key", "=", clientKey!)
        .executeTakeFirstOrThrow();
      return {
        messageId: existing.id,
        conversationId: existing.conversation_id,
        state: existing.state,
        // The winning request's turn, not the one this call generated and
        // threw away. Returning the local one would hand back an undo id that
        // matches nothing.
        turnId: existing.turn_id,
      };
    }

    const message = inserted;

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
      // One retry, then the person is told (AC-5). The column's default is
      // 5, which is right for email and wrong for somebody watching a
      // thinking indicator.
      maxAttempts: 2,
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

    return { messageId: message.id, conversationId, state: message.state, turnId };
  });
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
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const { text, clientKey } = request.body;

      // Before the write, not after. AC-14.
      if (text.length > MAX_DUMP_CHARS) {
        return reply
          .code(413)
          .send({ error: "too_long" as const, maxChars: MAX_DUMP_CHARS });
      }

      // Idempotency first, so a retry never reaches the conversation logic and
      // cannot start a second conversation on the six-hour boundary.
      if (clientKey) {
        const existing = await db
          .selectFrom("messages")
          .select(["id", "conversation_id", "state", "turn_id"])
          .where("account_id", "=", accountId)
          .where("client_key", "=", clientKey)
          .executeTakeFirst();
        if (existing) {
          return reply.code(202).send({
            messageId: existing.id,
            conversationId: existing.conversation_id,
            state: existing.state,
            turnId: existing.turn_id,
          });
        }
      }

      const result = await takeDump(accountId, text, clientKey);

      return reply.code(202).send(result);
    },
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
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "text", "turn_id"])
        .where("id", "=", request.params.id)
        // Scoped, so another account's id is not found rather than forbidden:
        // a 403 confirms the row exists.
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message)
        return reply.code(404).send({ error: "not_found" as const });

      const settled = message.state === "answered" || message.state === "partial";
      const touched = settled
        ? await threadsFor(message.id, accountId)
        : { landed: [], changed: [] };

      return reply.send({
        id: message.id,
        conversationId: message.conversation_id,
        state: message.state,
        text: message.text,
        reply: settled ? await replyFor(message.turn_id, accountId) : null,
        // Where it actually went, and everything it changed. Both empty until
        // the turn settles, which is the honest answer while it is running.
        threads: settled ? touched.landed : [],
        changed: settled ? touched.changed : [],
      });
    },
  );

  // The tail of the current conversation.
  //
  // AC-1 promises that somebody who sends a dump and loses connectivity finds
  // it on next load. The row was always safe, but until this existed there was
  // no way to reach it: the only routes were send, fetch one message by an id
  // the browser had forgotten, and a stream. The impl-spec's volume section had
  // already designed this read and nothing had built it.
  //
  // A fixed tail rather than the whole thing, cursorless because the composer
  // shows one screen and the heavy case at 200 messages is already more than it
  // should render. Paging arrives with a conversation view that can scroll.
  app.get(
    "/v1/conversations/current",
    { schema: { response: { 200: currentConversation, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const conversation = await db
        .selectFrom("conversations")
        .select(["id"])
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        // The same predicate as the dump's own lookup, and for the same
        // reason: a conversation somebody closed must not come back on the
        // next load. Its messages are still there, they are just not the
        // current conversation any more.
        .where("ended_at", "is", null)
        .where(sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`)
        .orderBy("last_message_at", "desc")
        .limit(1)
        .executeTakeFirst();

      if (!conversation) return reply.send({ conversationId: null, messages: [] });

      const rows = await db
        .selectFrom("messages")
        .select(["id", "role", "text", "state", "turn_id", "created_at"])
        .where("conversation_id", "=", conversation.id)
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .orderBy("created_at", "desc")
        .limit(TAIL)
        .execute();

      return reply.send({
        conversationId: conversation.id,
        messages: rows.reverse().map((row) => ({
          id: row.id,
          role: row.role,
          text: row.text,
          state: row.state,
          turnId: row.turn_id,
        })),
      });
    }
  );

  // Ending the current conversation, because somebody closed it.
  //
  // The composer's close is a statement, not a tidy-up: this subject is over.
  // Before this it cleared the screen and nothing else, so the next dump joined
  // the same conversation and offload answered it holding the previous one.
  //
  // **Ends whatever is current rather than an id the client names.** The client
  // knows the conversation it was showing, but by the time the request lands
  // that may not be the one a dump from another device just started, and ending
  // a conversation somebody is still typing into is worse than the bug. So the
  // server ends what its own lookup would have reused, which is exactly the
  // thing the close was about.
  //
  // Idempotent, and quiet about finding nothing: closing an empty composer, or
  // closing twice, is a normal thing to do and not a failure.
  app.post(
    "/v1/conversations/current/end",
    { schema: { response: { 200: z.object({ ended: z.boolean() }), 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const ended = await db
        .updateTable("conversations")
        .set({ ended_at: sql`now()` })
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .where("ended_at", "is", null)
        .where(sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`)
        .executeTakeFirst();

      return reply.send({ ended: (ended.numUpdatedRows ?? 0n) > 0n });
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
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "state", "turn_id"])
        .where("id", "=", request.params.id)
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message)
        return reply.code(404).send({ error: "not_found" as const });

      let closed = false;
      // Set once the stream subscribes. A stream that goes away without
      // unsubscribing leaves a closure in a map for the life of the process,
      // which is the same leak as an EventSource nobody closes.
      let unsubscribe: (() => void) | null = null;
      const finish = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        clearInterval(timer);
        clearTimeout(lifetime);
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      request.raw.on("close", finish);

      // Fastify otherwise passes whatever an async handler resolves with to
      // reply.send() once the promise settles, which for a stream that is still
      // waiting means sending a response on top of one already in flight.
      reply.hijack();

      // CORS, by hand, because hijacking bypasses the plugin that would
      // otherwise add it.
      //
      // **This is why the composer never received an answer in a browser.**
      // `reply.hijack()` takes the socket away from Fastify, and
      // `reply.raw.writeHead` writes exactly the headers listed here, so the
      // `access-control-allow-origin` @fastify/cors sets on the reply object
      // never reaches the wire. Same-origin callers, including every test in
      // this repo, never notice. A browser on a different origin blocks the
      // response, the EventSource errors, and the person watches a thinking
      // indicator until they reload.
      //
      // The origin is echoed only when it is on the same allowlist the plugin
      // uses, so this cannot become a way around it.
      const requestOrigin = request.headers.origin;
      const allowed =
        typeof requestOrigin === "string" && webOrigins.includes(requestOrigin)
          ? requestOrigin
          : null;

      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Nginx and friends buffer by default, which turns a stream into one
        // large response delivered at the end.
        "x-accel-buffering": "no",
        ...(allowed
          ? {
              "access-control-allow-origin": allowed,
              "access-control-allow-credentials": "true",
              // The origin decides the body, so a shared cache must not serve
              // one origin's response to another.
              vary: "Origin",
            }
          : {}),
      });

      // A socket that dies mid-write emits on the response. Unhandled, that is
      // an uncaught exception on a process serving everybody else.
      reply.raw.on("error", () => finish());

      /** Every write goes through here, and every write re-checks.
       *
       *  The check cannot be done once at the top of a tick: there are two
       *  awaits between there and the write, and a client that closes the tab
       *  during either one runs the close handler concurrently. The tick then
       *  resumes and writes to a response that has already ended, which throws
       *  from inside a `void tick()` and becomes an unhandled rejection. A
       *  person closing a tab mid-dump is the ordinary case, not an edge one. */
      const write = (chunk: string): void => {
        if (closed || reply.raw.writableEnded) return;
        try {
          reply.raw.write(chunk);
        } catch {
          finish();
        }
      };

      const send = (event: string, data: unknown): void => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      /** One look at the message, and at whether this person may still see it.
       *
       *  The session check runs on every tick and not only at connect. 002
       *  enforces revocation at Better Auth's refresh, which fires on a
       *  request, and an open stream makes none: without this, disabling an
       *  account would leave its stream delivering conversation updates for as
       *  long as it stayed open. The tick interval is therefore the exposure,
       *  and it is stated rather than discovered. */
      const tick = async (checkSession: boolean): Promise<void> => {
        if (closed) return;
        try {
          // The session only on the clock. The answer arrives by notification,
          // and re-checking a session every time one lands would be a Better
          // Auth call per answer for no gain.
          if (checkSession) {
            const stillAllowed = await currentAccountId(request);
            if (stillAllowed !== accountId) return finish();
          }

          const step = await streamStep(message.id, accountId);
          if (step.do === "answered" || step.do === "partial") {
            send("done", {
              state: step.do,
              reply: step.reply,
              threads: step.threads,
              changed: step.changed,
            });
            return finish();
          }
          if (step.do === "failed") {
            send("failed", { state: "failed" });
            return finish();
          }
          if (step.do === "close") return finish();

          // A comment frame, only on the clock. Its job is to keep an idle
          // proxy from dropping a stream that is legitimately waiting on a
          // model.
          if (checkSession) write(": keep-alive\n\n");
        } catch {
          // A failed tick is not worth killing the process over. The client
          // reconnects, or falls back to asking.
          finish();
        }
      };

      send("thinking", { state: message.state });

      // The clock, for the session check and the keep-alive only.
      const timer = setInterval(() => void tick(true), STREAM_SESSION_MS);

      // Bounded. The client reconnects, which re-runs the authorization above
      // and bounds how stale an open stream's view of a session can be.
      const lifetime = setTimeout(finish, STREAM_LIFETIME_MS);

      // Woken by the transaction that writes the reply, so the answer goes out
      // the instant it commits and nothing asks in the meantime.
      //
      // Subscribed before the first read, deliberately. The other order has a
      // gap: an answer committing between the read and the subscribe would
      // notify nobody, and the stream would then wait for a notification that
      // had already happened.
      unsubscribe = await onAnswer(message.id, () => void tick(false));

      // And then read once, in case it landed before any of this, which is
      // common on a fast model and on a reconnect.
      await tick(false);

      return;
    },
  );

  // Undo, and the one thing it must not leave behind.
  //
  // The unit is the whole turn: the person's message, every piece of content
  // derived from it, and offload's reply. The reply especially. A reply saying
  // "Added to Flat admin" that survives its own undo is a false statement
  // sitting permanently in history, which is exactly the pretence 004 exists to
  // retire, recreated by the mechanism meant to protect against it.
  //
  // **No server-side time window.** The eight seconds is the toast's lifetime
  // in the client. A window here would add a clock-skew failure mode to defend
  // against somebody deleting their own content, which is not a threat and is
  // arguably a feature. Written down because the acceptance criterion says
  // "available for eight seconds" and a reader would otherwise look for a check
  // that is deliberately absent.
  app.post(
    "/v1/turns/:turnId/undo",
    {
      schema: {
        params: z.object({ turnId: z.string().uuid() }),
        response: { 200: undoResponse, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const outcome = await undoTurn(accountId, request.params.turnId);

      if (!outcome) return reply.code(404).send({ error: "not_found" as const });
      return reply.send(outcome);
    },
  );

  // Finish a turn that stopped partway.
  //
  // A fresh job against the same message, not a fresh dump. The planner is
  // given what already landed and asked to do the rest, so the resume adds to
  // the turn rather than replacing it, and nothing already filed is touched.
  app.post(
    "/v1/dumps/:messageId/resume",
    {
      schema: {
        params: z.object({ messageId: z.string().uuid() }),
        response: { 200: dumpResponse, 401: unauthenticated, 404: notFound, 409: notFinishable },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "turn_id"])
        .where("id", "=", request.params.messageId)
        .where("account_id", "=", accountId)
        .where("role", "=", "person")
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message) return reply.code(404).send({ error: "not_found" as const });

      // Only a turn that stopped. Resuming an answered one would file a second
      // copy of everything, and resuming one still in flight would put two
      // planners on the same message.
      if (message.state !== "partial" && message.state !== "failed") {
        return reply.code(409).send({ error: "not_finishable" as const });
      }

      const state = await db.transaction().execute(async (trx) => {
        // Back to seen, so the composer's existing wait path applies unchanged
        // and turn-result's idempotency guard has something to match.
        await trx
          .updateTable("messages")
          .set({ state: "seen" })
          .where("id", "=", message.id)
          .execute();

        await enqueue({
          kind: "dump.answer",
          accountId,
          payload: {
            messageId: message.id,
            conversationId: message.conversation_id,
            turnId: message.turn_id,
          },
          priority: PRIORITY.interactive,
          maxAttempts: 2,
          tx: trx,
        });

        return "seen" as const;
      });

      return reply.send({
        messageId: message.id,
        conversationId: message.conversation_id,
        state,
        turnId: message.turn_id,
      });
    },
  );
}

/** Undo one turn: what they dumped, everything derived from it, and what
 *  offload said about it.
 *
 *  Exported for the same reason `takeDump` is. Better Auth signs its session
 *  cookie, so a test cannot reach a session-scoped route by pretending, and the
 *  properties worth asserting here are properties of the transaction. The route
 *  owns the session check; this owns the write.
 *
 *  Returns null when the turn is not this account's or does not exist, which
 *  are one answer for the same reason the tool endpoint has one refusal.
 */
export async function undoTurn(
  accountId: string,
  turnId: string,
): Promise<{ undone: boolean } | null> {
  return db.transaction().execute(async (trx) => {
    const owned = await trx
      .selectFrom("messages")
      .select(["id"])
      .where("turn_id", "=", turnId)
      .where("account_id", "=", accountId)
      .execute();

    if (owned.length === 0) return null;

    const live = await trx
      .selectFrom("messages")
      .select(["id"])
      .where("turn_id", "=", turnId)
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();

    // Idempotent. The second press matches nothing and changes nothing.
    if (live.length === 0) return { undone: false };

    // One timestamp for the whole turn. Two now() calls in one transaction do
    // return the same value in Postgres, but relying on that is relying on a
    // detail rather than stating the requirement, which is that a turn purges
    // as a unit.
    const stamp = sql<Date>`now()`;
    const purge = sql<Date>`now() + interval '8 seconds'`;

    // **Calendar rows are excluded, and this is not a refinement.** 012 lets a
    // tool write an event into somebody's Google Calendar, and this update
    // filters on nothing but the message the row came from: not `type`, not
    // `source`. Left as it was, the ordinary Undo toast would soft-delete our
    // row and leave the event sitting in Google forever, which is exactly the
    // disagreement between offload and a calendar that 012 AC-17 forbids.
    //
    // Undoing a calendar write has to reach Google first and only then touch
    // the local row, because the effect already left. That is a different path
    // with a different failure mode, so it is not this one's to run.
    await trx
      .updateTable("content")
      .set({ deleted_at: stamp, purge_after: purge, updated_at: stamp })
      .where(
        "derived_from_message_id",
        "in",
        live.map((row) => row.id),
      )
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .where("source", "<>", "calendar")
      .execute();

    // Memories the turn wrote, on the same clock and by the same predicate.
    //
    // Without this, undoing a dump takes back what was filed and leaves the
    // standing rule offload derived from it, which then goes on steering every
    // later turn on that thread. Same argument as reversing offload's reply: a
    // turn that half survives its own undo is the pretence this feature exists
    // to retire, recreated by the mechanism meant to protect against it.
    await trx
      .updateTable("memories")
      .set({ deleted_at: stamp, purge_after: purge, updated_at: stamp })
      .where(
        "derived_from_message_id",
        "in",
        live.map((row) => row.id),
      )
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();

    await trx
      .updateTable("messages")
      .set({ deleted_at: stamp, purge_after: purge })
      .where("turn_id", "=", turnId)
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();

    // The conversation stays. A conversation with every message undone is an
    // empty conversation, not a deleted one.
    //
    // The hard delete is enqueued by the delete rather than left to a timer,
    // which is the difference between a purge that is late and a purge that
    // never happens because a scheduler stopped and nobody noticed. Ten seconds
    // out, two past the window, and the handler is idempotent so overlapping
    // enqueues cost nothing.
    await enqueue({
      kind: "content.purge",
      accountId,
      payload: {},
      priority: PRIORITY.background,
      runAfterSeconds: 10,
      tx: trx,
    });

    return { undone: true };
  });
}

export const DUMP_LIMITS = { MAX_DUMP_CHARS, CONVERSATION_GAP } as const;
