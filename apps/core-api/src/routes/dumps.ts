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
import { targetFor, undoWrite, type WriteAction } from "../connectors/write.js";
import { waitingFor, writeThroughTool } from "../connectors/tool-calls.js";
import {
  applyAnswer,
  closeOpenQuestions,
  closeQuestion,
  closeQuestionsOfTurn,
  landedIn,
  openQuestionIn,
  optionLabel,
  questionOnWire,
  questionsFor,
  restoreAnswers,
  openQuestionOn,
  type QuestionOnWire,
} from "../questions.js";
import { foundFor } from "../search/found.js";
import { memberOf } from "../threads/access.js";

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
  /** The thread that was on screen when this was dumped.
   *
   *  **A default, not a destination.** Somebody typing into the composer while
   *  looking at a thread almost always means that thread, and saying so every
   *  time would be filing by another name. But "add X to Flat admin" from
   *  inside Lisbon trip means Flat admin, so this reaches the model as where
   *  they are rather than as where it must go, and the words win.
   *
   *  Distinct from the hard pin a quick add carries, which genuinely cannot go
   *  anywhere else because pressing + in a section is the choice.
   *
   *  **Checked for membership before it is written down.** It arrives from a
   *  client and a thread id from a client is never an access decision. */
  threadId: z.string().uuid().optional(),
});

type MessageState = "queued" | "seen" | "answered" | "failed" | "partial" | "cancelled";

/** One list, used by every response that carries a state, so a value added to
 *  the CHECK constraint cannot reach one endpoint and not another. */
const messageState = z.enum(["queued", "seen", "answered", "failed", "partial", "cancelled"]);

const dumpResponse = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  state: messageState,
  /** The undo unit, returned at send time so the composer never has to ask for
   *  it later. Undo is offered eight seconds after the reply, and a round trip
   *  inside that window is a round trip that can miss it. */
  turnId: z.string(),
  /** 018. On an answer's response: the turn's second question, now open on
   *  the answering message, so it appears without a reload. */
  question: questionOnWire.nullable().optional(),
  /** 018. On an answer's response: the thread the answer changed, so the
   *  tap's own turn wears the Done mark and the pill at once rather than
   *  after a reload. Empty for the way out, which changed nothing. */
  threads: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  /** 019. On a calendar answer's response: the proposal the tap turned into,
   *  when the calendar needed the person's say-so, drawn on their own turn. */
  waiting: z.object({ id: z.string(), because: z.string() }).nullable().optional(),
});

/** The threads a turn actually wrote to.
 *
 *  From the `content` rows it produced, not from parsing the reply. offload
 *  naming a thread it did not write to is the failure 004 exists to prevent,
 *  so the composer's links come from the record of what happened rather than
 *  from the sentence describing it. If the two ever disagree, the links are
 *  right and the sentence is the bug. */
const touchedThreads = z.array(z.object({ id: z.string(), name: z.string() }));

/** A calendar write this turn proposed and nobody has answered yet.
 *
 *  **The reply carries its own control**, which is the house rule: a sentence
 *  cannot be clicked, so offload saying it will add something once you confirm
 *  has to arrive next to the thing that confirms it. Null is the ordinary case;
 *  a write nobody else learns about just happens. */
const waitingOn = z
  .object({ id: z.string(), because: z.string() })
  .nullable()
  .optional();

/** The rows an answer showed, grouped as it read them.
 *
 *  One read was one result and one result is one card, so the grouping travels
 *  rather than being reconstructed on the client by guessing from threadId. */
const foundResults = z.array(
  z.object({
    threadId: z.string(),
    threadName: z.string(),
    truncated: z.boolean(),
    rows: z.array(
      z.object({
        contentId: z.string(),
        threadId: z.string(),
        threadName: z.string(),
        type: z.string(),
        title: z.string(),
        body: z.string().nullable(),
        done: z.boolean(),
      })
    ),
  })
);

/** 017. What a cancel did. `stopped` false means the turn had already finished
 *  and nothing was stopped, and `state` is then the turn's real state rather
 *  than the one the press asked for. */
const cancelResponse = z.object({
  state: z.enum(["queued", "seen", "answered", "failed", "partial", "cancelled"]),
  stopped: z.boolean(),
});

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
  /** 016. Where this turn got something from, for the chips under it. Empty on
   *  every turn that read nothing, which is nearly all of them. */
  sources: z.array(z.object({ domain: z.string(), url: z.string() })),
  /** 017. What offload is doing, on a turn still in flight. Null on anything
   *  settled and on a step old enough to be a dead worker's. */
  step: z.string().nullable(),
  waiting: waitingOn,
  /** 018. The question offload asked back on this turn, while it is open. */
  question: questionOnWire.optional(),
  found: foundResults,
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
      waiting: waitingOn,
      question: questionOnWire.optional(),
      found: foundResults,
      /** Where this turn filed, and where a fact in it came from. Empty on an
       *  offload message and on any turn that read nothing. */
      threads: z.array(z.object({ id: z.string(), name: z.string() })),
      sources: z.array(z.object({ domain: z.string(), url: z.string() })),
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
/** What a turn read from the web, for the chip under it.
 *
 *  Scoped by account like everything else, and read at the turn rather than at
 *  the reply: an ordinary filing turn writes no reply and may still have read
 *  something. Ordered by when it was read, and capped, because six chips under
 *  a one-sentence reply is a footnote section. */
