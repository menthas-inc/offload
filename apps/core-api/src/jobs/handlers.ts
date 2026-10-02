// What each job kind actually does.
//
// Handlers are pure of transport concerns: claiming, retrying, backoff and
// scrubbing live in the runner. A handler does the work or throws.

import { shouldPropose, sweepSuggestions } from "../loose/propose.js";
import { sql, type ExpressionBuilder, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { NOTE_PROMPT_BUDGET, deleteNotesForThread } from "../threads/notes.js";
import { resolvePlace } from "../places/resolve.js";
import { locateBlob, reverseGeocodingOn } from "../places/reverse.js";
import { objectKey, objectStore, RENDITIONS } from "../blobs/store.js";
import type { Mailer } from "../mail/index.js";
import { env } from "../env.js";
import { scheduleFullSyncs, scheduleNextSync, superviseSyncs, syncConnection } from "../connectors/sync.js";
import { enqueue, PRIORITY, scheduleDaily, scheduleHourly } from "./queue.js";
import { purgeActivity } from "../notifications/activity.js";
import { forgetPendingWrites } from "../connectors/tool-calls.js";
import { purgeLabelRuns, purgeLabels } from "../threads/labels.js";
import { runDigest, scheduleDigests, readReceipts, type Send } from "../notifications/digest.js";
import { notifyPerson, notifySharedActivity } from "../notifications/people.js";
import { emit } from "../analytics.js";
import { sweepEmbeds } from "../search/sweep.js";
import { sweepPeople } from "../people/people.js";
import { sweepPutOffs } from "../today/needs.js";

export type Handler = (
  payload: Record<string, unknown>,
  deps: { mailer: Mailer },
  /** The job row's own account, for handlers that work on one. Null for the
   *  scheduled sweeps, which belong to nobody. */
  accountId: string | null,
) => Promise<void>;

/** The waitlist confirmation.
 *
 *  Gated on accounts.waitlist_email_sent_at so it sends once per account, ever.
 *  Rate limiting bounds request rate, not total sends over time or across
 *  addresses, so without this the endpoint mails a stranger's inbox as often as
 *  anyone cares to submit it. */
const waitlistJoined: Handler = async (_payload, { mailer }, accountId) => {
  // The row's account, never the payload's: `queue.ts` states the contract
  // and this handler read the payload for a while against it.
  if (!accountId) throw new Error("waitlist_joined job has no account");

  // Claim the send before making it. If the send then fails the job retries and
  // finds nothing to claim, which loses one email; sending twice to someone who
  // did not ask is the worse failure of the two.
  const claimed = await db
    .updateTable("accounts")
    .set({ waitlist_email_sent_at: new Date() })
    .where("id", "=", accountId)
    .where("waitlist_email_sent_at", "is", null)
    .where("state", "=", "waitlist")
    .returning(["email"])
    .executeTakeFirst();

  if (!claimed) return;

  await mailer.send({
    to: claimed.email,
    subject: "You are on the list",
    slots: {
      headline: "You are on the list",
      body: "offload is invite only while it is still small. We will email you when your account is ready to use.",
      footer: `You are receiving this because you asked to join offload at ${new URL(env.WEB_URL).host}.`,
    },
  });
};

/** The invite. The one email in this product that someone is waiting for, so
 *  it is the one that carries a link rather than only news.
 *
 *  Claimed the same way as the waitlist confirmation, and for the same reason:
 *  the queue's idempotency key prevents a second enqueue, not a second send by
 *  a job that retried after the mailer succeeded and the acknowledgement did
 *  not. */
const invited: Handler = async (_payload, { mailer }, accountId) => {
  if (!accountId) throw new Error("invited job has no account");

  const claimed = await db
    .updateTable("accounts")
    .set({ invite_email_sent_at: new Date() })
    .where("id", "=", accountId)
    .where("invite_email_sent_at", "is", null)
    .where("state", "=", "invited")
    .returning(["email"])
    .executeTakeFirst();

  if (!claimed) return;

  await mailer.send({
    to: claimed.email,
    subject: "You are in",
    slots: {
      headline: "You are in",
      body:
        "Your offload account is ready. Sign in with this address, using Google or Apple, " +
        "and dump the first thing you would otherwise forget.",
      buttonLabel: "Open offload",
      buttonUrl: `${env.WEB_URL}/sign-in`,
      footer: `You are receiving this because you joined the offload waitlist at ${new URL(env.WEB_URL).host}.`,
    },
  });
};

/** How many rows one run may destroy before it stops and asks for help.
 *
 *  A real run is a handful. This is far above anything normal and far below
 *  what a bad predicate would produce, which is the only useful place for a
 *  number like this to sit. */
export const PURGE_CEILING = 500;

/** The hard delete, and the only one in the codebase.
 *
 *  Undo is a soft delete under a `purge_after` eight seconds out. This is what
 *  makes the deletion real, and it is the single most dangerous handler here:
 *  it destroys rows on a timer, and a wrong predicate is a silent irreversible
 *  mass delete with nothing to roll back to.
 *
 *  So it is written defensively on purpose:
 *
 *  - **Both conditions, always.** `purge_after < now()` alone would take rows
 *    that were never soft-deleted at all, since a null `purge_after` compares
 *    false today and a future column default is one character away from
 *    changing that. Either condition implies the other right now. They are both
 *    stated anyway.
 *  - **Count before deleting, and stop if the count is absurd.** A run that
 *    suddenly wants 40,000 rows is a bug, and the right response to a bug in a
 *    delete is to do nothing and say so.
 *  - **One transaction**, content before messages, so a crash mid-purge cannot
 *    leave a message whose content is already gone. */
const contentPurge: Handler = async () => {
  await db.transaction().execute(async (trx) => {
    const due = sql<boolean>`deleted_at is not null and purge_after is not null and purge_after < now()`;

    // **A folded note is the one row here that is due without being deleted.**
    // 014's daily job sets a note aside rather than destroying it, and gives
    // offload's own thirty days of history before it goes. A person's carries
    // no `purge_after`, so this predicate never matches one however old it is.
    const folded = sql<boolean>`deleted_at is null and superseded_at is not null
      and purge_after is not null and purge_after < now()`;

    const counts = await Promise.all([
      trx
        .selectFrom("content")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .where(due)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("messages")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .where(due)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("notes")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .where(due)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("threads")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .where(due)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("notes")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .where(folded)
        .executeTakeFirstOrThrow(),
    ]);

    const total = counts.reduce((sum, row) => sum + Number(row.n), 0);
    // 020. Nothing due on the four tables still leaves the photo sweep at the
    // bottom of this function to run, so an upload nobody sent is not kept
    // until something else happens to be deleted.
    if (total === 0) return sweepBlobs(trx, due);

    if (total > PURGE_CEILING) {
      // Counts only, and it throws rather than returning, so the job is
      // recorded as failed and shows up rather than passing quietly.
      throw new Error(`purge ceiling exceeded: ${total} rows due, ceiling ${PURGE_CEILING}`);
    }

    // Content first. `derived_from_message_id` is on delete set null, so the
    // other order would silently orphan a row from the message it came from
    // in the moment before it was deleted itself.
    await trx.deleteFrom("content").where(due).execute();
    // Notes before messages for the same reason content is: a note's
    // `derived_from_message_id` is on delete set null, so the other order
    // orphans it from its source in the moment before it goes itself.
    await trx.deleteFrom("notes").where(due).execute();
    // And the folded history that has run out its thirty days.
    await trx.deleteFrom("notes").where(folded).execute();
    await trx.deleteFrom("messages").where(due).execute();

    // A thread nobody is left in. Everything that points at it cascades,
    // `content`, `thread_members` and `thread_keys`, with one exception that
    // does not: `notes.subject_id` is polymorphic so it carries no foreign
    // key, and nothing removes those unless it is told to. This is the caller
    // 008 wrote `deleteNotesForThread` for and could not wire, because
    // until now no path in the product deleted a thread.
    const deadThreads = await trx
      .selectFrom("threads")
      .select("id")
      .where(due)
      .execute();
    for (const thread of deadThreads) {
      await deleteNotesForThread(thread.id, trx);
    }
    await trx.deleteFrom("threads").where(due).execute();

    await sweepBlobs(trx, due);
  });
};

/** 020. Photos, after everything that could have referenced one is gone.
 *
 *  A thread wrap with no row left in that thread linking the blob goes,
 *  including a dead thread's, whose rows the cascade just took. A row in
 *  its own Undo window still holds its `content_blobs` link, so its wrap
 *  survives the window. Then a blob nothing references, its message gone
 *  and no row linking it, is soft-deleted onto the purge clock, and so is
 *  an upload nothing claimed within the hour. The R2 delete is its own
 *  job, because a network call inside this transaction is how a slow
 *  third party becomes a stalled database. */
async function sweepBlobs(trx: Transaction<Database>, due: ReturnType<typeof sql<boolean>>): Promise<void> {
    await sql`
      delete from blob_keys bk
      where bk.scope = 'thread'
        and not exists (
          select 1 from content_blobs cb
          join content c on c.id = cb.content_id
          where cb.blob_id = bk.blob_id and c.thread_id = bk.scope_id
        )
    `.execute(trx);
    const orphaned = await trx
      .updateTable("blobs")
      .set({ deleted_at: sql`now()`, purge_after: sql`now()` })
      .where("deleted_at", "is", null)
      .where("message_id", "is", null)
      .where("created_at", "<", sql<Date>`now() - interval '1 hour'`)
      .where((eb) =>
        eb.not(eb.exists(eb.selectFrom("content_blobs").select("blob_id").whereRef("content_blobs.blob_id", "=", "blobs.id"))),
      )
      .returning("id")
      .execute();
    const dueBlobs = await trx
      .selectFrom("blobs")
      .select(({ fn }) => fn.countAll<string>().as("n"))
      .where(due)
      .executeTakeFirstOrThrow();
    if (orphaned.length > 0 || Number(dueBlobs.n) > 0) {
      await enqueue({ kind: "blob.purge", payload: {}, priority: PRIORITY.background, tx: trx });
    }
}

/** The R2 delete for every blob past its purge clock, then the row.
 *
 *  Outside any transaction, one blob at a time, the object first: a row that
 *  outlives a failed delete is retried next run, while an object that outlives
 *  a deleted row is ciphertext nobody can open and nothing will ever remove.
 *  Same ceiling discipline as `contentPurge`. */
const blobPurge: Handler = async () => {
  const store = objectStore();
  if (!store) return;
  // 021. A row whose transcript is still held at the provider is not purged
  // until it is forgotten there: the reference is the only handle we have,
  // and an Undo inside the forget's own retry window would otherwise destroy
  // it and leave the words at the provider for their thirty-day default.
  // The forget is asked for again here; the `forgotten` route nulls the
  // reference and the next pass takes the row.
  const held = await db
    .selectFrom("blobs")
    .select("id")
    .where("deleted_at", "is not", null)
    .where("purge_after", "<", sql<Date>`now()`)
    .where("provider_ref", "is not", null)
    .limit(PURGE_CEILING)
    .execute();
  for (const blob of held) {
    await enqueue({
      kind: "voice.forget",
      payload: { blobId: blob.id },
      priority: PRIORITY.background,
      idempotencyKey: `voice.forget:${blob.id}:purge:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  const due = await db
    .selectFrom("blobs")
    .select("id")
    .where("deleted_at", "is not", null)
    .where("purge_after", "is not", null)
    .where("purge_after", "<", sql<Date>`now()`)
    .where("provider_ref", "is", null)
    .limit(PURGE_CEILING)
    .execute();
  if (due.length === 0) return;
  if (due.length >= PURGE_CEILING) {
    throw new Error(`blob purge ceiling reached: ${due.length} due, ceiling ${PURGE_CEILING}`);
  }
  for (const blob of due) {
    await store.remove(RENDITIONS.map((rendition) => objectKey(blob.id, rendition)));
    await db.deleteFrom("blobs").where("id", "=", blob.id).execute();
  }
  console.log(JSON.stringify({ level: "info", msg: "blobs purged", removed: due.length }));
};

/** Turn a place name into a point on a map, out of band.
 *
 *  A job rather than part of the tool call, so a dump is never held up by a
 *  third party and a provider that is down produces a location with a name and
 *  no pin rather than a failed answer.
 *
 *  **The payload carries an id and nothing else.** A payload is the thing that
 *  ends up in a log line when somebody debugs the queue, and a place name taken
 *  out of a dump is content (OFF-1). The log line here is the same: ids,
 *  outcome and latency, never the query, which is precisely the thing you would
 *  reach for while debugging a geocoder. */
const locationResolve: Handler = async (payload) => {
  const contentId = String(payload["contentId"] ?? "");
  if (!contentId) throw new Error("location.resolve job has no contentId");

  const started = Date.now();
  const outcome = await resolvePlace(contentId);

  // An enum and two numbers. `provider_error` is not retried by throwing: an
  // unresolved location is a normal permanent state and the row is already
  // safe, so failing the job would buy retries for something nobody is waiting
  // on.
  console.log(
    JSON.stringify({
      level: "info",
      msg: "location resolved",
      content_id: contentId,
      outcome,
      latency_ms: Date.now() - started,
    })
  );
};

/** One connection's sync. 012.
 *
 *  The next tick is scheduled **before** the work, not after it, so a run that
 *  fails five times and dies does not take the whole chain with it. See
 *  `connectors/sync.ts` for the two silent ways this stops otherwise. */
const calendarSync: Handler = async (payload) => {
  const connectionId = String(payload["connectionId"] ?? "");
  if (!connectionId) throw new Error("calendar.sync job has no connectionId");

  await scheduleNextSync(connectionId);

  const started = Date.now();
  const outcome = await syncConnection(connectionId, payload["full"] === true);

  // Counts and outcomes. Nothing from anybody's calendar (OFF-1), and the
  // schema beside this event name is what holds that rather than the runtime
  // heuristic, which a short title would walk straight past.
  await emit({
    name: "calendar_sync_completed",
    properties: { ...outcome, latency_ms: Date.now() - started },
  }).catch(() => undefined);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "calendar synced",
      connection_id: connectionId,
      ...outcome,
      latency_ms: Date.now() - started,
    })
  );
};

/** The only thing that would notice a sync chain that broke in a way nobody
 *  predicted. */
const calendarSupervise: Handler = async () => {
  await scheduleDaily("calendar.supervise");
  const restarted = await superviseSyncs();
  // 019. The nightly full pass, which 012 specified and never enqueued: the
  // calendar list, the colours, the participant counts, reconciliation by
  // absence and the window all ride on it.
  const full = await scheduleFullSyncs();
  console.log(JSON.stringify({ level: "info", msg: "calendar supervise", restarted, full }));
};

/** `jobs` is the one growing table nothing swept.
 *
 *  Every other table that grows carries `purge_after` and is swept by
 *  `content.purge`. A sync every fifteen minutes per connection is about thirty
 *  five thousand rows a year each, and this is the first job in the product
 *  that runs forever. */
const jobsPurge: Handler = async () => {
  await scheduleDaily("jobs.purge");
  // 024. Activity keeps thirty days, the invite expiry's figure.
  await purgeActivity();
  // 025. A deleted label and a sort's record keep the same thirty.
  await purgeLabels();
  await purgeLabelRuns();
  // 027. A calendar proposal nobody can answer any more.
  const proposals = await forgetPendingWrites();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await db
    .deleteFrom("jobs")
    .where("state", "in", ["done", "dead"])
    .where("updated_at", "<", cutoff)
    .executeTakeFirst();

  // The other tables that exist for us and grow with every request, each
  // kept only as long as something reads it: the waitlist limiter reads a
  // day, the lookup cap an hour, and a session or a verification past its
  // expiry is read by nothing. Windows with a margin, so a clock a little
  // behind never deletes a row a limiter is still counting.
  const attempts = await db
    .deleteFrom("waitlist_attempts")
    .where(sql<boolean>`created_at < now() - interval '2 days'`)
    .executeTakeFirst();
  const lookups = await db
    .deleteFrom("people_lookups")
    .where(sql<boolean>`looked_up_at < now() - interval '1 day'`)
    .executeTakeFirst();
  const sessions = await db
    .deleteFrom("sessions")
    .where(sql<boolean>`expires_at < now() - interval '1 day'`)
    .executeTakeFirst();
  const verifications = await db
    .deleteFrom("verifications")
    .where(sql<boolean>`expires_at < now() - interval '1 day'`)
    .executeTakeFirst();

  console.log(
    JSON.stringify({
      level: "info",
      msg: "jobs purged",
      removed: Number(result.numDeletedRows ?? 0),
      attempts: Number(attempts.numDeletedRows ?? 0),
      lookups: Number(lookups.numDeletedRows ?? 0),
      sessions: Number(sessions.numDeletedRows ?? 0),
      verifications: Number(verifications.numDeletedRows ?? 0),
      proposals,
    })
  );
};

/** The product events outbox, out of the database on a clock.
 *
 *  Every unshipped event goes to the store as one file of JSON lines, keyed by
 *  the day and the first event's id, and is marked shipped in the same run.
 *  Shipped rows are dropped thirty days after they arrived, the window the
 *  privacy page gives for data that exists for us. Without a store there is
 *  nowhere to ship to and nothing is dropped, so no event is lost to a
 *  missing variable. The rows are pseudonymous by construction (`analytics.ts`
 *  refuses content), which is why the file is written as it is rather than
 *  through the blob path's sealing. */
const analyticsShip: Handler = async () => {
  await scheduleDaily("analytics.ship");
  const store = objectStore();
  let shipped = 0;
  if (store) {
    const rows = await db
      .selectFrom("analytics_events")
      .selectAll()
      .where("shipped_at", "is", null)
      .orderBy("id")
      .limit(10_000)
      .execute();
    if (rows.length > 0) {
      const key = `analytics/${new Date().toISOString().slice(0, 10)}/${rows[0]!.id}.ndjson`;
      const lines = rows.map((row) =>
        JSON.stringify({
          id: row.id,
          name: row.name,
          version: row.version,
          occurred_at: row.occurred_at,
          received_at: row.received_at,
          anonymous_id: row.anonymous_id,
          subject_id: row.subject_id,
          session_id: row.session_id,
          source: row.source,
          platform: row.platform,
          properties: row.properties,
        }),
      );
      await store.put(key, Buffer.from(`${lines.join("\n")}\n`, "utf8"));
      await db
        .updateTable("analytics_events")
        .set({ shipped_at: sql`now()` })
        .where("id", "in", rows.map((row) => row.id))
        .execute();
      shipped = rows.length;
    }
  }
  const dropped = await db
    .deleteFrom("analytics_events")
    .where("shipped_at", "is not", null)
    .where(sql<boolean>`received_at < now() - interval '30 days'`)
    .executeTakeFirst();
  console.log(
    JSON.stringify({ level: "info", msg: "analytics shipped", shipped, dropped: Number(dropped.numDeletedRows ?? 0) })
  );
};

/** Find what still needs embedding and enqueue it, then book the next sweep.
 *
 *  The rows themselves are embedded by the Python worker: the client, the
 *  chunker and the model constant all live there, and a second implementation
 *  in TypeScript is the drift the two-plane split already pays for once. */
const embedSweep: Handler = async () => {
  // No event and no bespoke log line: the runner already records every job's
  // kind and outcome, and a sweep is operational rather than something a
  // person did. Nothing here could carry content even by accident.
  await sweepEmbeds();
};

/** The daily job, fanned out per account.
 *
 *  One row per account with something to work on, rather than one job that
 *  walks every account: a per-account job retries on its own, fails on its own,
 *  and shows up in the queue as the account it belongs to. The idempotency key
 *  is the account and the day, so a restart or a second instance collapses into
 *  the row that already exists.
 *
 *  **Accounts with no activity are skipped.** There is nothing to compact on a
 *  thread nobody has touched, and waking every account that ever existed is the
 *  shape that gets expensive quietly.
 */
const accountDaily: Handler = async () => {
  await scheduleDaily("account.daily");

  const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const accounts = await db
    .selectFrom("accounts")
    .select("id")
    .where("state", "=", "active")
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("thread_members")
          .innerJoin("threads", "threads.id", "thread_members.thread_id")
          .select("threads.id")
          .whereRef("thread_members.account_id", "=", "accounts.id")
          .where("thread_members.state", "=", "accepted")
          .where("threads.deleted_at", "is", null)
          .where((inner) =>
            inner.or([
              inner("threads.last_activity_at", ">=", since),
              // **Over the budget is its own reason to run.** Activity alone
              // was the gate until the review found what it misses: a thread
              // goes over a hundred, the account goes quiet, and nothing ever
              // comes back for it. AC-8 has no carve-out for a dormant
              // account, and neither does this.
              inner(
                inner
                  .selectFrom("notes")
                  .select(({ fn }) => fn.countAll<number>().as("n"))
                  .whereRef("notes.subject_id", "=", "threads.id")
                  .where("notes.scope", "=", "thread")
                  .where("notes.deleted_at", "is", null)
                  .where("notes.superseded_at", "is", null),
                ">",
                NOTE_PROMPT_BUDGET
              ),
            ])
          )
      )
    )
    .execute();

  const day = new Date().toISOString().slice(0, 10);
  for (const account of accounts) {
    await enqueue({
      kind: "account.daily.run",
      accountId: account.id,
      payload: {},
      priority: PRIORITY.background,
      idempotencyKey: `account.daily.run:${account.id}:${day}`,
      maxAttempts: 3,
    });
  }

  console.log(
    JSON.stringify({ level: "info", msg: "daily fanned out", accounts: accounts.length })
  );
};

/** One account's day.
 *
 *  032. One nightly pass per thread this member needs one in, and nothing
 *  else that reads their threads: the pass keeps their notes true, learns from
 *  what they dumped into the thread that day, and on their default thread
 *  suggests threads. Today generation and thread compaction land here as they
 *  are built.
 *
 *  A thread needs a pass when a note this member wrote there changed in the
 *  day, when it holds more notes than the prompt carries, or when something
 *  they dumped landed in it. The last is what makes learning possible; the
 *  first two are 014's, and how a contradiction written this morning gets
 *  resolved tonight rather than in a fortnight.
 */
const accountDailyRun: Handler = async (_payload, _deps, accountId) => {
  if (!accountId) throw new Error("account.daily.run has no account");

  const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const account = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  const defaultThread = account?.default_thread_id ?? null;

  const needs = (eb: ExpressionBuilder<Database, "threads" | "thread_members">) =>
    eb.or([
      eb.exists(
        eb
          .selectFrom("notes")
          .select("notes.id")
          .whereRef("notes.subject_id", "=", "threads.id")
          .where("notes.scope", "=", "thread")
          .where("notes.account_id", "=", accountId)
          .where("notes.deleted_at", "is", null)
          .where("notes.superseded_at", "is", null)
          .where("notes.updated_at", ">=", since)
      ),
      // Counted as a number, not as text. `count` comes back as a string in
      // the driver, and comparing it as one makes "100" smaller than "20".
      eb(
        eb
          .selectFrom("notes")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .whereRef("notes.subject_id", "=", "threads.id")
          .where("notes.scope", "=", "thread")
          .where("notes.deleted_at", "is", null)
          .where("notes.superseded_at", "is", null),
        ">",
        NOTE_PROMPT_BUDGET
      ),
      eb.exists(
        eb
          .selectFrom("messages")
          .innerJoin("content", "content.derived_from_message_id", "messages.id")
          .select("messages.id")
          .whereRef("content.thread_id", "=", "threads.id")
          .where("content.deleted_at", "is", null)
          .where("messages.account_id", "=", accountId)
          .where("messages.role", "=", "person")
          .where("messages.created_at", ">=", since)
      ),
    ]);

  const threads = await db
    .selectFrom("threads")
    .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
    .select(["threads.id as id"])
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .where(needs)
    .execute();

  // 028. The sweep of what nobody can undo any more, then whether the default
  // thread has something new for proposals to read.
  await sweepSuggestions(accountId);
  const propose = defaultThread ? await shouldPropose(accountId) : false;

  const day = new Date().toISOString().slice(0, 10);
  const book = (threadId: string, withProposals: boolean) =>
    enqueue({
      kind: "thread.nightly",
      accountId,
      payload: { threadId, propose: withProposals },
      priority: PRIORITY.background,
      idempotencyKey: `thread.nightly:${threadId}:${accountId}:${day}`,
      maxAttempts: 2,
    });

  let booked = 0;
  for (const thread of threads) {
    if (thread.id === defaultThread) continue;
    await book(thread.id, false);
    booked += 1;
  }
  if (defaultThread && (propose || threads.some((thread) => thread.id === defaultThread))) {
    await book(defaultThread, propose);
    booked += 1;
  }

  // Counts, never text.
  console.log(JSON.stringify({ level: "info", msg: "daily run", passes: booked }));
};

/** 020. Name the town a photo was taken in, from its rounded coordinate.
 *  Ids only in the payload and the log line; the coordinate never leaves the
 *  row except rounded, and never reaches a log at all. */
const blobLocate: Handler = async (payload) => {
  const blobId = String(payload["blobId"] ?? "");
  if (!blobId) throw new Error("blob.locate job has no blobId");
  const outcome = await locateBlob(blobId);
  console.log(JSON.stringify({ level: "info", msg: "blob located", blobId, outcome }));
};

/** The photo chain's daily tick.
 *
 *  Two things `content.purge` cannot be relied on for, because it runs only
 *  when something is deleted: an upload nobody sent on a day nobody deleted
 *  anything, which the sweep it triggers takes care of; and the towns for
 *  photos uploaded before `GOOGLE_MAPS_API_KEY` was set, which `blob.locate`
 *  is enqueued for only at rendition time. With the key set, up to
 *  `LOCATE_BACKFILL` blobs a day whose rounded pair is not yet in the cache
 *  get a job, keyed on the blob and the day so a pending one is never
 *  doubled and a provider that was down is asked again tomorrow. A pair
 *  the provider could not name is in the cache with no town and is not
 *  asked about again. Ids only, in the payload and the log. */
const LOCATE_BACKFILL = 200;
/** 022. One sweep a day over the people tables, and 027's put-off cards
 *  whose day has passed. */
const peopleDaily: Handler = async () => {
  await scheduleDaily("people.daily");
  await sweepPeople();
  await sweepPutOffs();
};

// 024. The hourly placer, and the digest it places.
const digestSchedule: Handler = async () => {
  await scheduleHourly("digest.schedule");
  const placed = await scheduleDigests();
  console.log(JSON.stringify({ level: "info", msg: "digests placed", placed }));
};

const accountDigest: Handler = async (payload, _deps, accountId) => {
  if (!accountId) return;
  const send = payload["send"] === "evening" ? "evening" : ("morning" as Send);
  const day = String(payload["day"] ?? "");
  const at = new Date(String(payload["at"] ?? ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(at.getTime())) return;
  const outcome = await runDigest(accountId, send, day, at);
  console.log(JSON.stringify({ level: "info", msg: "digest", send, outcome }));
};

const pushReceipts: Handler = async (payload) => {
  const tickets = Array.isArray(payload["tickets"]) ? (payload["tickets"] as { id: string; tokenId: string }[]) : [];
  await readReceipts(tickets);
};

const peopleNotify: Handler = async (payload) => {
  await notifyPerson(payload as { kind: "request"; requestId: string } | { kind: "share"; memberId: string });
};

const sharedActivity: Handler = async (payload) => {
  await notifySharedActivity(payload as { threadId: string; authorId: string; since: string });
};

const blobDaily: Handler = async () => {
  await scheduleDaily("blob.daily");
  await enqueue({ kind: "content.purge", payload: {}, priority: PRIORITY.background });
  // 021. A provider reference still held an hour after submission is one a
  // dead worker, an undone turn or a parked job left behind; the delete is
  // asked for again. Keyed on the blob, not the message, since the blob may
  // outlive it. The idempotency key includes the day so a reference that
  // survives a day's attempts is asked about again tomorrow.
  const held = await db
    .selectFrom("blobs")
    .select("id")
    .where("provider_ref", "is not", null)
    .where("created_at", "<", sql<Date>`now() - interval '1 hour'`)
    .limit(PURGE_CEILING)
    .execute();
  for (const blob of held) {
    await enqueue({
      kind: "voice.forget",
      payload: { blobId: blob.id },
      priority: PRIORITY.background,
      idempotencyKey: `voice.forget:${blob.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  if (!reverseGeocodingOn()) return;
  const due = await db
    .selectFrom("blobs")
    .select("id")
    .where("deleted_at", "is", null)
    .where("renditions_at", "is not", null)
    .where("latitude", "is not", null)
    .where("longitude", "is not", null)
    .where("town", "is", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("place_reverse")
            .select("lat")
            .whereRef("place_reverse.lat", "=", sql`round(blobs.latitude::numeric, 3)`)
            .whereRef("place_reverse.lng", "=", sql`round(blobs.longitude::numeric, 3)`),
        ),
      ),
    )
    .orderBy("created_at", "desc")
    .limit(LOCATE_BACKFILL)
    .execute();
  const day = new Date().toISOString().slice(0, 10);
  for (const blob of due) {
    await enqueue({
      kind: "blob.locate",
      payload: { blobId: blob.id },
      priority: PRIORITY.background,
      idempotencyKey: `blob.locate:${blob.id}:${day}`,
    });
  }
  console.log(JSON.stringify({ level: "info", msg: "blob locate backfill", enqueued: due.length }));
};

export const handlers: Record<string, Handler> = {
  "account.daily": accountDaily,
  "account.daily.run": accountDailyRun,
  "embed.sweep": embedSweep,
  "calendar.sync": calendarSync,
  "calendar.supervise": calendarSupervise,
  "jobs.purge": jobsPurge,
  "email.waitlist_joined": waitlistJoined,
  "email.invited": invited,
  "content.purge": contentPurge,
  "location.resolve": locationResolve,
  "blob.purge": blobPurge,
  "blob.locate": blobLocate,
  "blob.daily": blobDaily,
  "people.daily": peopleDaily,
  "analytics.ship": analyticsShip,
  "digest.schedule": digestSchedule,
  "account.digest": accountDigest,
  "push.receipts": pushReceipts,
  "people.notify": peopleNotify,
  "shared.activity": sharedActivity,
};

