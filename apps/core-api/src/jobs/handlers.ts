// What each job kind actually does.
//
// Handlers are pure of transport concerns: claiming, retrying, backoff and
// scrubbing live in the runner. A handler does the work or throws.

import { runOwn, scheduleOwn } from "../notifications/own.js";
import { sweepMemories } from "../memories/store.js";
import { layoutMemories } from "../memories/layout.js";
import { passOwed } from "../memories/pass.js";
import { shouldPropose, sweepSuggestions } from "../loose/propose.js";
import { sql, type ExpressionBuilder, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { NOTE_PROMPT_BUDGET, deleteNotesForThread } from "../threads/notes.js";
import { memoryEvent } from "../memories/calendar.js";
import { locateCalendar, refreshPlace, resolvePlace } from "../places/resolve.js";
import { agePlaces } from "../places/age.js";
import { backfillMaps } from "../places/backfill.js";
import { locateBlob, reverseGeocodingOn } from "../places/reverse.js";
import { objectKey, objectStore, RENDITIONS } from "../blobs/store.js";
import type { Mailer } from "../mail/index.js";
import { env } from "../env.js";
import { scheduleFullSyncs, scheduleNextSync, superviseSyncs, syncConnection } from "../connectors/sync.js";
import { buildCopy } from "../exports/build.js";
import { destroyParts, removeParts } from "../exports/copy.js";
import { enqueue, PRIORITY, scheduleDaily, scheduleHourly } from "./queue.js";
import { databaseNow } from "./clock.js";
import { JobError } from "./errors.js";
import { purgeActivity } from "../notifications/activity.js";
import { forgetPendingWrites } from "../connectors/tool-calls.js";
import { purgeLabelRuns, purgeLabels } from "../threads/labels.js";
import { runDigest, scheduleDigests, readReceipts, type Send } from "../notifications/digest.js";
import { notifyPerson, notifySharedActivity } from "../notifications/people.js";
import { emit } from "../analytics.js";
import { revoke } from "../connectors/google.js";
import { open as openSecret, openOrNull } from "../connectors/vault.js";
import { sweepEmbeds } from "../search/sweep.js";
import { sweepPeople } from "../people/people.js";
import { sweepPutOffs } from "../today/needs.js";
import { inBackground, worksInBackground } from "../accounts/active.js";
import { platformCapReached } from "../budget.js";
import { setting } from "../settings.js";
import { healthHandlers } from "../health/jobs.js";
import { deleteAccount, LastOwner } from "../accounts/delete.js";
import { audit } from "../admin/audit.js";
import { billingHandlers } from "../billing/jobs.js";
import { archivePassed, setAsidePassedNotes } from "../threads/passed.js";

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

  // Claim the send before making it. If the send then fails in a way that may
  // have landed, the job retries and finds nothing to claim, which loses one
  // email; sending twice to someone who did not ask is the worse failure of
  // the two. A send the mail company refused gives the claim back.
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
  }).catch((error: unknown) => giveBack(error, accountId, "waitlist_email_sent_at"));
};

/** A send the mail company answered with a refusal did not land, so its claim
 *  goes back and the retry sends it. Any other failure may have landed, and
 *  keeps the claim. */
async function giveBack(error: unknown, accountId: string, column: "waitlist_email_sent_at" | "invite_email_sent_at"): Promise<never> {
  if (error instanceof JobError && error.code === "mail_failed") {
    await db.updateTable("accounts").set({ [column]: null }).where("id", "=", accountId).execute();
  }
  throw error;
}

/** The invite. The one email in this product that someone is waiting for, so
 *  it is the one that carries a link rather than only news.
 *
 *  Claimed the same way as the waitlist confirmation, and for the same reason:
 *  the queue's idempotency key prevents a second enqueue, not a second send by
 *  a job that retried after the mailer succeeded and the acknowledgement did
 *  not. */
