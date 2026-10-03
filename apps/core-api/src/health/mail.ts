// `email.alert`: what every owner is told when something goes wrong, and
// whenever staff do something that cannot be quietly undone (034, section 7).
//
// Two kinds of payload, one handler:
//   - a condition: `{ alert: "condition", condition, state }`, booked by
//     `alerts.ts`, one job per owner;
//   - a staff action: `{ alert: "staff.added" | ..., actorAccountId,
//     targetAccountId }`, booked by the route that did it, in its
//     transaction, as one job for nobody.
//
// **One email per owner, at most once.** A job that is not yet addressed
// fans out: one job per owner, in one transaction, each with a single
// attempt. The claim that stops a second send is the queue's own: taking the
// job uses its only attempt before the mailer is called, so a send that fails
// or a process that dies loses that one email and never repeats it. Losing
// one is the better of the two failures, as it is for the invite. The
// fan-out's keys carry the minute, so the first job running twice books
// nothing new.
//
// **What an alert carries.** A condition names a service or a job kind and
// nothing about anybody. A staff action names the staff member who did it, by
// name and address, and the account it was done to by id only. Every link is
// built from `env.WEB_URL`, never from a request. The shell is the one
// transactional template.

import { z } from "zod";
import { db } from "../db.js";
import { env } from "../env.js";
import { JobError } from "../jobs/errors.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import type { Handler } from "../jobs/handlers.js";
import type { EmailSlots } from "../mail/template.js";
import type { Executor } from "../threads/access.js";

/** Every staff action an owner is mailed about. */
export const STAFF_ALERTS = ["staff.added", "staff.role_changed", "staff.removed", "deletion.scheduled", "deletion.cancelled"] as const;

const conditionPayload = z.object({
  alert: z.literal("condition"),
  condition: z.string().min(1).max(120),
  /** `paused` is the tenth of the day: the alert itself, and the news that
   *  there will be no more until tomorrow. */
  state: z.enum(["opened", "cleared", "paused"]),
  /** On a paused alert, which of the two it would have been. */
  was: z.enum(["opened", "cleared"]).optional(),
});

const staffPayload = z.object({
  alert: z.enum(STAFF_ALERTS),
  actorAccountId: z.string().uuid(),
  targetAccountId: z.string().uuid(),
});

const payloadSchema = z.union([conditionPayload, staffPayload]);

export type AlertPayload = z.infer<typeof payloadSchema>;

/** Who did it, for a staff action. Null when the account has gone. */
export interface Actor {
  name: string | null;
  email: string;
}

const SERVICE_NAMES: Record<string, string> = {
  "core-api": "The Core API",
  worker: "The worker",
  web: "The web",
  database: "The database",
};

/** The two the Core API checks, and so the two it can only speak for. */
const CHECKED = new Set(["web", "database"]);

const PAUSED = "This is the tenth alert today, so alerts are paused until tomorrow.";

function conditionWords(condition: string, cleared: boolean): { headline: string; body: string } {
  const [name, detail = ""] = condition.split(/:(.*)/s);
  if (name === "platform_cap") {
    return {
      headline: "The platform cap is reached",
      body: "Every account is refused its next turn, and scheduled model work is not booked, until spend falls back under the cap.",
    };
  }
  if (name === "service_down") {
    const service = SERVICE_NAMES[detail] ?? "A service";
    if (cleared) {
      return { headline: `${service} is back`, body: CHECKED.has(detail) ? "The Core API reached it again." : "It is reporting again." };
    }
    return {
      headline: `${service} is down`,
      body: CHECKED.has(detail) ? "The Core API has not reached it for five minutes." : "It has not reported for five minutes.",
    };
  }
  if (name === "job_late") {
    return { headline: "A scheduled job is late", body: `${detail} has not run when it was due.` };
  }
  if (name === "job_dead") {
    return { headline: "A job died", body: "It ran out of attempts. Health lists it with its error code." };
  }
  if (name === "backup_late") {
    return { headline: "The backup is late", body: "No backup has finished in the last 26 hours." };
  }
  return { headline: "Something needs a look", body: "Health has the detail." };
}

