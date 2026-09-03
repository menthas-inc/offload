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
const refused = z.object({ error: z.enum(["unauthorised", "unknown_job"]) });

export async function internalRoutes(app: App): Promise<void> {
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
          await trx
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
            .execute();

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

        return true;
      });

      return reply.send({ status: written ? ("written" as const) : ("already" as const) });
    }
  );
}
