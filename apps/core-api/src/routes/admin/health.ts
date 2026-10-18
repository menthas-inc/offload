// 034, section E. Health and alerts.
//
// Registered by the admin plugin, so every path here is relative to
// `/v1/admin` and already behind the staff check. Each route that is not a GET
// declares `config: { audit: <kind> }` and writes that entry in its own
// transaction.
//
// **Two functions, because the file serves two ranks.** Health itself is an
// owner page. Retrying a dead job is also offered on a person's page, which
// support sees, so the job actions register in the support scope: retry is
// support's, and dismiss declares `config: { rank: "owner" }`.
//
// Everything is read from our own Postgres: `heartbeats`, `jobs`,
// `job_stats_hourly`, `backup_runs`, `pending_revocations`, `llm_usage` and
// `lookups`. Of a job this file reads its kind, its state, its times, its
// attempts and its error code, and never its payload or its error text (OFF-1).

import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { audit } from "../../admin/audit.js";
import { atLeast } from "../../admin/staff.js";
import { worksInBackground } from "../../accounts/active.js";
import { limitReached } from "../../budget.js";
import { scheduled } from "../../jobs/schedule.js";
import { RANGES } from "../../health/range.js";
import { backups, incidents, services } from "../../health/services.js";
import { DEAD_PAGE, deadJobs, migrations, queueHistory, queueNow, stuckJobs } from "../../health/read.js";
import { scheduledJobs, volume } from "../../health/scheduled.js";
import { VENDORS, modelCalls, vendors } from "../../health/calls.js";

const notFound = z.object({ error: z.literal("not-found") });
const ranged = z.object({ range: z.enum(RANGES).default("30d") });
const iso = (at: Date | null): string | null => (at ? at.toISOString() : null);

/** Whose job it was: an id for the link, and their name when they have one. */
const jobAccount = z.object({ id: z.string().uuid(), name: z.string().nullable() }).nullable();

