// Migration runner.
//
// Hand-written SQL in migrations/, applied in filename order, each in its own
// transaction, recorded in a table so it runs once. Deliberately small: a
// migration tool is not where this project's complexity should live, and the
// spec calls for hand-written SQL rather than a generated diff.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { db, closeDb } from "./db.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

// One arbitrary constant, shared by every instance. Two containers starting at
// once would otherwise both see the same pending migration and both try to run
// it; the second fails on a duplicate object and takes the deploy with it.
const MIGRATION_LOCK = 4700_0001;

export async function migrate(log: (msg: string) => void = console.log): Promise<number> {
  // Session-level advisory lock: whoever gets here first migrates, the others
  // wait and then find nothing pending. Released explicitly in the finally.
  await sql`select pg_advisory_lock(${MIGRATION_LOCK})`.execute(db);
  try {
    return await runMigrations(log);
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK})`.execute(db);
  }
}

async function runMigrations(log: (msg: string) => void): Promise<number> {
  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `.execute(db);

  const applied = new Set(
    (await db.selectFrom("schema_migrations").select("name").execute()).map((r) => r.name)
  );

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const contents = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    // One transaction per migration. A migration that fails halfway leaves
    // nothing behind, which is the only reason it is safe to just run it again.
    await db.transaction().execute(async (trx) => {
      await sql.raw(contents).execute(trx);
      await trx.insertInto("schema_migrations").values({ name: file }).execute();
    });

    log(`applied ${file}`);
    count += 1;
  }

  if (count === 0) log("no pending migrations");
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  await closeDb();
}
