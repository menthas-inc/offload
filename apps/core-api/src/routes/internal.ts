// What the worker is allowed to write.
//
// The Python plane reads the database directly and writes nothing: every result
// comes back through here, which is what `stack.md` means by one writer. This
// is the first feature that exercises it, so the properties worth stating are
// stated rather than assumed.
//
// **The worker is not trusted for an access decision.** It posts a job id and a
// reply, and the account and conversation are read from the job row this
// service minted. A body naming an account is refused, not ignored: a worker
// that has started asserting identity is either compromised or wrong, and both
// are worth failing loudly. That is SEC-2 applied to a service rather than to a
// browser, and it is the same lesson as trusting a model's output for a
// destination.

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../app.js";
import { db } from "../db.js";
import { emit } from "../analytics.js";
import { env } from "../env.js";
import { NOTE_TEXT_CHARS, applyCompaction } from "../threads/notes.js";
import { parseWhen, plausible } from "../threads/dates.js";

/** Constant time, and length-checked first because timingSafeEqual throws on a
 *  length mismatch and that throw is itself a length oracle. */
function tokenMatches(presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const usageEntry = z.object({
  model: z.string().max(64),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadTokens: z.number().int().min(0).default(0),
  costMicros: z.number().int().min(0).default(0),
  latencyMs: z.number().int().min(0),
});

/** A turn is several model calls now, and each one writes its own ledger row
 *  (AC-20). The single-object form is still accepted and mapped to a
 *  one-element array, so a worker and an API deployed a minute apart do not
 *  silently lose a row: for the length of one release the old shape is a
 *  supported shape rather than a bug. */
const usage = z.union([usageEntry, z.array(usageEntry)]).transform((u) => (Array.isArray(u) ? u : [u]));

// A discriminated union rather than an optional reply, so "answered with
// nothing" cannot be expressed. The worker either has an answer or has a
// reason it does not.
//
// `partial` is a third arm rather than a flag on `answered` because the three
// want different things from the client: nothing more, a resume, or the text
// back in the composer.
// Strict, for the reason the header states. Without it "a body naming an
// account is refused, not ignored" was a claim about a schema that silently
// dropped the field instead.
const body = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("answered"),
    jobId: z.string().uuid(),
    replyText: z.string().min(1),
    /** 013. Content ids an answer showed, in the order it read them.
     *
     *  Ids only. The reply resolves them when it is read, so a row ticked or
     *  deleted afterwards is never stale inside an old answer, which is the
     *  rule 005 already set for thread links: they come from the ids and never
     *  from parsing the sentence. */
    found: z
      .array(
        z.object({
          threadId: z.string().uuid().nullable(),
          /** The read hit its page, so the tail is the thread rather than a
           *  Show more that would expand into rows nobody fetched. */
          truncated: z.boolean(),
          contentIds: z.array(z.string().uuid()).max(20),
        })
      )
      .max(3)
      .optional(),
    usage,
  }),
  z.strictObject({
    outcome: z.literal("partial"),
    jobId: z.string().uuid(),
    /** Describes what actually landed, and only that (AC-15). */
    replyText: z.string().min(1),
    usage,
  }),
  z.strictObject({
    outcome: z.literal("failed"),
    jobId: z.string().uuid(),
    /** An enum, never the exception. An error message can carry the dumped
     *  text, and this value reaches an analytics event (OFF-1). */
    reason: z.enum(["model_error", "invalid_output", "timeout"]),
    usage: usage.optional(),
  }),
]);

const ok = z.object({ status: z.enum(["written", "already"]) });

/** What a quick-add job reports. No reply, because nobody asked a question:
 *  somebody typed into a list and offload read it. There is nothing to say back
 *  and nowhere to say it. */
const quickAddBody = z.strictObject({
  jobId: z.string().uuid(),
  outcome: z.enum(["done", "failed"]),
  usage: usage.optional(),
});
const refused = z.object({ error: z.enum(["unauthorised", "unknown_job"]) });

/** What the daily fold proposes, and what came back from applying it.
 *
 *  Bounded on every axis, because this is a model's output crossing a boundary
 *  (OFF-5) and an unbounded list of ids is an unbounded number of writes. */
