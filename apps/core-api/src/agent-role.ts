// Give the worker's database role a password, and write its connection string.
//
// Migration 0009 creates `offload_agent` with its grants and deliberately
// without LOGIN, because a password in a migration is a secret in source
// (SEC-1). This is the other half: it mints a password, grants LOGIN, and
// writes AGENT_DATABASE_URL where the worker will look for it.
//
// Nobody types or reads the password. It is generated here, sent to Postgres,
// written into .env, and never printed: a secret that appears in a terminal is
// a secret in scrollback, in a screen recording, and in whatever captured the
// session.
//
//   pnpm agent:role
//
// Idempotent. Run it again and the role gets a new password and the connection
// string is rewritten to match, which is also how you rotate it.

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "kysely";
import { db } from "./db.js";
import { env } from "./env.js";

const ROLE = "offload_agent";

/** base64url, so it needs no escaping in a URL or in a SQL literal. A password
 *  containing a `@` or a `/` produces a connection string that parses wrong and
 *  a failure that looks like bad credentials. */
function mint(): string {
  return randomBytes(24).toString("base64url");
}

function agentUrl(adminUrl: string, password: string): string {
  const url = new URL(adminUrl);
  url.username = ROLE;
  url.password = password;
  return url.toString();
}

/** Rewrite one key in .env, in place, leaving every other line and every
 *  comment exactly as it was. Never rewrites the whole file: this repo lost
 *  credentials once to a `cat >` that replaced one. */
function setEnvVar(path: string, key: string, value: string): void {
  const original = readFileSync(path, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(original)
    ? original.replace(pattern, line)
    : `${original.trimEnd()}\n${line}\n`;
  writeFileSync(path, next);
}

async function main(): Promise<void> {
  const password = process.env["AGENT_DB_PASSWORD"] ?? mint();

  // The role name is a constant in this file and the password is a parameter,
  // so neither is interpolated from anything a caller controls.
  await sql`alter role ${sql.raw(ROLE)} login password ${sql.lit(password)}`.execute(db);

  const url = agentUrl(env.DATABASE_URL, password);
  const envPath = join(process.cwd(), "../../.env");
  setEnvVar(envPath, "AGENT_DATABASE_URL", url);

  // Shape only. The value is in .env and nowhere else.
  const parsed = new URL(url);
  console.log(`  ${ROLE} can now log in.`);
  console.log(`  AGENT_DATABASE_URL written to .env`);
  console.log(`    host     ${parsed.hostname}`);
  console.log(`    database ${parsed.pathname.slice(1)}`);
  console.log(`    user     ${parsed.username}`);
  console.log(`    password ${password.length} characters, not shown`);

  await db.destroy();
}

await main();
