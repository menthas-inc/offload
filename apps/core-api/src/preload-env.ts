// Load the repo-root .env before anything reads process.env.
//
// The scripts that boot the app outside a test run (migrate, seed,
// seed:admins, dev) all import env.ts, which validates at module load. Without
// this preload they only work for whoever remembered to source the file into
// their shell, which is the same trap the test suite already fell into.
//
// A no-op in production: Railway injects real variables and there is no file
// to find, and dotenv never overwrites what is already set.

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
