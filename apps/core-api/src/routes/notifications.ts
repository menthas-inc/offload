// The routes notifications need: a phone's token, Activity, and the two
// verbs a one-task digest carries. 024.
//
// A push token is a delivery capability and is bound to a session: the route
// takes no account id, and a token already held by another account is
// re-bound, so a phone that changes hands or accounts never receives the last
// account's words. No read returns a token. Activity is readable by its own
// account only. The verbs resolve the account from the session and the row
// through the same membership predicate as the sheet's write.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { addUtcDays, dayIn, occurrencesIn, parseRule, timeHM, utcDay, whenDayOf } from "@offload/widgets";
import { sql } from "kysely";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { zoneOf } from "../accounts/zone.js";
import { actedCopy } from "../notifications/copy.js";
import { listActivity, markSeen, record } from "../notifications/activity.js";
import { isPushToken } from "../notifications/push.js";
import { NotYours, readableContent } from "../threads/access.js";
import { Refused } from "../threads/refusals.js";
import { completeContent, contentRow, editContent, toRow, withPhotos, type RawRow } from "./threads.js";

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const done = z.object({ ok: z.literal(true) });

/** Expo's own shape, and nothing else. The column's check says the same. */
const pushToken = z
  .string()
  .max(120)
  .refine((token) => isPushToken(token), "not a push token");

/** Today looks back thirty days for what is late, and its Overdue is capped. */
export const TODAY_BACK_DAYS = 30;
export const OVERDUE_CAP = 100;

const agendaRow = contentRow.extend({ threadId: z.string(), threadName: z.string() });
const todayResponse = z.object({
  overdue: z.array(agendaRow),
  today: z.array(agendaRow),
  tomorrow: z.array(agendaRow),
  overdueMore: z.number(),
  /** Whether anything was ever filed: the day-one invitation is for an
   *  account that has never dumped anything, and the quiet line for one that
   *  has. */
  everDumped: z.boolean(),
});

const activityEntry = z.object({
  id: z.string(),
  kind: z.enum(["digest", "request", "share", "shared_activity", "expired", "moved", "acted"]),
  sent: z.boolean(),
  reason: z.enum(["setting", "permission", "design"]).nullable(),
  title: z.string(),
  body: z.string().nullable(),
  send: z.enum(["morning", "evening"]).nullable(),
  threadId: z.string().nullable(),
  contentId: z.string().nullable(),
  memberId: z.string().nullable(),
  requestId: z.string().nullable(),
  occurredAt: z.string(),
});