function staffWords(alert: (typeof STAFF_ALERTS)[number], who: string, target: string): { headline: string; body: string } {
  switch (alert) {
    case "staff.added":
      return { headline: "Staff added", body: `${who} added account ${target} as staff.` };
    case "staff.role_changed":
      return { headline: "A staff role changed", body: `${who} changed the role of account ${target}.` };
    case "staff.removed":
      return { headline: "Staff removed", body: `${who} removed account ${target} from staff.` };
    case "deletion.scheduled":
      return {
        headline: "An account is marked for deletion",
        body: `${who} marked account ${target} for deletion. It is destroyed in 24 hours unless an owner cancels.`,
      };
    case "deletion.cancelled":
      return { headline: "A deletion was cancelled", body: `${who} cancelled the deletion of account ${target}. The account stays disabled.` };
  }
}

/** One alert as the mail it becomes. Pure, so every alert can be rendered and
 *  read by a test without a queue. */
export function renderAlert(payload: AlertPayload, actor: Actor | null): { subject: string; slots: EmailSlots } {
  const footer = `You are receiving this because you are an owner of offload at ${new URL(env.WEB_URL).host}.`;

  if (payload.alert === "condition") {
    const cleared = payload.state === "cleared" || (payload.state === "paused" && payload.was === "cleared");
    const words = conditionWords(payload.condition, cleared);
    return {
      subject: words.headline,
      slots: {
        headline: words.headline,
        body: payload.state === "paused" ? `${words.body} ${PAUSED}` : words.body,
        buttonLabel: "Open Health",
        buttonUrl: `${env.WEB_URL}/admin/health?range=24h`,
        footer,
      },
    };
  }

  const who = actor ? (actor.name ? `${actor.name} (${actor.email})` : actor.email) : "A staff member";
  const words = staffWords(payload.alert, who, payload.targetAccountId);
  return {
    subject: words.headline,
    slots: { headline: words.headline, body: words.body, buttonLabel: "Open Audit", buttonUrl: `${env.WEB_URL}/admin/audit`, footer },
  };
}

/** Every owner whose account is active: who an alert goes to. */
export async function owners(trx: Executor = db): Promise<Array<{ id: string; email: string }>> {
  return trx
    .selectFrom("staff")
    .innerJoin("accounts", "accounts.id", "staff.account_id")
    .select(["accounts.id as id", "accounts.email as email"])
    .where("staff.role", "=", "owner")
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .orderBy("accounts.id")
    .execute();
}

/** Book one owner's copy of an alert: theirs by the job's own account, one
 *  attempt, and ahead of scheduled work. */
export async function bookAlert(trx: Executor, ownerId: string, payload: AlertPayload, key: string): Promise<void> {
  await enqueue({
    kind: "email.alert",
    payload: { ...payload, addressed: true },
    accountId: ownerId,
    priority: PRIORITY.interactive,
    maxAttempts: 1,
    idempotencyKey: `${key}:${ownerId}`,
    tx: trx,
  });
}

export const emailAlert: Handler = async (raw, { mailer }, accountId) => {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new JobError("handler_error", "alert payload not understood");
  const payload = parsed.data;

  // Not yet addressed: one job per owner, together or not at all.
  if (raw["addressed"] !== true) {
    const about = payload.alert === "condition" ? `${payload.condition}:${payload.state}` : `${payload.actorAccountId}:${payload.targetAccountId}`;
    const key = `alert:${payload.alert}:${about}:${Math.floor(Date.now() / 60_000)}`;
    await db.transaction().execute(async (tx) => {
      for (const owner of await owners(tx)) await bookAlert(tx, owner.id, payload, key);
    });
    return;
  }

  // The row's account, never the payload's, and only while they are still an
  // owner: a job can wait, and a role can go while it does.
  const recipient = (await owners()).find((owner) => owner.id === accountId);
  if (!recipient) return;

  const actor =
    payload.alert === "condition"
      ? null
      : ((await db
          .selectFrom("accounts")
          .select(["display_name as name", "email"])
          .where("id", "=", payload.actorAccountId)
          .executeTakeFirst()) ?? null);

  const { subject, slots } = renderAlert(payload, actor);
  await mailer.send({ to: recipient.email, subject, slots });
};
