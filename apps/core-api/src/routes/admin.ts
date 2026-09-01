// The admin panel's API.
//
// Two things: read the waitlist, and let people in. Everything about who may
// call these lives in admin/staff.ts, and everything about what letting
// someone in means lives in admin/promote.ts. This file is the shape of the
// requests.

import { z } from "zod";
import type { App } from "../app.js";
import { db } from "../db.js";
import { requireStaff } from "../admin/staff.js";
import { promote } from "../admin/promote.js";

const MAX_BATCH = 100;

const row = z.object({
  id: z.string().uuid(),
  email: z.string(),
  state: z.enum(["waitlist", "invited"]),
  createdAt: z.string(),
  /** Invited and never signed in. The state the waitlist page shows apart,
   *  because it is the one that looks like success and is not. */
  awaitingFirstSignIn: z.boolean(),
});

const page = z.object({
  rows: z.array(row),
  /** Opaque. Callers pass it back and do not parse it. */
  nextCursor: z.string().nullable(),
});

/** The cursor is the last row's id, and the order is by id.
 *
 *  Not an offset: offsets skip and repeat rows when the underlying set changes
 *  between requests, and this set changes every time someone joins the
 *  waitlist, which is continuously.
 *
 *  And not (created_at, id), which is the usual answer and was wrong here. A
 *  timestamptz has microsecond precision; a JavaScript Date has milliseconds.
 *  Round-tripping the cursor through one truncates it, so `created_at = cursor`
 *  never matches and the `created_at > cursor` branch returns rows the previous
 *  page already showed. A bulk insert puts every row in the same transaction
 *  timestamp, so that is the ordinary case rather than a rare tie.
 *
 *  Ids are UUIDv7, so ordering by id is chronological to the millisecond and a
 *  total order below that. Lossless, one column, one comparison. */
function encodeCursor(id: string): string {
  return Buffer.from(id).toString("base64url");
}

function decodeCursor(cursor: string): string | null {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

const outcome = z.object({
  accountId: z.string().uuid(),
  status: z.enum(["invited", "already-in", "refused"]),
});

export async function adminRoutes(app: App): Promise<void> {
  // What the panel's own shell asks first: am I staff, and which pages exist
  // for me? The role decides which nav items render at all, because support
  // does not see costs and limits refused, it does not see them.
  app.get(
    "/v1/admin/me",
    {
      preHandler: requireStaff(),
      schema: {
        response: {
          200: z.object({ role: z.enum(["support", "owner"]) }),
          404: z.object({ error: z.literal("not-found") }),
        },
      },
    },
    async (request, reply) => reply.send({ role: request.staff!.role })
  );

  app.get(
    "/v1/admin/waitlist",
    {
      preHandler: requireStaff(),
      schema: {
        querystring: z.object({
          state: z.enum(["waiting", "invited"]).default("waiting"),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: { 200: page, 404: z.object({ error: z.literal("not-found") }) },
      },
    },
    async (request, reply) => {
      const { state, cursor, limit } = request.query;
      const after = cursor ? decodeCursor(cursor) : null;

      let query = db
        .selectFrom("accounts")
        .select(["id", "email", "state", "created_at", "first_signed_in_at"])
        .where("state", "=", state === "waiting" ? "waitlist" : "invited")
        .where("deleted_at", "is", null)
        .orderBy("id", "asc")
        // One extra row, so "is there a next page" is answered by the query
        // rather than by a second count that can disagree with it.
        .limit(limit + 1);

      if (after) query = query.where("id", ">", after);

      const found = await query.execute();
      const rows = found.slice(0, limit);
      const last = rows[rows.length - 1];

      return reply.send({
        rows: rows.map((account) => ({
          id: account.id,
          email: account.email,
          state: account.state as "waitlist" | "invited",
          createdAt: account.created_at.toISOString(),
          awaitingFirstSignIn: account.state === "invited" && account.first_signed_in_at === null,
        })),
        nextCursor: found.length > limit && last ? encodeCursor(last.id) : null,
      });
    }
  );

  app.post(
    "/v1/admin/waitlist/:id/invite",
    {
      preHandler: requireStaff(),
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: outcome,
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const account = await db
        .selectFrom("accounts")
        .select(["email"])
        .where("id", "=", request.params.id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!account) return reply.status(404).send({ error: "not-found" as const });

      const result = await promote(account.email, { invitedBy: request.staff?.accountId ?? null });
      return reply.send({ accountId: result.accountId, status: result.status });
    }
  );

  // The batch variant. Sequential rather than concurrent: each promotion takes
  // a row lock and opens a transaction, and a hundred of those at once is a
  // hundred connections' worth of contention to save a second on a screen
  // nobody is watching a progress bar on.
  app.post(
    "/v1/admin/waitlist/invite",
    {
      preHandler: requireStaff(),
      schema: {
        body: z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH) }),
        response: {
          200: z.object({ results: z.array(outcome) }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const accounts = await db
        .selectFrom("accounts")
        .select(["id", "email"])
        .where("id", "in", request.body.ids)
        .where("deleted_at", "is", null)
        .execute();

      const results = [];
      for (const account of accounts) {
        // One failure does not abandon the rest: each promotion is already its
        // own transaction, so a partial batch is a partial batch and not a
        // half-written account.
        const result = await promote(account.email, { invitedBy: request.staff?.accountId ?? null });
        results.push({ accountId: result.accountId, status: result.status });
      }

      return reply.send({ results });
    }
  );
}
