// What each job kind actually does.
//
// Handlers are pure of transport concerns: claiming, retrying, backoff and
// scrubbing live in the runner. A handler does the work or throws.

import { sql } from "kysely";
import { db } from "../db.js";
import { resolvePlace } from "../places/resolve.js";
import type { Mailer } from "../mail/index.js";
import { env } from "../env.js";

export type Handler = (payload: Record<string, unknown>, deps: { mailer: Mailer }) => Promise<void>;

/** The waitlist confirmation.
 *
 *  Gated on accounts.waitlist_email_sent_at so it sends once per account, ever.
 *  Rate limiting bounds request rate, not total sends over time or across
 *  addresses, so without this the endpoint mails a stranger's inbox as often as
 *  anyone cares to submit it. */
const waitlistJoined: Handler = async (payload, { mailer }) => {
  const accountId = String(payload["accountId"] ?? "");
  if (!accountId) throw new Error("waitlist_joined job has no accountId");

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
const invited: Handler = async (payload, { mailer }) => {
  const accountId = String(payload["accountId"] ?? "");
  if (!accountId) throw new Error("invited job has no accountId");

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
        .selectFrom("memories")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .where(due)
        .executeTakeFirstOrThrow(),
    ]);

    const total = Number(counts[0].n) + Number(counts[1].n) + Number(counts[2].n);
    if (total === 0) return;

    if (total > PURGE_CEILING) {
      // Counts only, and it throws rather than returning, so the job is
      // recorded as failed and shows up rather than passing quietly.
      throw new Error(`purge ceiling exceeded: ${total} rows due, ceiling ${PURGE_CEILING}`);
    }

    // Content first. `derived_from_message_id` is on delete set null, so the
    // other order would silently orphan a row from the message it came from
    // in the moment before it was deleted itself.
    await trx.deleteFrom("content").where(due).execute();
    // Memories before messages for the same reason content is: a memory's
    // `derived_from_message_id` is on delete set null, so the other order
    // orphans it from its source in the moment before it goes itself.
    await trx.deleteFrom("memories").where(due).execute();
    await trx.deleteFrom("messages").where(due).execute();
  });
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

export const handlers: Record<string, Handler> = {
  "email.waitlist_joined": waitlistJoined,
  "email.invited": invited,
  "content.purge": contentPurge,
  "location.resolve": locationResolve,
};
