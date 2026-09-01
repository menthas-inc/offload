// Load the repo-root environment file before anything imports env.ts.
//
// Without this the suite only passes for someone who happened to source it into
// their shell, which is how a test suite quietly becomes unrunnable for CI and
// for everyone else. Caught by the pre-commit gate, not by me.

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

// These tests truncate tables. Refuse to run anywhere that is not local.
if (!process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Tests refuse a non-local DATABASE_URL: they truncate tables.");
}
