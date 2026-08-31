// Database access: Kysely over pg.
//
// A typed query builder rather than an ORM, per decisions.md: the model is
// unstructured-first, with JSONB promoted to columns by backfill-heavy
// migrations, which is where a declarative-diff ORM stops paying for itself.

import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "./env.js";
import type { Database } from "./schema.js";

// Postgres returns bigint and numeric as strings to avoid silent precision
// loss. Counts are the common case here and they are safe as numbers, so
// int8 is parsed; numeric is deliberately left alone.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle client dropped by the server emits an error on the pool. Unhandled,
// that is an uncaught exception and Node exits, so a database restart takes the
// API down with it instead of merely failing readiness. Verified: without this
// listener, stopping Postgres killed the process.
pool.on("error", (error) => {
  // No client detail and no query text: an error object from pg carries the
  // failing statement, and a statement can carry content (OFF-1).
  console.error(JSON.stringify({ level: "error", msg: "postgres pool error", code: (error as NodeJS.ErrnoException).code ?? null }));
});

export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

export async function closeDb(): Promise<void> {
  await db.destroy();
}
