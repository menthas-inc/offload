// 034, section D. Limits: every cap and switch an owner can change while
// offload runs.
//
// Registered by the admin plugin in the owner scope, so every path here is
// relative to `/v1/admin` and already behind the owner check. The registry,
// its bounds and the save itself live in `settings.ts`; this file is the
// shape of the requests.

import { z } from "zod";
import { sql } from "kysely";
import type { FastifyReply } from "fastify";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { platformSpent } from "../../budget.js";
import { SettingsRefused, clearSettingsCache, listSettings, saveSettings, setting } from "../../settings.js";

const value = z.union([z.number(), z.boolean(), z.null(), z.record(z.string(), z.number())]);

const row = z.object({
  key: z.string(),
  kind: z.enum(["int", "micros", "bool", "money-map"]),
  value,
  default: value,
  /** Bounds for a number, and for each amount in a map. Null for a switch. */
  min: z.number().nullable(),
  max: z.number().nullable(),
  /** Whether null is a value, meaning off. */
  nullable: z.boolean(),
  /** The stored row made no sense, and the default is what is in force. */
  malformed: z.boolean(),
  updatedAt: z.string().nullable(),
});

const settings = z.object({ settings: z.array(row) });
const notFound = z.object({ error: z.literal("not-found") });

const HITS_PAGE = 50;

/** One refusal row: a cap, whose it was, the UTC day, and how many times. The
 *  person is their name and their address, and nothing else of them. */
const hitRow = z.object({
  cap: z.string(),
  scope: z.enum(["account", "platform"]),
  /** The UTC day, as `2026-10-03`. */
  day: z.string(),
  count: z.number().int(),
  lastAt: z.string(),
  account: z.object({ id: z.string().uuid(), name: z.string().nullable(), email: z.string() }),
});

/** Where a page of refusals ended: the last row's whole sort key.
 *
 *  The table has no id; its key is account, cap, scope and day, and the order
 *  is by day and then by `last_at`. The waitlist route says why a moment must
 *  not round trip through a JavaScript Date: a timestamptz has microseconds
 *  and a Date has milliseconds, so the comparison stops matching and a page
 *  repeats rows. So the day travels as a count of days and the moment as a
 *  count of microseconds, both worked out by Postgres, carried here as digits
 *  and compared in Postgres. Digits also mean a cursor somebody made up can
 *  be refused by its shape and can never fail a cast. */
interface HitCursor {
  day: string;
  micros: string;
  accountId: string;
  cap: string;
  scope: "account" | "platform";
}

const CURSOR = /^(\d{1,6})\.(\d{1,17})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z][a-z_.]{0,60})\.(account|platform)$/;

function encodeCursor(at: HitCursor): string {
  return Buffer.from(`${at.day}.${at.micros}.${at.accountId}.${at.cap}.${at.scope}`).toString("base64url");
}

function decodeCursor(cursor: string): HitCursor | null {
  const found = CURSOR.exec(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!found) return null;
  return { day: found[1]!, micros: found[2]!, accountId: found[3]!, cap: found[4]!, scope: found[5] as HitCursor["scope"] };
}

const DAY_NUMBER = sql<number>`(limit_hits.day - date '1970-01-01')`;
const MICROS = sql<string>`floor(extract(epoch from limit_hits.last_at) * 1000000)::bigint`;

