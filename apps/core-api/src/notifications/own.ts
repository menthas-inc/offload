// 042. A reminder of its own: one notification shortly before something with
// a clock time, at 15, 30 or 60 minutes, or at the time itself for a row the
// person asked about.
//
// **Placed an hour ahead, decided when it runs.** The hourly pass finds the
// accounts with something timed in the next two hours, asks `plan()` which of
// their reminders fall in the coming hour, and enqueues one job each, keyed
// on the thing, the occurrence and the window so a restart or a second
// instance places it once. The job holds ids, a day and an instant and never
// a word (OFF-1); when it runs it reads the thing again and plans it again,
// and sends only if the same moment still comes out, so a tick, a moved date,
// a stop or a membership ended needs nothing cancelled.

import { sql } from "kysely";
import { CHANNEL_REMINDERS } from "@offload/widgets";
import { inBackground } from "../accounts/active.js";
import { emit, subjectOf } from "../analytics.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { record } from "./activity.js";
import { ownCopy } from "./copy.js";
import { GONE, PushFailed, push, type PushMessage } from "./push.js";
import { clockOf, placed } from "./reminders.js";

/** More than this past its moment, a reminder is dropped rather than sent:
 *  a reminder late is worse than none. */
export const OWN_LATE_MS = 15 * 60_000;
const HOUR_MS = 3_600_000;
const RECEIPTS_AFTER_SECONDS = 15 * 60;

export interface OwnPayload {
  of: "content" | "note";
  id: string;
  occurrence: string;
  at: string;
}

/** The accounts with a timed thing in the next two hours, or a repeating one,
 *  that want reminders and can be scheduled. */
async function accountsDue(now: Date): Promise<string[]> {
  const from = now.toISOString();
  const to = new Date(now.getTime() + 2 * HOUR_MS).toISOString();
  const result = await sql<{ id: string }>`
    select a.id from accounts a
     where a.notify_reminders and a.time_zone is not null and ${inBackground("a")}
       and (
         exists (select 1 from content c
                  where c.account_id = a.id and c.deleted_at is null and c.done_at is null
                    and c.archived_at is null and c.source_ref is null
                    and coalesce((c.attrs ->> 'all_day')::boolean, false) = false
                    and ((c.type = 'event' and c.occurs_at between ${from}::timestamptz and ${to}::timestamptz)
                         or (c.type <> 'event' and c.due_at between ${from}::timestamptz and ${to}::timestamptz)
                         or c.rrule is not null))
         or exists (select 1 from notes n
                     where n.account_id = a.id and n.scope = 'thread' and n.deleted_at is null
                       and coalesce((n.attrs ->> 'all_day')::boolean, false) = false
                       and (n.occurs_at between ${from}::timestamptz and ${to}::timestamptz or n.rrule is not null))
       )
  `.execute(db);
  return result.rows.map((row) => row.id);
}

/** The hourly pass: every reminder of its own in the coming hour, as a job. */
export async function scheduleOwn(now = new Date()): Promise<number> {
  let count = 0;
  for (const accountId of await accountsDue(now)) {
    const clock = await clockOf(accountId, now);
    if (!clock || !clock.on) continue;
    for (const { candidate, slot } of await placed(accountId, clock)) {
      if (slot.at !== "own" || candidate.of === "memory") continue;
      const lead = slot.instant.getTime() - now.getTime();
      if (lead < 0 || lead >= HOUR_MS) continue;
      const payload: OwnPayload = { of: candidate.of, id: candidate.id, occurrence: slot.occurrence, at: slot.instant.toISOString() };
      await enqueue({
        kind: "reminder.own",
        accountId,
        payload: payload as unknown as Record<string, unknown>,
        priority: PRIORITY.scheduled,
        runAfter: slot.instant,
        idempotencyKey: `reminder.own:${candidate.id}:${slot.occurrence}:${slot.window}`,
        maxAttempts: 2,
      });
      count += 1;
    }
  }
  return count;
}

export type OwnOutcome = "sent" | "gone" | "late" | "skipped_permission";

