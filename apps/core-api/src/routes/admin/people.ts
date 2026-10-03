// 034, section A. People and a person.
//
// Registered by the admin plugin in the support scope, so every path here is relative to
// `/v1/admin` and already behind the staff check. Each route that is not a GET
// declares `config: { audit: <kind> }` and writes that entry in its own
// transaction. Owner-only routes here (an override, delete and its cancel)
// declare `config: { rank: "owner" }` and the prefix guard enforces it.
//
// **Nothing they wrote is on any of it** (OFF-1). A person is their name and
// their address; everything else here is a count, a kind, a time, a cost or
// an outcome. Every query names its columns, a job is read by its code and
// never by `last_error` or `payload`, and a session, a device and a calendar
// connection are counted and never described.

import { z } from "zod";
import { sql, type RawBuilder } from "kysely";
import type { FastifyReply } from "fastify";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { audit } from "../../admin/audit.js";
import { atLeast, type Staff } from "../../admin/staff.js";
import { signedIn } from "../../accounts/active.js";
import { limitReached, spentToday, turnsToday } from "../../budget.js";
import { SETTING_KEYS, clearOverrides, limitFor, setting, settingDef, validSetting, type CapKey } from "../../settings.js";
import { photosToday } from "../../blobs/photos.js";
import { voiceToday } from "../../blobs/audio.js";
import { storageUsed } from "../../blobs/storage.js";
import { mailToday } from "../../mail-in/receive.js";
import { syncNow } from "../../connectors/sync.js";
import type { Executor } from "../../threads/access.js";
import { enqueue, PRIORITY } from "../../jobs/queue.js";
import { uuidv7 } from "../../uuid.js";

const PAGE = 50;

/** Sorted by anything but joined, the list is not paged: it is the top of
 *  the order and says when there was more. */
const TOP = 200;

const notFound = z.object({ error: z.literal("not-found") });
const refused = z.object({ error: z.literal("refused"), reason: z.enum(["self", "staff", "last_owner", "deleting", "email", "not_marked"]) });
const gone = z.object({ error: z.literal("deleted"), deletedAt: z.string() });
const idParams = z.object({ id: z.string().uuid() });

/** The per-person caps, in the registry's order. */
const CAP_KEYS = SETTING_KEYS.filter((key): key is CapKey => key.startsWith("cap."));

function isCapKey(key: string): key is CapKey {
  return (CAP_KEYS as readonly string[]).includes(key);
}

/** Who People lists: every account that has signed in at least once and has
 *  not been removed. The one definition (`accounts/active.ts`), so the list,
 *  the stats, a person's page and Costs agree on who is here. */
const onPeople = signedIn;

/** What an account spent in the last 30 days: model calls and search fees. */
const spend30 = (alias: string) => sql<string>`(
  coalesce((select sum(u.cost_micros) from llm_usage u where u.account_id = ${sql.ref(`${alias}.id`)} and u.created_at > now() - interval '30 days'), 0)
  + coalesce((select sum(l.cost_micros) from lookups l where l.account_id = ${sql.ref(`${alias}.id`)} and l.created_at > now() - interval '30 days'), 0))`;

/** When they last did something: the newest of a session being used and a
 *  turn being started. A turn, not any job: the nightly pass and the digest
 *  carry the account too, and would make everybody active every day. */
const lastActive = (alias: string) => sql<Date | null>`greatest(
  (select max(s.updated_at) from sessions s where s.account_id = ${sql.ref(`${alias}.id`)}),
  (select max(j.created_at) from jobs j where j.account_id = ${sql.ref(`${alias}.id`)} and j.kind = 'dump.answer'))`;

const providersOf = (alias: string) => sql<string[]>`(
  select coalesce(array_agg(distinct i.provider::text order by i.provider::text), '{}'::text[])
  from account_identities i where i.account_id = ${sql.ref(`${alias}.id`)})`;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

// The cursor is the last row's id, as the waitlist's is and for its reasons.
function encodeCursor(id: string): string {
  return Buffer.from(id).toString("base64url");
}

