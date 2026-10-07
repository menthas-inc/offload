// 038. The cast: eight people, their threads, conversations, notes and
// memories, from apps/agent/evals/cast/cast.sql, which the memory evals are
// measured against. `pnpm seed:cast` loads them into a local database so the
// app can be tried as one of them; `pnpm seed:cast ana <file>` also signs in as
// Ana and writes her session cookie to <file>, for the browser.
//
// Local only. The script refuses a database that is not on this machine.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { closeDb, db } from "./db.js";
import { env } from "./env.js";
import { uuidv7 } from "./uuid.js";

const CAST = join(dirname(fileURLToPath(import.meta.url)), "../../agent/evals/cast");

export async function seedCast(): Promise<void> {
  await sql.raw(readFileSync(join(CAST, "cast.sql"), "utf8")).execute(db);
}

/** Everything with a cast id gone: the file's own clear block, so the two
 *  cannot drift. */
export async function clearCast(): Promise<void> {
  const file = readFileSync(join(CAST, "cast.sql"), "utf8");
  const block = file.slice(file.indexOf("-- ---------------------------------------------------------------- clear"), file.indexOf("-- ---------------------------------------------------------------- people"));
  await sql.raw(block).execute(db);
}

/** A week's session for one of the cast, as the signed cookie the API reads. */
export async function signInAs(character: string): Promise<string> {
  const ids = JSON.parse(readFileSync(join(CAST, "ids.json"), "utf8")) as { people: Record<string, string> };
  const accountId = ids.people[character];
  if (!accountId) throw new Error(`nobody called ${character} in the cast`);
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 7 * 86400_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = new URL(env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error("seed:cast is for a local database only.");
    process.exit(1);
  }
  await seedCast();
  const [character, file] = process.argv.slice(2);
  if (character && file) {
    writeFileSync(file, await signInAs(character));
    console.log(`The cast is in. Signed in as ${character}; the cookie is in ${file}.`);
  } else {
    console.log("The cast is in.");
  }
  await closeDb();
}
