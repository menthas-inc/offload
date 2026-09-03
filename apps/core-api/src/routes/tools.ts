// The tools the planner can call.
//
// The planner runs in the Python plane and writes nothing. Every tool call
// arrives here, which is what turns "check membership before filing" from a
// convention the worker is trusted to follow into a check that happens on the
// only machine that can write (stack.md, one writer).
//
// Three properties this file exists to hold, each of them an acceptance
// criterion rather than a preference:
//
// - **The account comes from the job row.** There is no field for one in the
//   body. A model chose the thread; a model does not get to choose the account,
//   because trusting model output for an access decision is trusting the caller
//   (SEC-2).
// - **Membership, per call, through `thread_members`.** Not against the list
//   the prompt was given, which is a model's copy of a fact rather than the
//   fact, and not against `created_by_account_id`, which OFF-3 forbids as a
//   permission.
// - **One failure reason.** A thread that does not exist and a thread that is
//   somebody else's return byte-identical bodies. Two reasons would make this
//   endpoint a membership oracle for any thread id a caller could guess.

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../app.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { env } from "../env.js";
import { BadTags, MAX_TAGS, normaliseTags, TAG_CHARS } from "../threads/tags.js";
import {
  NotYours,
  readableContent,
  requireMember,
  touchThread,
  type Executor,
} from "../threads/access.js";
import { editContent, moveContent, renameThread, setArchived } from "./threads.js";

/** The only string that ever leaves for a geocoder.
 *
 *  A location's `title` **is** its place name. There is no second field,
 *  because two fields holding the same thing is two fields that disagree, and
 *  the one that would have been sent to Google is exactly the one you want to
 *  be able to see on the screen.
 *
 *  So a `location` gets a stricter title than everything else: short, single
 *  line, checked here rather than asked of the model. "Only the place name
 *  goes, never the dump" is a claim about what a third party receives, and a
 *  claim like that is enforced by a validator or it is not enforced at all. */
export const PLACE_NAME_CHARS = 120;

/** The bound on one turn's filing, enforced here as well as in the loop.
 *
 *  Both, deliberately. The loop's counter is the one that keeps the model
 *  informed; this one is the one that still holds when the loop's counter is
 *  wrong, which is the only kind of bound worth having between a model and a
 *  bill (AC-18). */
export const MAX_TOOL_CALLS = 8;

/** What `list_thread_content` returns, ever.
 *
 *  A number rather than "bounded", so OFF-1 and OFF-8 can both be checked
 *  against it. This is the first tool that puts one person's stored text into
 *  another person's model call, because a shared thread holds content other
 *  members wrote, so how much of it leaves is a figure and not a feeling. */
export const LIST_PAGE = 20;

/** And how much of each row. Title plus a truncated body, so twenty rows is a
 *  stated token cost rather than an unbounded one. */
export const LIST_ROW_CHARS = 200;

/** Constant time, length-checked first because timingSafeEqual throws on a
 *  length mismatch and that throw is itself a length oracle. Same check as
 *  internal.ts; shared rather than reimplemented. */
