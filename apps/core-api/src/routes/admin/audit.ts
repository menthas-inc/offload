// 034, section F. The audit log, read.
//
// Registered by the admin plugin in the owner scope, so every path here is
// relative to `/v1/admin` and already behind the owner check. Reads, and the
// export, which adds its own entry: an entry is written by the route that did
// the thing, in that route's transaction, and nothing changes or removes one.
// The database refuses both (0075), and this file offers neither.
//
// A stored entry names accounts by id and holds no address. Who and on whom
// are joined from `accounts` when the log is read, which is why an account
// that has gone reads as its id and nothing else.

import { Readable } from "node:stream";
import { z } from "zod";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { AUDIT_KINDS, audit } from "../../admin/audit.js";
import { csvCell } from "./costs.js";

const PAGE = 50;
const DEFAULT_DAYS = 30;
/** The export's period when none is asked for. */
const EXPORT_DAYS = 90;
/** Rows read at a time while the export streams, so a long log is never
 *  held whole. */
const CHUNK = 1000;
const DAY_MS = 86_400_000;

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

/** The log as the page reads it: each entry with who and on whom joined from
 *  `accounts` as they are now. The list and the export both read through
 *  this and `toEntry`, so the file holds what the page shows and no more. */
function entries() {
  return db
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
    ]);
}

type Found = Awaited<ReturnType<ReturnType<typeof entries>["execute"]>>[number];
type Entry = z.infer<typeof entry>;

function toEntry(row: Found): Entry {
  return {
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
  };
}

const AUDIT_CSV = ["id", "at", "kind", "staff_id", "staff_name", "staff_email", "target_id", "target_name", "target_email", "target_deleted", "setting_key", "old", "new", "job_id"];

/** A stored value as a cell: a role or a word as itself, a number or a
 *  switch as written, nothing as nothing, and the one map as its JSON. */
function valueCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return csvCell(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return csvCell(JSON.stringify(value));
}

function csvLine(one: Entry): string {
  const staff = "email" in one.staff ? one.staff : null;
  const target = one.target && !one.target.deleted ? one.target : null;
  return [
    one.id,
    one.at,
    csvCell(one.kind),
    one.staff.id,
    csvCell(staff?.name ?? ""),
    csvCell(staff?.email ?? ""),
    one.target?.id ?? "",
    csvCell(target?.name ?? ""),
    csvCell(target?.email ?? ""),
    one.target ? String(one.target.deleted) : "",
    csvCell(one.settingKey ?? ""),
    valueCell(one.old),
    valueCell(one.new),
    one.jobId ?? "",
  ].join(",");
}

/** The file, a chunk of rows at a time, newest first as the page lists it.
 *  Keyed on the id as the page's cursor is, so an entry written while it
 *  streams is never read twice and none is skipped. */
async function* auditCsv(from: Date, until: Date): AsyncGenerator<string> {
  yield `${AUDIT_CSV.join(",")}\r\n`;
  let before: string | null = null;
  for (;;) {
    let query = entries().where("entry.at", ">=", from).where("entry.at", "<", until).orderBy("entry.id", "desc").limit(CHUNK);
    if (before) query = query.where("entry.id", "<", before);
    const rows = await query.execute();
    if (rows.length > 0) yield rows.map((row) => `${csvLine(toEntry(row))}\r\n`).join("");
    if (rows.length < CHUNK) return;
    before = rows[rows.length - 1]!.id;
  }
}

const utcDay = (at: Date) => at.toISOString().slice(0, 10);

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

      let query = entries()
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
        rows: rows.map(toEntry),
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

  // Going-public 17c. The log for a period, as a file: every column the page
  // shows of an entry, by UTC day with both ends included, the last 90 days
  // unless asked. A POST because it is recorded, with the period in the
  // value, and the entry is written before the first row is read: a
  // download that could not be recorded is not served. It streams, so a long
  // log is never held whole, and the export's own entry is in it when the
  // period runs to today.
  app.post(
    "/audit/export",
    {
      config: { audit: "audit.exported" },
      schema: {
        // No response schema: the answer is a file, as Costs' is.
        body: z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).optional(),
      },
    },
    async (request, reply) => {
      const now = new Date();
      const to = request.body?.to ?? utcDay(now);
      const from = request.body?.from ?? utcDay(new Date(Date.parse(`${to}T00:00:00Z`) - EXPORT_DAYS * DAY_MS));
      // A period that ends before it starts, refused before anything is recorded.
      if (from > to) return reply.status(400).send({ error: "period" as const });

      await db.transaction().execute((tx) => audit(tx, { staff: request.staff!, kind: "audit.exported", new: `${from}/${to}` }));

      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="offload-audit-${from}-to-${to}.csv"`)
        .send(Readable.from(auditCsv(new Date(`${from}T00:00:00Z`), new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS))));
    }
  );
}