/** One reminder of its own, decided again and sent. */
export async function runOwn(accountId: string, raw: Record<string, unknown>, now = new Date()): Promise<OwnOutcome> {
  const payload = raw as unknown as OwnPayload;
  const at = new Date(payload.at);
  if (Number.isNaN(at.getTime())) return "gone";
  if (now.getTime() - at.getTime() > OWN_LATE_MS) {
    console.log(JSON.stringify({ level: "warn", msg: "reminder dropped, late", lateMs: now.getTime() - at.getTime() }));
    return "late";
  }
  const clock = await clockOf(accountId, now);
  if (!clock || !clock.on) return "gone";
  // Planned as of its own moment, which is what the hourly pass planned with.
  const again = (await placed(accountId, { ...clock, now: new Date(Math.min(now.getTime(), at.getTime())) })).find(
    ({ candidate, slot }) =>
      candidate.id === payload.id && slot.at === "own" && slot.occurrence === payload.occurrence && slot.instant.getTime() === at.getTime(),
  );
  if (!again || again.slot.at !== "own") return "gone";
  const { candidate, slot } = again;
  const copy = ownCopy(candidate.name, new Date(slot.instant.getTime() + slot.minutes * 60_000), slot.minutes, clock.zone);
  const where = { threadId: candidate.threadId, ...(candidate.of === "content" ? { contentId: candidate.id } : {}) };
  const subject = await subjectOf(accountId);

  const tokens = await db
    .selectFrom("push_tokens")
    .select(["id", "token"])
    .where("account_id", "=", accountId)
    .where("takes_reminders", "=", true)
    .execute();
  if (tokens.length === 0) {
    const id = await record(accountId, { kind: "reminder", sent: false, reason: "permission", ...copy, ...where });
    if (candidate.of === "note") await db.updateTable("activity").set({ note_id: candidate.id }).where("id", "=", id).execute();
    return "skipped_permission";
  }

  const data = { kind: "reminder", threadId: candidate.threadId, ...(candidate.of === "content" ? { contentId: candidate.id } : { noteId: candidate.id }) };
  const messages: PushMessage[] = tokens.map((one) => ({ to: one.token, title: copy.title, body: copy.body, data, channelId: CHANNEL_REMINDERS }));
  let tickets;
  try {
    tickets = await push().send(messages);
  } catch (error) {
    if (error instanceof PushFailed) {
      await emit({ name: "notification_failed", subjectId: subject, properties: { kind: "reminder", status: error.status, code: error.code } });
    }
    throw error;
  }
  const gone = tickets.filter((ticket) => !ticket.ok && ticket.code === GONE).map((ticket) => ticket.token);
  if (gone.length > 0) await db.deleteFrom("push_tokens").where("token", "in", gone).execute();
  const refused = tickets.find((ticket) => !ticket.ok && ticket.code !== GONE);
  if (refused && !refused.ok) {
    await emit({ name: "notification_failed", subjectId: subject, properties: { kind: "reminder", status: 200, code: refused.code } });
    throw new PushFailed(200, refused.code);
  }
  const idOf = new Map(tokens.map((one) => [one.token, one.id]));
  const delivered = tickets.flatMap((ticket) => (ticket.ok && idOf.has(ticket.token) ? [{ id: ticket.id, tokenId: idOf.get(ticket.token)! }] : []));
  if (delivered.length > 0) {
    await enqueue({
      kind: "push.receipts",
      accountId,
      payload: { tickets: delivered },
      priority: PRIORITY.background,
      runAfterSeconds: RECEIPTS_AFTER_SECONDS,
      idempotencyKey: `push.receipts:${accountId}:reminder:${payload.id}:${payload.occurrence}`,
    });
  }
  const id = await record(accountId, { kind: "reminder", sent: true, ...copy, ...where });
  if (candidate.of === "note") await db.updateTable("activity").set({ note_id: candidate.id }).where("id", "=", id).execute();
  await emit({ name: "reminder_sent", subjectId: subject, properties: { via: "own", long: 0, short: 0, day: 1 } });
  return "sent";
}
