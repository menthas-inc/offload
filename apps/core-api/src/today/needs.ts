// 027 Needs you: the interruptions the server can know, in order.
//
// Account issues, people, questions, tips. The time zone and notifications
// cards are facts about a device, so the client adds those itself. Every
// source is filtered by its own account predicate; a kind the layout has off
// is not read at all; a card with a live put-off is left out.

import { dayIn } from "@offload/widgets";
import { sql } from "kysely";
import { z } from "zod";
import { zoneOf } from "../accounts/zone.js";
import { db } from "../db.js";
import { ADDRESS } from "../mail-in/sender.js";
import { requestsFor } from "../people/people.js";
import { onWire, questionOnWire } from "../questions.js";
import { invitationsFor } from "../threads/sharing.js";
import { partsOn, resolveLayout, type NeedsPart } from "./layout.js";
import { startOfTomorrow } from "./picks.js";
import { everDumped } from "./rows.js";

/** The fields whose answer stays inside offload and starts no turn. A share,
 *  a calendar write and the country question stay in the conversation, where
 *  offload says who will find out and a follow-up turn has somewhere to land. */
export const TODAY_FIELDS = ["date", "span", "time", "thread"] as const;

const person = z.object({ accountId: z.string(), displayName: z.string().nullable(), initials: z.string() });

export const needsCard = z.discriminatedUnion("kind", [
  z.object({ key: z.string(), kind: z.literal("calendar"), since: z.string(), connectionId: z.string(), email: z.string().nullable() }),
  z.object({ key: z.string(), kind: z.literal("request"), since: z.string(), requestId: z.string(), person }),
  z.object({
    key: z.string(),
    kind: z.literal("invitation"),
    since: z.string(),
    memberId: z.string(),
    threadName: z.string(),
    from: person,
    preview: z.object({ count: z.number(), titles: z.array(z.string()) }),
  }),
  z.object({
    key: z.string(),
    kind: z.literal("question"),
    since: z.string(),
    question: questionOnWire.unwrap(),
    threadId: z.string().nullable(),
    threadName: z.string().nullable(),
    fromEmail: z.boolean(),
  }),
  z.object({ key: z.string(), kind: z.literal("tip"), tip: z.literal("forwarding"), address: z.string(), from: z.string() }),
]);
export type NeedsCard = z.infer<typeof needsCard>;

/** The closed shape of a card's key, the same as the table's check. */
export const CARD = /^((calendar|request|invitation|question|pick):[0-9a-f-]{36}|tip:forwarding)$/;

async function livePutOffs(accountId: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom("today_put_offs")
    .select("card")
    .where("account_id", "=", accountId)
    .where((eb) => eb.or([eb("until", "is", null), eb("until", ">", sql<Date>`now()`)]))
    .execute();
  return new Set(rows.map((row) => row.card));
}

async function calendarCards(accountId: string): Promise<NeedsCard[]> {
  const live = await db
    .selectFrom("connector_connections")
    .select(["id", "state", "external_account_email", "updated_at"])
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .orderBy("updated_at", "asc")
    .execute();
  return live
    .filter((row) => row.state === "needs_reauth")
    .map((row) => ({
      key: `calendar:${row.id}`,
      kind: "calendar" as const,
      since: row.updated_at.toISOString(),
      connectionId: row.id,
      email: live.length > 1 ? row.external_account_email : null,
    }));
}

async function peopleCards(accountId: string): Promise<NeedsCard[]> {
  const [requests, invitations] = await Promise.all([requestsFor(accountId), invitationsFor(accountId)]);
  const oldest = <T extends { since: Date }>(rows: T[]) => [...rows].sort((a, b) => a.since.getTime() - b.since.getTime());
  return [
    ...oldest(requests).map((row) => ({
      key: `request:${row.id}`,
      kind: "request" as const,
      since: row.since.toISOString(),
      requestId: row.id,
      person: { accountId: row.accountId, displayName: row.displayName, initials: row.initials },
    })),
    ...oldest(invitations).map((row) => ({
      key: `invitation:${row.memberId}`,
      kind: "invitation" as const,
      since: row.since.toISOString(),
      memberId: row.memberId,
      threadName: row.threadName,
      from: row.from,
      preview: row.preview,
    })),
  ];
}

