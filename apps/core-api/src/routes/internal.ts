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

import { PROPOSAL_CANDIDATES, applyProposals } from "../loose/propose.js";
import { applyPageRead, linkReadable } from "../places/backfill.js";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../app.js";
import { db } from "../db.js";
import { applyTurnLabels } from "../threads/labels.js";
import { hashtagsIn } from "@offload/widgets";
import { ownWords } from "../mail-in/attrs.js";
import { recordMailTurn } from "../mail-in/activity.js";
import { emit } from "../analytics.js";
import { env } from "../env.js";
import { ledgerRows } from "../ledger.js";
import { NOTE_TEXT_CHARS, applyCompaction, applyLearned } from "../threads/notes.js";
import { parseWhen, plausible } from "../threads/dates.js";
import {
  applyAnswer,
  askedQuestion,
  closeQuestion,
  matchCalendarLabel,
  storeQuestions,
  validateAsked,
  type StoredOption,
} from "../questions.js";
import { answerCalendarQuestion } from "./dumps.js";
import { fileUnfiled } from "../blobs/rows.js";
import { memberOf } from "../threads/access.js";
import type { Transaction } from "kysely";
import type { Database } from "../schema.js";
import type { FastifyBaseLogger } from "fastify";

/** 020. The photos on a message that no live row carries, filed with a plain
 *  title in the thread on screen or the default. Where the turn already
 *  filed every photo this does nothing, which is the common case. */
async function fileUnfiledPhotos(
  trx: Transaction<Database>,
  messageId: string,
  accountId: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const message = await trx
    .selectFrom("messages")
    .select("looking_at_thread_id")
    .where("id", "=", messageId)
    .executeTakeFirst();
  const account = await trx
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", accountId)
    .executeTakeFirst();
  const lookingAt = message?.looking_at_thread_id;
  const threadId =
    lookingAt && (await memberOf(accountId, lookingAt, trx)) ? lookingAt : account?.default_thread_id;
  if (!threadId) return;
  const filed = await fileUnfiled(trx, messageId, accountId, threadId);
  if (filed > 0) log.info({ filed }, "photos filed by the server");
}

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
  cacheWriteTokens: z.number().int().min(0).default(0),
  /** Accepted from a worker a release behind and ignored: core-api prices a
   *  call from its tokens (src/pricing.ts). */
  costMicros: z.number().int().min(0).optional(),
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
    /** 018. What the turn asked back. Validated whole, against the closed
     *  field set and the turn's own filings, and dropped whole on any failure
     *  so the turn settles as if it had asked nothing. */
    questions: z.array(askedQuestion).max(2).optional(),
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
      .array(
        z.object({
          domain: z.string().max(253),
          // https and nothing else. The clients open these with the platform's
          // opener, and a citation is the one URL on a reply the person never
          // typed; a scheme other than https is not a page to open.
          url: z.string().url().max(2000).refine((value) => /^https:\/\//i.test(value), "https only"),
        })
      )
      // **Twelve, not six.** Six was written for three lookups of two sources
      // each; one real search cites nine, and the first production turn to
      // complete a lookup was refused over the length after doing the work. The
      // worker deduplicates by domain and truncates to the same number, so this
      // is the contract rather than the thing that catches a mistake.
      .max(12)
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
      .array(
        z.object({
          domain: z.string().max(253),
          // https and nothing else. The clients open these with the platform's
          // opener, and a citation is the one URL on a reply the person never
          // typed; a scheme other than https is not a page to open.
          url: z.string().url().max(2000).refine((value) => /^https:\/\//i.test(value), "https only"),
        })
      )
      // **Twelve, not six.** Six was written for three lookups of two sources
      // each; one real search cites nine, and the first production turn to
      // complete a lookup was refused over the length after doing the work. The
      // worker deduplicates by domain and truncates to the same number, so this
      // is the contract rather than the thing that catches a mistake.
      .max(12)
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
    reason: z.enum(["model_error", "invalid_output", "timeout", "transcription_failed"]),
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

/** 032. What a nightly pass proposes: a fold of its member's notes, what it
 *  learned from their dumps, and on the default thread the threads it would
 *  suggest.
 *
 *  Bounded on every axis, because this is a model's output crossing a boundary
 *  (OFF-5) and an unbounded list of ids is an unbounded number of writes. */
const nightlyBody = z.strictObject({
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
  /** New notes, each citing the messages it came from. The Core API decides
   *  which messages a note may cite; this only bounds the shape. */
  learned: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(NOTE_TEXT_CHARS),
        from: z.array(z.string().uuid()).min(1).max(10),
        occursAt: z.string().max(40).nullish(),
        occursEndAt: z.string().max(40).nullish(),
        dueAt: z.string().max(40).nullish(),
      })
    )
    .max(3)
    .default([]),
  /** 028. The default thread's candidates the worker sent, and its groups. */
  sent: z.array(z.string().uuid()).max(PROPOSAL_CANDIDATES).default([]),
  groups: z.array(z.strictObject({ name: z.string().max(200), ids: z.array(z.string().uuid()).max(20) })).max(10).default([]),
  usage: usage.optional(),
});

