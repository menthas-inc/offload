// What the heartbeats say (034, section E): each service up, late or down,
// its uptime over a range, and each stretch it was down.
//
// One row a minute per service is the whole record, so a service is judged by
// its newest good row and an outage is a run of minutes with none.
//
// - **Up** with a good row inside two minutes, **late** between two and
//   three, **down** past three. A service with no row at all has never
//   reported, which is not the same as down, and reads `none`.
// - **Uptime** is minutes with a good row over minutes since the later of the
//   range's start and the service's first row. The minute in progress is left
//   out of both: its beat may not have landed yet.
// - **An incident** is two or more minutes in a row with no good row. One
//   missing minute is a restart. The stretch still open ends at null, and it
//   opens on the same rule that reads down.

import { sql } from "kysely";
import { db } from "../db.js";
import type { Service } from "./heartbeat.js";
import { RANGE_HOURS, type Range } from "./range.js";

export const SERVICES: readonly Service[] = ["core-api", "worker", "web", "database"];

export type Status = "up" | "late" | "down" | "none";

export interface ServiceRow {
  service: Service;
  status: Status;
  /** Null before the first heartbeat, or inside its first minute. */
  uptime: number | null;
  startedAt: Date | null;
  commit: string | null;
}

export async function services(range: Range): Promise<ServiceRow[]> {
  const result = await sql<{
    service: Service;
    status: Status;
    minutes: string | null;
    good: string | null;
    started_at: Date | null;
    commit: string | null;
  }>`
    with edge as (
      select service, min(minute) as first, max(minute) filter (where ok) as last_ok
      from heartbeats group by service
    ), span as (
      select service, first, last_ok,
             greatest(first, date_trunc('minute', now()) - make_interval(hours => ${RANGE_HOURS[range]})) as start
      from edge
    )
    select
      span.service,
      case
        when span.last_ok is null then 'down'
        when span.last_ok > now() - interval '2 minutes' then 'up'
        when span.last_ok > now() - interval '3 minutes' then 'late'
        else 'down'
      end as status,
      extract(epoch from (date_trunc('minute', now()) - span.start)) / 60 as minutes,
      (select count(*) from heartbeats h
        where h.service = span.service and h.ok and h.minute >= span.start and h.minute < date_trunc('minute', now())) as good,
      newest.started_at,
      newest.commit
    from span
    left join lateral (
      select h.started_at, h.commit from heartbeats h where h.service = span.service order by h.minute desc limit 1
    ) newest on true`.execute(db);

  return SERVICES.map((service) => {
    const row = result.rows.find((one) => one.service === service);
    if (!row) return { service, status: "none", uptime: null, startedAt: null, commit: null };
    const minutes = Number(row.minutes ?? 0);
    return {
      service,
      status: row.status,
      uptime: minutes > 0 ? Math.min(1, Number(row.good ?? 0) / minutes) : null,
      startedAt: row.started_at,
      commit: row.commit,
    };
  });
}

export interface Incident {
  service: Service;
  began: Date;
  /** Null while it is still down. */
  ended: Date | null;
  seconds: number;
}

/** Gaps and islands over each service's good minutes, newest first. A gap
 *  counts when the two good rows either side are three or more minutes apart,
 *  which is two or more minutes missing. */
export async function incidents(range: Range): Promise<Incident[]> {
  const result = await sql<{ service: Service; began: Date; ended: Date | null; seconds: string }>`
    with good as (
      select service, minute, lag(minute) over (partition by service order by minute) as previous
      from heartbeats where ok
    ), closed as (
      select service, previous + interval '1 minute' as began, minute as ended
      from good where minute - previous >= interval '3 minutes'
    ), edge as (
      select service, min(minute) as first, max(minute) filter (where ok) as last_ok
      from heartbeats group by service
    ), open as (
      select service, coalesce(last_ok + interval '1 minute', first) as began, null::timestamptz as ended
      from edge where last_ok is null or last_ok <= now() - interval '3 minutes'
    ), every as (
      select service, began, ended from closed union all select service, began, ended from open
    )
    select service, began, ended, extract(epoch from (coalesce(ended, now()) - began)) as seconds
    from every
    where ended is null or ended >= now() - make_interval(hours => ${RANGE_HOURS[range]})
    order by began desc, service`.execute(db);
  return result.rows.map((row) => ({ service: row.service, began: row.began, ended: row.ended, seconds: Math.round(Number(row.seconds)) }));
}

/** Services that read down now. A service that has never reported is not one. */
export async function downServices(forMinutes = 3): Promise<Service[]> {
  const result = await sql<{ service: Service }>`
    select service from heartbeats
    group by service
    having max(minute) filter (where ok) is null
        or max(minute) filter (where ok) <= now() - make_interval(mins => ${forMinutes})`.execute(db);
  return result.rows.map((row) => row.service);
}

/** How long a backup may be overdue before it is late. It runs nightly. */
export const BACKUP_LATE_HOURS = 26;

export interface Backups {
  last: { finishedAt: Date; bytes: number; ok: boolean } | null;
  late: boolean;
}

/** The newest run, and whether the newest good one is past 26 hours. No good
 *  run at all is late too. */
export async function backups(): Promise<Backups> {
  const last = await db.selectFrom("backup_runs").select(["finished_at", "bytes", "ok"]).orderBy("finished_at", "desc").limit(1).executeTakeFirst();
  const good = await sql<{ fresh: boolean }>`
    select exists (
      select 1 from backup_runs where ok and finished_at > now() - make_interval(hours => ${BACKUP_LATE_HOURS})
    ) as fresh`.execute(db);
  return {
    last: last ? { finishedAt: last.finished_at as Date, bytes: Number(last.bytes), ok: last.ok } : null,
    late: !good.rows[0]!.fresh,
  };
}
