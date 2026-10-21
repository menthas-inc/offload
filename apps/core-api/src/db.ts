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

// Iterative index scan, set per connection because it is a session GUC.
//
// pgvector applies a filter AFTER the HNSW scan, so a membership-scoped slice
// of a shared index returns far fewer rows than the limit asked for: at the
// default ef_search of 40 and an account holding a tenth of the table, roughly
// four survive. 0.8.0 added this for exactly that, and 001 said to turn it on
// from the start rather than discover it later as "search got worse".
//
// Not a problem at alpha, where one account is most of the table, and a real
// one as accounts multiply. It costs nothing now and it is invisible to fix
// later, which is the whole argument.
//
// `relaxed_order` rather than `strict_order`: the fused ranking reorders
// everything anyway, so paying for exact distance ordering inside the scan buys
// nothing this product reads.
pool.on("connect", (client) => {
  // Every client keeps an error listener for its whole life, idle or checked
  // out. `pool.on("error")` below only covers idle clients; a client that drops
  // mid-query ("Connection terminated unexpectedly", e.g. the minute heartbeat
  // in flight when Postgres closes the socket) emits on the client with no
  // listener, which Node turns into an uncaught exception and the process
  // exits. The query still rejects and the pool discards the client; this only
  // stops a dropped connection from taking the whole API down. No client detail
  // or query text (OFF-1), as the pool handler.
  client.on("error", (error) => {
    console.error(JSON.stringify({ level: "error", msg: "postgres client error", code: (error as NodeJS.ErrnoException).code ?? null }));
  });
  client.query("set hnsw.iterative_scan = relaxed_order").catch(() => {
    // A connection that cannot set it still works, just narrower. Silent
    // because it fires per connection and would otherwise be the loudest line
    // in the log on a database that predates the extension.
  });
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
