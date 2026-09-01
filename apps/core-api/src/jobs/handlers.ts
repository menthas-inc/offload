// What each job kind actually does.
//
// Handlers are pure of transport concerns: claiming, retrying, backoff and
// scrubbing live in the runner. A handler does the work or throws.

import { db } from "../db.js";
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

export const handlers: Record<string, Handler> = {
  "email.waitlist_joined": waitlistJoined,
  "email.invited": invited,
};