const compactionBody = z.strictObject({
  jobId: z.string().uuid(),
  supersede: z.array(z.string().uuid()).max(200).default([]),
  remove: z.array(z.string().uuid()).max(200).default([]),
  add: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(NOTE_TEXT_CHARS),
        occursAt: z.string().max(40).nullish(),
        occursEndAt: z.string().max(40).nullish(),
        dueAt: z.string().max(40).nullish(),
        /** What this one replaces. It is how the new note inherits an author,
         *  so an entry naming nothing is dropped rather than written. */
        foldedFrom: z.array(z.string().uuid()).min(1).max(50),
      })
    )
    .max(100)
    .default([]),
  usage: usage.optional(),
});

/** A date from the fold, or null. Shared with `add_note`'s parser rather than
 *  a second reading of what a model writes. */
function when(raw: string | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  const at = parseWhen(raw);
  return at && plausible(at) ? at : null;
}

const compacted = z.object({
  superseded: z.number(),
  removed: z.number(),
  added: z.number(),
  ignored: z.number(),
});

export async function internalRoutes(app: App): Promise<void> {
  // A row typed straight into a thread has been read.
  //
  // Separate from `turn-result` because the two differ in the thing that
  // matters: a turn ends by writing offload's reply into the conversation, and
  // this one must write nothing there at all. Somebody adding a task to a list
  // is not talking to offload, and a chat log carrying every typed row would
  // stop being a record of anything.
  //
  // **All it does is stop the spinner**, which is why it takes no reply and
  // reports the same status whether the model succeeded or failed. Everything
  // the model wrote it wrote through the tool endpoint, in its own transaction,
  // already committed. A failure here means the row keeps the words somebody
  // typed, in the thread they typed them into, which was always the floor.
  app.post(
    "/internal/v1/quick-add-result",
    { schema: { body: quickAddBody, response: { 200: ok, 401: refused, 404: refused } } },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) {
        return reply.code(401).send({ error: "unauthorised" as const });
      }

      const result = request.body;
      const job = await db
        .selectFrom("jobs")
        .select(["id", "account_id", "payload"])
        .where("id", "=", result.jobId)
        .where("kind", "=", "thread.quick_add")
        .executeTakeFirst();

      if (!job?.account_id) return reply.code(404).send({ error: "unknown_job" as const });

      const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
        contentId?: string;
        threadId?: string;
      };
      if (!payload.contentId) return reply.code(404).send({ error: "unknown_job" as const });

      const accountId = job.account_id;

      await db.transaction().execute(async (trx) => {
        // Every row this job left filing, not only the one it started with: the
        // model may have split what was typed into several, and each of those
        // was written filing so it did not appear finished before it was.
        await trx
          .updateTable("content")
          .set({ filing_at: null })
          .where("thread_id", "=", payload.threadId ?? "")
          .where("filing_at", "is not", null)
          .execute();

        if (result.usage && result.usage.length > 0) {
          await trx
            .insertInto("llm_usage")
            .values(
              result.usage.map((entry) => ({
                account_id: accountId,
                job_kind: "thread.quick_add",
                category: "interactive" as const,
                model: entry.model,
                input_tokens: entry.inputTokens,
                output_tokens: entry.outputTokens,
                cache_read_tokens: entry.cacheReadTokens,
                cost_micros: entry.costMicros,
                latency_ms: entry.latencyMs,
              }))
            )
            .execute();
        }

        // Closed here rather than by the worker, for the reason turn-result
        // states: a job left running counts against the account's concurrency
        // cap forever.
        await trx
          .updateTable("jobs")
          .set({ state: "done", locked_at: null, locked_by: null, updated_at: sql`now()` })
          .where("id", "=", result.jobId)
          .execute();
      });

      return reply.send({ status: "written" as const });
    }
  );

  // The daily fold, applied.
  //
  // The worker reads a thread's notes directly, asks a model what the set says
  // now, and posts the answer here. **Every rule is enforced on this side**:
  // the prompt states them too, and stating them twice is the point, because a
  // prompt is a request and this is the enforcement.
  //
  // The thread comes from the job row, never from the body, which is the same
  // rule the endpoints above follow for the account.
  app.post(
    "/internal/v1/notes-compacted",
    { schema: { body: compactionBody, response: { 200: compacted, 401: refused, 404: refused } } },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) {
        return reply.code(401).send({ error: "unauthorised" as const });
      }

      const result = request.body;
      const job = await db
        .selectFrom("jobs")
        .select(["id", "account_id", "payload"])
        .where("id", "=", result.jobId)
        .where("kind", "=", "notes.compact")
        .executeTakeFirst();

      if (!job?.account_id) return reply.code(404).send({ error: "unknown_job" as const });

      const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
        threadId?: string;
      };
      if (!payload.threadId) return reply.code(404).send({ error: "unknown_job" as const });

      const accountId = job.account_id;
      const threadId = payload.threadId;

      const outcome = await db.transaction().execute(async (trx) => {
        const applied = await applyCompaction(
          threadId,
          {
            supersede: result.supersede,
            remove: result.remove,
            add: result.add.map((entry) => ({
              text: entry.text,
              // The same guard `add_note` puts on the same three columns. A
              // model writes `2026-09-28` as often as an ISO string, and a date
              // a century out sorts to the bottom forever where nobody sees it
              // to fix it. **The date is dropped, never the entry**: a fold
              // whose replacement is right and whose date is wrong should lose
              // the date, not put the thread back where it was.
              occursAt: when(entry.occursAt),
              occursEndAt: when(entry.occursEndAt),
              dueAt: when(entry.dueAt),
              foldedFrom: entry.foldedFrom,
            })),
          },
          trx,
        );

        if (result.usage && result.usage.length > 0) {
          await trx
            .insertInto("llm_usage")
            .values(
              result.usage.map((entry) => ({
                account_id: accountId,
                job_kind: "notes.compact",
                // Scheduled, not interactive: nobody is waiting on the fold.
                category: "scheduled" as const,
                model: entry.model,
                input_tokens: entry.inputTokens,
                output_tokens: entry.outputTokens,
                cache_read_tokens: entry.cacheReadTokens,
                cost_micros: entry.costMicros,
                latency_ms: entry.latencyMs,
              }))
            )
            .execute();
        }

        // Closed here rather than by the worker, for the reason turn-result
        // states: a job left running counts against the account's concurrency
        // cap forever.
        await trx
          .updateTable("jobs")
          .set({ state: "done", locked_at: null, locked_by: null, updated_at: sql`now()` })
          .where("id", "=", result.jobId)
          .execute();

        return applied;
      });

      // Counts, never text. This is the first job in the product that holds a
      // hundred sentences of dumped text at once, and the shortest route from
      // here to an OFF-1 breach is a helpful log line.
      return reply.send(outcome);
    }
  );

  app.post(
    "/internal/v1/turn-result",
    { schema: { body, response: { 200: ok, 401: refused, 404: refused } } },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) {
        return reply.code(401).send({ error: "unauthorised" as const });
      }

      const result = request.body;

      // The job is the authority on whose conversation this is.
      //
      // Scoped to the kind this endpoint serves, not just the id. Nothing
      // exploits that today, because the payload shape check below would fail
      // closed, but the next job kind added to this table could easily carry a
      // messageId and conversationId of its own and would then be written into
      // silently. Cheaper to name the one kind than to rely on two unrelated
      // payloads never rhyming.
      //
      // **Deliberately not scoped to state = 'running'**, which was the other
      // half of that suggestion and is wrong. Delivery is at least once, so a
      // retried post arrives after the first one already closed the job; with a
      // state predicate that retry 404s, the worker treats it as undeliverable
      // and releases the job, and an already answered message gets a second
      // model call. Idempotency belongs where it already is, on the person's
      // message still being `seen`, which describes the thing being protected
      // rather than the machinery around it.
      const job = await db
        .selectFrom("jobs")
        .select(["id", "account_id", "payload", "state"])
        .where("id", "=", result.jobId)
        .where("kind", "=", "dump.answer")
        .executeTakeFirst();

      if (!job || !job.account_id) return reply.code(404).send({ error: "unknown_job" as const });

      const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
        messageId?: string;
        conversationId?: string;
        turnId?: string;
      };
      if (!payload.messageId || !payload.conversationId || !payload.turnId) {
        return reply.code(404).send({ error: "unknown_job" as const });
      }

      const accountId = job.account_id;

      const written = await db.transaction().execute(async (trx) => {
        // Idempotent. At-least-once delivery means a retry must not write a
        // second reply, and the person's message already being out of `seen`
        // is the cheapest proof this ran.
        const person = await trx
          .selectFrom("messages")
          .select(["id", "state"])
          .where("id", "=", payload.messageId!)
          .where("account_id", "=", accountId)
          .executeTakeFirst();

        // Idempotent. At-least-once delivery means a retry must not write a
        // second reply. `partial` is admitted alongside `seen` because a
        // resumed turn's result arrives against a message this endpoint itself
        // left partial.
        if (!person || (person.state !== "seen" && person.state !== "partial")) return false;

        if (result.outcome === "answered" || result.outcome === "partial") {
          const reply = await trx
            .insertInto("messages")
            .values({
              conversation_id: payload.conversationId!,
              account_id: accountId,
              role: "offload",
              type: "text",
              turn_id: payload.turnId!,
              text: result.replyText,
              state: "answered",
            })
            .returning("id")
            .executeTakeFirstOrThrow();

          if (result.outcome === "answered" && result.found?.length) {
            const ids = result.found.flatMap((r) => r.contentIds);
            // Membership-checked again on the way in. The ids came from a read
            // that was already scoped, and re-checking costs one query and
            // removes the need to trust that.
            const readable = await trx
              .selectFrom("readable_content as content")
              .select("content.id as id")
              .where("content.viewer_account_id", "=", accountId)
              .where("content.id", "in", ids)
              .where("content.deleted_at", "is", null)
              .execute();
            const allowed = new Set(readable.map((r) => r.id));

            // `ord` runs across the whole answer rather than restarting per
            // result, so the order the model read things in survives a regroup.
            let ord = 0;
            const rows = result.found.flatMap((found) =>
              found.contentIds
                .filter((id) => allowed.has(id))
                .map((id) => ({
                  message_id: reply.id,
                  content_id: id,
                  ord: ord++,
                  truncated: found.truncated,
                })),
            );
            if (rows.length > 0) {
              await trx.insertInto("message_content").values(rows).execute();
            }
          }

          await trx
            .updateTable("messages")
            .set({ state: result.outcome })
            .where("id", "=", person.id)
            .execute();

          await trx
            .updateTable("conversations")
            .set({ last_message_at: sql`now()`, unread_at: sql`now()` })
            .where("id", "=", payload.conversationId!)
            .execute();
        } else {
          // No offload message on failure. A turn that says nothing is not a
          // turn, and the composer renders the failure from the person's
          // message state rather than from a blank reply.
          await trx
            .updateTable("messages")
            .set({ state: "failed" })
            .where("id", "=", person.id)
            .execute();
        }

        // One row per model call, not per turn. A planner turn is several
        // calls and billing every one of them to the first row understates
        // every turn that used a tool.
        if (result.usage && result.usage.length > 0) {
          await trx
            .insertInto("llm_usage")
            .values(
              result.usage.map((entry) => ({
                account_id: accountId,
                job_kind: "dump.answer",
                category: "interactive" as const,
                model: entry.model,
                input_tokens: entry.inputTokens,
                output_tokens: entry.outputTokens,
                cache_read_tokens: entry.cacheReadTokens,
                cost_micros: entry.costMicros,
                latency_ms: entry.latencyMs,
              }))
            )
            .execute();
        }

        // The job is closed here, in the same transaction as the write it
        // describes, rather than by the worker afterwards. Two reasons: the
        // worker holds `update` on jobs only so it can claim, and a job left
        // `running` because a second call failed would count against the
        // per-account concurrency cap forever, locking that account out after
        // two dumps. Found by running the loop end to end, not by a test.
        await trx
          .updateTable("jobs")
          .set({ state: "done", locked_at: null, locked_by: null, updated_at: sql`now()` })
          .where("id", "=", result.jobId)
          .execute();

        const subject = await trx
          .selectFrom("accounts")
          .select("analytics_subject_id")
          .where("id", "=", accountId)
          .executeTakeFirst();

        await emit(
          result.outcome !== "failed"
            ? {
                name: "dump_answered",
                subjectId: subject?.analytics_subject_id ?? null,
                // Counts and enums. `calls` is how many model round trips the
                // turn took, which is the number worth watching once a loop
                // can take several, and it says nothing about what was in them.
                properties: {
                  latency_ms: result.usage.reduce((n, e) => n + e.latencyMs, 0),
                  model: result.usage[0]?.model ?? "unknown",
                  calls: result.usage.length,
                  outcome: result.outcome,
                },
                tx: trx,
              }
            : {
                name: "dump_failed",
                subjectId: subject?.analytics_subject_id ?? null,
                properties: { reason: result.reason },
                tx: trx,
              }
        );

        // In the transaction, so nobody is woken to read a row that then rolls
        // back. Postgres holds the notification until commit for exactly this.
        // The payload is a message id and nothing else: a notification is a
        // "look again", not a delivery.
        await sql`select pg_notify(${"offload_answer"}, ${payload.messageId!})`.execute(trx);

        return true;
      });

      return reply.send({ status: written ? ("written" as const) : ("already" as const) });
    }
  );
}
