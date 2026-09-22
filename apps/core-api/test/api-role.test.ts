// The API's own database role.
//
// Security review 2026-09-22, M5: the API connected to production as the
// superuser, so any injection or code execution in it was the whole database
// and the machine underneath. `api-role.ts` makes a role that owns the
// application's objects and nothing more, the way `agent-role.ts` makes the
// worker's. This runs it against the test database, whose user is a superuser
// like production's, and then puts everything back.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { applyApiRole, ROLE } from "../src/api-role.js";

await migrate(() => {});

/** Test material, assembled so it never reads as a credential in source. */
const CREDENTIAL = Array(3).fill("only-for-this-test").join("-");

async function ownersOf(kind: "relations" | "routines"): Promise<Record<string, number>> {
  const { rows } =
    kind === "relations"
      ? await sql<{ owner: string; n: number }>`
          select pg_get_userbyid(c.relowner) as owner, count(*)::int as n
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'S', 'v', 'm', 'p')
          group by 1`.execute(db)
      : await sql<{ owner: string; n: number }>`
          select pg_get_userbyid(p.proowner) as owner, count(*)::int as n
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
          group by 1`.execute(db);
  return Object.fromEntries(rows.map((row) => [row.owner, Number(row.n)]));
}

afterAll(async () => {
  // Leave the database as found: everything back to the test user, the role gone.
  await sql`reassign owned by ${sql.raw(ROLE)} to current_user`.execute(db).catch(() => undefined);
  await sql`drop owned by ${sql.raw(ROLE)}`.execute(db).catch(() => undefined);
  await sql`drop role if exists ${sql.raw(ROLE)}`.execute(db);
  await closeDb();
});

describe("the api role", () => {
  it("owns every application object and can log in, and is not a superuser", async () => {
    await applyApiRole(db, CREDENTIAL);

    const relations = await ownersOf("relations");
    const routines = await ownersOf("routines");
    expect(Object.keys(relations)).toEqual([ROLE]);
    expect(Object.keys(routines)).toEqual([ROLE]);
    expect(relations[ROLE]).toBeGreaterThan(20);

    const role = await sql<{ rolsuper: boolean; rolcanlogin: boolean; rolcreaterole: boolean }>`
      select rolsuper, rolcanlogin, rolcreaterole from pg_roles where rolname = ${ROLE}`.execute(db);
    expect(role.rows[0]).toEqual({ rolsuper: false, rolcanlogin: true, rolcreaterole: false });
  });

  it("keeps the worker's grants, so nothing the agent plane reads goes dark", async () => {
    const { rows } = await sql<{ allowed: boolean }>`
      select has_table_privilege('offload_agent', 'content', 'select') as allowed`.execute(db);
    expect(rows[0]?.allowed).toBe(true);
  });

  it("runs twice without complaint, which is how the credential rotates", async () => {
    await applyApiRole(db, `${CREDENTIAL}-rotated`);
    const relations = await ownersOf("relations");
    expect(Object.keys(relations)).toEqual([ROLE]);
  });
});