export async function sourcesFor(
  turnId: string,
  accountId: string,
): Promise<{ domain: string; url: string }[]> {
  return db
    .selectFrom("turn_sources")
    .select(["domain", "url"])
    .where("turn_id", "=", turnId)
    .where("account_id", "=", accountId)
    .orderBy("created_at")
    // **Twelve, the same number the worker sends and the schema accepts.** Six
    // here made the chip's count a lie: a turn that read seven places drew
    // three chips and "and 3 more", which says six. The count is the one part
    // of that row making a claim about how many places were read, so the read
    // has to see all of them; the client is what decides how many to draw.
    .limit(12)
    .execute();
}

/** Where each of a page of messages filed, in one query.
 *
 *  The per-message `threadsFor` is right for a single turn and wrong for a page:
 *  fifty messages is fifty round trips on every open, which is the reasoning
 *  `foundFor` already carries. Only what landed, never `changed`: a pill saying
 *  a turn went somewhere it only moved something out of would be untrue. */
export async function threadsForAll(
  messageIds: string[],
  accountId: string,
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  if (messageIds.length === 0) return out;

  // **Both halves of `threadsFor`, not just the content one.** A turn that only
  // wrote a note reaches a thread through `message_threads`, and 014 made those
  // one concept; reading content alone would drop the pill on every note turn.
  const [filed, noted] = await Promise.all([
    db
      .selectFrom("content")
      .innerJoin("threads", "threads.id", "content.thread_id")
      .select([
        "content.derived_from_message_id as message_id",
        "threads.id as id",
        "threads.name as name",
      ])
      .where("content.derived_from_message_id", "in", messageIds)
      .where("content.account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .where("threads.deleted_at", "is", null)
      .orderBy("content.created_at")
      .execute(),
    db
      .selectFrom("message_threads")
      .innerJoin("threads", "threads.id", "message_threads.thread_id")
      // Membership, not authorship, exactly as the single-message version has
      // it: a turn can act on a shared thread and the name is only shown to
      // somebody already in it.
      .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
      .select([
        "message_threads.message_id as message_id",
        "threads.id as id",
        "threads.name as name",
      ])
      .where("message_threads.message_id", "in", messageIds)
      .where("message_threads.landed", "=", true)
      .where("thread_members.account_id", "=", accountId)
      .where("threads.deleted_at", "is", null)
      .orderBy("message_threads.created_at")
      .execute(),
  ]);

  for (const row of [...filed, ...noted]) {
    if (!row.message_id) continue;
    const list = out.get(row.message_id) ?? [];
    if (!list.some((t) => t.id === row.id)) list.push({ id: row.id, name: row.name });
    out.set(row.message_id, list);
  }
  return out;
}

/** What each of a page of turns read, in one query. Same reasoning. */
export async function sourcesForAll(
  turnIds: string[],
  accountId: string,
): Promise<Map<string, { domain: string; url: string }[]>> {
  const out = new Map<string, { domain: string; url: string }[]>();
  if (turnIds.length === 0) return out;

  const rows = await db
    .selectFrom("turn_sources")
    .select(["turn_id", "domain", "url"])
    .where("turn_id", "in", turnIds)
    .where("account_id", "=", accountId)
    .orderBy("created_at")
    .execute();

  for (const row of rows) {
    const list = out.get(row.turn_id) ?? [];
    list.push({ domain: row.domain, url: row.url });
    out.set(row.turn_id, list);
  }
  return out;
}

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
): Promise<{ id: string; text: string | null } | null> {
  const row = await db
    .selectFrom("messages")
    // **The id as well as the text, and that is the whole of a real bug.**
    // A reply is found by turn, because the caller holds the id of the message
    // somebody sent and the reply is a different row. The rows an answer showed
    // are recorded against that reply, so resolving them for the id the caller
    // happens to hold asks about the question and never about the answer, and
    // comes back empty every time.
    //
    // It looked like the model summarising instead of listing: the sentence
    // arrived, the rows did not. Reloading fixed it, because the conversation
    // tail asks for every message in the page and the reply is one of them.
    .select(["id", "text"])
    .where("turn_id", "=", turnId)
    .where("role", "=", "offload")
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return row ?? null;
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
  /** `replyId` is the offload message, which is a different row from the one
   *  the caller is watching. The rows an answer showed are recorded against it,
   *  so anything resolving them needs this rather than the watched id. */
  | {
      do: "answered";
      reply: string | null;
      replyId: string | null;
      threads: TouchedThread[];
      changed: string[];
      sources: { domain: string; url: string }[];
    }
  | {
      do: "partial";
      reply: string | null;
      replyId: string | null;
      threads: TouchedThread[];
      changed: string[];
      sources: { domain: string; url: string }[];
    }
  | { do: "failed" }
  | { do: "close" }
  /** 017. One line of what offload is doing, on a turn still in flight. The
   *  stream stays open: this is not a settlement. */
  | { do: "step"; text: string }
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
    .select(["state", "turn_id", "step", "step_at"])
    .where("id", "=", messageId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!current) return { do: "close" };
  if (current.state === "answered" || current.state === "partial") {
    const [reply, touched, sources] = await Promise.all([
      replyFor(current.turn_id, accountId),
      threadsFor(messageId, accountId),
      sourcesFor(current.turn_id, accountId),
    ]);
    return {
      do: current.state === "answered" ? "answered" : "partial",
      reply: reply?.text ?? null,
      // The reply's own id, so the stream can resolve the rows it showed.
      replyId: reply?.id ?? null,
      threads: touched.landed,
      changed: touched.changed,
      sources,
    };
  }
  if (current.state === "failed") return { do: "failed" };

  // **After the settlements, never before.** A worker can post its last step and
  // its result close enough together that one wake sees both, and a step drawn
  // in preference to the answer it preceded is a progress line that outlives the
  // thing it was describing.
  if (current.step && fresh(current.step_at)) {
    return { do: "step", text: current.step };
  }

  return { do: "wait" };
}

