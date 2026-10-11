// Once, before any test file is loaded: bring the test database up to date.
//
// A test file's imports run before its own top-level `await migrate()`, and
// importing the app builds Better Auth, which checks the database against its
// model as it initialises and keeps the answer. On a database nothing had
// migrated yet, the first file to build the app answered every session read
// with a 500, "Database schema mismatch": the failure server.ts guards against
// at boot by migrating before it imports the app. Each file still migrates
// too, which finds nothing pending.

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export default async function setup(): Promise<void> {
  config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });
  // The same refusals as setup.ts, before anything connects.
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (docs/tech/turbo-env.md).");
  if (!process.env.DATABASE_URL.includes("localhost")) throw new Error("Tests refuse a non-local DATABASE_URL: they truncate tables.");
  // Imported here, after the environment, since env.ts validates as it loads.
  const { migrate } = await import("../src/migrate.js");
  const { closeDb } = await import("../src/db.js");
  try {
    await migrate(() => {});
  } finally {
    await closeDb();
  }
}
