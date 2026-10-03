// 034. What every admin test needs: real sessions, staff at either rank, and
// a clean slate. Sessions are rows plus a cookie signed the way Better Auth
// signs one, as `admin.test.ts` explains: a stubbed session check would be
// testing the stub.

import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db } from "../src/db.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { clearSettingsCache } from "../src/settings.js";
import { clearPlatformSpent } from "../src/budget.js";
import type { App, RouteEntry } from "../src/app.js";

/** Everything an admin test may have written, in an order the foreign keys
 *  allow. The audit table is truncated: it refuses a delete. */
export async function wipeAdmin(): Promise<void> {
  await sql`truncate staff_audit`.execute(db);
  await db.deleteFrom("app_settings").execute();
  clearSettingsCache();
  clearPlatformSpent();
  for (const table of ["heartbeats", "job_stats_hourly", "backup_runs", "alert_states", "alert_sends", "vendor_costs"] as const) {
    await db.deleteFrom(table).execute();
  }
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("lookups").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
}

/** A session the API will accept. */
export async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

/** An account that has been let in and has signed in: its key, its default
 *  thread and an accepted membership, as promotion makes them. */
export async function activeAccount(email = `${uuidv7()}@example.test`): Promise<string> {
  const promoted = await promote(email);
  await db.updateTable("accounts").set({ state: "active" }).where("id", "=", promoted.accountId).execute();
  return promoted.accountId;
}

/** A signed-in staff member. */
export async function staffMember(role: "support" | "owner" = "owner", email?: string): Promise<{ id: string; cookie: string }> {
  const id = await activeAccount(email);
  await db.insertInto("staff").values({ account_id: id, role }).execute();
  return { id, cookie: await signIn(id) };
}

/** Every `/v1/admin` route the app registered, without the HEAD twin Fastify
 *  adds to each GET. A new section's routes appear here by being registered. */
export function adminRoutesOf(app: App): RouteEntry[] {
  return app.routeTable.filter((route) => route.url.startsWith("/v1/admin") && route.method !== "HEAD");
}

/** A route's URL with each `:param` filled in. */
export function fill(url: string, params: Record<string, string> = {}): string {
  return url.replace(/:(\w+)/g, (_match, name: string) => params[name] ?? uuidv7());
}

export const auditEntries = () =>
  db
    .selectFrom("staff_audit")
    .select(["kind", "staff_account_id", "target_account_id", "setting_key", "old_value", "new_value", "job_id"])
    .orderBy("id")
    .execute();
