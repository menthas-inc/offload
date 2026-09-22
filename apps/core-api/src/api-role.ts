// Give the API a database role of its own, and hand it the application's objects.
//
// The API connected to production as the superuser from the first deploy, so
// any injection or code execution in it was the whole database and the
// machine underneath: `copy ... to program`, role changes, file reads. The
// worker got a narrow role in 0009; this is the same care for the other
// service (security review 2026-09-22, M5).
//
// The role owns every table, sequence, view and routine in `public`, which is
// what migrations need to alter them and to grant on them, and nothing else:
// no superuser, no createrole. Extension objects stay with the extension, and
// a future migration that says `create extension` runs once as the superuser.
//
// Idempotent, like `agent-role.ts`: run it again to rotate the credential.
//
// **In production this runs inside the API's container**, because the
// database is on the private network:
//
//   railway ssh --service core-api -- \
//     "OFFLOAD_API_PASSWORD=<value> node apps/core-api/dist/api-role.js"
//
// and DATABASE_URL on the service then becomes
// postgresql://offload_api:<value>@postgres.railway.internal:5432/railway.
// The value is never printed by this script.

import { randomBytes } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "./schema.js";

export const ROLE = "offload_api";

const SHAPE = /^[A-Za-z0-9_-]{24,}$/;

function mint(): string {
  return randomBytes(30).toString("base64url");
}

/** Create or rotate the role, then move every application object to it. */
export async function applyApiRole(db: Kysely<Database>, credential: string): Promise<void> {
  // The shape is the whole of the escaping: base64url and nothing else can
  // reach the literal below.
  if (!SHAPE.test(credential)) throw new Error("credential must be at least 24 url-safe characters");

  const existing = await sql<{ n: string }>`
    select count(*) as n from pg_roles where rolname = ${ROLE}`.execute(db);
  if (Number(existing.rows[0]?.n ?? 0) > 0) {
    await sql`alter role ${sql.raw(ROLE)} with login password ${sql.lit(credential)}`.execute(db);
  } else {
    await sql`create role ${sql.raw(ROLE)} login password ${sql.lit(credential)}`.execute(db);
  }

  const database = await sql<{ d: string }>`select current_database() as d`.execute(db);
  await sql`grant connect on database ${sql.id(database.rows[0]!.d)} to ${sql.raw(ROLE)}`.execute(db);
  await sql`grant usage, create on schema public to ${sql.raw(ROLE)}`.execute(db);

  // Ownership, object by object. `reassign owned by` cannot be used for the
  // superuser's objects, so this walks the catalogue instead, skipping what an
  // extension owns.
  await sql`
    do $$ declare r record; begin
      for r in
        select c.relname, c.relkind
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'S', 'v', 'm', 'p')
          and pg_get_userbyid(c.relowner) <> ${sql.lit(ROLE)}
      loop
        execute format(
          'alter %s public.%I owner to ${sql.raw(ROLE)}',
          case r.relkind
            when 'S' then 'sequence'
            when 'v' then 'view'
            when 'm' then 'materialized view'
            else 'table'
          end,
          r.relname
        );
      end loop;
      for r in
        select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and pg_get_userbyid(p.proowner) <> ${sql.lit(ROLE)}
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      loop
        execute format('alter routine %s owner to ${sql.raw(ROLE)}', r.sig);
      end loop;
    end $$`.execute(db);
}

async function main(): Promise<void> {
  const { db } = await import("./db.js");
  const credential = process.env["OFFLOAD_API_PASSWORD"] ?? mint();
  await applyApiRole(db, credential);
  console.log(`  ${ROLE} owns the application's objects and can log in.`);
  console.log(
    process.env["OFFLOAD_API_PASSWORD"]
      ? "  credential: the one you passed, not shown"
      : `  credential: minted, ${credential.length} characters, not shown. Pass OFFLOAD_API_PASSWORD to choose it.`
  );
  await db.destroy();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