function decodeCursor(cursor: string): string | null {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/** The owners whose accounts are active, which is who could still open the
 *  owner pages. */
async function activeOwners(trx: Executor): Promise<string[]> {
  const rows = await trx
    .selectFrom("staff")
    .innerJoin("accounts", "accounts.id", "staff.account_id")
    .select("staff.account_id")
    .where("staff.role", "=", "owner")
    .where("accounts.state", "=", "active")
    .where("accounts.deleted_at", "is", null)
    .execute();
  return rows.map((row) => row.account_id);
}

interface Target {
  id: string;
  state: "active" | "disabled";
  staffRole: "support" | "owner" | null;
  deleting: boolean;
}

/** Why this staff member may not lock or unlock this account, if they may
 *  not. The one rule, used by the routes to refuse and by the reads to say
 *  what not to draw (034, section 2: a guarded action is not drawn, and is
 *  refused if asked for anyway). */
function guard(caller: Staff, target: Target, owners: readonly string[]): "self" | "staff" | "last_owner" | null {
  if (target.id === caller.accountId) return "self";
  if (target.staffRole && !atLeast(caller.role, "owner")) return "staff";
  if (target.staffRole === "owner" && owners.every((id) => id === target.id)) return "last_owner";
  return null;
}

function canOf(
  caller: Staff,
  target: Target,
  owners: readonly string[],
): { disable: boolean; enable: boolean; delete: boolean; cancelDelete: boolean } {
  const free = guard(caller, target, owners) === null;
  const owner = atLeast(caller.role, "owner");
  return {
    disable: free && target.state === "active",
    enable: free && target.state === "disabled" && !target.deleting,
    delete: free && owner && !target.deleting,
    cancelDelete: owner && target.deleting,
  };
}

/** How long an account marked for deletion is held before it is destroyed.
 *  The hold is the undo (OFF-6, as 034 diverges from it). */
const HOLD_HOURS = 24;

type DeletionAlert = "deletion.scheduled" | "deletion.cancelled";

/** The email every owner gets when a deletion is marked or cancelled, queued
 *  in the transaction that did it. Ids only, as the staff alerts are. */
async function alertOwners(tx: Executor, alert: DeletionAlert, staff: Staff, targetAccountId: string): Promise<void> {
  const id = uuidv7();
  await enqueue({
    kind: "email.alert",
    payload: { alert, actorAccountId: staff.accountId, targetAccountId, id },
    priority: PRIORITY.interactive,
    idempotencyKey: `email.alert:${alert}:${targetAccountId}:${id}`,
    tx,
  });
}

/** The account inside a write, locked, with what the guards need. */
async function lockTarget(tx: Executor, id: string): Promise<Target | null> {
  const row = await tx
    .selectFrom("accounts")
    .select(["id", "state", "delete_after"])
    .where("id", "=", id)
    .where(onPeople("accounts"))
    .forUpdate()
    .executeTakeFirst();
  if (!row) return null;
  const staff = await tx.selectFrom("staff").select("role").where("account_id", "=", id).executeTakeFirst();
  return { id: row.id, state: row.state as Target["state"], staffRole: staff?.role ?? null, deleting: row.delete_after !== null };
}

/** The guard as it stands inside the write. The owner rows are locked first
 *  and read in a second statement, so two owners disabling each other at
 *  once are taken in turn and the second sees what the first did. */
async function guardLocked(tx: Executor, caller: Staff, target: Target): Promise<ReturnType<typeof guard>> {
  if (target.staffRole === "owner") await sql`select account_id from staff where role = 'owner' for update`.execute(tx);
  return guard(caller, target, target.staffRole === "owner" ? await activeOwners(tx) : []);
}

// What they used in the last 24 hours, against each cap. Every figure is the
// cap's own function, from the module that enforces it, so the page and the
// refusal read the same statement (AC-18).

async function usedToday(accountId: string): Promise<Record<CapKey, number>> {
  const [spent, turns, photos, voice, mail, kept] = await Promise.all([
    spentToday(accountId),
    turnsToday(accountId),
    photosToday(accountId),
    voiceToday(accountId),
    mailToday(accountId),
    storageUsed(accountId),
  ]);
  return {
    "cap.spend_micros": spent,
    "cap.turns": turns,
    "cap.photos": photos.n,
    "cap.photo_bytes": photos.bytes,
    "cap.voice_notes": voice.n,
    "cap.voice_ms": voice.ms,
    "cap.mail_day": mail.day,
    "cap.mail_hour": mail.hour,
    // 036. Not a day's figure: everything kept, against the same cap.
    "cap.storage_bytes": kept,
  };
}

/** How many UTC days a range draws. Plots are in UTC days, so the last 24
 *  hours is today and yesterday. */
const RANGE_DAYS = { "24h": 2, "7d": 7, "30d": 30, "90d": 90 } as const;

const can = z.object({ disable: z.boolean(), enable: z.boolean(), delete: z.boolean(), cancelDelete: z.boolean() });

const listRow = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string(),
  providers: z.array(z.string()),
  threads: z.number().int(),
  joined: z.string(),
  lastActive: z.string().nullable(),
  spendMicros: z.number().int(),
  state: z.enum(["active", "disabled"]),
  /** When it is destroyed, for an account an owner marked. */
  deleteAfter: z.string().nullable(),
  /** What this staff member may do to this row. A guarded action is not drawn. */
  can,
});

const who = z.object({ id: z.string().uuid(), name: z.string() });

const person = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string(),
  state: z.enum(["active", "disabled"]),
  joined: z.string(),
  firstSignedInAt: z.string(),
  lastActive: z.string().nullable(),
  disabledAt: z.string().nullable(),
  /** When it is destroyed, for an account an owner marked. */
  deleteAfter: z.string().nullable(),
  providers: z.array(z.string()),
  country: z.string().nullable(),
  timeZone: z.string().nullable(),
  consentVersion: z.string().nullable(),
  /** The staff member behind the newest invite in the audit log. */
  invitedBy: who.nullable(),
  can: can.extend({ limits: z.boolean() }),
  today: z.object({
    caps: z.array(z.object({ key: z.string(), used: z.number(), limit: z.number(), reached: z.boolean() })),
    /** The cap that would refuse their next turn now, the platform's included. */
    refused: z.object({ cap: z.string(), scope: z.enum(["account", "platform"]) }).nullable(),
  }),
  limits: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(["int", "micros"]),
      global: z.number(),
      override: z.number().nullable(),
      min: z.number(),
      max: z.number(),
      setBy: who.nullable(),
      setAt: z.string().nullable(),
    }),
  ),
  has: z.object({
    threadsAlone: z.number().int(),
    threadsShared: z.number().int(),
    dumped: z.number().int(),
    notes: z.number().int(),
    connections: z.number().int(),
    files: z.number().int(),
    fileBytes: z.number().int(),
    calendars: z.number().int(),
    /** Whether the newest sync of every connection worked. Null with none. */
    calendarSync: z.enum(["ok", "failed"]).nullable(),
    devices: z.object({ ios: z.number().int(), android: z.number().int() }),
    sessions: z.number().int(),
    sessionLastUsed: z.string().nullable(),
  }),
});