/** A date from the fold, or null. Shared with `add_note`'s parser rather than
 *  a second reading of what a model writes. */
function when(raw: string | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  const at = parseWhen(raw);
  return at && plausible(at) ? at : null;
}

const nightlyApplied = z.object({
  superseded: z.number(),
  removed: z.number(),
  added: z.number(),
  learned: z.number(),
  proposals: z.number(),
  ignored: z.number(),
});

export async function internalRoutes(app: App): Promise<void> {
  // 032. A nightly pass, applied.
  //
  // The worker read one thread for one member, asked a model what that
  // member's notes say now, what their day's dumps add, and on the default
  // thread which threads to suggest, and posts the answer here. **Every rule is
  // enforced on this side**: the prompt states them too, and stating them
  // twice is the point, because a prompt is a request and this is the
  // enforcement.
  //
  // The thread and the member come from the job row, never from the body.
  app.post(
    "/internal/v1/nightly-result",
    { schema: { body: nightlyBody, response: { 200: nightlyApplied, 401: refused, 404: refused } } },
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
        .where("kind", "=", "thread.nightly")
        .executeTakeFirst();
      if (!job?.account_id) return reply.code(404).send({ error: "unknown_job" as const });

      const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
        threadId?: string;
        propose?: boolean;
      };
      if (!payload.threadId) return reply.code(404).send({ error: "unknown_job" as const });
      const accountId = job.account_id;
      const threadId = payload.threadId;
      const none = { superseded: 0, removed: 0, added: 0, learned: 0, proposals: 0, ignored: 0 };

      const outcome = await db.transaction().execute(async (trx) => {
        // Once per job: a retried post after a lost response writes nothing a
        // second time.
        const open = await trx.selectFrom("jobs").select("state").where("id", "=", result.jobId).forUpdate().executeTakeFirstOrThrow();
        if (open.state !== "running") return none;

        const close = () =>
          trx
            .updateTable("jobs")
            .set({ state: "done", locked_at: null, locked_by: null, updated_at: sql`now()` })
            .where("id", "=", result.jobId)
            .execute();

        // A member taken out between the booking and now: the pass is refused
        // whole, and the job closed so it does not hold the account's slot.
        if (!(await memberOf(accountId, threadId, trx))) {
          await close();
          return none;
        }

        const folded = await applyCompaction(
          threadId,
          {
            supersede: result.supersede,
            remove: result.remove,
            add: result.add.map((entry) => ({
              text: entry.text,
              // The same guard `add_note` puts on the same three columns: the
              // date is dropped, never the entry.
              occursAt: when(entry.occursAt),
              occursEndAt: when(entry.occursEndAt),
              dueAt: when(entry.dueAt),
              foldedFrom: entry.foldedFrom,
            })),
          },
          trx,
          { author: accountId },
        );

        // The default thread is never learned from: what lands there has no
        // shared subject. Its pass suggests threads instead.
        const isDefault = await trx
          .selectFrom("accounts")
          .select("id")
          .where("id", "=", accountId)
          .where("default_thread_id", "=", threadId)
          .executeTakeFirst();

        const taught = isDefault
          ? { learned: 0, ignored: result.learned.length }
          : await applyLearned(trx, {
              accountId,
              threadId,
              entries: result.learned.map((entry) => ({
                text: entry.text,
                from: entry.from,
                occursAt: when(entry.occursAt),
                occursEndAt: when(entry.occursEndAt),
                dueAt: when(entry.dueAt),
              })),
            });

        const proposals = isDefault && payload.propose ? await applyProposals(trx, accountId, result.sent, result.groups) : 0;

        if (result.usage && result.usage.length > 0) {
          await trx
            .insertInto("llm_usage")
            // Scheduled, not interactive: nobody is waiting on it.
            .values(ledgerRows(accountId, "thread.nightly", "scheduled", result.usage))
            .execute();
        }
        // The member's last pass here, after everything this one wrote: the
        // next is booked on, and reads, what changed since, so this pass's own
        // notes never book it. clock_timestamp, not now(): now() is the
        // transaction's start, which the writes above would come after.
        await trx
          .updateTable("thread_members")
          .set({ nightly_at: sql`clock_timestamp()` })
          .where("thread_id", "=", threadId)
          .where("account_id", "=", accountId)
          .execute();
        await close();

        return {
          superseded: folded.superseded,
          removed: folded.removed,
          added: folded.added,
          learned: taught.learned,
          proposals,
          ignored: folded.ignored + taught.ignored,
        };
      });

      // Counts, never text (OFF-1).
      console.log(JSON.stringify({ level: "info", msg: "nightly applied", ...outcome }));
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
          .select(["id", "state", "source"])
          .where("id", "=", payload.messageId!)
          .where("account_id", "=", accountId)
          .executeTakeFirst();

        // Idempotent. At-least-once delivery means a retry must not write a
        // second reply. `partial` is admitted alongside `seen` because a
        // resumed turn's result arrives against a message this endpoint itself
        // left partial.
        if (!person || (person.state !== "seen" && person.state !== "partial")) return false;

        if (result.outcome === "answered" || result.outcome === "partial") {
          // 025. A # picked in the composer, applied once the rows exist.
          const sent = await trx
            .selectFrom("messages")
            .select(["id", "turn_id", "text", "attrs", "source"])
            .where("id", "=", payload.messageId!)
            .executeTakeFirstOrThrow();
          // 026. A forwarded email's #words are somebody else's; the note's are theirs.
          await applyTurnLabels(trx, accountId, { id: sent.id, turnId: sent.turn_id, text: ownWords(sent), attrs: sent.attrs }, hashtagsIn);

          // **No row when there was nothing to say.** A dump that was simply
          // filed writes no offload message at all: the Done mark and the pill
          // naming the thread carry it, and `reply` on the wire is already
          // nullable, so the clients have the shape for it.
          // **A resumed turn replaces what it said last time.** The first
          // attempt at a turn that stopped wrote "That did not finish." against
          // the turn, and a second attempt used to write another beside it:
          // two identical sentences, each with the same chips, under one Finish
          // it. A turn has one reply, so the row is reused when there is one,
          // and goes when the resume had nothing to say (a filing that then
          // finished quietly earns its Done mark and no sentence).
          const earlier = await trx
            .selectFrom("messages")
            .select("id")
            .where("turn_id", "=", payload.turnId!)
            .where("role", "=", "offload")
            .where("deleted_at", "is", null)
            .executeTakeFirst();

          let reply: { id: string } | null = null;
          if (result.replyText && earlier) {
            await trx
              .updateTable("messages")
              .set({ text: result.replyText, state: "answered" })
              .where("id", "=", earlier.id)
              .execute();
            // What the earlier sentence showed belongs to the earlier sentence.
            await trx.deleteFrom("message_content").where("message_id", "=", earlier.id).execute();
            reply = earlier;
          } else if (result.replyText) {
            reply = await trx
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
          } else if (earlier) {
            await trx
              .updateTable("messages")
              .set({ deleted_at: new Date() })
              .where("id", "=", earlier.id)
              .execute();
          }

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
          // **Only what this attempt read for the first time.** A resumed turn
          // reads the same pages again, and recording them again grew the
          // chip's count past the cap on every Finish it: three chips and
          // "and 12 more" over eight pages. The tally is a count of reads, so
          // it moves only for the new ones as well.
          const known = new Set(
            result.sources?.length
              ? (
                  await trx
                    .selectFrom("turn_sources")
                    .select("url")
                    .where("turn_id", "=", payload.turnId!)
                    .execute()
                ).map((row) => row.url)
              : [],
          );
          const sources = (result.sources ?? []).filter((source) => !known.has(source.url));
          if (sources.length) {
            await trx
              .insertInto("turn_sources")
              .values(
                sources.map((source) => ({
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
            for (const domain of new Set(sources.map((s) => s.domain))) {
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

          // 020. Every photo lands in Files, and the server is what holds
          // that: a photo the turn did not file gets a row now, with a plain
          // title, in the thread on screen or the default. Before the
          // questions, so the one about which thread sees every row the turn
          // ends with.
          await fileUnfiledPhotos(trx, person.id, accountId, request.log);

          // 018. The questions, on the answered arm only, after everything the
          // turn filed is in the same transaction, so a target that did not
          // settle is a target that does not exist. An answering turn is one
          // that carried `found`; only it may ask the country.
          if (result.outcome === "answered" && result.questions?.length) {
            // An answer never creates a question: a job that is itself the
            // re-run for a country somebody picked may not ask again.
            const rerun = Boolean((payload as { questionId?: string }).questionId);
            const answering = result.found !== undefined && !rerun;
            const verdict = await validateAsked(trx, result.questions, {
              accountId,
              messageId: person.id,
              answering,
            });
            if (verdict.ok) {
              await storeQuestions(trx, verdict.rows, {
                accountId,
                conversationId: payload.conversationId!,
                messageId: person.id,
                turnId: payload.turnId!,
                // A turn that read a calendar or the web: the flag is a
                // record, since nothing the model wrote reaches a question.
                // 026: and a forwarded email, which somebody else wrote.
                derivedFromUntrusted:
                  person.source === "mail" ||
                  (payload as { sawApps?: boolean }).sawApps === true ||
                  (result.lookups ?? []).some((l) => l.outcome !== "refused_bound"),
              });
            } else {
              // Enums only: the field and the reason, never the sentence.
              request.log.warn({ field: verdict.field, reason: verdict.reason }, "question refused");
            }
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

          // 020. A turn that failed or was stopped still sent its photos, and
          // they are still in Files. The one path every ending goes through.
          await fileUnfiledPhotos(trx, person.id, accountId, request.log);
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
            .values(ledgerRows(accountId, "dump.answer", "interactive", calls))
            .execute();
        }

        // 026. A forwarded email is processed with nobody watching, so its
        // record is Activity's, written with the result it describes.
        await recordMailTurn(trx, accountId, payload.messageId!, payload.turnId!);

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

  // 018. The worker's two ways of settling an open question after judging a
  // typed message. Both resolve the job first, the way turn-step does, and tie
  // the question to the job's conversation, so a judgement about one message
  // can only ever settle the question that message could answer.
  async function questionScope(
    request: { headers: { authorization?: string | string[] | undefined } },
    jobId: string,
  ): Promise<{ accountId: string; conversationId: string; messageId: string; turnId: string } | null> {
    const header = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;
    const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!tokenMatches(presented)) return null;
    const job = await db
      .selectFrom("jobs")
      .select(["account_id", "payload"])
      .where("id", "=", jobId)
      .where("kind", "=", "dump.answer")
      .executeTakeFirst();
    if (!job || !job.account_id) return null;
    const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
      messageId?: string;
      conversationId?: string;
      turnId?: string;
    };
    if (!payload.messageId || !payload.conversationId || !payload.turnId) return null;
    return {
      accountId: job.account_id,
      conversationId: payload.conversationId,
      messageId: payload.messageId,
      turnId: payload.turnId,
    };
  }

  app.post(
    "/internal/v1/question-answer",
    {
      schema: {
        body: z.strictObject({
          jobId: z.string().uuid(),
          questionId: z.string().uuid(),
          value: z.record(z.string(), z.string()).optional(),
        }),
        response: { 200: z.object({ applied: z.boolean() }), 401: refused, 404: refused },
      },
    },
    async (request, reply) => {
      const scope = await questionScope(request, request.body.jobId);
      if (!scope) return reply.code(401).send({ error: "unauthorised" as const });
      // 019. A typed answer to a calendar question is matched here, in code,
      // against the labels: the worker never reads them, since one may be a
      // name somebody else wrote. A hit reaches Google, so it takes the tapped
      // answer's own path, outside any transaction, with the dump as the
      // person's message. A miss closes the question and the dump files.
      // 022. A person question's labels are connections' names, matched the
      // same way and for the same reason; a hit is the share, inside one
      // transaction like the tap's.
      const typedText = request.body.value?.["text"];
      if (typedText !== undefined) {
        const q = await db
          .selectFrom("questions")
          .select(["id", "field", "options"])
          .where("id", "=", request.body.questionId)
          .where("account_id", "=", scope.accountId)
          .where("conversation_id", "=", scope.conversationId)
          .where("state", "=", "open")
          .executeTakeFirst();
        if (!q || (q.field !== "calendar" && q.field !== "person")) return reply.send({ applied: false });
        const options = Array.isArray(q.options) ? (q.options as StoredOption[]) : [];
        const option = matchCalendarLabel(typedText, options);
        if (option === null) {
          await db.transaction().execute((trx) => closeQuestion(trx, q.id, scope.accountId, scope.messageId));
          request.log.info({ how: "typed", field: q.field, applied: false }, "question closed");
          return reply.send({ applied: false });
        }
        if (q.field === "person") {
          const applied = await db.transaction().execute(async (trx) => {
            const outcome = await applyAnswer(trx, q.id, scope.accountId, { person: options[option]!.value ?? "" }, {
              answeredMessageId: scope.messageId,
              answerTurnId: scope.turnId,
              option,
            });
            if (!outcome.applied) await closeQuestion(trx, q.id, scope.accountId, scope.messageId);
            return outcome.applied;
          });
          request.log.info({ how: "typed", field: "person", applied }, "question answered");
          return reply.send({ applied });
        }
        const answered = await answerCalendarQuestion(scope.accountId, {
          questionId: q.id,
          option,
          lookingAt: null,
          typed: { messageId: scope.messageId, turnId: scope.turnId },
        });
        const applied = Boolean(answered && answered.applied);
        request.log.info({ how: "typed", field: "calendar", applied }, "question answered");
        return reply.send({ applied });
      }
      const applied = await db.transaction().execute(async (trx) => {
        const q = await trx
          .selectFrom("questions")
          .select("id")
          .where("id", "=", request.body.questionId)
          .where("account_id", "=", scope.accountId)
          .where("conversation_id", "=", scope.conversationId)
          .executeTakeFirst();
        if (!q) return false;
        const outcome = await applyAnswer(trx, q.id, scope.accountId, request.body.value ?? {}, {
          answeredMessageId: scope.messageId,
          answerTurnId: scope.turnId,
          option: null,
        });
        if (!outcome.applied) await closeQuestion(trx, q.id, scope.accountId, scope.messageId);
        return outcome.applied;
      });
      request.log.info({ how: "typed", applied }, "question answered");
      return reply.send({ applied });
    }
  );

  // 030. What the worker found when it read a link's page again for a place.
  // The job it ran is checked to be this row's, and everything the job checked
  // before the fetch is checked again here. The body is never logged.
  app.post(
    "/internal/v1/content/:id/page-location",
    {
      logLevel: "warn",
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          jobId: z.string().uuid(),
          found: z
            .union([
              z.strictObject({ lat: z.number(), lng: z.number() }),
              z.strictObject({ name: z.string().min(1).max(400) }),
            ])
            .nullable(),
        }),
        response: { 200: z.object({ ok: z.literal(true) }), 401: refused, 404: refused },
      },
    },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) return reply.code(401).send({ error: "unauthorised" as const });
      const { id } = request.params;
      const done = await db.transaction().execute(async (trx) => {
        const job = await trx
          .selectFrom("jobs")
          .select("id")
          .where("id", "=", request.body.jobId)
          .where("kind", "=", "link.place")
          .where("state", "=", "running")
          .where(sql<boolean>`payload->>'contentId' = ${id}`)
          .executeTakeFirst();
        if (!job || !(await linkReadable(id, trx))) return false;
        await applyPageRead(trx, id, request.body.found);
        return true;
      });
      if (!done) return reply.code(404).send({ error: "unknown_job" as const });
      return reply.send({ ok: true as const });
    }
  );

  app.post(
    "/internal/v1/question-close",
    {
      schema: {
        body: z.strictObject({ jobId: z.string().uuid(), questionId: z.string().uuid() }),
        response: { 200: z.object({ closed: z.boolean() }), 401: refused, 404: refused },
      },
    },
    async (request, reply) => {
      const scope = await questionScope(request, request.body.jobId);
      if (!scope) return reply.code(401).send({ error: "unauthorised" as const });
      const closed = await db.transaction().execute(async (trx) => {
        const q = await trx
          .selectFrom("questions")
          .select("id")
          .where("id", "=", request.body.questionId)
          .where("account_id", "=", scope.accountId)
          .where("conversation_id", "=", scope.conversationId)
          .executeTakeFirst();
        return q ? closeQuestion(trx, q.id, scope.accountId, scope.messageId) : false;
      });
      return reply.send({ closed });
    }
  );

}