export async function notificationRoutes(app: App): Promise<void> {
  app.post(
    "/v1/push-tokens",
    {
      schema: {
        body: z.object({ token: pushToken, platform: z.enum(["ios", "android"]) }),
        response: { 200: done, 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      const { token, platform } = request.body;
      await db
        .insertInto("push_tokens")
        .values({ account_id: accountId, token, platform })
        .onConflict((oc) =>
          oc.column("token").doUpdateSet({ account_id: accountId, platform, last_seen_at: new Date() }),
        )
        .execute();
      return { ok: true as const };
    },
  );

  app.delete(
    "/v1/push-tokens",
    {
      schema: {
        body: z.object({ token: pushToken }),
        response: { 200: done, 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      // Only the session's own: another account's row is not this session's
      // to remove, and the answer is the same either way.
      await db.deleteFrom("push_tokens").where("token", "=", request.body.token).where("account_id", "=", accountId).execute();
      return { ok: true as const };
    },
  );

  app.get(
    "/v1/activity",
    {
      schema: {
        querystring: z.object({ cursor: z.string().max(80).optional() }),
        response: { 200: z.object({ rows: z.array(activityEntry), next: z.string().nullable() }), 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      return listActivity(accountId, request.query.cursor ?? null);
    },
  );

  app.post("/v1/activity/seen", { schema: { response: { 200: done, 401: unauthenticated } } }, async (request, reply) => {
    const accountId = await currentAccountId(request);
    if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
    await markSeen(accountId);
    return { ok: true as const };
  });

  /** The two verbs. Done ticks the row; Tomorrow moves its date by one day
   *  through the same write path as the sheet, so it is a date change and
   *  not a snooze. Each writes an Activity row, since there is no toast to
   *  say what happened. A row on a calendar refuses Tomorrow as the sheet's
   *  route does. */
  app.post(
    "/v1/notifications/act",
    {
      schema: {
        body: z.object({ action: z.enum(["done", "tomorrow"]), contentId: z.string().uuid() }),
        response: {
          200: done,
          401: unauthenticated,
          400: z.object({ error: z.literal("bad_date") }),
          404: z.object({ error: z.literal("not_found") }),
          409: z.object({ error: z.literal("on_calendar") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      const { action, contentId } = request.body;
      try {
        const ref = await readableContent(accountId, contentId);
        if (!ref) return reply.status(404).send({ error: "not_found" });
        const row = await db
          .selectFrom("content")
          .select(["title", "type", "due_at", "occurs_at", "occurs_end_at", "attrs"])
          .where("id", "=", ref.id)
          .executeTakeFirstOrThrow();
        if (action === "done") {
          await completeContent(accountId, contentId, true);
        } else {
          const held = row.type === "event" ? row.occurs_at : row.due_at;
          if (!held) return reply.status(404).send({ error: "not_found" });
          const allDay = (row.attrs as Record<string, unknown> | null)?.["all_day"] === true;
          const zone = await zoneOf(accountId);
          const dayOn = (at: Date): string =>
            allDay ? addUtcDays(utcDay(at), 1) : `${addUtcDays(dayIn(at, zone), 1)}T${timeHM(at.toISOString(), zone)}:00`;
          // An event's end moves with its start, so the span is never turned
          // round and never refused for it.
          await editContent(
            accountId,
            contentId,
            row.type === "event"
              ? { occursAt: dayOn(held), ...(row.occurs_end_at ? { occursEndAt: dayOn(row.occurs_end_at) } : {}) }
              : { dueAt: dayOn(held) },
          );
        }
        await record(accountId, { ...actedCopy(row.title, action), kind: "acted", sent: true, threadId: ref.threadId, contentId: ref.id });
        return { ok: true as const };
      } catch (error) {
        if (error instanceof NotYours) return reply.status(404).send({ error: "not_found" });
        if (error instanceof Refused) {
          return error.code === "on_calendar" ? reply.status(409).send({ error: "on_calendar" }) : reply.status(400).send({ error: "bad_date" });
        }
        throw error;
      }
    },
  );

  /** Today, the agenda: three groups across every thread the account is in,
   *  from the same row the thread page draws, with the thread's name. Every
   *  dated content row lands here, reminder or not; notes do not. A repeating
   *  row appears once, in the first group its rule lands in, never in
   *  Overdue. Overdue reaches back thirty days and is capped, newest first. */
  app.get("/v1/today", { schema: { response: { 200: todayResponse, 401: unauthenticated } } }, async (request, reply) => {
    const accountId = await currentAccountId(request);
    if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
    const zone = await zoneOf(accountId);
    const today = dayIn(new Date(), zone);
    const tomorrow = addUtcDays(today, 1);
    const from = new Date(`${addUtcDays(today, -(TODAY_BACK_DAYS + 1))}T00:00:00Z`);
    const to = new Date(`${addUtcDays(tomorrow, 2)}T00:00:00Z`);

    const raw = await db
      .selectFrom("readable_content as content")
      .innerJoin("threads", "threads.id", "content.thread_id")
      .leftJoin("accounts", "accounts.id", "content.account_id")
      .select([
        "content.id as id",
        "content.type as type",
        "content.title as title",
        "content.body as body",
        "content.url as url",
        "content.image_url as image_url",
        "content.created_at as created_at",
        "content.archived_at as archived_at",
        "content.account_id as account_id",
        "content.done_at as done_at",
        "content.filing_at as filing_at",
        "content.due_at as due_at",
        "content.occurs_at as occurs_at",
        "content.occurs_end_at as occurs_end_at",
        "content.rrule as rrule",
        "content.source_ref as source_ref",
        "content.is_reminder as is_reminder",
        "content.priority as priority",
        "content.priority_pinned as priority_pinned",
        "content.place_id as place_id",
        "content.attrs as attrs",
        "accounts.display_name as authorName",
        "content.thread_id as threadId",
        "threads.name as threadName",
        sql<boolean>`exists (
          select 1 from thread_members am
          where am.thread_id = content.thread_id
            and am.account_id = content.account_id
            and am.state = 'accepted'
        )`.as("authorIsMember"),
        sql<string | null>`null`.as("placeName"),
        sql<string | null>`null`.as("placeAddress"),
        sql<number | null>`null`.as("placeLat"),
        sql<number | null>`null`.as("placeLng"),
      ])
      .where("content.viewer_account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .where("content.archived_at", "is", null)
      .where("content.done_at", "is", null)
      .where("threads.deleted_at", "is", null)
      .where((eb) =>
        eb.or([
          eb.and([eb("content.type", "=", "event"), eb("content.occurs_at", ">=", from), eb("content.occurs_at", "<", to)]),
          eb.and([eb("content.type", "<>", "event"), eb("content.due_at", ">=", from), eb("content.due_at", "<", to)]),
          eb("content.rrule", "is not", null),
        ]),
      )
      // Nearest first, so if the cap is ever reached it drops what is
      // furthest off rather than what was dumped longest ago.
      .orderBy(sql`coalesce(content.occurs_at, content.due_at)`, "asc")
      .limit(800)
      .execute();

    type Agenda = RawRow & { threadId: string; threadName: string };
    const overdue: { day: string; row: Agenda }[] = [];
    const todays: Agenda[] = [];
    const tomorrows: Agenda[] = [];
    for (const row of raw as Agenda[]) {
      const day = whenDayOf(
        {
          type: row.type,
          dueAt: row.due_at ? row.due_at.toISOString() : null,
          occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
          allDay: (row.attrs as Record<string, unknown> | null)?.["all_day"] === true,
          doneAt: null,
          rrule: row.rrule,
        },
        zone,
      );
      if (!day) continue;
      const parsed = row.rrule ? parseRule(row.rrule) : null;
      const rule = parsed?.ok ? parsed.rule : null;
      if (rule) {
        if (day <= today && occurrencesIn(rule, day, today, today).length > 0) todays.push(row);
        else if (day <= tomorrow && occurrencesIn(rule, day, tomorrow, tomorrow).length > 0) tomorrows.push(row);
        continue;
      }
      if (day === today) todays.push(row);
      else if (day === tomorrow) tomorrows.push(row);
      else if (day < today && day >= addUtcDays(today, -TODAY_BACK_DAYS)) overdue.push({ day, row });
    }
    overdue.sort((a, b) => (a.day === b.day ? (a.row.id < b.row.id ? 1 : -1) : a.day < b.day ? 1 : -1));
    const shape = async (rows: Agenda[]) =>
      (await withPhotos(rows.map((row) => ({ ...toRow(row, accountId), threadId: row.threadId, threadName: row.threadName })))) as unknown as z.infer<typeof agendaRow>[];
    const ever = await db
      .selectFrom("readable_content as content")
      .select("content.id")
      .where("content.viewer_account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .limit(1)
      .executeTakeFirst();
    return {
      overdue: await shape(overdue.slice(0, OVERDUE_CAP).map((one) => one.row)),
      today: await shape(todays),
      tomorrow: await shape(tomorrows),
      overdueMore: Math.max(0, overdue.length - OVERDUE_CAP),
      everDumped: ever !== undefined,
    };
  });
}
