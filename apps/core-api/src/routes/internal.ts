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
    /** Absent when there was nothing to say.
     *
     *  **A dump that was simply filed writes no reply at all.** The Done mark
     *  and the pill naming the thread say what happened; a sentence repeating
     *  what somebody just typed is noise in offload's voice. An answer is the
     *  other way round and the worker refuses to post one without a sentence,
     *  because a question with no answer is a failure. */
    replyText: z.string().min(1).optional(),
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
    /** 016. Where the turn got something from, for the chips under it.
     *
     *  **Two fields, and the omissions are the point.** A provider's citation
     *  also carries the page's title and a quoted excerpt, and both are written
     *  by whoever owns the page: forwarding either walks attacker-controlled
     *  prose onto somebody's screen in offload's own voice. */
    sources: z
      .array(z.object({ domain: z.string().max(253), url: z.string().url().max(2000) }))
      .max(6)
      .optional(),
    /** And what kind of lookup it was, which is how the next narrow tool gets
     *  argued from counts rather than from whichever example came to mind.
     *
     *  **No query and no URL.** A query is somebody's own sentence, and
     *  anonymising it does not make it not content (OFF-1). The label is
     *  validated against a closed set here as well as in the worker, because a
     *  set enforced in one place is a set until somebody adds a second writer. */
    lookups: z
      .array(
        z.object({
          label: z.string().max(40),
          kind: z.enum(["search", "read"]),
          outcome: z.enum(["used", "unused", "empty", "failed", "refused_bound"]),
          costMicros: z.number().int().min(0).max(10_000_000),
        })
      )
      .max(12)
      .optional(),
    usage,
  }),
  z.strictObject({
    outcome: z.literal("partial"),
    jobId: z.string().uuid(),
    /** Describes what actually landed, and only that (AC-15). */
    replyText: z.string().min(1),
    /** A turn cut off partway still read what it read, and a chip is a record
     *  of that rather than of the turn finishing. Same shape as above. */
    sources: z
      .array(z.object({ domain: z.string().max(253), url: z.string().url().max(2000) }))
      .max(6)
      .optional(),
    lookups: z
      .array(
        z.object({
          label: z.string().max(40),
          kind: z.enum(["search", "read"]),
          outcome: z.enum(["used", "unused", "empty", "failed", "refused_bound"]),
          costMicros: z.number().int().min(0).max(10_000_000),
        })
      )
      .max(12)
      .optional(),
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
  /** 017. Somebody stopped it. No reply and no reason: the reply would be
   *  offload explaining a decision that was not its own, and the reason is on
   *  screen already, because they are the one who pressed it.
   *
   *  **It still reports usage.** The model calls happened and were paid for,
   *  and a cancelled turn that reported nothing would make the spend
   *  disappear from the only place it is counted. */
  z.strictObject({
    outcome: z.literal("cancelled"),
    jobId: z.string().uuid(),
    usage: usage.optional(),
  }),
]);

/** The closed set the `lookups.label` column may hold, mirrored from the
 *  worker's own list. Anything else becomes `other` and the string the model
 *  produced is discarded rather than stored, which is the difference between a
 *  counter and a free-text field nobody meant to build. */