async function questionCards(accountId: string): Promise<NeedsCard[]> {
  const rows = await db
    .selectFrom("questions as q")
    .innerJoin("messages as m", "m.id", "q.message_id")
    .leftJoin("readable_content as c", (join) => join.onRef("c.id", "=", "q.target_content_id").on("c.viewer_account_id", "=", accountId))
    .leftJoin("threads as t", (join) => join.onRef("t.id", "=", "c.thread_id").on("t.deleted_at", "is", null))
    .select([
      "q.id",
      "q.field",
      "q.text",
      "q.options",
      "q.ordinal",
      "q.created_at",
      "q.derived_from_untrusted",
      "m.source",
      "t.id as threadId",
      "t.name as threadName",
    ])
    .where("q.account_id", "=", accountId)
    .where("q.state", "=", "open")
    .where("q.field", "in", [...TODAY_FIELDS])
    .orderBy("q.created_at", "asc")
    .execute();
  return rows
    // A question raised from somebody else's words is on Today only when it
    // came from a forwarded email, and then it says so. One from a calendar
    // or a web page stays in the conversation that holds its source.
    .filter((row) => !row.derived_from_untrusted || row.source === "mail")
    .map((row) => ({
      key: `question:${row.id}`,
      kind: "question" as const,
      since: row.created_at.toISOString(),
      question: onWire(row)!,
      threadId: row.threadId ?? null,
      threadName: row.threadName ?? null,
      fromEmail: row.source === "mail",
    }));
}

async function tipCards(accountId: string): Promise<NeedsCard[]> {
  const account = await db.selectFrom("accounts").select("email").where("id", "=", accountId).executeTakeFirst();
  if (!account || /@privaterelay\.appleid\.com$/i.test(account.email)) return [];
  if (!(await everDumped(accountId))) return [];
  const mailed = await db
    .selectFrom("messages")
    .select("id")
    .where("account_id", "=", accountId)
    .where("source", "=", "mail")
    .limit(1)
    .executeTakeFirst();
  if (mailed) return [];
  return [{ key: "tip:forwarding", kind: "tip", tip: "forwarding", address: ADDRESS, from: account.email }];
}

const SOURCES: Record<NeedsPart, (accountId: string) => Promise<NeedsCard[]>> = {
  account: calendarCards,
  people: peopleCards,
  questions: questionCards,
  tips: tipCards,
};

export async function needsYou(accountId: string): Promise<NeedsCard[]> {
  const account = await db.selectFrom("accounts").select("today_layout").where("id", "=", accountId).executeTakeFirst();
  const on = partsOn(resolveLayout(account?.today_layout ?? null));
  const kinds = (Object.keys(SOURCES) as NeedsPart[]).filter((kind) => on.has(kind));
  const [cards, off] = await Promise.all([Promise.all(kinds.map((kind) => SOURCES[kind](accountId))), livePutOffs(accountId)]);
  return cards.flat().filter((card) => !off.has(card.key));
}

/** Whether `card` is a live card of this account, by the read's own rules. */
async function isLiveCard(accountId: string, card: string): Promise<boolean> {
  const [kind] = card.split(":");
  if (kind === "calendar") return (await calendarCards(accountId)).some((one) => one.key === card);
  if (kind === "request" || kind === "invitation") return (await peopleCards(accountId)).some((one) => one.key === card);
  if (kind === "question") return (await questionCards(accountId)).some((one) => one.key === card);
  if (kind === "tip") return (await tipCards(accountId)).some((one) => one.key === card);
  return false;
}

/** Put a card off until the start of tomorrow in the account's zone, or for
 *  good where that exists. A card that is not this account's live card is
 *  `not_found`, the same as one that never existed. */
export async function putOff(accountId: string, card: string, forGood: boolean): Promise<"ok" | "bad_card" | "not_found"> {
  if (!CARD.test(card) || card.startsWith("pick:")) return "bad_card";
  if (forGood && !card.startsWith("invitation:") && card !== "tip:forwarding") return "bad_card";
  if (!(await isLiveCard(accountId, card))) return "not_found";
  const until = forGood ? null : startOfTomorrow(dayIn(new Date(), await zoneOf(accountId)), await zoneOf(accountId));
  await db
    .insertInto("today_put_offs")
    .values({ account_id: accountId, card, until })
    .onConflict((oc) => oc.columns(["account_id", "card"]).doUpdateSet({ until }))
    .execute();
  return "ok";
}

/** Nightly: a put-off a day past its time is never read again. */
export async function sweepPutOffs(): Promise<number> {
  const gone = await db
    .deleteFrom("today_put_offs")
    .where("until", "is not", null)
    .where("until", "<", sql<Date>`now() - interval '1 day'`)
    .executeTakeFirst();
  return Number(gone.numDeletedRows);
}
