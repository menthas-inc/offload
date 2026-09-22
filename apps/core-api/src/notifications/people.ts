// The people sends. 024.
//
// One person, one thread, when it happens, never batched into a digest. A
// connection request is announced once it is delivered; a share once the
// invitation is pending; somebody adding to a thread you share is coalesced
// per thread and person over ten minutes and composed at the moment of the
// send from the rows the recipient may still read, so a row deleted or a
// member taken out in those ten minutes is not announced. Nobody is told
// about their own additions.

import { emit } from "../analytics.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { record } from "./activity.js";
import { additionsCopy, requestCopy, shareCopy, type Copy } from "./copy.js";
import { GONE, PushFailed, push, type PushMessage } from "./push.js";

export const ADDITIONS_BUCKET_SECONDS = 10 * 60;
export const CHANNEL_REQUESTS = "people_requests";
export const CHANNEL_SHARED = "shared_activity";

/** Ten-minute buckets, so somebody tidying a shared list costs one
 *  notification rather than eleven. */
export function bucketOf(at: Date): string {
  return String(Math.floor(at.getTime() / (ADDITIONS_BUCKET_SECONDS * 1000)));
}

/** Somebody added a row or a note to a thread with other members: one job
 *  per thread, author and bucket, run ten minutes ahead. */
export async function noteAddition(threadId: string, authorId: string, at = new Date()): Promise<void> {
  const bucket = bucketOf(at);
  await enqueue({
    kind: "shared.activity",
    accountId: authorId,
    payload: { threadId, authorId, since: new Date(Number(bucket) * ADDITIONS_BUCKET_SECONDS * 1000).toISOString() },
    priority: PRIORITY.scheduled,
    runAfterSeconds: ADDITIONS_BUCKET_SECONDS,
    idempotencyKey: `shared.activity:${threadId}:${authorId}:${bucket}`,
  });
}

/** Send one copy to every token an account holds, dropping the tokens the
 *  service says are gone. Returns whether anything reached a phone. */
async function sendTo(
  accountId: string,
  copy: Copy,
  data: Record<string, unknown>,
  channelId: string,
  kind: "request" | "share" | "shared_activity",
): Promise<boolean> {
  const tokens = await db.selectFrom("push_tokens").select("token").where("account_id", "=", accountId).execute();
  if (tokens.length === 0) return false;
  const messages: PushMessage[] = tokens.map((one) => ({
    to: one.token,
    title: copy.title,
    body: copy.body ?? "",
    data,
    categoryId: "people",
    channelId,
  }));
  let tickets;
  try {
    tickets = await push().send(messages);
  } catch (error) {
    if (error instanceof PushFailed) {
      await emit({ name: "notification_failed", subjectId: accountId, properties: { kind, status: error.status, code: error.code } });
    }
    throw error;
  }
  const gone = tickets.filter((ticket) => !ticket.ok && ticket.code === GONE).map((ticket) => ticket.token);
  if (gone.length > 0) await db.deleteFrom("push_tokens").where("token", "in", gone).execute();
  await emit({ name: "notification_sent", subjectId: accountId, properties: { kind } });
  return tickets.some((ticket) => ticket.ok);
}

/** A request or a share, checked at send time: still open, still delivered,
 *  still pending, the recipient's switch on. */
