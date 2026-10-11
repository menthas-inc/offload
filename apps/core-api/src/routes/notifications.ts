// The routes notifications need: a phone's token, Activity, and the two
// verbs a one-task digest carries. 024.
//
// A push token is a delivery capability and is bound to a session: the route
// takes no account id, and a token already held by another account is
// re-bound, so a phone that changes hands or accounts never receives the last
// account's words. The row names the session that registered it and goes when
// that session ends, however it ends (0091). No read returns a token. Activity is readable by its own
// account only. The verbs resolve the account from the session and the row
// through the same membership predicate as the sheet's write.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { addUtcDays, dayIn, occurrencesIn, parseRule, timeHM, utcDay, whenDayOf } from "@offload/widgets";
import { sql } from "kysely";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { undoMailRow } from "../mail-in/activity.js";
import { zoneOf } from "../accounts/zone.js";
import { agendaQuery, agendaRow, everDumped, labelsOf, shapeRows, type AgendaRaw } from "../today/rows.js";
import { actedCopy } from "../notifications/copy.js";
import { ACTIVITY_DAYS, listActivity, markSeen, record } from "../notifications/activity.js";
import { isPushToken } from "../notifications/push.js";
import { setReminders } from "../notifications/labels.js";
import { webOrigins } from "../env.js";
import { NotYours, memberOf, readableContent } from "../threads/access.js";
import { undoRun } from "../threads/labels.js";
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

const todayResponse = z.object({
  overdue: z.array(agendaRow),
  today: z.array(agendaRow),
  tomorrow: z.array(agendaRow),
  overdueMore: z.number(),
  /** Whether anything was ever filed: the day-one invitation is for an
   *  account that has never dumped anything, and the quiet line for one that
   *  has. */
  everDumped: z.boolean(),
  /** 025. The labels the rows above carry, and only those: Today has no
   *  thread bundle to look a label up in. */
  threadLabels: z.array(z.object({ id: z.string(), name: z.string(), colour: z.number() })),
});

const activityEntry = z.object({
  id: z.string(),
  kind: z.enum(["digest", "request", "share", "shared_activity", "expired", "moved", "acted", "labelled", "mail", "export", "reminder"]),
  sent: z.boolean(),
  reason: z.enum(["setting", "permission", "design"]).nullable(),
  title: z.string(),
  body: z.string().nullable(),
  send: z.enum(["morning", "evening"]).nullable(),
  threadId: z.string().nullable(),
  contentId: z.string().nullable(),
  memberId: z.string().nullable(),
  requestId: z.string().nullable(),
  /** 025. A labelled row's Undo is offered while this is true. 026: and a
   *  filed email's, for a day. */
  undoable: z.boolean(),
  undone: z.boolean(),
  occurredAt: z.string(),
  /** 026. Which of the five an email row is, and the email it opens. */
  mailOutcome: z.enum(["filed", "asked", "nothing", "refused", "over_limit"]).nullable(),
  messageId: z.string().nullable(),
});

