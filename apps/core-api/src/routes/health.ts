import type { App } from "../app.js";
import { sql } from "kysely";
import { z } from "zod";
import { db } from "../db.js";

export async function healthRoutes(app: App): Promise<void> {
  // Liveness: the process is up. Deliberately touches nothing else, so a
  // database blip does not cause the platform to restart a healthy process.
  app.get(
    "/healthz",
    { schema: { response: { 200: z.object({ status: z.literal("ok") }) } } },
    async () => ({ status: "ok" as const })
  );

  // Readiness: it can actually serve. This one does touch the database,
  // because a process that cannot reach Postgres should not receive traffic.
  app.get(
    "/readyz",
    {
      schema: {
        response: {
          200: z.object({ status: z.literal("ready") }),
          503: z.object({ status: z.literal("unready"), reason: z.string() }),
        },
      },
    },
    async (_request, reply) => {
      try {
        await sql`select 1`.execute(db);
        return { status: "ready" as const };
      } catch {
        // No error detail in the body or the log: a readiness probe is
        // reachable and its output should never describe our internals.
        return reply.code(503).send({ status: "unready" as const, reason: "database" });
      }
    }
  );
}