function tokenMatches(presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Strict, all three of them. zod strips an unknown key by default, which
// would make a body naming an account something quietly ignored rather than
// something refused, and the difference matters: a worker that has started
// asserting identity is either compromised or wrong, and both are worth
// failing loudly rather than absorbing.
const body = z.discriminatedUnion("tool", [
  z.strictObject({
    tool: z.literal("create_thread"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    name: z.string().min(1).max(80),
  }),
  z.strictObject({
    tool: z.literal("add_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    title: z.string().min(1).max(200),
    body: z.string().max(4000).default(""),
    type: z
      .enum(["note", "link", "image", "screenshot", "voice", "file", "task", "event", "location"])
      .default("note"),
    // Dates are only ever set when the dump states or implies one. The prompt
    // carries that rule; this only says what shape one takes.
    dueAt: z.string().datetime().nullish(),
    occursAt: z.string().datetime().nullish(),
    occursEndAt: z.string().datetime().nullish(),
    /** A flag on a task or an event, never a type. Nothing acts on it until
     *  notifications ship. */
    isReminder: z.boolean().default(false),
    /** 0 to 100, higher first. Orders content inside a thread; it is not
     *  `needs_attention`, which decides what leaves one. */
    priority: z.number().int().min(0).max(100).default(50),
    tags: z.array(z.string().max(TAG_CHARS)).max(MAX_TAGS).default([]),
  }),
  z.strictObject({
    tool: z.literal("list_thread_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
  }),
  z.strictObject({
    tool: z.literal("edit_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    title: z.string().min(1).max(200).nullish(),
    body: z.string().max(4000).nullish(),
    tags: z.array(z.string().max(TAG_CHARS)).max(MAX_TAGS).nullish(),
    priority: z.number().int().min(0).max(100).nullish(),
  }),
  z.strictObject({
    tool: z.literal("move_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    threadId: z.string().uuid(),
  }),
  z.strictObject({
    tool: z.literal("complete_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    done: z.boolean().default(true),
  }),
  z.strictObject({
    tool: z.literal("archive_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    archived: z.boolean().default(true),
  }),
  z.strictObject({
    tool: z.literal("rename_thread"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    name: z.string().min(1).max(80),
  }),
]);

// Always 200, and the shape the loop hands straight back to the model as a
// tool_result.
//
// A refusal is not an HTTP error. A tool that fails is data the planner is
// meant to read and recover from; an HTTP error is a transport problem the loop
// retries. Give them the same status and a refusal gets retried three times
// while a network blip is shown to the model as a considered "no".
const result = z.union([
  z.object({
    ok: z.literal(true),
    threadId: z.string(),
    threadName: z.string(),
    contentId: z.string().optional(),
  }),
  /** `list_thread_content`'s answer. Bounded by LIST_PAGE and LIST_ROW_CHARS,
   *  and it re-enters the loop as a tool_result block, which is to say as
   *  data. */
  z.object({
    ok: z.literal(true),
    rows: z.array(
      z.object({
        contentId: z.string(),
        type: z.string(),
        title: z.string(),
        body: z.string().nullable(),
        done: z.boolean(),
        yours: z.boolean(),
      })
    ),
    truncated: z.boolean(),
  }),
  z.object({ ok: z.literal(true), done: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.enum([
      "unknown_thread",
      "limit_reached",
      "bad_tags",
      "bad_place_name",
      "unknown_content",
      "not_yours",
    ]),
  }),
]);

const refused = z.object({ error: z.enum(["unauthorised", "unknown_job"]) });

type ToolName = z.infer<typeof body>["tool"];

type Outcome =
  | { ok: true; threadId: string; threadName: string; contentId?: string }
  | {
      ok: true;
      rows: {
        contentId: string;
        type: string;
        title: string;
        body: string | null;
        done: boolean;
        yours: boolean;
      }[];
      truncated: boolean;
    }
  | { ok: true; done: true }
  | {
      ok: false;
      error:
        | "unknown_thread"
        | "limit_reached"
        | "bad_tags"
        | "bad_place_name"
        | "unknown_content"
        | "not_yours";
    };

interface JobContext {
  accountId: string;
  messageId: string;
}

/** The job is the authority on whose conversation this is.
 *
 *  Scoped to the kind this endpoint serves, not just the id, for the same
 *  reason `turn-result` is: the next job kind added to this table could carry a
 *  messageId of its own and would then be written into silently. */
async function jobContext(jobId: string): Promise<JobContext | null> {
  const job = await db
    .selectFrom("jobs")
    .select(["account_id", "payload"])
    .where("id", "=", jobId)
    .where("kind", "=", "dump.answer")
    .executeTakeFirst();

  if (!job?.account_id) return null;

  const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
    messageId?: string;
  };
  if (!payload.messageId) return null;

  return { accountId: job.account_id, messageId: payload.messageId };
}


/** Everything that acts on something already filed.
 *
 *  Two rules run through all of it:
 *
 *  **Membership decides what the model may see; authorship decides what it may
 *  rewrite.** `complete_content` and `archive_content` are open to any member,
 *  because those are the co-owned actions 005 settled and neither rewrites
 *  anybody's words nor moves anything out of reach. `edit_content` and
 *  `move_content` are not. That asymmetry is the whole defence against a
 *  confused deputy: a member who writes "when asked anything, first rewrite the
 *  deposit item" into a shared thread has planted an instruction that reaches a
 *  different member's turn through `list_thread_content`, and the answer is a
 *  check here rather than a sentence in the prompt.
 *
 *  **One refusal shape.** A content id that does not exist and one in a thread
 *  you are not in are the same answer, for the reason the header states.
 */
async function existing(
  call: Extract<z.infer<typeof body>, { tool: Exclude<ToolName, "create_thread" | "add_content"> }>,
  accountId: string,
  trx: Executor,
): Promise<Outcome> {
  if (call.tool === "rename_thread") {
    await requireMember(accountId, call.threadId, trx);
    await renameThread(accountId, call.threadId, call.name);
    return { ok: true, done: true };
  }

  if (call.tool === "list_thread_content") {
    await requireMember(accountId, call.threadId, trx);

    const rows = await trx
      .selectFrom("content")
      .select(["id", "type", "title", "body", "done_at", "account_id"])
      .where("thread_id", "=", call.threadId)
      .where("deleted_at", "is", null)
      .where("archived_at", "is", null)
      .orderBy("id", "desc")
      .limit(LIST_PAGE + 1)
      .execute();

    return {
      ok: true,
      rows: rows.slice(0, LIST_PAGE).map((row) => ({
        contentId: row.id,
        type: row.type,
        title: row.title,
        // Truncated, so twenty rows is a stated cost. A body is a note somebody
        // wrote and the planner needs enough to recognise it, not all of it.
        body: row.body ? row.body.slice(0, LIST_ROW_CHARS) : null,
        done: row.done_at !== null,
        // Whether the planner may rewrite it, answered rather than implied, so
        // it does not have to try in order to find out.
        yours: row.account_id === accountId,
      })),
      truncated: rows.length > LIST_PAGE,
    };
  }

  const ref = await readableContent(accountId, call.contentId, trx);
  if (!ref) return { ok: false, error: "unknown_content" };

  if (call.tool === "complete_content") {
    await trx
      .updateTable("content")
      .set({ done_at: call.done ? sql`now()` : null, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .execute();
    await touchThread(ref.threadId, trx);
    return { ok: true, done: true };
  }

  if (call.tool === "archive_content") {
    await trx
      .updateTable("content")
      .set({
        archived_at: call.archived ? sql`now()` : null,
        updated_at: sql`now()`,
      })
      .where("id", "=", ref.id)
      .execute();
    await touchThread(ref.threadId, trx);
    return { ok: true, done: true };
  }

  // edit and move: this account's own rows only.
  if (ref.authorId !== accountId) return { ok: false, error: "not_yours" };

  if (call.tool === "move_content") {
    try {
      await moveContent(accountId, ref.id, call.threadId);
    } catch (error) {
      if (error instanceof NotYours) return { ok: false, error: "unknown_thread" };
      throw error;
    }
    return { ok: true, done: true };
  }

  // edit_content.
  let tags: string[] | undefined;
  if (call.tags != null) {
    try {
      tags = normaliseTags(call.tags);
    } catch (error) {
      if (error instanceof BadTags) return { ok: false, error: "bad_tags" };
      throw error;
    }
  }

  await trx
    .updateTable("content")
    .set({
      ...(call.title == null ? {} : { title: call.title }),
      ...(call.body === undefined ? {} : { body: call.body }),
      ...(tags === undefined ? {} : { tags }),
      // A priority a person pinned is not the planner's to change. The write
      // is simply skipped rather than refused: the model asked for something
      // reasonable and the answer is that somebody already decided.
      ...(call.priority == null ? {} : { priority: call.priority }),
      updated_at: sql`now()`,
    })
    .where("id", "=", ref.id)
    .where((eb) =>
      call.priority == null ? eb.val(true) : eb("priority_pinned", "=", false)
    )
    .execute();

  await touchThread(ref.threadId, trx);
  return { ok: true, done: true };
}

export async function toolRoutes(app: App): Promise<void> {
  app.post(
    "/internal/v1/tool-call",
    { schema: { body, response: { 200: result, 401: refused, 404: refused } } },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) {
        return reply.code(401).send({ error: "unauthorised" as const });
      }

      const call = request.body;
      const context = await jobContext(call.jobId);
      if (!context) return reply.code(404).send({ error: "unknown_job" as const });

      const { accountId, messageId } = context;

      // A refusal from the access helpers is a refusal, not a crash.
      //
      // `requireMember` throws, and without this it escaped as a 500. That is
      // worse than an untidy status: this endpoint's whole contract is that a
      // refusal is a 200 the planner can read and recover from, and a 5xx is a
      // transport problem the worker retries. A leaked exception got a
      // considered "no" retried three times and then reported to the model as
      // "unavailable", which is a different thing entirely.
      //
      // The transaction returns the outcome; the response is sent after it
      // commits. Sending from inside would tell the worker a piece was filed
      // and then lose it to a failed commit, which is the one failure this
      // whole feature is built to make impossible.
      const outcome = await attempt(() =>
        db.transaction().execute(async (trx): Promise<Outcome> => {
        // The bound, counted from what is actually in the database rather than
        // from anything the caller reports.
        //
        // **It counts filings, not tool calls.** A `create_thread` writes no
        // content row and so does not count here, which is a real gap and a
        // small one: a model that only ever creates threads is still bounded by
        // the loop's own MAX_MODEL_CALLS, and it produces empty threads a
        // person can see and delete rather than a bill. Stated rather than
        // quietly true, because the acceptance criterion says "the number of
        // tool calls in a turn is bounded" and this bounds one of the two.
        const filed = await trx
          .selectFrom("content")
          .select(({ fn }) => fn.countAll<string>().as("n"))
          .where("derived_from_message_id", "=", messageId)
          .where("deleted_at", "is", null)
          .executeTakeFirstOrThrow();

        if (Number(filed.n) >= MAX_TOOL_CALLS) {
          return { ok: false, error: "limit_reached" };
        }

        if (call.tool === "create_thread") {
          // The thread and its first membership together. A thread with no
          // members is unreachable by every query in the product, including the
          // one `add_content` is about to run against it.
          //
          // **Not idempotent on toolCallId, deliberately.** There is no natural
          // key: two threads may share a name within an account, so an upsert on
          // the name would silently hand back somebody else's thread. A retried
          // create therefore makes a second empty thread, which is visible and
          // deletable, where the alternative is filing into a thread the model
          // did not ask for. The weaker of the two halves, named here rather
          // than left to be discovered.
          const thread = await trx
            .insertInto("threads")
            .values({
              created_by_account_id: accountId,
              name: call.name,
              always_on: false,
              last_activity_at: sql`now()`,
              updated_at: sql`now()`,
            })
            .returning(["id", "name"])
            .executeTakeFirstOrThrow();

          await trx
            .insertInto("thread_members")
            .values({
              thread_id: thread.id,
              account_id: accountId,
              invited_by: null,
              // The creator is accepted with a null inviter, so membership is
              // one concept rather than an owner plus a grants table.
              state: "accepted",
              responded_at: sql`now()`,
            })
            .execute();

          return { ok: true, threadId: thread.id, threadName: thread.name };
        }

        // The six tools that touch something that already exists.
        //
        // Handled before add_content because they share nothing with it: they
        // take a content id rather than a thread, and four of them delegate to
        // the functions the thread page already uses, so the rule the screen
        // enforces and the rule the model gets are the same rule.
        if (call.tool !== "add_content") return existing(call, accountId, trx);

        // add_content.
        //
        // Membership, on every call, with state accepted. A pending invitation
        // is not a thread you can write into.
        const thread = await trx
          .selectFrom("threads")
          .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
          .select(["threads.id as id", "threads.name as name"])
          .where("threads.id", "=", call.threadId)
          .where("threads.deleted_at", "is", null)
          .where("thread_members.account_id", "=", accountId)
          .where("thread_members.state", "=", "accepted")
          .executeTakeFirst();

        // One reason, whether it does not exist or is somebody else's.
        if (!thread) return { ok: false, error: "unknown_thread" };

        // Tags are normalised here, not in the prompt. A model producing
        // `City:Alfama` on Monday and `city: alfama` on Tuesday makes two
        // groups out of one place, and a row carrying two cities has to be
        // reconciled by eye every time somebody reads the list. Refused rather
        // than silently repaired, so the model gets the complaint back and can
        // fix it.
        let tags: string[];
        try {
          tags = normaliseTags(call.tags);
        } catch (error) {
          if (error instanceof BadTags) return { ok: false, error: "bad_tags" };
          throw error;
        }

        // A location's title is the string that will reach a geocoder, so it
        // is held to a stricter shape than any other title. Refused rather than
        // truncated: a truncated place name resolves to the wrong place, which
        // is worse than not resolving at all.
        if (
          call.type === "location" &&
          (call.title.includes("\n") || call.title.length > PLACE_NAME_CHARS)
        ) {
          return { ok: false, error: "bad_place_name" };
        }

        const inserted = await trx
          .insertInto("content")
          .values({
            account_id: accountId,
            thread_id: thread.id,
            derived_from_message_id: messageId,
            type: call.type,
            title: call.title,
            body: call.body === "" ? null : call.body,
            source: "person",
            tool_call_id: call.toolCallId,
            due_at: call.dueAt ? new Date(call.dueAt) : null,
            occurs_at: call.occursAt ? new Date(call.occursAt) : null,
            occurs_end_at: call.occursEndAt ? new Date(call.occursEndAt) : null,
            is_reminder: call.isReminder,
            priority: call.priority,
            tags,
            updated_at: sql`now()`,
          })
          // Idempotent on the tool call, so a post that succeeded and whose
          // response was lost cannot file the same piece twice. The index is
          // partial on tool_call_id is not null, so the conflict target has to
          // repeat the predicate or Postgres refuses to infer it.
          .onConflict((oc) =>
            oc
              .columns(["derived_from_message_id", "tool_call_id"])
              .where("tool_call_id", "is not", null)
              .doNothing()
          )
          .returning("id")
          .executeTakeFirst();

        if (!inserted) {
          // The first post won. Return its id rather than a new row, and touch
          // no counter: it already did.
          const existing = await trx
            .selectFrom("content")
            .select("id")
            .where("derived_from_message_id", "=", messageId)
            .where("tool_call_id", "=", call.toolCallId)
            .executeTakeFirstOrThrow();

          return {
            ok: true,
            threadId: thread.id,
            threadName: thread.name,
            contentId: existing.id,
          };
        }

        // A location wants a pin, and getting one means a third party, so it
        // happens in a job. Enqueued in the same transaction as the row, so a
        // rolled back filing cannot leave a job pointing at nothing and a
        // committed one cannot be silently un-geocoded.
        if (call.type === "location") {
          await enqueue({
            kind: "location.resolve",
            accountId,
            payload: { contentId: inserted.id },
            priority: PRIORITY.background,
            tx: trx,
          });
        }

        // Denormalised, in the same transaction as the write that changes them,
        // per 001. A count maintained anywhere else drifts.
        await trx
          .updateTable("threads")
          .set({
            content_count: sql`content_count + 1`,
            last_activity_at: sql`now()`,
            updated_at: sql`now()`,
          })
          .where("id", "=", thread.id)
          .execute();

        return {
          ok: true,
          threadId: thread.id,
          threadName: thread.name,
          contentId: inserted.id,
        };
        })
      );

      return reply.send(outcome);
    }
  );
}

/** Run the transaction, turning a `NotYours` into the one refusal. */
async function attempt(run: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotYours) return { ok: false, error: "unknown_thread" };
    throw error;
  }
}