export async function notifyPerson(payload: { kind: "request"; requestId: string } | { kind: "share"; memberId: string }): Promise<"sent" | "skipped" | "gone"> {
  if (payload.kind === "request") {
    const request = await db
      .selectFrom("connection_requests")
      .innerJoin("accounts as sender", "sender.id", "connection_requests.from_account_id")
      .innerJoin("accounts as recipient", "recipient.id", "connection_requests.to_account_id")
      .select([
        "connection_requests.id",
        "connection_requests.to_account_id",
        "connection_requests.delivered",
        "connection_requests.accepted_at",
        "connection_requests.withdrawn_at",
        "sender.display_name as sender_name",
        "recipient.notify_people_requests as wanted",
      ])
      .where("connection_requests.id", "=", payload.requestId)
      .executeTakeFirst();
    if (!request || !request.delivered || request.accepted_at || request.withdrawn_at) return "gone";
    if (!request.wanted) return "skipped";
    const copy = requestCopy(request.sender_name);
    const reached = await sendTo(request.to_account_id, copy, { kind: "request" }, CHANNEL_REQUESTS, "request");
    await record(request.to_account_id, { kind: "request", sent: reached, reason: reached ? undefined : "permission", ...copy, requestId: request.id });
    return reached ? "sent" : "skipped";
  }

  const member = await db
    .selectFrom("thread_members")
    .innerJoin("threads", "threads.id", "thread_members.thread_id")
    .leftJoin("accounts as sharer", "sharer.id", "thread_members.invited_by")
    .innerJoin("accounts as recipient", "recipient.id", "thread_members.account_id")
    .select([
      "thread_members.id",
      "thread_members.account_id",
      "thread_members.state",
      "thread_members.thread_id",
      "threads.name as thread_name",
      "sharer.display_name as sharer_name",
      "recipient.notify_shared_activity as wanted",
    ])
    .where("thread_members.id", "=", payload.memberId)
    .executeTakeFirst();
  if (!member || member.state !== "pending") return "gone";
  if (!member.wanted) return "skipped";
  const copy = shareCopy(member.sharer_name, member.thread_name);
  const reached = await sendTo(member.account_id, copy, { kind: "share", memberId: member.id }, CHANNEL_SHARED, "share");
  await record(member.account_id, {
    kind: "share",
    sent: reached,
    reason: reached ? undefined : "permission",
    ...copy,
    threadId: member.thread_id,
    memberId: member.id,
  });
  return reached ? "sent" : "skipped";
}

/** Somebody's additions to a shared thread, composed now from the rows each
 *  other member may still read. */
export async function notifySharedActivity(payload: { threadId: string; authorId: string; since: string }): Promise<number> {
  const since = new Date(payload.since);
  if (Number.isNaN(since.getTime())) return 0;
  const until = new Date(since.getTime() + ADDITIONS_BUCKET_SECONDS * 1000);
  const thread = await db.selectFrom("threads").select("name").where("id", "=", payload.threadId).where("deleted_at", "is", null).executeTakeFirst();
  if (!thread) return 0;
  const author = await db.selectFrom("accounts").select("display_name").where("id", "=", payload.authorId).executeTakeFirst();
  const members = await db
    .selectFrom("thread_members")
    .innerJoin("accounts", "accounts.id", "thread_members.account_id")
    .select(["thread_members.account_id", "accounts.notify_shared_activity as wanted"])
    .where("thread_members.thread_id", "=", payload.threadId)
    .where("thread_members.state", "=", "accepted")
    .where("thread_members.account_id", "<>", payload.authorId)
    .execute();
  let sent = 0;
  for (const member of members) {
    // What this member may read now, by the author, since the bucket began.
    const rows = await db
      .selectFrom("readable_content as content")
      .select("content.title")
      .where("content.viewer_account_id", "=", member.account_id)
      .where("content.thread_id", "=", payload.threadId)
      .where("content.account_id", "=", payload.authorId)
      .where("content.deleted_at", "is", null)
      .where("content.created_at", ">=", since)
      .where("content.created_at", "<", until)
      .orderBy("content.created_at", "asc")
      .execute();
    if (rows.length === 0) continue;
    const copy = additionsCopy(author?.display_name ?? null, thread.name, rows.map((row) => row.title));
    if (!member.wanted) continue;
    const reached = await sendTo(member.account_id, copy, { kind: "shared_activity", threadId: payload.threadId }, CHANNEL_SHARED, "shared_activity");
    await record(member.account_id, {
      kind: "shared_activity",
      sent: reached,
      reason: reached ? undefined : "permission",
      ...copy,
      threadId: payload.threadId,
      aboutAccountId: payload.authorId,
    });
    if (reached) sent += 1;
  }
  return sent;
}