const LOOKUP_LABELS = new Set([
  "weather",
  "when_is",
  "place",
  "opening_hours",
  "price_or_availability",
  "link_metadata",
  "person_or_org",
  "how_to",
  "other",
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

/** 017. One line of what offload is doing. Free text, because the alternative
 *  is a closed set of stages and the whole point is that the line describes
 *  this turn rather than a category it fits into.
 *
 *  **Capped here as well as by the check constraint**, because AC-4 puts the
 *  cap on the server, and a step that the constraint rejects becomes a failed
 *  write in the middle of a working turn. Better to refuse the post. */
const stepBody = z.strictObject({
  jobId: z.string().uuid(),
  text: z.string().trim().min(1).max(80),
});

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

  // 017. What offload is doing, on its way out.
  //
  // **Deliberately not idempotent and deliberately unversioned.** A step is the
  // current one; two steps racing means one of them is drawn for a moment and
  // replaced, which is what a progress line does anyway. There is nothing to
  // reconcile and no order to preserve.
  app.post(
    "/internal/v1/turn-step",
    { schema: { body: stepBody, response: { 200: ok, 401: refused, 404: refused } } },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) {
        return reply.code(401).send({ error: "unauthorised" as const });
      }

      // The job is the authority on which message this is, exactly as
      // `turn-result` has it. The worker never names a message id: it holds a
      // job, and the job holds the message.
      const job = await db
        .selectFrom("jobs")
        .select(["payload"])
        .where("id", "=", request.body.jobId)
        .where("kind", "in", ["dump.plan", "dump.answer"])
        .executeTakeFirst();
      if (!job) return reply.code(404).send({ error: "unknown_job" as const });

      const messageId = (job.payload as { messageId?: string }).messageId;
      if (!messageId) return reply.code(404).send({ error: "unknown_job" as const });

      // **Only while the message is still waiting.** A step that lands after
      // the turn settled would redraw a progress line under a finished answer,
      // and a retried post is the ordinary way that happens.
      const written = await db
        .updateTable("messages")
        .set({ step: request.body.text, step_at: new Date() })
        .where("id", "=", messageId)
        .where("state", "=", "seen")
        .executeTakeFirst();

      if (Number(written.numUpdatedRows) === 0) {
        return reply.send({ status: "already" as const });
      }

      // Same channel the answer rides, because the client is already listening
      // to it and a second channel would be a second connection for a string.
      // The payload is the message id and nothing else, so the reader looks
      // again rather than being handed anything.
      await sql`select pg_notify(${"offload_answer"}, ${messageId})`.execute(db);

      return reply.send({ status: "written" as const });
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
          // **No row when there was nothing to say.** A dump that was simply
          // filed writes no offload message at all: the Done mark and the pill
          // naming the thread carry it, and `reply` on the wire is already
          // nullable, so the clients have the shape for it.
          const reply = result.replyText
            ? await trx
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
                .executeTakeFirstOrThrow()
            : null;

          if (result.outcome === "answered" && reply && result.found?.length) {
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

          // 016. What the turn read, and what kind of lookup it was.
          //
          // **Against the turn rather than the reply**, because an ordinary
          // filing turn writes no reply at all and may still have read
          // something. Same reason the Done mark and the thread pills belong to
          // the turn: the sentence is optional and the record is not.
          if (result.sources?.length) {
            await trx
              .insertInto("turn_sources")
              .values(
                result.sources.map((source) => ({
                  account_id: accountId,
                  turn_id: payload.turnId!,
                  domain: source.domain,
                  url: source.url,
                })),
              )
              .execute();

            // And the tally with nobody attached. One statement, no account id
            // in it at all, which is what makes this aggregate by construction
            // rather than aggregate by policy.
            for (const domain of new Set(result.sources.map((s) => s.domain))) {
              await sql`
                insert into domain_reads (domain, day, count)
                values (${domain}, current_date, 1)
                on conflict (domain, day) do update set count = domain_reads.count + 1
              `.execute(trx);
            }
          }

          if (result.lookups?.length) {
            await trx
              .insertInto("lookups")
              .values(
                result.lookups.map((lookup) => ({
                  account_id: accountId,
                  // Validated against the closed set here as well as in the
                  // worker. A set enforced in one place is a set until there
                  // is a second writer, and the whole design of this table is
                  // that the column can never become free text.
                  label: LOOKUP_LABELS.has(lookup.label) ? lookup.label : "other",
                  kind: lookup.kind,
                  outcome: lookup.outcome,
                  cost_micros: lookup.costMicros,
                })),
              )
              .execute();
          }

          await trx
            .updateTable("messages")
            .set({ state: result.outcome, step: null, step_at: null })
            .where("id", "=", person.id)
            .execute();

          await trx
            .updateTable("conversations")
            .set({ last_message_at: sql`now()`, unread_at: sql`now()` })
            .where("id", "=", payload.conversationId!)
            .execute();
        } else {
          // No offload message on failure or on a cancel. A turn that says
          // nothing is not a turn, and the composer renders both from the
          // person's message state rather than from a blank reply.
          //
          // **The step is cleared here rather than only by the cancel
          // endpoint.** A turn that is stopped, times out or fails all leave a
          // progress line behind, and this is the one place every ending goes
          // through. The endpoint clears it too, so the screen changes on the
          // press rather than on the worker noticing.
          await trx
            .updateTable("messages")
            .set({ state: result.outcome === "cancelled" ? "cancelled" : "failed", step: null, step_at: null })
            .where("id", "=", person.id)
            .execute();
        }

        // **Optional on two outcomes now.** `failed` has always been able to
        // arrive with no usage, and 017's `cancelled` can too: a turn stopped
        // before its first call has nothing to report.
        const calls = "usage" in result ? (result.usage ?? []) : [];

        // One row per model call, not per turn. A planner turn is several
        // calls and billing every one of them to the first row understates
        // every turn that used a tool.
        if (calls.length > 0) {
          await trx
            .insertInto("llm_usage")
            .values(
              calls.map((entry) => ({
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
                  latency_ms: calls.reduce((n, e) => n + e.latencyMs, 0),
                  model: calls[0]?.model ?? "unknown",
                  calls: calls.length,
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