export async function notificationRoutes(app: App): Promise<void> {
  // 042. The author's Remind me on a thread note or a memory, whose editors
  // write their words through routes of their own; a row's goes through the
  // row sheet's one save. Anybody but the author gets the answer a thing that
  // does not exist gets.
  app.put(
    "/v1/reminders",
    {
      schema: {
        body: z.strictObject({ of: z.enum(["content", "note", "memory"]), id: z.string().uuid(), on: z.boolean() }),
        response: { 200: done, 401: unauthenticated, 403: z.object({ error: z.literal("origin") }), 404: z.object({ error: z.literal("not_found") }) },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && !webOrigins.includes(origin)) return reply.code(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const found = await db.transaction().execute((trx) => setReminders(trx, { accountId, ...request.body }));
      if (!found) return reply.code(404).send({ error: "not_found" as const });
      return reply.send({ ok: true as const });
    },
  );

  app.post(
    "/v1/push-tokens",
    {
      schema: {
        // 042. `takes` names what this build can draw: a reminder of its own
        // needs its channel and its door, so an older build is sent none.
        body: z.object({ token: pushToken, platform: z.enum(["ios", "android"]), takes: z.array(z.enum(["reminder"])).max(4).optional() }),
        response: { 200: done, 401: unauthenticated, 403: z.object({ error: z.literal("not_active") }) },
      },
    },
    async (request, reply) => {
      const session = (await auth.api.getSession({ headers: fetchHeaders(request) }))?.session;
      if (!session) return reply.status(401).send({ error: "unauthenticated" });
      const { userId: accountId, id: sessionId } = session;
      const { token, platform } = request.body;
      const takesReminders = request.body.takes?.includes("reminder") ?? false;
      await db
        .insertInto("push_tokens")
        .values({ account_id: accountId, session_id: sessionId, token, platform, takes_reminders: takesReminders })
        .onConflict((oc) =>
          oc
            .column("token")
            .doUpdateSet({ account_id: accountId, session_id: sessionId, platform, takes_reminders: takesReminders, last_seen_at: new Date() }),
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

  // 025. Undo on a labelled row: the sort it records, taken back as far as
  // nobody has touched it since, for every member at once. The caller must
  // own the row and still be in its thread; the row must be under thirty days
  // and not already undone.
  app.post(
    "/v1/activity/:id/undo",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ undone: z.literal(true) }),
          401: unauthenticated,
          404: z.object({ error: z.literal("not_found") }),
          409: z.object({ error: z.literal("not_undoable") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      const outcome = await db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom("activity")
          .select(["id", "label_run_id", "undone_at", "occurred_at"])
          .where("id", "=", request.params.id)
          .where("account_id", "=", accountId)
          .where("kind", "=", "labelled")
          .executeTakeFirst();
        if (!row) return "mail" as const;
        const run = row.label_run_id
          ? await trx.selectFrom("label_runs").select(["id", "thread_id"]).where("id", "=", row.label_run_id).executeTakeFirst()
          : undefined;
        if (!run || !(await memberOf(accountId, run.thread_id, trx))) {
          // A member who left, or a sort already purged: not theirs to undo.
          return run ? ("not_found" as const) : ("not_undoable" as const);
        }
        const tooOld = row.occurred_at.getTime() < Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
        if (row.undone_at !== null || tooOld) return "not_undoable" as const;
        await undoRun(trx, run.id);
        return "undone" as const;
      });
      if (outcome === "mail") {
        const mailOutcome = await undoMailRow(accountId, request.params.id);
        if (mailOutcome === "not_found") return reply.status(404).send({ error: "not_found" as const });
        if (mailOutcome === "not_undoable") return reply.status(409).send({ error: "not_undoable" as const });
        return { undone: true as const };
      }
      if (outcome === "not_found") return reply.status(404).send({ error: "not_found" as const });
      if (outcome === "not_undoable") return reply.status(409).send({ error: "not_undoable" as const });
      return { undone: true as const };
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
  // 024's three groups, kept for phones built before 027, which read
  // `/v1/today/day` and `/v1/today/needs` instead. Remove once no session has
  // come from a build older than 027's first phone build for thirty days.
  app.get("/v1/today", { schema: { response: { 200: todayResponse, 401: unauthenticated } } }, async (request, reply) => {
    const accountId = await currentAccountId(request);
    if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
    const zone = await zoneOf(accountId);
    const today = dayIn(new Date(), zone);
    const tomorrow = addUtcDays(today, 1);
    const from = new Date(`${addUtcDays(today, -(TODAY_BACK_DAYS + 1))}T00:00:00Z`);
    const to = new Date(`${addUtcDays(tomorrow, 2)}T00:00:00Z`);

    const raw = await agendaQuery(accountId)
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

    type Agenda = AgendaRaw;
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
    const shaped = {
      overdue: await shapeRows(overdue.slice(0, OVERDUE_CAP).map((one) => one.row), accountId),
      today: await shapeRows(todays, accountId),
      tomorrow: await shapeRows(tomorrows, accountId),
    };
    const threadLabels = await labelsOf([...shaped.overdue, ...shaped.today, ...shaped.tomorrow]);
    const ever = await everDumped(accountId);
    return {
      ...shaped,
      overdueMore: Math.max(0, overdue.length - OVERDUE_CAP),
      everDumped: ever,
      threadLabels,
    };
  });
}