/** Whether a step is recent enough to draw.
 *
 *  A worker that dies mid-turn leaves its last line behind, and the message
 *  stays `seen` until the job's own timeout reaps it. Without this, a client
 *  reconnecting to that turn would be told offload is still looking something
 *  up by a process that no longer exists. Two minutes is longer than any step
 *  and shorter than the reaper. */
const STEP_STALE_MS = 120_000;

function fresh(at: Date | null): boolean {
  return at !== null && Date.now() - at.getTime() < STEP_STALE_MS;
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
  /** The thread on screen, unchecked as it arrived. */
  threadId?: string,
): Promise<{
  messageId: string;
  conversationId: string;
  state: MessageState;
  turnId: string;
}> {
  const turnId = randomUUID();

  // Membership, before the id is written into a job payload. A thread id from a
  // client is a claim, and this one ends up naming a thread in a model prompt.
  //
  // A stale id is dropped rather than refused. The screen can be looking at a
  // thread that was deleted or left a second ago, and the dump is the part that
  // matters: losing the default is losing a convenience, losing the dump is
  // losing what somebody wrote.
  const lookingAt =
    threadId && (await memberOf(accountId, threadId)) ? threadId : null;

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

    // 018. A question closes with its conversation. A new conversation is the
    // old one ending, so anything still open there closes now, and its chips
    // are gone on the next load.
    if (!recent) await closeOpenQuestions(trx, { accountId, exceptConversationId: conversationId });
    // And the one open in this conversation, if any, rides on the job so the
    // worker reads the message as a possible answer before anything else.
    const openQuestionId = await openQuestionIn(trx, conversationId);

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
        looking_at_thread_id: lookingAt,
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
      payload: {
        messageId: message.id,
        conversationId,
        turnId,
        ...(openQuestionId ? { openQuestionId } : {}),
      },
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
      // **Timed in three parts, and the parts go back to the browser.** The
      // request measured 1.5 seconds from a laptop in Lisbon against 45ms of
      // server time, and nothing could say where the rest went. Server-Timing
      // puts the split on the response, Timing-Allow-Origin lets a page on
      // our own origin read it, and the log line keeps it with no content in
      // it. The origin is echoed only after CORS has already accepted it.
      const startedAt = performance.now();
      const marks: [string, number][] = [];
      const mark = (name: string): void => {
        const last = marks.length ? marks[marks.length - 1]![1] : 0;
        marks.push([name, performance.now() - startedAt - last]);
      };
      const timed = (): void => {
        const total = performance.now() - startedAt;
        reply.header(
          "Server-Timing",
          [...marks.map(([n, d]) => `${n};dur=${d.toFixed(1)}`), `total;dur=${total.toFixed(1)}`].join(", "),
        );
        if (request.headers.origin) reply.header("Timing-Allow-Origin", request.headers.origin);
        request.log.info(
          { timing: Object.fromEntries(marks.map(([n, d]) => [n, Math.round(d)])), totalMs: Math.round(total) },
          "dump timing",
        );
      };

      const accountId = await currentAccountId(request);
      mark("session");
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const { text, clientKey, threadId } = request.body;

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
          mark("idempotent");
          timed();
          return reply.code(202).send({
            messageId: existing.id,
            conversationId: existing.conversation_id,
            state: existing.state,
            turnId: existing.turn_id,
          });
        }
      }
      mark("idempotency");

      const result = await takeDump(accountId, text, clientKey, threadId);
      mark("dump");
      timed();

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
        .select(["id", "conversation_id", "state", "text", "turn_id", "step", "step_at"])
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
      // One lookup for both the sentence and the id its rows hang off.
      const replyRow = settled ? await replyFor(message.turn_id, accountId) : null;

      return reply.send({
        id: message.id,
        conversationId: message.conversation_id,
        state: message.state,
        text: message.text,
        reply: replyRow?.text ?? null,
        // Where it actually went, and everything it changed. Both empty until
        // the turn settles, which is the honest answer while it is running.
        threads: settled ? touched.landed : [],
        changed: settled ? touched.changed : [],
        // Read at the turn rather than at the reply: a filing turn writes no
        // reply and may still have read something.
        sources: settled ? await sourcesFor(message.turn_id, accountId) : [],
        // 017. Null on anything settled, so a client polling after the answer
        // is never handed a progress line for work that is over. This is the
        // reconnect path: the stream is the fast one and this is the one that
        // survives a dropped socket.
        step: settled || !fresh(message.step_at) ? null : message.step,
        // The control arrives with the reply that mentions it, rather than on
        // the next reload. A reply saying offload is waiting, with nothing to
        // answer it, is the dead end this whole change is about.
        waiting: settled ? ((await waitingFor([message.id])).get(message.id) ?? null) : null,
        // 018. Same reason, same place: the question arrives with the turn
        // that asked it, and survives a reload because it is read here too.
        question: settled ? ((await questionsFor(accountId, [message.id])).get(message.id) ?? null) : null,
        // The rows an answer showed, resolved now rather than stored. Empty for
        // a dump, which files rather than answers.
        // Against the reply, never against the message being asked about. The
        // question carries no rows; the answer does.
        found: replyRow ? ((await foundFor([replyRow.id], accountId)).get(replyRow.id) ?? []) : [],
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

      // A proposal survives a reload, which is the point of reading it here as
      // well as returning it with the turn. Somebody who backgrounds the app
      // mid-confirmation comes back to the same question rather than to a reply
      // about a thing that never happened.
      const waiting = await waitingFor(rows.map((row) => row.id));
      // 018. The open question, one query for the page, same shape.
      const questions = await questionsFor(accountId, rows.map((row) => row.id));
      // One query for the whole page, the same shape `waitingFor` takes. Per
      // message it is fifty queries on every open.
      const found = await foundFor(
        rows.map((row) => row.id),
        accountId,
      );

      // **The footer, which a reload used to empty.** Every settled turn lost
      // its Done mark, the thread it filed into and anything it read, because
      // the tail carried none of the three: they were resolved only on the
      // stream and on the single-message read. On a phone that is one cold start
      // away, and it is the third time this endpoint has dropped something the
      // rest of the API returns. `waiting` and `found` are the first two, and
      // the comment above them says the same sentence.
      const [landed, sources] = await Promise.all([
        threadsForAll(
          rows.map((row) => row.id),
          accountId,
        ),
        sourcesForAll(
          rows.map((row) => row.turn_id),
          accountId,
        ),
      ]);

      return reply.send({
        conversationId: conversation.id,
        messages: rows.reverse().map((row) => ({
          id: row.id,
          role: row.role,
          text: row.text,
          state: row.state,
          turnId: row.turn_id,
          waiting: waiting.get(row.id) ?? null,
          question: questions.get(row.id) ?? null,
          found: found.get(row.id) ?? [],
          // Where it went and where a fact came from, both from the record of
          // what was written rather than from anything the reply said.
          threads: landed.get(row.id) ?? [],
          sources: sources.get(row.turn_id) ?? [],
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
              sources: step.sources,
              waiting: (await waitingFor([message.id])).get(message.id) ?? null,
              // 018. The question, with the turn that asked it.
              question: (await questionsFor(accountId, [message.id])).get(message.id) ?? null,
              // Arrives with the reply that mentions it, rather than on the
              // next reload. Same reason the confirmation does.
              found: step.replyId
                ? ((await foundFor([step.replyId], accountId)).get(step.replyId) ?? [])
                : [],
            });
            return finish();
          }
          if (step.do === "failed") {
            send("failed", { state: "failed" });
            return finish();
          }
          if (step.do === "close") return finish();

          // 017. The one event that does not end the stream. Sent on every wake
          // that finds a step, which means the same line can be sent twice if
          // something else woke the loop; the client draws a step rather than
          // appending one, so a repeat is a no-op on screen and cheaper than
          // holding per-connection state to deduplicate it.
          if (step.do === "step") {
            send("step", { text: step.text });
            return;
          }

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

  // 017. Stop a turn that is taking too long.
  //
  // **Cancel stops work. It does not reverse it.** Everything filed before the
  // press stays filed, and Undo is the thing that takes it back: a cancel that
  // rolled back would make the control destructive, and the whole reason it
  // exists is that somebody wants their screen returned.
  //
  // **Idempotent, and a no-op once the turn has settled.** A press that races
  // the answer loses, because the work is already done and there is nothing left
  // to stop. The response says what state the turn is actually in, so a client
  // that cancelled and then reconnected is not told "stopped" about a turn that
  // finished.
  app.post(
    "/v1/turns/:turnId/cancel",
    {
      schema: {
        params: z.object({ turnId: z.string().uuid() }),
        response: { 200: cancelResponse, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const outcome = await cancelTurn(accountId, request.params.turnId);
      if (!outcome) return reply.code(404).send({ error: "not_found" as const });
      return reply.send(outcome);
    },
  );

  // 018. Answer a question offload asked back.
  //
  // **A tap runs no model.** The server fills the one field on the one row the
  // question was about, writes the person's words into the log as their own
  // turn, and settles. The escape closes the question and writes the words.
  // Only the country question runs anything afterwards: its answer re-runs
  // the answering turn, read-only, and the envelope says `seen` so the
  // composer waits for it exactly as it waits for a dump.
  app.post(
    "/v1/questions/:id/answer",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ option: z.number().int().min(0).max(4) }),
        response: {
          200: dumpResponse,
          401: unauthenticated,
          404: notFound,
          // 019. A calendar answer's write did not go through. The question
          // is open again and the client draws the failure line with the
          // chips still there.
          502: z.object({ error: z.literal("did_not_go_through") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const outcome = await answerQuestion(accountId, request.params.id, request.body.option);
      if (!outcome) return reply.code(404).send({ error: "not_found" as const });
      if ("calendar" in outcome) {
        const answered = await answerCalendarQuestion(accountId, outcome.calendar);
        if (!answered) return reply.code(404).send({ error: "not_found" as const });
        if (answered.failed) return reply.code(502).send({ error: "did_not_go_through" as const });
        request.log.info({ field: "calendar", how: "tap", applied: answered.applied }, "question answered");
        return reply.send(answered.envelope);
      }
      request.log.info(
        { field: outcome.field, how: "tap", applied: outcome.applied, escape: outcome.escape },
        "question answered",
      );
      return reply.send(outcome.envelope);
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
/** Stop a turn that is taking too long. 017.
 *
 *  Extracted from the route for the reason `undoTurn` is: Better Auth signs the
 *  session cookie, so driving the endpoint from a test would mean replicating
 *  that signing, which is a test that breaks when the library changes rather
 *  than when the product does.
 *
 *  Null when the turn is not this account's, which the route turns into a 404
 *  rather than a 403: a 403 confirms the row exists.
 */
export async function cancelTurn(
  accountId: string,
  turnId: string,
): Promise<{ state: MessageState; stopped: boolean } | null> {
  // The turn resolved to this account server-side (SEC-2). A turn id is a uuid
  // somebody could hold from elsewhere, and this is the only thing standing
  // between that and cancelling a stranger's work.
  const message = await db
    .selectFrom("messages")
    .select(["id", "state"])
    .where("turn_id", "=", turnId)
    .where("account_id", "=", accountId)
    .where("role", "=", "person")
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!message) return null;

  // Already over. Say what it actually is rather than what was asked for, so a
  // client that cancelled and then reconnected is not told "stopped" about a
  // turn that finished.
  if (message.state !== "seen" && message.state !== "queued") {
    return { state: message.state, stopped: false };
  }

  await db.transaction().execute(async (trx) => {
    // The jobs still to do for this message. Matched on state rather than on an
    // id, because an answer turn can have queued a second job and stopping one
    // of two is not stopping.
    const jobs = await trx
      .updateTable("jobs")
      .set({ cancelled_at: new Date() })
      .where("kind", "in", ["dump.plan", "dump.answer"])
      .where("account_id", "=", accountId)
      .where("state", "in", ["queued", "running"])
      .where(sql<string>`payload ->> 'messageId'`, "=", message.id)
      .returning("id")
      .execute();

    // The step goes with it. A progress line surviving a cancel would be the
    // screen still saying offload is working on something nobody is working on.
    await trx
      .updateTable("messages")
      .set({ step: null, step_at: null })
      .where("id", "=", message.id)
      .execute();

    // **One notification per cancelled job, on the worker's own channel.**
    // Separate from `offload_answer` because the direction is opposite and the
    // listener is a different process: the client listens for answers, the
    // worker listens for this.
    for (const job of jobs) {
      await sql`select pg_notify(${"offload_cancel"}, ${job.id})`.execute(trx);
    }
  });

  // **The state is not written here.** The worker posts `cancelled` and the
  // turn settles through the one path every other outcome takes, so a cancel
  // cannot leave a message in a state no `turn-result` produced. If the worker
  // is already gone, the job is marked and the turn settles from that.
  return { state: "cancelled", stopped: true };
}

export async function undoTurn(
  accountId: string,
  turnId: string,
): Promise<{ undone: boolean } | null> {
  // **Calendar rows are undone before the transaction, not inside it.**
  //
  // Every other row in a turn is undone by a local soft delete, which is why
  // this is one transaction. A calendar event is not: it already left, so
  // taking it back is a call to Google, and holding a transaction open across
  // a round trip to somebody else's API is how a slow third party becomes a
  // stalled database.
  //
  // Google first, and the local row only if that succeeded, so offload and the
  // calendar never disagree. A row whose event Google refuses to delete keeps
  // its `source_ref` and its row, and stays in both places, which is the honest
  // outcome: the update below deliberately excludes rows still carrying a
  // `source_ref`, so nothing here can leave a row deleted while the event is
  // still on somebody's calendar.
  await undoCalendarWrites(accountId, turnId);

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
      .where("source_ref", "is", null)
      .execute();

    // Notes the turn wrote, on the same clock and by the same predicate.
    //
    // Without this, undoing a dump takes back what was filed and leaves the
    // standing rule offload derived from it, which then goes on steering every
    // later turn on that thread. Same argument as reversing offload's reply: a
    // turn that half survives its own undo is the pretence this feature exists
    // to retire, recreated by the mechanism meant to protect against it.
    await trx
      .updateTable("notes")
      .set({ deleted_at: stamp, purge_after: purge, updated_at: stamp })
      .where(
        "derived_from_message_id",
        "in",
        live.map((row) => row.id),
      )
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();

    // 018. The asking turn's questions close with what they were about; an
    // answer's turn puts the previous value back and the question stays
    // answered. A turn is only ever one of the two.
    await closeQuestionsOfTurn(trx, accountId, turnId);
    await restoreAnswers(trx, accountId, turnId);

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

/** Take back whatever this turn put on a calendar.
 *
 *  Best effort, and deliberately so: a failure here leaves both the event and
 *  its row exactly where they are, and the rest of the turn still undoes. The
 *  alternative is refusing to undo a dump because Google is down. */
async function undoCalendarWrites(accountId: string, turnId: string): Promise<void> {
  // Rows this turn filed and then put on a calendar, and rows a tapped answer
  // in this turn put on one: both remember their event in `source_ref`.
  const filed = await db
    .selectFrom("content")
    .innerJoin("messages", "messages.id", "content.derived_from_message_id")
    .select(["content.source_ref as sourceRef"])
    .where("messages.turn_id", "=", turnId)
    .where("content.account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .where("content.source_ref", "is not", null)
    .execute();
  const answered = await db
    .selectFrom("questions")
    .innerJoin("content", "content.id", "questions.target_content_id")
    .select(["content.source_ref as sourceRef"])
    .where("questions.answer_turn_id", "=", turnId)
    .where("questions.account_id", "=", accountId)
    .where("questions.field", "=", "calendar")
    .where("content.source_ref", "is not", null)
    .execute();

  for (const row of [...filed, ...answered]) {
    if (!row.sourceRef) continue;
    // `source_ref` is `<calendar external id>:<event id>`, so the calendar it
    // belongs to is the prefix.
    const externalId = row.sourceRef.split(":")[0];
    if (!externalId) continue;

    const calendar = await db
      .selectFrom("connector_calendars as c")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select("c.id as id")
      .where("c.external_id", "=", externalId)
      .where("n.account_id", "=", accountId)
      .where("n.deleted_at", "is", null)
      .executeTakeFirst();
    if (!calendar) continue;

    const target = await targetFor(calendar.id, accountId);
    if (!target) continue;

    await undoWrite(target, row.sourceRef).catch(() => undefined);
  }
}

export const DUMP_LIMITS = { MAX_DUMP_CHARS, CONVERSATION_GAP } as const;

/** 018. Answer a question by option. Null when the question is not this
 *  account's, not open, or the option does not exist, which the client draws
 *  as the chips leaving without a failure line: there is nothing to retry. */
export async function answerQuestion(
  accountId: string,
  questionId: string,
  option: number,
): Promise<{
  envelope: {
    messageId: string;
    conversationId: string;
    state: MessageState;
    turnId: string;
    question: QuestionOnWire | null;
    threads: { id: string; name: string }[];
  };
  field: string;
  applied: boolean;
  escape: boolean;
} | { calendar: { questionId: string; option: number; lookingAt: string | null } } | null> {
  return db.transaction().execute(async (trx) => {
    // Locked for the length of this transaction, which is ours, so two taps
    // from two devices queue here: the second reads the first's answered state
    // and leaves without writing a turn. Without the lock both passed the
    // check, both wrote the person's words, and only one applied.
    const question = await trx
      .selectFrom("questions")
      .select(["id", "conversation_id", "message_id", "field", "state"])
      .where("id", "=", questionId)
      .where("account_id", "=", accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!question || question.state !== "open") return null;

    // Where the dump that led to the question was made from. A country re-run
    // reads it off the answering message, and the thread is the very fact the
    // question turned on, so the answer carries it as the dump did.
    const asked = await trx
      .selectFrom("messages")
      .select("looking_at_thread_id")
      .where("id", "=", question.message_id)
      .executeTakeFirst();

    const picked = await optionLabel(trx, accountId, question.id, option);
    if (!picked) return null;

    const turnId = randomUUID();
    const escape = picked.value === null;
    const country = question.field === "country" && !escape;
    // 019. A calendar answer reaches Google, which cannot happen inside this
    // transaction: it settles here and writes on its own path afterwards.
    if (question.field === "calendar" && !escape) {
      return { calendar: { questionId: question.id, option, lookingAt: asked?.looking_at_thread_id ?? null } };
    }

    // The person's own turn, in words, exactly as typing them would be.
    const message = await trx
      .insertInto("messages")
      .values({
        conversation_id: question.conversation_id,
        account_id: accountId,
        role: "person",
        type: "text",
        turn_id: turnId,
        text: picked.label,
        state: country ? "seen" : "answered",
        looking_at_thread_id: asked?.looking_at_thread_id ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    let applied = false;
    if (escape) {
      await closeQuestion(trx, question.id, accountId, message.id);
    } else {
      const value = optionAsValue(picked.field, picked.value!);
      const outcome = value
        ? await applyAnswer(trx, question.id, accountId, value, {
            answeredMessageId: message.id,
            answerTurnId: turnId,
            option,
          })
        : ({ applied: false, reason: "bad_value" } as const);
      applied = outcome.applied;
      // The row is gone or the field was set by hand since. The words are
      // written, the question is closed, nothing else changes.
      if (!applied) await closeQuestion(trx, question.id, accountId, message.id);
    }

    await trx
      .updateTable("conversations")
      .set({ last_message_at: sql`now()` })
      .where("id", "=", question.conversation_id)
      .execute();

    if (country && applied) {
      await enqueue({
        kind: "dump.answer",
        accountId,
        payload: {
          messageId: message.id,
          conversationId: question.conversation_id,
          turnId,
          questionId: question.id,
          country: picked.value,
        },
        priority: PRIORITY.interactive,
        maxAttempts: 2,
        tx: trx,
      });
    } else if (country) {
      await trx.updateTable("messages").set({ state: "answered" }).where("id", "=", message.id).execute();
    }

    return {
      envelope: {
        messageId: message.id,
        conversationId: question.conversation_id,
        state: country && applied ? ("seen" as const) : ("answered" as const),
        turnId,
        question: await openQuestionOn(trx, accountId, message.id),
        threads: await trx
          .selectFrom("message_threads")
          .innerJoin("threads", "threads.id", "message_threads.thread_id")
          .select(["threads.id as id", "threads.name as name"])
          .where("message_threads.message_id", "=", message.id)
          .where("message_threads.landed", "=", true)
          .execute(),
      },
      field: question.field,
      applied,
      escape,
    };
  });
}

/** 019. Answer a calendar question: settle first, write outside, remember
 *  after.
 *
 *  Settling first is what makes a second tap a 404 rather than a second event.
 *  The write reaches Google and so runs outside any transaction; a failure
 *  reopens the question, takes back the pick the tap made, and the client
 *  draws the failure line with the chips still there. The row remembers the
 *  event it became inside the write path itself. */
export async function answerCalendarQuestion(
  accountId: string,
  input: {
    questionId: string;
    option: number;
    lookingAt: string | null;
    /** 019. A typed answer: the dump is already the person's message, so no
     *  turn is written and the write is recorded against it. */
    typed?: { messageId: string; turnId: string };
  },
): Promise<{
  envelope: {
    messageId: string;
    conversationId: string;
    state: MessageState;
    turnId: string;
    question: QuestionOnWire | null;
    threads: { id: string; name: string }[];
    waiting: { id: string; because: string } | null;
  };
  applied: boolean;
  failed: boolean;
} | null> {
  const turnId = input.typed?.turnId ?? randomUUID();

  const settled = await db.transaction().execute(async (trx) => {
    const question = await trx
      .selectFrom("questions")
      .select(["id", "conversation_id", "message_id", "target_content_id", "previous_value", "state"])
      .where("id", "=", input.questionId)
      .where("account_id", "=", accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!question || question.state !== "open") return null;

    const picked = await optionLabel(trx, accountId, question.id, input.option);
    if (!picked || picked.value === null) return null;
    const calendarId = picked.value;
    const picksOnAnswer = (question.previous_value as { picks?: boolean } | null)?.picks === true;

    // Still theirs, approved, writable, and picked in the row's thread unless
    // the tap is the pick. A calendar un-approved since the question was asked
    // closes it with nothing written.
    const row = question.target_content_id
      ? await trx
          .selectFrom("content")
          .select(["id", "thread_id", "title", "occurs_at", "occurs_end_at", "source_ref"])
          .where("id", "=", question.target_content_id)
          .where("deleted_at", "is", null)
          .forUpdate()
          .executeTakeFirst()
      : undefined;
    // Still in the thread. Somebody who left between the ask and the tap
    // would otherwise pick their calendar into a thread they are no longer
    // in, and nobody left could take it out.
    const stillMember = row ? await memberOf(accountId, row.thread_id, trx) : false;
    const calendar = await trx
      .selectFrom("connector_calendars as c")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select(["c.id as id", "c.access_role as accessRole"])
      .where("c.id", "=", calendarId)
      .where("c.selected", "=", true)
      .where("n.account_id", "=", accountId)
      .where("n.deleted_at", "is", null)
      .where("n.state", "=", "active")
      .executeTakeFirst();
    const stillPicked =
      row && calendar && !picksOnAnswer
        ? await trx
            .selectFrom("thread_calendars")
            .select("calendar_id")
            .where("thread_id", "=", row.thread_id)
            .where("calendar_id", "=", calendarId)
            .where("account_id", "=", accountId)
            .executeTakeFirst()
        : { calendar_id: calendarId };
    const owned = await trx
      .selectFrom("connector_calendars as c")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select("c.access_role")
      .where("c.id", "=", calendarId)
      .where("n.account_id", "=", accountId)
      .executeTakeFirst();

    // The person's own turn, in words. A calendar somebody else owns has a
    // name somebody else wrote, so the message is marked and the tail the
    // prompts read never carries it as the person's words. A typed answer is
    // already a message of theirs, and their own words.
    const message = input.typed
      ? { id: input.typed.messageId }
      : await trx
          .insertInto("messages")
          .values({
            conversation_id: question.conversation_id,
            account_id: accountId,
            role: "person",
            type: "text",
            turn_id: turnId,
            text: picked.label,
            state: "answered",
            looking_at_thread_id: input.lookingAt,
            derived_from_untrusted: owned?.access_role !== "owner",
          })
          .returning("id")
          .executeTakeFirstOrThrow();

    const writable = calendar && (calendar.accessRole === "owner" || calendar.accessRole === "writer");
    if (!row || !stillMember || !calendar || !writable || !stillPicked || row.source_ref || !row.occurs_at) {
      await closeQuestion(trx, question.id, accountId, message.id);
      return { question, message, turnId, row: null as null, calendarId, picksOnAnswer };
    }

    await trx
      .updateTable("questions")
      .set({
        state: "answered",
        settled_at: sql`now()`,
        answered_option: input.option,
        answered_message_id: message.id,
        answer_turn_id: turnId,
        previous_value: JSON.stringify({ picks: picksOnAnswer, calendar: calendarId }),
      })
      .where("id", "=", question.id)
      .execute();
    if (picksOnAnswer) {
      await trx
        .insertInto("thread_calendars")
        .values({ thread_id: row.thread_id, calendar_id: calendarId, account_id: accountId })
        .onConflict((oc) => oc.columns(["thread_id", "calendar_id"]).doNothing())
        .execute();
    }
    await trx
      .updateTable("conversations")
      .set({ last_message_at: sql`now()` })
      .where("id", "=", question.conversation_id)
      .execute();

    return { question, message, turnId, row, calendarId, picksOnAnswer };
  });
  if (!settled) return null;

  const envelopeFor = async (waiting: { id: string; because: string } | null) =>
    db.transaction().execute(async (trx) => ({
      messageId: settled.message.id,
      conversationId: settled.question.conversation_id,
      state: "answered" as const,
      turnId: settled.turnId,
      question: await openQuestionOn(trx, accountId, settled.message.id),
      threads: await trx
        .selectFrom("message_threads")
        .innerJoin("threads", "threads.id", "message_threads.thread_id")
        .select(["threads.id as id", "threads.name as name"])
        .where("message_threads.message_id", "=", settled.message.id)
        .where("message_threads.landed", "=", true)
        .execute(),
      waiting,
    }));

  if (!settled.row) return { envelope: await envelopeFor(null), applied: false, failed: false };
  const row = settled.row;

  const write: WriteAction = {
    action: "create",
    draft: {
      title: row.title,
      startsAt: row.occurs_at as Date,
      endsAt: row.occurs_end_at ?? new Date((row.occurs_at as Date).getTime() + 60 * 60 * 1000),
      location: null,
      attendees: [],
    },
  };

  const reopen = async () => {
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("questions")
        .set({ state: "open", settled_at: null, answered_option: null, answered_message_id: null, answer_turn_id: null })
        .where("id", "=", settled.question.id)
        .execute();
      if (settled.picksOnAnswer) {
        await trx
          .deleteFrom("thread_calendars")
          .where("thread_id", "=", row.thread_id)
          .where("calendar_id", "=", settled.calendarId)
          .where("account_id", "=", accountId)
          .execute();
      }
      // The person's words came with the tap; a write that did not go
      // through takes them back too, so the chips stay on the asking turn.
      // Soft, as every message goes: the row was theirs. A typed answer is
      // the dump itself and stays.
      if (!input.typed) {
        await trx
          .updateTable("messages")
          .set({ deleted_at: sql`now()` })
          .where("id", "=", settled.message.id)
          .execute();
      }
    });
  };

  let outcome: Awaited<ReturnType<typeof writeThroughTool>>;
  try {
    outcome = await writeThroughTool(accountId, settled.calendarId, write, settled.message.id, row.id);
  } catch (error) {
    // The type only (OFF-1): enough to tell a sealed-token fault from Google
    // being down, and never the event's title.
    console.warn(
      JSON.stringify({
        at: "calendar.answer",
        outcome: "failed",
        error_type: error instanceof Error ? error.name : typeof error,
      })
    );
    await reopen();
    return { envelope: await envelopeFor(null), applied: false, failed: true };
  }
  if (outcome.kind === "refused") {
    console.warn(JSON.stringify({ at: "calendar.answer", outcome: "refused", reason: outcome.reason }));
    await reopen();
    return { envelope: await envelopeFor(null), applied: false, failed: true };
  }

  if (outcome.kind === "written") {
    await db.transaction().execute(async (trx) => {
      await landedIn(trx, settled.message.id, row.thread_id);
    });
    return { envelope: await envelopeFor(null), applied: true, failed: false };
  }

  return {
    envelope: await envelopeFor({ id: outcome.pendingId, because: outcome.line }),
    applied: true,
    failed: false,
  };
}

/** An option's stored value in the field's wire form. */
function optionAsValue(field: string, value: string): Record<string, string> | null {
  switch (field) {
    case "date":
      return { day: value };
    case "span": {
      const [from, to] = value.split("/");
      return from ? { from, to: to ?? from } : null;
    }
    case "time": {
      const [day, time] = value.split("T");
      return day && time ? { day, time } : null;
    }
    case "tag":
      return { tag: value };
    case "country":
      return { country: value };
    default:
      return null;
  }
}
