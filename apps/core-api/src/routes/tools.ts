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
import { env } from "../env.js";

/** The bound on one turn's filing, enforced here as well as in the loop.
 *
 *  Both, deliberately. The loop's counter is the one that keeps the model
 *  informed; this one is the one that still holds when the loop's counter is
 *  wrong, which is the only kind of bound worth having between a model and a
 *  bill (AC-18). */
export const MAX_TOOL_CALLS = 8;

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
  z.object({
    ok: z.literal(false),
    error: z.enum(["unknown_thread", "limit_reached"]),
  }),
]);

const refused = z.object({ error: z.enum(["unauthorised", "unknown_job"]) });

type Outcome =
  | { ok: true; threadId: string; threadName: string; contentId?: string }
  | { ok: false; error: "unknown_thread" | "limit_reached" };

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

      // The transaction returns the outcome; the response is sent after it
      // commits. Sending from inside would tell the worker a piece was filed
      // and then lose it to a failed commit, which is the one failure this
      // whole feature is built to make impossible.
      const outcome = await db.transaction().execute(async (trx): Promise<Outcome> => {
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

        const inserted = await trx
          .insertInto("content")
          .values({
            account_id: accountId,
            thread_id: thread.id,
            derived_from_message_id: messageId,
            type: "note",
            title: call.title,
            body: call.body === "" ? null : call.body,
            source: "person",
            tool_call_id: call.toolCallId,
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
      });

      return reply.send(outcome);
    }
  );
}
