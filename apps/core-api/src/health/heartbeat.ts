// Each service says it is alive once a minute (034).
//
// Health is read from our own Postgres: one row per service per minute in
// `heartbeats`, and a gap is an outage. The Core API writes its own row and
// records what it found of the web and the database; the worker posts its own
// through `/internal/v1/heartbeat`.
//
// **What this cannot see.** The Core API down writes no web or database row
// either, so all three show the same gap, and the page says those two rows
// are the Core API's view. A database that is down cannot be written to, so
// its outage is a gap and never a row saying so.
//
// The primary key is `(service, minute)`, which is what makes the timer safe
// on more than one instance: two instances write one row.

import { sql } from "kysely";
import { db } from "../db.js";
import { env } from "../env.js";
import { checkAlerts } from "./alerts.js";

export type Service = "core-api" | "worker" | "web" | "database";

export const HEARTBEAT_SECONDS = 60;

/** When this process started, which is when this deploy went live here. */
export const BOOTED_AT = new Date();

/** The commit this service runs. **To verify on the platform, not from its
 *  documentation:** that Railway sets this at runtime. Unset, the commit
 *  reads as unknown. */
export function commit(): string | null {
  return process.env["RAILWAY_GIT_COMMIT_SHA"] || null;
}

/** Write one service's row for this minute, by the database's clock.
 *
 *  An `ok` from any writer stands for the minute: a second instance that
 *  could not reach the web does not overwrite one that could. */
export async function beat(service: Service, ok: boolean, about: { commit?: string | null; startedAt?: Date | null } = {}): Promise<void> {
  await sql`
    insert into heartbeats (service, minute, ok, commit, started_at)
    values (${service}, date_trunc('minute', now()), ${ok}, ${about.commit ?? null}, ${about.startedAt ?? null})
    on conflict (service, minute) do update set
      ok = heartbeats.ok or excluded.ok,
      commit = coalesce(excluded.commit, heartbeats.commit),
      started_at = coalesce(excluded.started_at, heartbeats.started_at)
  `.execute(db);
}

/** How long the web gets to answer before it counts as not answering. */
const WEB_TIMEOUT_MS = 5_000;

async function checkWeb(fetcher: typeof fetch): Promise<{ ok: boolean; commit: string | null; startedAt: Date | null }> {
  try {
    const response = await fetcher(`${env.WEB_URL}/healthz`, { signal: AbortSignal.timeout(WEB_TIMEOUT_MS) });
    if (!response.ok) return { ok: false, commit: null, startedAt: null };
    const body = (await response.json().catch(() => ({}))) as { commit?: unknown; startedAt?: unknown };
    const started = typeof body.startedAt === "string" ? new Date(body.startedAt) : null;
    return {
      ok: true,
      commit: typeof body.commit === "string" ? body.commit.slice(0, 64) : null,
      startedAt: started && !Number.isNaN(started.getTime()) ? started : null,
    };
  } catch {
    return { ok: false, commit: null, startedAt: null };
  }
}

/** One minute's work: this service, the database, the web. */
export async function heartbeat(fetcher: typeof fetch = fetch): Promise<void> {
  // The database first: if this throws, there is nowhere to write anything.
  await sql`select 1`.execute(db);
  await beat("database", true);
  await beat("core-api", true, { commit: commit(), startedAt: BOOTED_AT });
  const web = await checkWeb(fetcher);
  await beat("web", web.ok, web);
}

/** Start the minute timer. Called by `server.ts` and by nothing else, so a
 *  test never has one running under it. A failed beat is logged by kind and
 *  the timer carries on: the gap it leaves is the record. */
export function startHeartbeat(log: (fields: Record<string, unknown>, msg: string) => void): NodeJS.Timeout {
  const failed = (msg: string) => (error: unknown) => log({ err: error instanceof Error ? error.name : "unknown" }, msg);
  const tick = (): void => {
    // The alert conditions are read off what the beat just wrote, so they run
    // after it, and on their own: a failed beat is itself something to alert on.
    heartbeat()
      .catch(failed("heartbeat failed"))
      .then(() => checkAlerts())
      .catch(failed("alerts check failed"));
  };
  tick();
  return setInterval(tick, HEARTBEAT_SECONDS * 1000);
}
