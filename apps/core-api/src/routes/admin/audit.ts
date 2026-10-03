// 034, section F. The audit log, read.
//
// Registered by the admin plugin in the owner scope, so every path here is
// relative to `/v1/admin` and already behind the owner check. There are only
// GETs: an entry is written by the route that did the thing, in that route's
// transaction, and nothing changes or removes one. The database refuses both
// (0075), and this file offers neither.
//
// A stored entry names accounts by id and holds no address. Who and on whom
// are joined from `accounts` when the log is read, which is why an account
// that has gone reads as its id and nothing else.

import { z } from "zod";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { AUDIT_KINDS } from "../../admin/audit.js";

const PAGE = 50;
const DEFAULT_DAYS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cleared control sends an empty value, and that is no filter. */
const blank = (value: unknown) => (value === "" ? undefined : value);

const notFound = z.object({ error: z.literal("not-found") });

/** A staff member, or their id alone once the account is gone. */
const who = z.union([z.object({ id: z.string().uuid(), name: z.string().nullable(), email: z.string() }), z.object({ id: z.string().uuid() })]);

const entry = z.object({
  id: z.string().uuid(),
  at: z.string(),
  kind: z.string(),
  staff: who,
  target: z
    .union([
      z.object({ id: z.string().uuid(), name: z.string().nullable(), email: z.string(), deleted: z.literal(false) }),
      z.object({ id: z.string().uuid(), deleted: z.literal(true) }),
    ])
    .nullable(),
  settingKey: z.string().nullable(),
  /** A setting's, an override's or a role's value before and after. */
  old: z.unknown(),
  new: z.unknown(),
  jobId: z.string().uuid().nullable(),
});

/** The cursor is the last row's id, as on the waitlist and for its reason:
 *  ids are UUIDv7, so the order is by time and total, and nothing is lost
 *  going through a JavaScript Date. */
function encodeCursor(id: string): string {
  return Buffer.from(id).toString("base64url");
}

function decodeCursor(cursor: string): string | null {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return UUID.test(id) ? id : null;
}

export async function auditAdminRoutes(app: App): Promise<void> {
  app.get(
    "/audit",
    {
      schema: {
        querystring: z.object({
          staff: z.preprocess(blank, z.string().uuid().optional()),
          kind: z.preprocess(blank, z.enum(AUDIT_KINDS).optional()),
          /** An account's id, or an address to find one by. */
          person: z.preprocess(blank, z.string().trim().max(320).optional()),
          cursor: z.preprocess(blank, z.string().optional()),
          /** How far back. Thirty days unless asked for more. */
          from: z.preprocess(blank, z.coerce.date().optional()),
        }),
        response: { 200: z.object({ rows: z.array(entry), nextCursor: z.string().nullable() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const { staff, kind, person, cursor } = request.query;
      const from = request.query.from ?? new Date(Date.now() - DEFAULT_DAYS * 86_400_000);
      const before = cursor ? decodeCursor(cursor) : null;

      // The person, as ids. An address is resolved here and never stored or
      // echoed; one that belongs to nobody matches nothing, and says nothing
      // about why.
      let targets: string[] | null = null;
      if (person) {
        if (UUID.test(person)) targets = [person];
        else {
          const found = await db
            .selectFrom("accounts")
            .select("id")
            .where((eb) => eb(eb.fn("lower", ["email"]), "=", person.toLowerCase()))
            .execute();
          targets = found.map((account) => account.id);
        }
        if (targets.length === 0) return reply.send({ rows: [], nextCursor: null });
      }

      let query = db
        .selectFrom("staff_audit as entry")
        .leftJoin("accounts as actor", "actor.id", "entry.staff_account_id")
        .leftJoin("accounts as target", "target.id", "entry.target_account_id")
        .select([
          "entry.id as id",
          "entry.at as at",
          "entry.kind as kind",
          "entry.staff_account_id as staff_id",
          "entry.target_account_id as target_id",
          "entry.setting_key as setting_key",
          "entry.old_value as old_value",
          "entry.new_value as new_value",
          "entry.job_id as job_id",
          "actor.id as actor_found",
          "actor.display_name as actor_name",
          "actor.email as actor_email",
          "actor.deleted_at as actor_deleted_at",
          "target.id as target_found",
          "target.display_name as target_name",
          "target.email as target_email",
          "target.deleted_at as target_deleted_at",
        ])
        .where("entry.at", ">=", from)
        // Newest first. One extra row answers whether there is a next page.
        .orderBy("entry.id", "desc")
        .limit(PAGE + 1);

      if (staff) query = query.where("entry.staff_account_id", "=", staff);
      if (kind) query = query.where("entry.kind", "=", kind);
      if (targets) query = query.where("entry.target_account_id", "in", targets);
      if (before) query = query.where("entry.id", "<", before);

      const found = await query.execute();
      const rows = found.slice(0, PAGE);
      const last = rows[rows.length - 1];

      return reply.send({
        rows: rows.map((row) => ({
          id: row.id,
          at: row.at.toISOString(),
          kind: row.kind,
          staff:
            row.actor_found && row.actor_email !== null && !row.actor_deleted_at
              ? { id: row.staff_id, name: row.actor_name, email: row.actor_email }
              : { id: row.staff_id },
          target:
            row.target_id === null
              ? null
              : row.target_found && row.target_email !== null && !row.target_deleted_at
                ? { id: row.target_id, name: row.target_name, email: row.target_email, deleted: false as const }
                : { id: row.target_id, deleted: true as const },
          settingKey: row.setting_key,
          old: row.old_value ?? null,
          new: row.new_value ?? null,
          jobId: row.job_id,
        })),
        nextCursor: found.length > PAGE && last ? encodeCursor(last.id) : null,
      });
    }
  );

  // What the filter controls offer: the staff members and the kinds the log
  // actually holds, so no control offers a choice that finds nothing.
  app.get(
    "/audit/facets",
    { schema: { response: { 200: z.object({ staff: z.array(who), kinds: z.array(z.string()) }), 404: notFound } } },
    async (_request, reply) => {
      const [people, kinds] = await Promise.all([
        db
          .selectFrom(db.selectFrom("staff_audit").select("staff_account_id").distinct().as("seen"))
          .leftJoin("accounts as actor", "actor.id", "seen.staff_account_id")
          .select(["seen.staff_account_id as id", "actor.display_name as name", "actor.email as email", "actor.deleted_at as deleted_at"])
          .orderBy("actor.email")
          .orderBy("seen.staff_account_id")
          .execute(),
        db.selectFrom("staff_audit").select("kind").distinct().orderBy("kind").execute(),
      ]);

      return reply.send({
        staff: people.map((row) => (row.email !== null && !row.deleted_at ? { id: row.id, name: row.name, email: row.email } : { id: row.id })),
        kinds: kinds.map((row) => row.kind),
      });
    }
  );
}