const invited: Handler = async (payload, { mailer }, accountId) => {
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

  // A job queued before promotion said where the address came from was a
  // waitlist promotion: that was the only invite there was.
  const fromWaitlist = (payload as { fromWaitlist?: boolean }).fromWaitlist !== false;
  const site = new URL(env.WEB_URL).host;

  await mailer.send({
    to: claimed.email,
    subject: "Welcome to offload",
    slots: {
      headline: "Let's get you started",
      body:
        `You've been invited to try offload. You can sign in with your email address ${claimed.email} ` +
        "using Google or Apple and start using offload!",
      bold: claimed.email,
      badges: [
        { url: "https://apps.apple.com/app/id6814795746", image: `${env.WEB_URL}/brands/app-store.png`, alt: "Download on the App Store" },
        { url: `${env.WEB_URL}/sign-in`, image: `${env.WEB_URL}/brands/open-in-browser.png`, alt: "Open in browser" },
      ],
      footer: fromWaitlist
        ? `You are receiving this because you joined the offload waitlist at ${site}.`
        : "You are receiving this because the team at offload wanted you to try it.",
    },
  }).catch((error: unknown) => giveBack(error, accountId, "invite_email_sent_at"));
};

/** "3 October 2026 at 18:34 UTC", in the account's zone when it had one. A
 *  zone the runtime does not know falls back to UTC rather than failing the
 *  one mail that cannot be sent again. */
