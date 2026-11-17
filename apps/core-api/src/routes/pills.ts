// 052. A reply's pill, tapped.
//
// The body names the turn and the kind and nothing else. The row, the
// calendar and the person are worked out again here from the turn's record
// and the caller's live membership, by the same code that offered the pill,
// and a kind the turn no longer offers is refused (SEC-2, OFF-3).
//
// Two kinds reach the server. Add a date, Share with and Directions open what
// already exists on the client: the row's date field, 022's confirmation and
// 030's link.

import { sql } from "kysely";
import { z } from "zod";
import type { App } from "../app.js";
import { db } from "../db.js";
import { webOrigins } from "../env.js";
import { currentAccountId } from "../auth/current-account.js";
import { pillsFor } from "../dumps/pills.js";
import { setReminders } from "../notifications/labels.js";
import { writeThroughTool } from "../connectors/tool-calls.js";
import { targetFor, undoWrite, type WriteAction } from "../connectors/write.js";
import { calendarSpan } from "../threads/dates.js";
import { seriesFor } from "./tools.js";

/** A calendar pill's own Undo lasts as long as its line: eight seconds, and two
 *  for the round trip. After that the event is removed from its row, where
 *  019's delete confirmation applies. */
const CALENDAR_UNDO_SECONDS = 10;

const unauthenticated = z.object({ error: z.literal("unauthenticated") });

export async function pillRoutes(app: App): Promise<void> {
  app.post(
    "/v1/turns/:turnId/pills",
    {
      schema: {
        params: z.object({ turnId: z.string().uuid() }),
        body: z.strictObject({ kind: z.enum(["calendar", "remind"]), undo: z.boolean().optional() }),
        response: {
          200: z.union([z.object({ ok: z.literal(true) }), z.object({ confirm: z.string(), pendingId: z.string() })]),
          401: unauthenticated,
          403: z.object({ error: z.literal("origin") }),
          404: z.object({ error: z.literal("not_found") }),
          409: z.object({ error: z.enum(["not_offered", "refused"]) }),
        },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && !webOrigins.includes(origin)) return reply.code(403).send({ error: "origin" as const });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const persons = await db
        .selectFrom("messages")
        .select("id")
        .where("turn_id", "=", request.params.turnId)
        .where("account_id", "=", accountId)
        .where("role", "=", "person")
        .where("deleted_at", "is", null)
        .orderBy("created_at")
        .execute();
      if (persons.length === 0) return reply.code(404).send({ error: "not_found" as const });
      const personIds = persons.map((p) => p.id);
      const { kind, undo } = request.body;

      if (undo) return reply.send(await takeBack(accountId, personIds, kind, reply));

      const offered = (await pillsFor(accountId, [{ turnId: request.params.turnId, personIds }])).get(request.params.turnId) ?? [];
      const pill = offered.find((one) => one.kind === kind);
      if (!pill?.rowId) return reply.code(409).send({ error: "not_offered" as const });

      if (kind === "remind") {
        // As the row's own Remind me switches it on, and marked as asked for, so
        // 042's table still decides when and a clock time is honoured.
        await db.transaction().execute(async (trx) => {
          await setReminders(trx, { accountId, of: "content", id: pill.rowId!, on: true });
          await trx.updateTable("content").set({ is_reminder: true }).where("id", "=", pill.rowId!).execute();
        });
        request.log.info({ turnId: request.params.turnId, kind, outcome: "on" }, "pill");
        return reply.send({ ok: true as const });
      }

      const row = await db
        .selectFrom("content")
        .select(["title", "occurs_at", "occurs_end_at", "due_at", "rrule", "attrs", "location"])
        .where("id", "=", pill.rowId)
        .executeTakeFirstOrThrow();
      const at = row.occurs_at ?? row.due_at;
      if (!at || !pill.calendar) return reply.code(409).send({ error: "not_offered" as const });
      const write: WriteAction = {
        action: "create",
        draft: {
          title: row.title,
          ...calendarSpan(at, row.occurs_end_at, row.attrs),
          location: row.location ?? null,
          attendees: [],
          recurrence: seriesFor(row.rrule),
        },
      };
      // The one row on the one calendar. The thread's calendar picks are not
      // touched: that is the thread's own question (owner, 2026-11-17).
      const outcome = await writeThroughTool(accountId, pill.calendar.id, write, personIds[0]!, pill.rowId);
      request.log.info({ turnId: request.params.turnId, kind, outcome: outcome.kind }, "pill");
      if (outcome.kind === "refused") return reply.code(409).send({ error: "refused" as const });
      if (outcome.kind === "pending") return reply.send({ confirm: outcome.line, pendingId: outcome.pendingId });
      await sql`update content set attrs = attrs || jsonb_build_object('pill_calendar_at', now()::text) where id = ${pill.rowId}::uuid`.execute(db);
      return reply.send({ ok: true as const });
    },
  );
}

/** A pill's own Undo: the turn's row whose Remind me it switched on, or whose
 *  event it wrote inside the last few seconds. Found from the record again,
 *  never named by the client. */
async function takeBack(
  accountId: string,
  personIds: string[],
  kind: "calendar" | "remind",
  reply: import("fastify").FastifyReply,
) {
  const rows = await db
    .selectFrom("content")
    .innerJoin("thread_members as tm", (join) =>
      join.onRef("tm.thread_id", "=", "content.thread_id").on("tm.account_id", "=", accountId).on("tm.state", "=", "accepted"),
    )
    .select(["content.id as id", "content.is_reminder as isReminder", "content.source_ref as sourceRef", "content.attrs as attrs"])
    .where("content.derived_from_message_id", "in", personIds)
    .where("content.account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .execute();

  if (kind === "remind") {
    const on = rows.filter((r) => r.isReminder);
    if (on.length !== 1) return reply.code(409).send({ error: "not_offered" as const });
    await db.transaction().execute(async (trx) => {
      await setReminders(trx, { accountId, of: "content", id: on[0]!.id, on: false });
      await trx.updateTable("content").set({ is_reminder: false }).where("id", "=", on[0]!.id).execute();
    });
    return { ok: true as const };
  }

  const tapped = rows.filter((r) => {
    const at = (r.attrs as { pill_calendar_at?: string } | null)?.pill_calendar_at;
    return r.sourceRef && at && Date.now() - new Date(at).getTime() < CALENDAR_UNDO_SECONDS * 1000;
  });
  if (tapped.length !== 1) return reply.code(409).send({ error: "not_offered" as const });
  const row = tapped[0]!;
  const externalId = row.sourceRef!.split(":")[0]!;
  const calendar = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select("c.id as id")
    .where("c.external_id", "=", externalId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();
  const target = calendar ? await targetFor(calendar.id, accountId) : null;
  if (!target || !(await undoWrite(target, row.sourceRef!))) return reply.code(409).send({ error: "refused" as const });
  await sql`update content set attrs = attrs - 'pill_calendar_at' where id = ${row.id}::uuid`.execute(db);
  return { ok: true as const };
}