export async function limitsAdminRoutes(app: App): Promise<void> {
  app.get("/settings", { schema: { response: { 200: settings, 404: notFound } } }, async (_request, reply) =>
    reply.send({ settings: await listSettings() })
  );

  // One save for the page. PATCH, as every edit here is: the API's CORS
  // allows no PUT.
  //
  // `expected` is what the page showed for each key it is changing. A value
  // somebody else has since moved is a conflict: nothing is written and the
  // answer carries the current values, so the page can show them. A value
  // outside its bounds is refused with the bounds, and nothing is written.
  //
  // 400 is not in the response map, for the reason `dumps.ts` gives: a
  // validation failure answers 400 too, with a body of its own.
  app.patch(
    "/settings",
    {
      config: { audit: "setting.changed" },
      schema: {
        body: z.object({ changes: z.record(z.string(), z.unknown()), expected: z.record(z.string(), z.unknown()) }),
        response: { 200: settings, 404: notFound, 409: settings.extend({ error: z.literal("conflict"), key: z.string() }) },
      },
    },
    async (request, reply) => {
      try {
        await db.transaction().execute((tx) => saveSettings(request.body.changes, request.body.expected, request.staff!, tx));
      } catch (error) {
        if (!(error instanceof SettingsRefused)) throw error;
        if (error.code === "conflict") {
          clearSettingsCache();
          return reply.code(409).send({ error: "conflict" as const, key: error.key, settings: await listSettings() });
        }
        // Untyped on purpose: 400 has no schema here, as above.
        return (reply as FastifyReply).code(400).send({ error: error.code, key: error.key, min: error.min, max: error.max });
      }
      // After the commit, so this instance reads what it just wrote. Every
      // other instance sees it inside the cache's fifteen seconds.
      clearSettingsCache();
      return reply.send({ settings: await listSettings() });
    }
  );

  // What the platform has spent in the last 24 hours against its cap. The sum
  // is the one every dump is checked against, cache and all, so the page and
  // the cap never disagree about whether it is reached. Null is off.
  app.get(
    "/limits/now",
    {
      schema: {
        response: {
          200: z.object({ spentMicros: z.number().int(), capMicros: z.number().int().nullable(), reached: z.boolean() }),
          404: notFound,
        },
      },
    },
    async (_request, reply) => {
      const [spentMicros, capMicros] = await Promise.all([platformSpent(), setting("platform.spend_micros")]);
      return reply.send({ spentMicros, capMicros, reached: capMicros !== null && spentMicros >= capMicros });
    }
  );

  // What has been hit: the last 30 days of refusals, the newest day first and
  // the latest refusal first within it. Thirty days is how long the daily
  // purge keeps them, and the bound here is the purge's own.
  //
  // 400 is not in the response map, as above.
  app.get(
    "/limits/hits",
    {
      schema: {
        querystring: z.object({ cursor: z.string().max(400).optional() }),
        response: { 200: z.object({ rows: z.array(hitRow), nextCursor: z.string().nullable() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const after = request.query.cursor === undefined ? null : decodeCursor(request.query.cursor);
      if (request.query.cursor !== undefined && !after) {
        return (reply as FastifyReply).code(400).send({ error: "bad_cursor" });
      }

      let query = db
        .selectFrom("limit_hits")
        .innerJoin("accounts", "accounts.id", "limit_hits.account_id")
        .select([
          "limit_hits.cap as cap",
          "limit_hits.scope as scope",
          "limit_hits.count as count",
          "limit_hits.last_at as last_at",
          "limit_hits.account_id as account_id",
          "accounts.display_name as name",
          "accounts.email as email",
          sql<string>`to_char(limit_hits.day, 'YYYY-MM-DD')`.as("day"),
          DAY_NUMBER.as("day_number"),
          MICROS.as("micros"),
        ])
        .where(sql<boolean>`limit_hits.day >= (now() - interval '30 days')::date`)
        .orderBy("limit_hits.day", "desc")
        .orderBy("limit_hits.last_at", "desc")
        .orderBy("limit_hits.account_id", "desc")
        .orderBy("limit_hits.cap", "desc")
        .orderBy("limit_hits.scope", "desc")
        // One extra row, so "is there more" is answered by the query itself.
        .limit(HITS_PAGE + 1);

      if (after) {
        query = query.where(
          sql<boolean>`(${DAY_NUMBER}, ${MICROS}, limit_hits.account_id, limit_hits.cap, limit_hits.scope)
                     < (${after.day}::int, ${after.micros}::bigint, ${after.accountId}::uuid, ${after.cap}::text, ${after.scope}::text)`
        );
      }

      const found = await query.execute();
      const rows = found.slice(0, HITS_PAGE);
      const last = rows[rows.length - 1];

      return reply.send({
        rows: rows.map((hit) => ({
          cap: hit.cap,
          scope: hit.scope,
          day: hit.day,
          count: hit.count,
          lastAt: hit.last_at.toISOString(),
          account: { id: hit.account_id, name: hit.name, email: hit.email },
        })),
        nextCursor:
          found.length > HITS_PAGE && last
            ? encodeCursor({ day: String(last.day_number), micros: String(last.micros), accountId: last.account_id, cap: last.cap, scope: last.scope })
            : null,
      });
    }
  );
}
