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
//
// The two cases are separate messages on purpose. "Not local" and "not there at
// all" have completely different causes, and collapsing them cost a CI debug:
// turbo filters the environment, so a variable the workflow sets is absent
// inside the task unless turbo.json names it, and the suite reported that as a
// non-local database.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Locally that means no root .env; under turbo it " +
      "means the variable is not in globalPassThroughEnv (docs/tech/turbo-env.md)."
  );
}

if (!process.env.DATABASE_URL.includes("localhost")) {
  throw new Error("Tests refuse a non-local DATABASE_URL: they truncate tables.");
}