function deletedWhen(at: Date, zone: string | null): string {
  const say = (timeZone: string): string => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).formatToParts(at);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("day")} ${part("month")} ${part("year")} at ${part("hour")}:${part("minute")} ${part("timeZoneName")}`;
  };
  try {
    return say(zone ?? "UTC");
  } catch {
    return say("UTC");
  }
}

/** 035. The notice that an account was deleted.
 *
 *  The address comes from the payload: the account is gone, so there is no row
 *  to read it from, and nothing else about the person is in the job. */
const accountDeleted: Handler = async (payload, { mailer }) => {
  const id = typeof payload["id"] === "string" ? payload["id"] : null;
  const sealed = typeof payload["to"] === "string" ? payload["to"] : null;
  if (!id || !sealed) throw new Error("account_deleted job has no address");
  const to = openSecret(Buffer.from(sealed, "base64"), id, "notice_address");
  const at = typeof payload["at"] === "string" ? new Date(payload["at"]) : new Date();
  const zone = typeof payload["zone"] === "string" ? payload["zone"] : null;
  await mailer.send({
    to,
    subject: "Your offload account is deleted",
    slots: {
      headline: "Your account is deleted",
      body:
        `Your account was deleted on ${deletedWhen(at, zone)}. ` +
        "Everything only you could see is gone. What you added to a thread you shared stays with the people in it. " +
        "If this was not you, write to hello@offload.club.",
      footer: `You are receiving this because an offload account at ${new URL(env.WEB_URL).host} used this address.`,
    },
  });
  // Sent: the row keeps its kind and its outcome and loses the address.
  await db
    .updateTable("jobs")
    .set({ payload: sql`'{}'::jsonb` })
    .where("kind", "=", "email.account_deleted")
    .where(sql<boolean>`payload->>'id' = ${id}`)
    .execute();
};

/** 035. Somebody asked for a copy of everything the account can read. With
 *  no second sign-in, this mail is how its owner hears of one they did not
 *  ask for. The address is read here: the job row carries the time only. */
const exportRequested: Handler = async (payload, { mailer }, accountId) => {
  if (!accountId) return;
  const account = await db.selectFrom("accounts").select(["email", "time_zone"]).where("id", "=", accountId).executeTakeFirst();
  if (!account) return;
  const at = typeof payload["at"] === "string" ? new Date(payload["at"]) : new Date();
  await mailer.send({
    to: account.email,
    subject: "A copy of your offload was asked for",
    slots: {
      headline: "A copy was asked for",
      body:
        `A copy of everything in your account was asked for on ${deletedWhen(at, account.time_zone)}. ` +
        "It is downloaded from Settings while signed in, and it is kept for 7 days. " +
        "If this was not you, write to hello@offload.club.",
      footer: `You are receiving this because an offload account at ${new URL(env.WEB_URL).host} uses this address.`,
    },
  });
};

/** 035. Make the copy. The build never throws: a failure is a state on the
 *  row, which is what the person's screen reads. */
const exportBuild: Handler = async (payload) => {
  const exportId = typeof payload["exportId"] === "string" ? payload["exportId"] : null;
  if (exportId) await buildCopy(exportId);
};

/** 035. Take a copy's sealed parts out of storage. The payload is an id and
 *  a count: by the time this runs the row may be gone with its account. */
const exportDestroy: Handler = async (payload) => {
  const id = typeof payload["id"] === "string" ? payload["id"] : null;
  const parts = typeof payload["parts"] === "number" ? payload["parts"] : 0;
  if (id) await removeParts(id, parts);
};

/** A build still `making` after this long is not going to finish: the worker
 *  that held it restarted. The heaviest real one is minutes. */
const BUILD_HOURS = 2;

/** 035. The hourly pass: a copy past its seven days ends, and a build nobody
 *  is running is failed so the row stops saying it is being made. Books the
 *  next hour first. */
const exportSweep: Handler = async () => {
  await scheduleHourly("export.sweep");
  const ended = await db.transaction().execute(async (trx) => {
    const rows = await trx
      .updateTable("exports")
      .set({ state: "gone" })
      .where("state", "!=", "gone")
      .where(sql<boolean>`expires_at <= now()`)
      .returning(["id", "parts"])
      .execute();
    for (const row of rows) await destroyParts(trx, row.id, row.parts);
    return rows.length;
  });
  const stuck = await db.transaction().execute(async (trx) => {
    const rows = await trx
      .updateTable("exports")
      // The count stays: it is what the removal below is booked with, and
      // what any later end of this row books again.
      .set({ state: "failed", requested_at: null, expires_at: null })
      .where("state", "=", "making")
      .where(sql<boolean>`requested_at < now() - make_interval(hours => ${BUILD_HOURS})`)
      .returning(["id", "parts"])
      .execute();
    for (const row of rows) await destroyParts(trx, row.id, row.parts);
    return rows.length;
  });
  if (ended + stuck > 0) console.log(JSON.stringify({ level: "info", msg: "copies swept", ended, stuck }));
};

/** How long a grant waits for Google before it is dropped unrevoked. Our copy
 *  is the only thing that could use it, and that goes either way. */
const REVOCATION_DAYS = 7;

/** 035. Hand back the calendar grants of accounts that no longer exist.
 *
 *  One row per grant, sealed, naming nobody. A row goes when Google has taken
 *  the token back or when it is a week old; while any is left the job books
 *  itself again in an hour. */
const connectorRevoke: Handler = async () => {
  const dropped = await db
    .deleteFrom("pending_revocations")
    .where(sql<boolean>`created_at < now() - make_interval(days => ${REVOCATION_DAYS})`)
    .returning("id")
    .execute();
  // A grant given up on is still live at Google. Loud, so somebody looks.
  if (dropped.length > 0) {
    console.error(JSON.stringify({ level: "error", msg: "grants dropped unrevoked", dropped: dropped.length }));
  }
  const waiting = await db
    .selectFrom("pending_revocations")
    .select(["id", "sealed_token"])
    .where("unopenable_at", "is", null)
    .execute();
  let left = 0;
  let unopenable = 0;
  for (const row of waiting) {
    // S27. One that will not open under the key held now never will: marked
    // for a revoke by hand, and not tried again. A missing key still throws.
    const token = openOrNull(Buffer.from(row.sealed_token), row.id, "refresh_token");
    if (token === null) {
      unopenable += 1;
      await db.updateTable("pending_revocations").set({ unopenable_at: new Date() }).where("id", "=", row.id).execute();
      continue;
    }
    const done = await revoke(token).catch(() => false);
    if (done) {
      await db.deleteFrom("pending_revocations").where("id", "=", row.id).execute();
    } else {
      left += 1;
      await db
        .updateTable("pending_revocations")
        .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
        .where("id", "=", row.id)
        .execute();
    }
  }
  console.log(JSON.stringify({ level: "info", msg: "grants revoked", revoked: waiting.length - left - unopenable, waiting: left, unopenable }));
  // Keyed on the hour: every account deletion starts a run, and an unkeyed
  // re-arm made each of them a chain of its own.
  if (left > 0) await scheduleHourly("connector.revoke");
};

/** How much one run of a purge destroys before it books the next run.
 *
 *  A batch, not a brake (the owner, 2026-10-05). It used to be a ceiling: a
 *  run with more due than this deleted nothing and failed, on the grounds that
 *  a delete wanting that much was a bug. Deleting a thread now takes the
 *  messages its rows came from, and an account with thousands of photos is a
 *  real delete, so the count could not tell a big delete from a bad predicate
 *  and the halt stopped the purge for everyone. What guards the delete is the
 *  predicate, both conditions always, that only a delete or an Undo writes a
 *  `purge_after`, and the put back of any file a live row carries. A run that
 *  fails, R2 refusing say, retries and then dies, which is the dead-job alert. */
export const PURGE_BATCH = 500;

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
 *  - **A batch a run.** Up to `PURGE_BATCH` from each table, and a run that
 *    filled a batch books the next one, so a delete of any size completes.
 *  - **One transaction a run**, content and notes before messages, and
 *    messages only in a run that left no due content or note behind, so a
 *    crash mid-purge cannot leave a message whose content is already gone. */
const contentPurge: Handler = async () => {
  await db.transaction().execute(async (trx) => {
    const due = sql<boolean>`deleted_at is not null and purge_after is not null and purge_after < now()`;

    // **A folded note is the one row here that is due without being deleted.**
    // 014's daily job sets a note aside rather than destroying it, and gives
    // offload's own thirty days of history before it goes. A person's thread
    // note carries no `purge_after`, so this never matches one however old it
    // is. An account-scope memory is different: any replaced one goes thirty
    // days later whoever wrote it, the person's own included, because the
    // privacy policy's section 13 says so (memories/pass.ts sets the date).
    const folded = sql<boolean>`deleted_at is null and superseded_at is not null
      and purge_after is not null and purge_after < now()`;

    /** One batch from one table. True when it was full, so more may be due. */
    const batch = async (table: "content" | "notes" | "messages", when: typeof due): Promise<boolean> => {
      // 052. `turn_changes.target_id` is polymorphic and has no foreign key,
      // so a purged row's earlier values go with it here, by name.
      const result = await sql<{ id: string }>`
        with gone as (
          delete from ${sql.table(table)}
          where id in (select id from ${sql.table(table)} where ${when} limit ${PURGE_BATCH})
          returning id
        ), records as (delete from turn_changes where target_id in (select id from gone))
        select id from gone
      `.execute(trx);
      return result.rows.length >= PURGE_BATCH;
    };

    // Content first. `derived_from_message_id` is on delete set null, so the
    // other order would silently orphan a row from the message it came from
    // in the moment before it was deleted itself. Notes before messages for
    // the same reason, and the folded history that has run out its thirty days.
    let more = await batch("content", due);
    // 042. A send that named a forgotten memory goes with the memory, once
    // its Undo can no longer bring it back, and before the cascade would take
    // only the link and leave the words.
    await sql`
      delete from activity where id in (
        select m.activity_id from activity_memories m join notes n on n.id = m.note_id
         where n.deleted_at is not null and n.purge_after is not null and n.purge_after < now())
    `.execute(trx);
    more = (await batch("notes", due)) || more;
    more = (await batch("notes", folded)) || more;
    // A reminder dismissed on Today (2026-10-11) is about one day; a week
    // after that day the row is for nothing, so it goes.
    await sql`delete from reminder_dismissals where occurrence < to_char(now() - interval '7 days', 'YYYY-MM-DD')`.execute(trx);

    if (!more) {
      more = await batch("messages", due);

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
        .limit(PURGE_BATCH)
        .execute();
      for (const thread of deadThreads) {
        await deleteNotesForThread(thread.id, trx);
      }
      if (deadThreads.length > 0) {
        const ids = deadThreads.map((thread) => thread.id);
        await trx.deleteFrom("turn_changes").where("target_id", "in", ids).execute();
        await trx.deleteFrom("threads").where("id", "in", ids).execute();
      }
      more = more || deadThreads.length >= PURGE_BATCH;
    }

    // 020. Run whatever was due, so an upload nobody sent is not kept until
    // something else happens to be deleted.
    await sweepBlobs(trx, due);
    if (more) await enqueue({ kind: "content.purge", payload: {}, priority: PRIORITY.background, tx: trx });
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
 *  A batch a run, as `contentPurge`. */
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
    .limit(PURGE_BATCH)
    .execute();
  for (const blob of held) {
    await enqueue({
      kind: "voice.forget",
      payload: { blobId: blob.id },
      priority: PRIORITY.background,
      idempotencyKey: `voice.forget:${blob.id}:purge:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  // 036. A delete decides a photo goes; a live row in a live thread still
  // carrying it at this moment overrules that, and the photo is put back
  // rather than destroyed under a row that draws it. A thread's delete leaves
  // its rows live until the thread itself is purged, so a row in a deleted
  // thread is not one: putting those back would leave the files for good.
  await sql`
    update blobs b
    set deleted_at = null, purge_after = null
    where b.deleted_at is not null
      and b.purge_after < now()
      and exists (
        select 1 from content_blobs cb
        join content c on c.id = cb.content_id
        join threads t on t.id = c.thread_id
        where cb.blob_id = b.id and c.deleted_at is null and t.deleted_at is null
      )
  `.execute(db);
  const due = await db
    .selectFrom("blobs")
    .select("id")
    .where("deleted_at", "is not", null)
    .where("purge_after", "is not", null)
    .where("purge_after", "<", sql<Date>`now()`)
    .where("provider_ref", "is", null)
    .limit(PURGE_BATCH)
    .execute();
  if (due.length === 0) return;
  for (const blob of due) {
    await store.remove(RENDITIONS.map((rendition) => objectKey(blob.id, rendition)));
    await db.deleteFrom("blobs").where("id", "=", blob.id).execute();
  }
  console.log(JSON.stringify({ level: "info", msg: "blobs purged", removed: due.length }));
  // A full batch books the next run, so a delete of thousands of files
  // completes a batch at a time. After the work: a run that dies before this
  // line leaves the rest to the day's run.
  if (due.length >= PURGE_BATCH) await enqueue({ kind: "blob.purge", payload: {}, priority: PRIORITY.background });
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
  // 039. The review code limiter reads an hour.
  const codeAttempts = await db
    .deleteFrom("review_code_attempts")
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
  // A verification goes at its expiry, with no margin. Better Auth refuses
  // an expired one by its own clock, and nothing else reads the table. A
  // browser's sign-in keeps its OAuth state here, and with it any review
  // code that was typed (039), so an abandoned sign-in's code lasts until
  // this pass after its ten minutes, and no longer.
  const verifications = await db
    .deleteFrom("verifications")
    .where(sql<boolean>`expires_at < now()`)
    .executeTakeFirst();

  // 034. The admin panel's own tables, each to its window: a heartbeat and
  // an hour of history for ninety days, a refusal for thirty, and an audit
  // entry for two years, which is the one delete its table allows (0075).
  const heartbeats = await db.deleteFrom("heartbeats").where(sql<boolean>`minute < now() - interval '90 days'`).executeTakeFirst();
  const history = await db.deleteFrom("job_stats_hourly").where(sql<boolean>`hour < now() - interval '90 days'`).executeTakeFirst();
  const hits = await db.deleteFrom("limit_hits").where(sql<boolean>`day < (now() - interval '30 days')::date`).executeTakeFirst();
  const audits = await db.deleteFrom("staff_audit").where(sql<boolean>`at < now() - interval '2 years'`).executeTakeFirst();

  console.log(
    JSON.stringify({
      level: "info",
      msg: "jobs purged",
      removed: Number(result.numDeletedRows ?? 0),
      attempts: Number(attempts.numDeletedRows ?? 0),
      codeAttempts: Number(codeAttempts.numDeletedRows ?? 0),
      lookups: Number(lookups.numDeletedRows ?? 0),
      sessions: Number(sessions.numDeletedRows ?? 0),
      verifications: Number(verifications.numDeletedRows ?? 0),
      proposals,
      heartbeats: Number(heartbeats.numDeletedRows ?? 0),
      history: Number(history.numDeletedRows ?? 0),
      hits: Number(hits.numDeletedRows ?? 0),
      audits: Number(audits.numDeletedRows ?? 0),
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
  // 038. For every account, quiet ones too: what the privacy page says of a
  // memory whose source is gone holds whether or not they came back today.
  await sweepMemories();

  const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const accounts = await db
    .selectFrom("accounts")
    .select("id")
    .where(inBackground())
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
              // 032. A dated note of theirs that passed its date since their
              // last pass there is the one change no activity causes. Since the
              // last pass, as the run itself reads it, so a night this fan-out
              // missed loses nothing either.
              inner.exists(
                inner
                  .selectFrom("notes")
                  .select("notes.id")
                  .whereRef("notes.subject_id", "=", "threads.id")
                  .whereRef("notes.account_id", "=", "accounts.id")
                  .where("notes.scope", "=", "thread")
                  .where("notes.deleted_at", "is", null)
                  .where("notes.superseded_at", "is", null)
                  .where(
                    sql<boolean>`coalesce(notes.occurs_end_at, notes.occurs_at, notes.due_at)
                      between greatest(coalesce(thread_members.nightly_at, now() - interval '25 hours'), now() - interval '7 days')
                      and now()`,
                  )
              ),
              // 042. A thing of theirs no pass has labelled, or whose words
              // changed since: the one change a quiet account still owes.
              sql<boolean>`exists (select 1 from reminders_wanted(accounts.id, threads.id))`,
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
 *  A thread needs a pass only when something material changed since this
 *  member's last pass there: see `needs` below.
 */
/** 032. The most nightly passes one member gets in a night, beside their
 *  default thread's. */
export const NIGHTLY_THREADS = 10;

const accountDailyRun: Handler = async (_payload, _deps, accountId) => {
  if (!accountId) throw new Error("account.daily.run has no account");

  // 034. Disabled or marked for deletion since the fan-out booked this.
  if (!(await worksInBackground(accountId))) return;

  // 040. Where each memory sits on the map, once a day, from yesterday's
  // embeddings: the map moves overnight and never under someone reading it.
  await layoutMemories(accountId);

  const account = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  const defaultThread = account?.default_thread_id ?? null;

  // **Something material since this member's last pass here**, and nothing
  // else: a pass's own writes come before its stamp, so it never books the
  // next one; ticking or moving rows changes nothing a pass reads. In order:
  // a dump of theirs the pass may read landed; a note of theirs changed and
  // they hold two or more there (one has nothing to fold); a dated note of
  // theirs passed its date; a first pass on a thread over the budget; a row
  // they typed straight into a thread still open to a layout, which files no
  // dump; the one layout pass 0095 owes a thread with rows in it.
  // Thread layouts: offload may still suggest one, as the nightly result's guards say.
  const layoutOpen = sql`(threads.layout = 'default' and threads.layout_set_by = 'offload'
      and threads.layout_suggestion is null and threads.layout_suggestion_dismissed_at is null)`;
  const since = sql`greatest(coalesce(thread_members.nightly_at, now() - interval '25 hours'), now() - interval '7 days')`;
  const own = sql`(select count(*) from notes n where n.scope = 'thread' and n.subject_id = threads.id
      and n.account_id = ${accountId} and n.deleted_at is null and n.superseded_at is null)`;
  const needs = sql<boolean>`(
    exists (
      select 1 from messages m
       where m.account_id = ${accountId} and m.role = 'person'
         and m.source not in ('mail', 'gmail', 'calendar', 'browser')
         and not m.derived_from_untrusted and m.created_at > ${since}
         and (exists (select 1 from content c where c.derived_from_message_id = m.id
                       and c.thread_id = threads.id and c.deleted_at is null)
              or exists (select 1 from notes n where n.derived_from_message_id = m.id
                       and n.scope = 'thread' and n.subject_id = threads.id and n.deleted_at is null))
    )
    or (${own} >= 2 and exists (
      select 1 from notes n where n.scope = 'thread' and n.subject_id = threads.id
         and n.account_id = ${accountId} and n.deleted_at is null and n.superseded_at is null
         and n.updated_at > ${since}
    ))
    or exists (
      select 1 from notes n where n.scope = 'thread' and n.subject_id = threads.id
         and n.account_id = ${accountId} and n.deleted_at is null and n.superseded_at is null
         and coalesce(n.occurs_end_at, n.occurs_at, n.due_at) > ${since}
         and coalesce(n.occurs_end_at, n.occurs_at, n.due_at) <= now()
    )
    or exists (select 1 from reminders_wanted(${accountId}::uuid, threads.id))
    or (threads.id is distinct from ${defaultThread} and ${layoutOpen} and exists (
      select 1 from content c where c.thread_id = threads.id and c.account_id = ${accountId}
         and c.derived_from_message_id is null and c.deleted_at is null and c.created_at > ${since}
    ))
    or (threads.id is distinct from ${defaultThread} and threads.layout_pass_owed and ${layoutOpen}
      and exists (select 1 from content c where c.thread_id = threads.id and c.deleted_at is null))
    or (thread_members.nightly_at is null and ${own} >= 2 and (
      select count(*) from notes n where n.scope = 'thread' and n.subject_id = threads.id
         and n.deleted_at is null and n.superseded_at is null) > ${NOTE_PROMPT_BUDGET})
  )`;

  const owed = db
    .selectFrom("threads")
    .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
    .select(["threads.id as id"])
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .where(needs);
  // The most recently active first, and no more than the cap: a guardrail for
  // a member busy in many threads. A thread left over keeps everything it is
  // owed, since only a pass stamps it, and is read on a later night.
  const threads = await owed
    .where(sql<boolean>`threads.id is distinct from ${defaultThread}`)
    .orderBy("threads.last_activity_at", "desc")
    .limit(NIGHTLY_THREADS)
    .execute();
  const defaultOwed = defaultThread
    ? Boolean(await owed.where("threads.id", "=", defaultThread).executeTakeFirst())
    : false;

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

  // 034. Scheduled model work is not booked while the nightly switch is off or
  // the platform's cap is reached. Nothing is lost: a thread keeps what it is
  // owed until a pass stamps it, so the next night that may book does.
  const mayBook = (await setting("switch.nightly")) && !(await platformCapReached());

  let booked = 0;
  if (mayBook) {
    for (const thread of threads) {
      await book(thread.id, false);
      booked += 1;
    }
    if (defaultThread && (propose || defaultOwed)) {
      await book(defaultThread, propose);
      booked += 1;
    }
  }

  // 038. What offload knows about the person across their threads: one pass
  // when they said anything of their own since the last. Booked after the
  // thread passes and not waiting on them: it reads their notes as they are
  // when it runs.
  if (mayBook && (await passOwed(db, accountId))) {
    await enqueue({
      kind: "account.memories",
      accountId,
      payload: {},
      priority: PRIORITY.background,
      idempotencyKey: `account.memories:${accountId}:${day}`,
      maxAttempts: 2,
    });
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
  // From the top of the hour, not from when this runs: a pass that starts at
  // 11:20 would otherwise place nothing for 11:00 to 11:20. A slot placed a
  // little in the past runs at once, inside each send's own lateness bound,
  // and the keys collapse anything placed twice. The hour is the database's,
  // as `scheduleHourly`'s is.
  const hour = new Date(Math.floor((await databaseNow()).getTime() / 3_600_000) * 3_600_000);
  const placed = await scheduleDigests(hour);
  // 042. Reminders of their own falling in the same hour.
  const own = await scheduleOwn(hour);
  console.log(JSON.stringify({ level: "info", msg: "digests placed", placed, own }));
};

// 042. One reminder of its own, decided again when it runs.
const reminderOwn: Handler = async (payload, _deps, accountId) => {
  if (!accountId) return;
  const outcome = await runOwn(accountId, payload);
  console.log(JSON.stringify({ level: "info", msg: "reminder", outcome }));
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

/** The most blobs a day `blob.daily` asks a town for. */
const LOCATE_BACKFILL = 200;

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
    .limit(PURGE_BATCH)
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

/** 030. A place's coordinates fetched again, because a map wants a place
 *  whose thirty days had passed. The payload is the place's id and nothing
 *  else; the log line is the id and the outcome. */
const placesRefresh: Handler = async (payload) => {
  const placeId = String(payload["placeId"] ?? "");
  if (!placeId) throw new Error("places.refresh job has no placeId");
  const outcome = await refreshPlace(placeId);
  console.log(JSON.stringify({ level: "info", msg: "place refreshed", place_id: placeId, outcome }));
};

/** 030. Google's thirty days, by SQL alone, once a day. Tomorrow's run is
 *  armed first, so one failure does not stop the chain. Counts only. */
const placesAge: Handler = async () => {
  await scheduleDaily("places.age");
  const swept = await agePlaces();
  console.log(JSON.stringify({ level: "info", msg: "places aged", ...swept }));
};

/** 2026-10-17. What has passed archives itself, on the hour, since a day
 *  ends at a different hour in every zone. Counts only in the log. */
const contentPassed: Handler = async () => {
  await scheduleHourly("content.passed");
  const swept = await archivePassed();
  const notes = await setAsidePassedNotes();
  console.log(JSON.stringify({ level: "info", msg: "passed archived", ...swept, notes: notes.setAside }));
  // A batch at a time, as content.purge: the next one now while there is more.
  if (swept.more || notes.more) await enqueue({ kind: "content.passed", payload: {}, priority: PRIORITY.background });
};

/** 030. A calendar's event locations looked up, a batch at a time. Ids and
 *  counts in the log, never a location. */
const eventLocate: Handler = async (payload) => {
  const calendarId = String(payload["calendarId"] ?? "");
  if (!calendarId) throw new Error("event.locate job has no calendarId");
  const done = await locateCalendar(calendarId);
  console.log(JSON.stringify({ level: "info", msg: "calendar located", calendar_id: calendarId, ...done }));
};

/** 030. The one pass over what existed before the map. Counts only. */
const mapsBackfill: Handler = async () => {
  const booked = await backfillMaps();
  console.log(JSON.stringify({ level: "info", msg: "maps backfill booked", ...booked }));
};

/** 034. An account an owner marked, a day later.
 *
 *  The mark is read again here, so a cancel in between is a job that does
 *  nothing, and so is a mark that was moved. The audit entry is written
 *  after the delete rather than with it: `deleteAccount` owns its own
 *  transaction. Staff are named by the id the mark carried. */
const accountDelete: Handler = async (payload) => {
  const id = typeof payload.accountId === "string" ? payload.accountId : null;
  if (!id) throw new Error("account.delete job has no account");
  const marked = await db
    .selectFrom("accounts")
    .select(["delete_requested_by"])
    .where("id", "=", id)
    .where("delete_after", "<=", sql<Date>`now()`)
    .executeTakeFirst();
  if (!marked?.delete_requested_by) return;
  try {
    const { deleted } = await deleteAccount(id, { onlyIfMarked: true });
    if (!deleted) return;
  } catch (error) {
    if (!(error instanceof LastOwner)) throw error;
    // The routes refuse this; it can only be an owner who became the last
    // one during the hold. The mark goes and the account stays disabled.
    await db.updateTable("accounts").set({ delete_after: null, delete_requested_by: null }).where("id", "=", id).execute();
    console.error(JSON.stringify({ at: "account.delete", outcome: "refused", reason: "last_owner" }));
    return;
  }
  await audit(db, { staff: { accountId: marked.delete_requested_by }, kind: "deleted", targetAccountId: id });
};

export const handlers: Record<string, Handler> = {
  "account.delete": accountDelete,
  "account.daily": accountDaily,
  "account.daily.run": accountDailyRun,
  "embed.sweep": embedSweep,
  "calendar.sync": calendarSync,
  "calendar.supervise": calendarSupervise,
  "jobs.purge": jobsPurge,
  "email.waitlist_joined": waitlistJoined,
  "email.invited": invited,
  "email.account_deleted": accountDeleted,
  "connector.revoke": connectorRevoke,
  "email.export_requested": exportRequested,
  "export.build": exportBuild,
  "export.destroy": exportDestroy,
  "export.sweep": exportSweep,
  "content.purge": contentPurge,
  "location.resolve": locationResolve,
  "places.refresh": placesRefresh,
  "places.age": placesAge,
  "content.passed": contentPassed,
  "event.locate": eventLocate,
  "maps.backfill": mapsBackfill,
  "blob.purge": blobPurge,
  "blob.locate": blobLocate,
  "memory.event": (payload) => memoryEvent(payload as { noteId?: unknown; accountId?: unknown; action?: unknown; on?: unknown }),
  "blob.daily": blobDaily,
  "people.daily": peopleDaily,
  "analytics.ship": analyticsShip,
  "digest.schedule": digestSchedule,
  "account.digest": accountDigest,
  "reminder.own": reminderOwn,
  "push.receipts": pushReceipts,
  "people.notify": peopleNotify,
  "shared.activity": sharedActivity,
  // 034. Each section's own jobs, from the directory it owns, so adding one
  // does not mean editing this file.
  ...healthHandlers,
  ...billingHandlers,
};