/** The cursor is the last row's id, as the waitlist's is, and for its reason:
 *  ids are UUIDv7, so the order is by time and total. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encodeCursor = (id: string): string => Buffer.from(id).toString("base64url");
function decodeCursor(cursor: string): string | null {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return UUID.test(id) ? id : null;
}

/** `/health/*`, in the owner scope. */
export async function healthAdminRoutes(app: App): Promise<void> {
  // Now: each service from its heartbeats. The web and the database do not
  // report themselves: their rows are what the Core API found when it looked,
  // so all three share a gap when the Core API is down, and the answer says
  // whose view each row is.
  app.get(
    "/health/services",
    {
      schema: {
        querystring: ranged,
        response: {
          200: z.object({
            services: z.array(
              z.object({
                service: z.enum(["core-api", "worker", "web", "database"]),
                /** `none` is no heartbeat yet, which is not down. */
                status: z.enum(["up", "late", "down", "none"]),
                uptime: z.number().nullable(),
                startedAt: z.string().nullable(),
                commit: z.string().nullable(),
                reportedBy: z.enum(["itself", "core-api"]),
                migrations: z.object({ count: z.number().int(), latest: z.string().nullable() }).nullable(),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const [rows, applied] = await Promise.all([services(request.query.range), migrations()]);
      return reply.send({
        services: rows.map((row) => ({
          service: row.service,
          status: row.status,
          uptime: row.uptime,
          startedAt: iso(row.startedAt),
          commit: row.commit,
          reportedBy: row.service === "web" || row.service === "database" ? ("core-api" as const) : ("itself" as const),
          migrations: row.service === "core-api" ? applied : null,
        })),
      });
    }
  );

  app.get(
    "/health/incidents",
    {
      schema: {
        querystring: ranged,
        response: {
          200: z.object({
            incidents: z.array(
              z.object({
                service: z.enum(["core-api", "worker", "web", "database"]),
                began: z.string(),
                /** Null while it is still down. */
                ended: z.string().nullable(),
                seconds: z.number().int(),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const rows = await incidents(request.query.range);
      return reply.send({
        incidents: rows.map((row) => ({ service: row.service, began: row.began.toISOString(), ended: iso(row.ended), seconds: row.seconds })),
      });
    }
  );

  app.get(
    "/health/backups",
    {
      schema: {
        response: {
          200: z.object({
            last: z.object({ finishedAt: z.string(), bytes: z.number(), ok: z.boolean() }).nullable(),
            late: z.boolean(),
          }),
          404: notFound,
        },
      },
    },
    async (_request, reply) => {
      const { last, late } = await backups();
      return reply.send({ last: last ? { finishedAt: last.finishedAt.toISOString(), bytes: last.bytes, ok: last.ok } : null, late });
    }
  );

  // S27. Grants offload could not open to hand back to Google, so live there
  // until somebody holding the old vault key revokes them by hand. Ages only:
  // the rows name nobody, and the seven days of 0080 still end each one.
  app.get(
    "/health/revocations",
    {
      schema: {
        response: {
          200: z.object({ unopenable: z.array(z.object({ since: z.string() })) }),
          404: notFound,
        },
      },
    },
    async (_request, reply) => {
      const rows = await db
        .selectFrom("pending_revocations")
        // As a Date: the table's Generated<Timestamp> reads as the column type.
        .select(sql<Date>`created_at`.as("since"))
        .where("unopenable_at", "is not", null)
        .orderBy("created_at")
        .execute();
      return reply.send({ unopenable: rows.map((row) => ({ since: row.since.toISOString() })) });
    }
  );

  // The queue. Now, from the job table; over the range, from the hourly
  // history, which outlives it.
  app.get(
    "/health/queue",
    {
      schema: {
        querystring: ranged,
        response: {
          200: z.object({
            now: z.object({
              waiting: z.array(z.object({ priority: z.enum(["interactive", "scheduled", "background"]), count: z.number().int() })),
              oldestSeconds: z.number().int().nullable(),
              running: z.number().int(),
            }),
            points: z.array(
              z.object({
                at: z.string(),
                finished: z.number().int(),
                failed: z.number().int(),
                dead: z.number().int(),
                waitMsSum: z.number(),
                waitMsP95: z.number(),
              })
            ),
            /** The first hour there is history for. Null before any. */
            historyStarts: z.string().nullable(),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const [now, history] = await Promise.all([queueNow(), queueHistory(request.query.range)]);
      return reply.send({
        now,
        points: history.points.map((point) => ({ ...point, at: point.at.toISOString() })),
        historyStarts: iso(history.historyStarts),
      });
    }
  );

  // One row for every job that runs on a schedule, from the registry.
  app.get(
    "/health/scheduled",
    {
      schema: {
        querystring: ranged,
        response: {
          200: z.object({
            jobs: z.array(
              z.object({
                kind: z.string(),
                does: z.string(),
                cadence: z.enum(["minute", "quarter", "hourly", "daily"]),
                runner: z.enum(["api", "worker"]),
                perAccount: z.boolean(),
                last: z.object({ at: z.string(), outcome: z.enum(["done", "failed", "dead"]), durationMs: z.number().int().nullable() }).nullable(),
                next: z.string().nullable(),
                runs: z.number().int(),
                failures: z.number().int(),
                late: z.boolean(),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const rows = await scheduledJobs(request.query.range);
      return reply.send({
        jobs: rows.map((row) => ({
          kind: row.kind,
          does: row.does,
          cadence: row.cadence,
          runner: row.runner,
          perAccount: row.perAccount,
          last: row.last ? { at: row.last.at.toISOString(), outcome: row.last.outcome, durationMs: row.last.durationMs } : null,
          next: iso(row.next),
          runs: row.runs,
          failures: row.failures,
          late: row.late,
        })),
      });
    }
  );

  app.get(
    "/health/scheduled/:kind",
    {
      schema: {
        params: z.object({ kind: z.string().max(64) }),
        querystring: ranged,
        response: {
          200: z.object({
            points: z.array(z.object({ at: z.string(), runs: z.number().int(), failures: z.number().int() })),
            nights: z
              .array(z.object({ at: z.string(), booked: z.number().int(), finished: z.number().int(), failed: z.number().int() }))
              .nullable(),
            historyStarts: z.string().nullable(),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      // The registry is the closed set: a kind it does not have is not here.
      if (!scheduled(request.params.kind)) return reply.code(404).send({ error: "not-found" as const });
      const result = await volume(request.params.kind, request.query.range);
      return reply.send({
        points: result.points.map((point) => ({ ...point, at: point.at.toISOString() })),
        nights: result.nights ? result.nights.map((night) => ({ ...night, at: night.at.toISOString() })) : null,
        historyStarts: iso(result.historyStarts),
      });
    }
  );

  app.get(
    "/health/stuck",
    {
      schema: {
        response: {
          200: z.object({
            jobs: z.array(
              z.object({
                id: z.string().uuid(),
                kind: z.string(),
                since: z.string(),
                seconds: z.number().int(),
                attempts: z.number().int(),
                account: jobAccount,
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (_request, reply) => {
      const rows = await stuckJobs();
      return reply.send({ jobs: rows.map((row) => ({ ...row, since: row.since.toISOString() })) });
    }
  );

  app.get(
    "/health/dead",
    {
      schema: {
        querystring: z.object({ cursor: z.string().max(200).optional() }),
        response: {
          200: z.object({
            jobs: z.array(
              z.object({
                id: z.string().uuid(),
                kind: z.string(),
                at: z.string(),
                attempts: z.number().int(),
                errorCode: z.string().nullable(),
                retried: z.boolean(),
                account: jobAccount,
              })
            ),
            nextCursor: z.string().nullable(),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const rows = await deadJobs(request.query.cursor ? decodeCursor(request.query.cursor) : null);
      const page = rows.slice(0, DEAD_PAGE);
      return reply.send({
        jobs: page.map((row) => ({ ...row, at: row.at.toISOString() })),
        nextCursor: rows.length > DEAD_PAGE ? encodeCursor(page[page.length - 1]!.id) : null,
      });
    }
  );

  // Calls: what the ledger says the model was asked, per job.
  app.get(
    "/health/calls",
    {
      schema: {
        querystring: ranged,
        response: {
          200: z.object({
            kinds: z.array(
              z.object({
                kind: z.string(),
                calls: z.number().int(),
                failures: z.number().int(),
                /** Latency over the range, in milliseconds. */
                p50: z.number(),
                p95: z.number(),
                points: z.array(
                  z.object({
                    at: z.string(),
                    calls: z.number().int(),
                    failures: z.number().int(),
                    /** Milliseconds. Null in a bucket with no call. */
                    p50: z.number().nullable(),
                    p95: z.number().nullable(),
                  })
                ),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const kinds = await modelCalls(request.query.range);
      return reply.send({
        kinds: kinds.map((kind) => ({ ...kind, points: kind.points.map((point) => ({ ...point, at: point.at.toISOString() })) })),
      });
    }
  );

  app.get(
    "/health/vendors",
    {
      schema: {
        querystring: ranged,
        response: {
          200: z.object({
            vendors: z.array(
              z.object({
                vendor: z.enum(VENDORS),
                /** False is "not recorded", and both figures are then null. */
                recorded: z.boolean(),
                calls: z.number().int().nullable(),
                failures: z.number().int().nullable(),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => reply.send({ vendors: await vendors(request.query.range) })
  );
}

/** `/jobs/:id/retry` and `/jobs/:id/dismiss`, in the support scope. */
export async function jobAdminRoutes(app: App): Promise<void> {
  const params = z.object({ id: z.string().uuid() });

  // One more attempt for a dead job, once.
  //
  // The row is locked for the length of the transaction, so two staff
  // pressing Retry together are one retry and one refusal. Refused for an
  // account offload does not work for in the background, and for one at its
  // limit: the retry would be the work its cap exists to stop. The error code
  // stays on the row until the attempt runs and either clears or replaces it.
  //
  // Support retries a person's job, from their page. A job that is nobody's
  // is the system's, and that is an owner's: support does not see it refused,
  // it does not see it.
  app.post(
    "/jobs/:id/retry",
    {
      config: { audit: "job.retried" },
      schema: {
        params,
        response: {
          200: z.object({ status: z.literal("queued") }),
          404: notFound,
          409: z.object({ error: z.enum(["not_dead", "already_retried", "account_off", "at_limit"]) }),
        },
      },
    },
    async (request, reply) => {
      const staff = request.staff!;
      const outcome = await db.transaction().execute(async (tx) => {
        const job = await tx
          .selectFrom("jobs")
          .select(["id", "state", "retried_at", "account_id"])
          .where("id", "=", request.params.id)
          .forUpdate()
          .executeTakeFirst();
        if (!job) return "not-found" as const;
        if (!job.account_id && !atLeast(staff.role, "owner")) return "not-found" as const;
        if (job.state !== "dead") return "not_dead" as const;
        if (job.retried_at) return "already_retried" as const;
        if (job.account_id) {
          if (!(await worksInBackground(job.account_id, tx))) return "account_off" as const;
          if (await limitReached(job.account_id, tx)) return "at_limit" as const;
        }

        await tx
          .updateTable("jobs")
          .set({
            state: "queued",
            run_after: sql<Date>`now()`,
            max_attempts: sql<number>`attempts + 1`,
            retried_at: sql<Date>`now()`,
            updated_at: sql<Date>`now()`,
          })
          .where("id", "=", job.id)
          .where("state", "=", "dead")
          .where("retried_at", "is", null)
          .execute();
        await audit(tx, { staff, kind: "job.retried", targetAccountId: job.account_id, jobId: job.id });
        return "queued" as const;
      });

      if (outcome === "not-found") return reply.code(404).send({ error: "not-found" as const });
      if (outcome !== "queued") return reply.code(409).send({ error: outcome });
      return reply.send({ status: outcome });
    }
  );

  // Off the dead list, and kept: the row stays for the 30 days every job is
  // kept, and a person's timeline still shows it.
  app.post(
    "/jobs/:id/dismiss",
    {
      config: { rank: "owner", audit: "job.dismissed" },
      schema: {
        params,
        response: {
          200: z.object({ status: z.literal("dismissed") }),
          404: notFound,
          409: z.object({ error: z.enum(["not_dead", "already_dismissed"]) }),
        },
      },
    },
    async (request, reply) => {
      const outcome = await db.transaction().execute(async (tx) => {
        const job = await tx
          .selectFrom("jobs")
          .select(["id", "state", "dismissed_at", "account_id"])
          .where("id", "=", request.params.id)
          .forUpdate()
          .executeTakeFirst();
        if (!job) return "not-found" as const;
        if (job.state !== "dead") return "not_dead" as const;
        if (job.dismissed_at) return "already_dismissed" as const;
        // `updated_at` is when it died, and the list says so: leave it.
        await tx.updateTable("jobs").set({ dismissed_at: sql<Date>`now()` }).where("id", "=", job.id).execute();
        await audit(tx, { staff: request.staff!, kind: "job.dismissed", targetAccountId: job.account_id, jobId: job.id });
        return "dismissed" as const;
      });

      if (outcome === "not-found") return reply.code(404).send({ error: "not-found" as const });
      if (outcome !== "dismissed") return reply.code(409).send({ error: outcome });
      return reply.send({ status: outcome });
    }
  );
}