/** Whether the account is one People lists. */
async function onList(id: string): Promise<boolean> {
  const row = await db.selectFrom("accounts").select("id").where("id", "=", id).where(onPeople("accounts")).executeTakeFirst();
  return row !== undefined;
}

export async function peopleAdminRoutes(app: App): Promise<void> {
  // The list. Sorted by joined it pages by cursor; sorted by last active or
  // by spend it is the top 200 and says when there were more.
  app.get(
    "/people",
    {
      schema: {
        querystring: z.object({
          state: z.enum(["all", "active", "disabled"]).default("all"),
          q: z.string().trim().max(320).optional(),
          sort: z.enum(["joined", "active", "spend"]).default("joined"),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(PAGE),
        }),
        response: {
          200: z.object({ rows: z.array(listRow), nextCursor: z.string().nullable(), capped: z.boolean() }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const { state, q, sort, cursor } = request.query;
      const paged = sort === "joined";
      const limit = paged ? request.query.limit : TOP;
      const after = paged && cursor ? decodeCursor(cursor) : null;

      const filters: RawBuilder<unknown>[] = [onPeople("a")];
      if (state !== "all") filters.push(sql`a.state = ${state}`);
      if (q) {
        // Substring, case-insensitive, on the name and the address. What was
        // typed is a string to find, so a wildcard in it is only a character.
        const like = `%${escapeLike(q.toLowerCase())}%`;
        filters.push(sql`(lower(a.email) like ${like} escape '\\' or lower(coalesce(a.display_name, '')) like ${like} escape '\\')`);
      }
      if (after) filters.push(sql`a.id < ${after}`);

      const order =
        sort === "spend" ? sql`spend desc, a.id desc` : sort === "active" ? sql`last_active desc nulls last, a.id desc` : sql`a.id desc`;

      // One extra row, so whether there is more is answered by the query.
      const found = (
        await sql<{
          id: string;
          display_name: string | null;
          email: string;
          state: "active" | "disabled";
          created_at: Date;
          delete_after: Date | null;
          providers: string[];
          threads: string;
          last_active: Date | null;
          spend: string;
          staff_role: "support" | "owner" | null;
        }>`
          select a.id, a.display_name, a.email, a.state, a.created_at, a.delete_after,
                 ${providersOf("a")} as providers,
                 (select count(*) from thread_members m join threads t on t.id = m.thread_id
                   where m.account_id = a.id and m.state = 'accepted' and t.deleted_at is null) as threads,
                 ${lastActive("a")} as last_active,
                 ${spend30("a")} as spend,
                 (select st.role from staff st where st.account_id = a.id) as staff_role
          from accounts a
          where ${sql.join(filters, sql` and `)}
          order by ${order}
          limit ${limit + 1}`.execute(db)
      ).rows;

      const rows = found.slice(0, limit);
      const last = rows[rows.length - 1];
      const owners = await activeOwners(db);

      return reply.send({
        rows: rows.map((account) => ({
          id: account.id,
          name: account.display_name,
          email: account.email,
          providers: account.providers,
          threads: Number(account.threads),
          joined: account.created_at.toISOString(),
          lastActive: account.last_active?.toISOString() ?? null,
          spendMicros: Number(account.spend),
          state: account.state,
          deleteAfter: account.delete_after?.toISOString() ?? null,
          can: canOf(request.staff!, { id: account.id, state: account.state, staffRole: account.staff_role, deleting: account.delete_after !== null }, owners),
        })),
        nextCursor: paged && found.length > limit && last ? encodeCursor(last.id) : null,
        capped: !paged && found.length > limit,
      });
    },
  );

  // The stats row.
  app.get(
    "/people/stats",
    {
      schema: {
        response: {
          200: z.object({
            accounts: z.number().int(),
            /** A session used or a turn started in the last seven days. */
            activeThisWeek: z.number().int(),
            disabled: z.number().int(),
            /** Per account, over the last 30 days. */
            averageSpendMicros: z.number().int(),
          }),
          404: notFound,
        },
      },
    },
    async (_request, reply) => {
      const row = (
        await sql<{ accounts: string; disabled: string; active_week: string; spend: string }>`
          select count(*) as accounts,
                 count(*) filter (where a.state = 'disabled') as disabled,
                 count(*) filter (where ${lastActive("a")} > now() - interval '7 days') as active_week,
                 coalesce(sum(${spend30("a")}), 0) as spend
          from accounts a
          where ${onPeople("a")}`.execute(db)
      ).rows[0]!;
      const accounts = Number(row.accounts);
      return reply.send({
        accounts,
        activeThisWeek: Number(row.active_week),
        disabled: Number(row.disabled),
        averageSpendMicros: accounts > 0 ? Math.round(Number(row.spend) / accounts) : 0,
      });
    },
  );

  // Disable. Signs the account out everywhere and refuses new sign-ins: the
  // gate reads the state (`auth/gate.ts`), and the one rule for scheduled
  // work reads it too (`accounts/active.ts`). Nothing is deleted. A live
  // stream closes itself when its session goes.
  app.post(
    "/people/:id/disable",
    {
      config: { audit: "disabled" },
      schema: { params: idParams, response: { 200: z.object({ status: z.literal("disabled") }), 404: notFound, 409: refused } },
    },
    async (request, reply) => {
      const outcome = await db.transaction().execute(async (tx) => {
        const target = await lockTarget(tx, request.params.id);
        if (!target) return "not-found" as const;
        const reason = await guardLocked(tx, request.staff!, target);
        if (reason) return reason;
        // Twice is once: nothing to write and nothing to record.
        if (target.state === "disabled") return null;
        await tx.updateTable("accounts").set({ state: "disabled", disabled_at: sql`now()`, updated_at: sql`now()` }).where("id", "=", target.id).execute();
        await tx.deleteFrom("sessions").where("account_id", "=", target.id).execute();
        await audit(tx, { staff: request.staff!, kind: "disabled", targetAccountId: target.id });
        return null;
      });
      if (outcome === "not-found") return reply.status(404).send({ error: "not-found" as const });
      if (outcome) return reply.status(409).send({ error: "refused" as const, reason: outcome });
      return reply.send({ status: "disabled" as const });
    },
  );

  // Enable. Puts them back as they were. An account marked for deletion is
  // not enabled from here: cancelling the deletion is its own action.
  app.post(
    "/people/:id/enable",
    {
      config: { audit: "enabled" },
      schema: { params: idParams, response: { 200: z.object({ status: z.literal("active") }), 404: notFound, 409: refused } },
    },
    async (request, reply) => {
      const outcome = await db.transaction().execute(async (tx) => {
        const target = await lockTarget(tx, request.params.id);
        if (!target) return "not-found" as const;
        const reason = await guardLocked(tx, request.staff!, target);
        if (reason) return reason;
        if (target.state === "active") return "already" as const;
        if (target.deleting) return "deleting" as const;
        await tx.updateTable("accounts").set({ state: "active", disabled_at: null, updated_at: sql`now()` }).where("id", "=", target.id).execute();
        await audit(tx, { staff: request.staff!, kind: "enabled", targetAccountId: target.id });
        return null;
      });
      if (outcome === "not-found") return reply.status(404).send({ error: "not-found" as const });
      if (outcome && outcome !== "already") return reply.status(409).send({ error: "refused" as const, reason: outcome });

      if (outcome === null) {
        // After the commit: the calendar chain stopped while they were locked
        // and nothing else restarts it before the daily supervisor.
        const connections = await db
          .selectFrom("connector_connections")
          .select("id")
          .where("account_id", "=", request.params.id)
          .where("state", "=", "active")
          .where("deleted_at", "is", null)
          .execute();
        for (const connection of connections) await syncNow(connection.id);
      }
      return reply.send({ status: "active" as const });
    },
  );

  // Sign out everywhere. Ends their sessions and leaves the account as it is.
  //
  // Support may not do it to staff, for the reason it may not disable them:
  // it puts somebody out of the panel. The same refusal, in the same shape.
  // Yourself is allowed, which disable is not: it is your own session to end,
  // and nothing is lost by it. There is no last-owner rule, because nobody
  // stops being an owner by signing in again.
  app.post(
    "/people/:id/sign-out",
    {
      config: { audit: "signed_out" },
      schema: {
        params: idParams,
        response: { 200: z.object({ status: z.literal("signed-out"), sessions: z.number().int() }), 404: notFound, 409: refused },
      },
    },
    async (request, reply) => {
      const staff = request.staff!;
      const ended = await db.transaction().execute(async (tx) => {
        const target = await lockTarget(tx, request.params.id);
        if (!target) return null;
        if (target.staffRole && target.id !== staff.accountId && !atLeast(staff.role, "owner")) return "staff" as const;
        const gone = await tx.deleteFrom("sessions").where("account_id", "=", target.id).returning("id").execute();
        await audit(tx, { staff: request.staff!, kind: "signed_out", targetAccountId: target.id });
        return gone.length;
      });
      if (ended === null) return reply.status(404).send({ error: "not-found" as const });
      if (ended === "staff") return reply.status(409).send({ error: "refused" as const, reason: ended });
      return reply.send({ status: "signed-out" as const, sessions: ended });
    },
  );

  // Delete, owner only. Locks the account as disable does and marks it; a
  // day later `account.delete` destroys it (035's `deleteAccount`). Nothing
  // is destroyed here, and the address has to be typed back.
  app.post(
    "/people/:id/delete",
    {
      config: { rank: "owner", audit: "deletion.scheduled" },
      schema: {
        params: idParams,
        body: z.object({ email: z.string().max(320) }).strict(),
        response: { 200: z.object({ status: z.literal("scheduled"), deleteAfter: z.string() }), 404: notFound, 409: refused },
      },
    },
    async (request, reply) => {
      const outcome = await db.transaction().execute(async (tx) => {
        const target = await lockTarget(tx, request.params.id);
        if (!target) return "not-found" as const;
        const reason = await guardLocked(tx, request.staff!, target);
        if (reason) return reason;
        const account = await tx.selectFrom("accounts").select(["email", "delete_after"]).where("id", "=", target.id).executeTakeFirstOrThrow();
        if (request.body.email.trim().toLowerCase() !== account.email.toLowerCase()) return "email" as const;
        // Twice is once: the first mark stands, with its own time.
        if (account.delete_after) return { deleteAfter: account.delete_after };

        const marked = await tx
          .updateTable("accounts")
          .set({
            state: "disabled",
            disabled_at: sql`coalesce(disabled_at, now())`,
            delete_after: sql`now() + make_interval(hours => ${HOLD_HOURS})`,
            delete_requested_by: request.staff!.accountId,
            updated_at: sql`now()`,
          })
          .where("id", "=", target.id)
          .returning("delete_after")
          .executeTakeFirstOrThrow();
        await tx.deleteFrom("sessions").where("account_id", "=", target.id).execute();
        await audit(tx, { staff: request.staff!, kind: "deletion.scheduled", targetAccountId: target.id });
        // Not the job's own account: a job that names one goes with it, and
        // this one has to outlive the row to record what it did.
        await enqueue({
          kind: "account.delete",
          payload: { accountId: target.id },
          priority: PRIORITY.scheduled,
          runAfter: marked.delete_after!,
          idempotencyKey: `account.delete:${target.id}:${marked.delete_after!.toISOString()}`,
          tx,
        });
        await alertOwners(tx, "deletion.scheduled", request.staff!, target.id);
        return { deleteAfter: marked.delete_after! };
      });
      if (outcome === "not-found") return reply.status(404).send({ error: "not-found" as const });
      if (typeof outcome === "string") return reply.status(409).send({ error: "refused" as const, reason: outcome });
      return reply.send({ status: "scheduled" as const, deleteAfter: outcome.deleteAfter.toISOString() });
    },
  );

  // Cancel. Clears the mark and leaves the account disabled; enabling it is
  // its own action. The job booked for the mark finds none and does nothing.
  app.post(
    "/people/:id/delete/cancel",
    {
      config: { rank: "owner", audit: "deletion.cancelled" },
      schema: { params: idParams, response: { 200: z.object({ status: z.literal("cancelled") }), 404: notFound, 409: refused } },
    },
    async (request, reply) => {
      const outcome = await db.transaction().execute(async (tx) => {
        const target = await lockTarget(tx, request.params.id);
        if (!target) return "not-found" as const;
        if (!target.deleting) return "not_marked" as const;
        await tx.updateTable("accounts").set({ delete_after: null, delete_requested_by: null, updated_at: sql`now()` }).where("id", "=", target.id).execute();
        await audit(tx, { staff: request.staff!, kind: "deletion.cancelled", targetAccountId: target.id });
        await alertOwners(tx, "deletion.cancelled", request.staff!, target.id);
        return null;
      });
      if (outcome === "not-found") return reply.status(404).send({ error: "not-found" as const });
      if (outcome) return reply.status(409).send({ error: "refused" as const, reason: outcome });
      return reply.send({ status: "cancelled" as const });
    },
  );

  // Opening a person's page, recorded once per staff member, person and day.
  // A write the page makes after it loads, because no read changes anything.
  app.post(
    "/people/:id/viewed",
    {
      config: { audit: "person.viewed" },
      schema: { params: idParams, response: { 200: z.object({ status: z.literal("recorded") }), 404: notFound } },
    },
    async (request, reply) => {
      const found = await db.transaction().execute(async (tx) => {
        const target = await tx.selectFrom("accounts").select("id").where("id", "=", request.params.id).where(onPeople("accounts")).executeTakeFirst();
        // The unique index makes the second one today a no-op.
        if (target) await audit(tx, { staff: request.staff!, kind: "person.viewed", targetAccountId: target.id });
        return target !== undefined;
      });
      if (!found) return reply.status(404).send({ error: "not-found" as const });
      return reply.send({ status: "recorded" as const });
    },
  );

  // One account.
  app.get("/people/:id", { schema: { params: idParams, response: { 200: person, 404: notFound, 410: gone } } }, async (request, reply) => {
    const id = request.params.id;
    const account = (
      await sql<{
        id: string;
        display_name: string | null;
        email: string;
        state: "active" | "disabled";
        created_at: Date;
        first_signed_in_at: Date;
        disabled_at: Date | null;
        delete_after: Date | null;
        country: string | null;
        time_zone: string | null;
        consent_version: string | null;
        providers: string[];
        last_active: Date | null;
        staff_role: "support" | "owner" | null;
      }>`
        select a.id, a.display_name, a.email, a.state, a.created_at, a.first_signed_in_at, a.disabled_at, a.delete_after,
               a.country, a.time_zone, a.consent_version,
               ${providersOf("a")} as providers,
               ${lastActive("a")} as last_active,
               (select st.role from staff st where st.account_id = a.id) as staff_role
        from accounts a
        where a.id = ${id} and ${onPeople("a")}`.execute(db)
    ).rows[0];
    if (!account) {
      // A deleted account's page is its head only: that it was deleted, and
      // when. The audit log is all that still names it.
      const deleted = await db
        .selectFrom("staff_audit")
        .select("at")
        .where("kind", "=", "deleted")
        .where("target_account_id", "=", id)
        .orderBy("at", "desc")
        .executeTakeFirst();
      if (deleted) return reply.status(410).send({ error: "deleted" as const, deletedAt: deleted.at.toISOString() });
      return reply.status(404).send({ error: "not-found" as const });
    }

    const [inviter, used, refusedBy, overrides, has, owners] = await Promise.all([
      // The newest invite the audit log holds for them, and who made it.
      sql<{ id: string; name: string }>`
        select s.id, coalesce(s.display_name, s.email) as name
        from staff_audit e join accounts s on s.id = e.staff_account_id
        where e.kind = 'invited' and e.target_account_id = ${id}
        order by e.at desc, e.id desc
        limit 1`.execute(db),
      usedToday(id),
      limitReached(id),
      sql<{ key: string; value: string; updated_at: Date; set_by: string | null; set_by_name: string | null }>`
        select l.key, l.value, l.updated_at, l.set_by_account_id as set_by, coalesce(s.display_name, s.email) as set_by_name
        from account_limits l left join accounts s on s.id = l.set_by_account_id
        where l.account_id = ${id}`.execute(db),
      // Counts only. No name, no second address, no address a session came from.
      sql<{
        threads_alone: string;
        threads_shared: string;
        dumped: string;
        notes: string;
        connections: string;
        files: string;
        file_bytes: string;
        calendars: string;
        calendars_failed: string;
        ios: string;
        android: string;
        sessions: string;
        session_last_used: Date | null;
      }>`
        with mine as (
          select m.thread_id,
                 exists (select 1 from thread_members o
                          where o.thread_id = m.thread_id and o.account_id <> m.account_id and o.state = 'accepted') as shared
          from thread_members m join threads t on t.id = m.thread_id
          where m.account_id = ${id} and m.state = 'accepted' and t.deleted_at is null
        )
        select
          (select count(*) from mine where not shared) as threads_alone,
          (select count(*) from mine where shared) as threads_shared,
          (select count(*) from messages where account_id = ${id} and role = 'person' and deleted_at is null) as dumped,
          (select count(*) from notes where account_id = ${id} and deleted_at is null and superseded_at is null) as notes,
          (select count(*) from connections where account_a = ${id} or account_b = ${id}) as connections,
          (select count(*) from blobs where account_id = ${id} and deleted_at is null) as files,
          (select coalesce(sum(byte_size), 0) from blobs where account_id = ${id} and deleted_at is null) as file_bytes,
          (select count(*) from connector_connections where account_id = ${id} and deleted_at is null) as calendars,
          (select count(*) from connector_connections
            where account_id = ${id} and deleted_at is null
              and (state <> 'active' or (last_error_at is not null and (last_sync_at is null or last_error_at > last_sync_at)))) as calendars_failed,
          (select count(*) from push_tokens where account_id = ${id} and platform = 'ios') as ios,
          (select count(*) from push_tokens where account_id = ${id} and platform = 'android') as android,
          (select count(*) from sessions where account_id = ${id} and expires_at > now()) as sessions,
          (select max(updated_at) from sessions where account_id = ${id} and expires_at > now()) as session_last_used`.execute(db),
      activeOwners(db),
    ]);

    const own = new Map(overrides.rows.map((row) => [row.key, row]));
    const caps = await Promise.all(
      CAP_KEYS.map(async (key) => {
        const limit = await limitFor(id, key);
        return { key, used: used[key], limit, reached: used[key] >= limit };
      }),
    );
    const limits = await Promise.all(
      CAP_KEYS.map(async (key) => {
        const def = settingDef(key);
        const row = own.get(key);
        return {
          key,
          kind: def.kind as "int" | "micros",
          global: await setting(key),
          override: row ? Number(row.value) : null,
          min: def.min!,
          max: def.max!,
          setBy: row?.set_by && row.set_by_name ? { id: row.set_by, name: row.set_by_name } : null,
          setAt: row?.updated_at.toISOString() ?? null,
        };
      }),
    );
    const counts = has.rows[0]!;
    const calendars = Number(counts.calendars);

    return reply.send({
      id: account.id,
      name: account.display_name,
      email: account.email,
      state: account.state,
      joined: account.created_at.toISOString(),
      firstSignedInAt: account.first_signed_in_at.toISOString(),
      lastActive: account.last_active?.toISOString() ?? null,
      disabledAt: account.disabled_at?.toISOString() ?? null,
      deleteAfter: account.delete_after?.toISOString() ?? null,
      providers: account.providers,
      country: account.country,
      timeZone: account.time_zone,
      consentVersion: account.consent_version,
      invitedBy: inviter.rows[0] ?? null,
      can: {
        ...canOf(request.staff!, { id: account.id, state: account.state, staffRole: account.staff_role, deleting: account.delete_after !== null }, owners),
        limits: atLeast(request.staff!.role, "owner"),
      },
      today: { caps, refused: refusedBy },
      limits,
      has: {
        threadsAlone: Number(counts.threads_alone),
        threadsShared: Number(counts.threads_shared),
        dumped: Number(counts.dumped),
        notes: Number(counts.notes),
        connections: Number(counts.connections),
        files: Number(counts.files),
        fileBytes: Number(counts.file_bytes),
        calendars,
        calendarSync: calendars === 0 ? null : Number(counts.calendars_failed) > 0 ? ("failed" as const) : ("ok" as const),
        devices: { ios: Number(counts.ios), android: Number(counts.android) },
        sessions: Number(counts.sessions),
        sessionLastUsed: counts.session_last_used?.toISOString() ?? null,
      },
    });
  });

  // Cost and activity per UTC day, one point a day, zero on a day with
  // nothing. Turns come from the job table, which is kept 30 days.
  app.get(
    "/people/:id/usage",
    {
      schema: {
        params: idParams,
        querystring: z.object({ range: z.enum(["24h", "7d", "30d", "90d"]).default("30d") }),
        response: {
          200: z.object({
            days: z.array(
              z.object({
                day: z.string(),
                costMicros: z.number().int(),
                turns: z.number().int(),
                photos: z.number().int(),
                voiceNotes: z.number().int(),
                mail: z.number().int(),
              }),
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      if (!(await onList(id))) return reply.status(404).send({ error: "not-found" as const });
      const back = RANGE_DAYS[request.query.range] - 1;
      const rows = (
        await sql<{ day: string; cost: string; turns: string; photos: string; voice: string; mail: string }>`
          with days as (
            select generate_series((now() at time zone 'UTC')::date - ${back}::int, (now() at time zone 'UTC')::date, interval '1 day')::date as day
          )
          select to_char(d.day, 'YYYY-MM-DD') as day,
            coalesce((select sum(cost_micros) from llm_usage where account_id = ${id} and (created_at at time zone 'UTC')::date = d.day), 0)
              + coalesce((select sum(cost_micros) from lookups where account_id = ${id} and (created_at at time zone 'UTC')::date = d.day), 0) as cost,
            (select count(*) from jobs where account_id = ${id} and kind = 'dump.answer' and (created_at at time zone 'UTC')::date = d.day) as turns,
            (select count(*) from blobs where account_id = ${id} and kind = 'image' and (created_at at time zone 'UTC')::date = d.day) as photos,
            (select count(*) from blobs where account_id = ${id} and kind = 'audio' and (created_at at time zone 'UTC')::date = d.day) as voice,
            (select count(*) from messages where account_id = ${id} and source = 'mail' and (created_at at time zone 'UTC')::date = d.day) as mail
          from days d
          order by d.day`.execute(db)
      ).rows;
      return reply.send({
        days: rows.map((row) => ({
          day: row.day,
          costMicros: Number(row.cost),
          turns: Number(row.turns),
          photos: Number(row.photos),
          voiceNotes: Number(row.voice),
          mail: Number(row.mail),
        })),
      });
    },
  );

  // What happened: their jobs, newest first. The code and never the text.
  //
  // Model, tokens and cost are the ledger rows that name the job (0076): the
  // distinct models, and the sums. A job that called no model has none of
  // them, which is not a zero. Search fees are in `lookups`, which names no
  // job, so a turn's cost here is its model calls and its transcription.
  //
  // The job table keeps no start time either: `locked_at` is cleared when a
  // job settles. How long is from when it could first run to when it settled.
  app.get(
    "/people/:id/timeline",
    {
      schema: {
        params: idParams,
        querystring: z.object({ failed: z.enum(["1", "true"]).optional(), cursor: z.string().optional() }),
        response: {
          200: z.object({
            rows: z.array(
              z.object({
                id: z.string().uuid(),
                kind: z.string(),
                state: z.enum(["queued", "running", "done", "failed", "dead"]),
                attempts: z.number().int(),
                at: z.string(),
                durationMs: z.number().int().nullable(),
                errorCode: z.string().nullable(),
                /** The models it called, by name. Null when it called none. */
                model: z.string().nullable(),
                tokensIn: z.number().int().nullable(),
                tokensOut: z.number().int().nullable(),
                costMicros: z.number().int().nullable(),
                /** Dead, and not yet given its one more attempt. */
                canRetry: z.boolean(),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      if (!(await onList(id))) return reply.status(404).send({ error: "not-found" as const });
      const after = request.query.cursor ? decodeCursor(request.query.cursor) : null;

      let query = db
        .selectFrom("jobs")
        .select([
          "id",
          "kind",
          "state",
          "attempts",
          "created_at",
          "error_code",
          "retried_at",
          sql<string | null>`case when state in ('done', 'failed', 'dead')
            then greatest(0, round(extract(epoch from (updated_at - greatest(created_at, run_after))) * 1000)) end`.as("duration_ms"),
          sql<string | null>`(select string_agg(distinct u.model, ', ' order by u.model) from llm_usage u where u.job_id = jobs.id)`.as("model"),
          sql<string | null>`(select sum(u.input_tokens) from llm_usage u where u.job_id = jobs.id)`.as("tokens_in"),
          sql<string | null>`(select sum(u.output_tokens) from llm_usage u where u.job_id = jobs.id)`.as("tokens_out"),
          sql<string | null>`(select sum(u.cost_micros) from llm_usage u where u.job_id = jobs.id)`.as("cost_micros"),
        ])
        .where("account_id", "=", id)
        .orderBy("id", "desc")
        .limit(PAGE + 1);
      if (request.query.failed) query = query.where("error_code", "is not", null);
      if (after) query = query.where("id", "<", after);

      const found = await query.execute();
      const rows = found.slice(0, PAGE);
      const last = rows[rows.length - 1];
      return reply.send({
        rows: rows.map((job) => ({
          id: job.id,
          kind: job.kind,
          state: job.state,
          attempts: job.attempts,
          at: job.created_at.toISOString(),
          durationMs: job.duration_ms === null ? null : Number(job.duration_ms),
          errorCode: job.error_code,
          model: job.model,
          tokensIn: job.tokens_in === null ? null : Number(job.tokens_in),
          tokensOut: job.tokens_out === null ? null : Number(job.tokens_out),
          costMicros: job.cost_micros === null ? null : Number(job.cost_micros),
          canRetry: job.state === "dead" && job.retried_at === null,
        })),
        nextCursor: found.length > PAGE && last ? encodeCursor(last.id) : null,
      });
    },
  );

  // Each time a cap refused them, for 30 days, which is how long a hit is kept.
  app.get(
    "/people/:id/hits",
    {
      schema: {
        params: idParams,
        response: {
          200: z.object({
            rows: z.array(
              z.object({ cap: z.string(), scope: z.enum(["account", "platform"]), day: z.string(), count: z.number().int(), lastAt: z.string() }),
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      if (!(await onList(id))) return reply.status(404).send({ error: "not-found" as const });
      const rows = (
        await sql<{ cap: string; scope: "account" | "platform"; day: string; count: number; last_at: Date }>`
          select cap, scope, to_char(day, 'YYYY-MM-DD') as day, count, last_at
          from limit_hits
          where account_id = ${id} and day >= (now() at time zone 'UTC')::date - 30
          order by limit_hits.day desc, last_at desc`.execute(db)
      ).rows;
      return reply.send({
        rows: rows.map((row) => ({ cap: row.cap, scope: row.scope, day: row.day, count: row.count, lastAt: row.last_at.toISOString() })),
      });
    },
  );

  // One account's own value for a per-person cap. Owner only. Null clears it.
  //
  // `config.audit` holds one kind, so the route declares `override.set` and
  // writes `override.cleared` when the value is null.
  //
  // 400 is not in the response map, for the reason `limits.ts` gives.
  app.patch(
    "/people/:id/limits",
    {
      config: { rank: "owner", audit: "override.set" },
      schema: {
        params: idParams,
        body: z.object({ key: z.string(), value: z.number().nullable() }),
        response: { 200: z.object({ key: z.string(), value: z.number().nullable() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const { key, value } = request.body;
      // Only a per-person cap can be overridden, and only inside the bounds
      // the setting itself has.
      if (!isCapKey(key)) {
        return (reply as FastifyReply).code(400).send({ error: "unknown_key", key, min: null, max: null });
      }
      const def = settingDef(key);
      if (value !== null && !validSetting(def, value)) {
        return (reply as FastifyReply).code(400).send({ error: "out_of_bounds", key, min: def.min ?? null, max: def.max ?? null });
      }

      const found = await db.transaction().execute(async (tx) => {
        const target = await lockTarget(tx, request.params.id);
        if (!target) return false;
        const before = await tx.selectFrom("account_limits").select("value").where("account_id", "=", target.id).where("key", "=", key).executeTakeFirst();
        const old = before ? Number(before.value) : null;
        if (old === value) return true;
        if (value === null) {
          await tx.deleteFrom("account_limits").where("account_id", "=", target.id).where("key", "=", key).execute();
        } else {
          await tx
            .insertInto("account_limits")
            .values({ account_id: target.id, key, value, set_by_account_id: request.staff!.accountId })
            .onConflict((oc) =>
              oc.columns(["account_id", "key"]).doUpdateSet({ value, set_by_account_id: request.staff!.accountId, updated_at: sql`now()` }),
            )
            .execute();
        }
        await audit(tx, {
          staff: request.staff!,
          kind: value === null ? "override.cleared" : "override.set",
          targetAccountId: target.id,
          settingKey: key,
          old,
          new: value,
        });
        return true;
      });
      if (!found) return reply.status(404).send({ error: "not-found" as const });

      // After the commit, so this instance's next check reads it. Every other
      // instance sees it inside the cache's fifteen seconds. Theirs alone:
      // the settings, and everybody else's overrides, stay as they were read.
      clearOverrides(request.params.id);
      return reply.send({ key, value });
    },
  );
}
