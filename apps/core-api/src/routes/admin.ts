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
import { setWebMaps, webMapsSetting } from "../settings.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";

const MAX_BATCH = 100;

/** How many people "Invite the next N" lets in.
 *
 *  The kit reads this from a Limits page, which does not exist yet and is
 *  another spec's work. A named constant rather than a literal at the call
 *  site, so moving it to a real setting is one change here and nothing else.
 *  Flagged in docs/tech/decisions.md rather than left to be discovered. */
export const WEEKLY_BATCH = 25;

/** The kit's vocabulary, not the database's. `active` reads as "signed up" on
 *  this page because that is what it means here: they were invited and they
 *  came. */
const rowState = z.enum(["waiting", "invited", "accepted", "disabled"]);

const row = z.object({
  id: z.string().uuid(),
  email: z.string(),
  state: rowState,
  joined: z.string(),
  /** Waitlist or a shared thread. Someone a member vouched for is a different
   *  proposition from someone who found the site, which is the whole reason
   *  the column exists. */
  source: z.enum(["waitlist", "thread"]),
  /** The quiet line under the address. Null when there is nothing to say,
   *  rather than a placeholder. */
  note: z.string().nullable(),
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


/** The quiet second line under an address. Only says something when there is
 *  something to say: an invite that has gone out and not been acted on is the
 *  state that looks like success and is not, and it is the only one an admin
 *  can do anything about from this page. */
function noteFor(account: {
  state: string;
  invite_email_sent_at: Date | null;
  first_signed_in_at: Date | null;
}): string | null {
  if (account.state !== "invited") return null;
  if (account.first_signed_in_at) return null;
  if (!account.invite_email_sent_at) return "invited, email not sent yet";

  const days = Math.floor((Date.now() - account.invite_email_sent_at.getTime()) / 86_400_000);
  if (days <= 0) return "invited today, not accepted";
  if (days === 1) return "invited yesterday, not accepted";
  return `invited ${days} days ago, not accepted`;
}


export async function adminRoutes(app: App): Promise<void> {
  // The owner's switches. Owner only, like costs and limits: support does not
  // see them. The admin panel's Limits page will call these; until it exists,
  // they are the way to flip a setting.
  const settingsSchema = z.object({ webMaps: z.boolean() });
  app.get(
    "/v1/admin/settings",
    {
      preHandler: requireStaff("owner"),
      schema: { response: { 200: settingsSchema, 404: z.object({ error: z.literal("not-found") }) } },
    },
    async (_request, reply) => reply.send({ webMaps: await webMapsSetting() })
  );
  // PATCH, as every edit here is: the API's CORS allows no PUT.
  app.patch(
    "/v1/admin/settings",
    {
      preHandler: requireStaff("owner"),
      schema: { body: settingsSchema, response: { 200: settingsSchema, 404: z.object({ error: z.literal("not-found") }) } },
    },
    async (request, reply) => reply.send({ webMaps: await setWebMaps(request.body.webMaps, request.staff!.accountId) })
  );

  // What the panel's own shell asks first: am I staff, and which pages exist
  // for me? The role decides which nav items render at all, because support
  // does not see costs and limits refused, it does not see them.
  app.get(
    "/v1/admin/me",
    {
      preHandler: requireStaff(),
      schema: {
        response: {
          200: z.object({
            role: z.enum(["support", "owner"]),
            /** Shown in the nav. The kit says "signed in as" and then an
             *  address, because a role is not who you are and support often
             *  has two accounts open. */
            email: z.string(),
            /** The count beside Waitlist in the nav. */
            waiting: z.number().int(),
          }),
          404: z.object({ error: z.literal("not-found") }),
        },
      },
    },
    async (request, reply) => {
      const [account, counts] = await Promise.all([
        db
          .selectFrom("accounts")
          .select(["email"])
          .where("id", "=", request.staff!.accountId)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("accounts")
          .select(db.fn.countAll<string>().as("n"))
          .where("state", "=", "waitlist")
          .where("deleted_at", "is", null)
          .executeTakeFirstOrThrow(),
      ]);

      return reply.send({
        role: request.staff!.role,
        email: account.email,
        waiting: Number(counts.n),
      });
    }
  );

  app.get(
    "/v1/admin/waitlist",
    {
      preHandler: requireStaff(),
      schema: {
        querystring: z.object({
          // One list with a state column, not a tab split: the kit shows every
          // row together so "invited and never signed in" sits beside the
          // people still waiting rather than behind a tab nobody opens.
          state: z.enum(["all", "waiting", "invited"]).default("all"),
          q: z.string().trim().max(320).optional(),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: { 200: page, 404: z.object({ error: z.literal("not-found") }) },
      },
    },
    async (request, reply) => {
      const { state, q, cursor, limit } = request.query;
      const after = cursor ? decodeCursor(cursor) : null;

      let query = db
        .selectFrom("accounts")
        .select([
          "id",
          "email",
          "state",
          "created_at",
          "first_signed_in_at",
          "invite_email_sent_at",
          "referred_by_account_id",
        ])
        .where("deleted_at", "is", null)
        .orderBy("id", "asc")
        // One extra row, so "is there a next page" is answered by the query
        // rather than by a second count that can disagree with it.
        .limit(limit + 1);

      if (state === "waiting") query = query.where("state", "=", "waitlist");
      else if (state === "invited") query = query.where("state", "=", "invited");
      // Everyone who has ever been on the waitlist, which is not everyone:
      // staff seeded straight to active were never waiting for anything.
      // Disabled is included, because a disabled account was on this list at
      // some point and hiding it makes it look as though it never existed.
      else query = query.where("state", "in", ["waitlist", "invited", "active", "disabled"]);

      if (q) {
        // Substring, case-insensitive. An admin searching a waitlist is
        // looking for someone who wrote to support, and they rarely have the
        // whole address.
        query = query.where((eb) => eb(eb.fn("lower", ["email"]), "like", `%${q.toLowerCase()}%`));
      }

      if (after) query = query.where("id", ">", after);

      const found = await query.execute();
      const rows = found.slice(0, limit);
      const last = rows[rows.length - 1];

      const joined = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

      return reply.send({
        rows: rows.map((account) => ({
          id: account.id,
          email: account.email,
          state:
            account.state === "waitlist"
              ? ("waiting" as const)
              : account.state === "invited"
                ? ("invited" as const)
                : account.state === "disabled"
                  ? ("disabled" as const)
                  : ("accepted" as const),
          joined: joined.format(account.created_at),
          source: account.referred_by_account_id ? ("thread" as const) : ("waitlist" as const),
          note: noteFor(account),
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

  // Send the invite email again.
  //
  // Not "reissue an invite": the kit's notes describe a single-use link that
  // expires and can be voided, and this product has no such link. Sign-in is
  // by provider on the invited address, so the only thing to resend is the
  // email itself. The divergence is logged rather than papered over.
  app.post(
    "/v1/admin/waitlist/:id/resend",
    {
      preHandler: requireStaff(),
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ status: z.enum(["queued", "not-invited"]) }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const account = await db
        .selectFrom("accounts")
        .select(["id", "state"])
        .where("id", "=", request.params.id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!account) return reply.status(404).send({ error: "not-found" as const });
      if (account.state !== "invited") return reply.send({ status: "not-invited" as const });

      await db.transaction().execute(async (tx) => {
        // Release the claim so the handler will send again. The claim exists to
        // stop a retrying job mailing twice; a person asking for a resend is
        // the case it is not meant to block.
        await tx
          .updateTable("accounts")
          .set({ invite_email_sent_at: null })
          .where("id", "=", account.id)
          .execute();

        // A distinct idempotency key, or the queue would drop this as a
        // duplicate of the original enqueue forever.
        await enqueue({
          kind: "email.invited",
          accountId: account.id,
          payload: { accountId: account.id },
          priority: PRIORITY.interactive,
          idempotencyKey: `email.invited:${account.id}:${Date.now()}`,
          tx,
        });
      });

      return reply.send({ status: "queued" as const });
    }
  );

  // Removing someone from the waitlist.
  //
  // The kit says this is deliberately absent, and that support does it from
  // People once the account exists. People does not exist, and an address
  // submitted by a bot or a typo has no account to remove it from, so it is
  // here. Narrower than the kit's account deletion in two ways that keep it
  // safe: it refuses anything past `waitlist`, so an invited or active account
  // can never be removed by this route, and it is a soft delete.
  //
  // Soft, because the unique index on the address is partial: it only covers
  // rows where deleted_at is null. Clearing the row hard would let the same
  // address rejoin and be counted as new, and keeping a tombstone means the
  // rate limiter and the audit trail both still see it.
  app.delete(
    "/v1/admin/waitlist/:id",
    {
      preHandler: requireStaff(),
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ status: z.enum(["removed", "not-waiting"]) }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const removed = await db
        .updateTable("accounts")
        .set({ deleted_at: new Date(), updated_at: new Date() })
        // Only someone still waiting. An invited account has keys, a thread
        // and a membership, and removing it here would leave all three behind.
        .where("id", "=", request.params.id)
        .where("state", "=", "waitlist")
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst();

      if (removed) return reply.send({ status: "removed" as const });

      // Tell apart "there is no such row" from "that person is past the
      // waitlist", because the second is a refusal an admin needs explaining
      // and the first is a stale page.
      const exists = await db
        .selectFrom("accounts")
        .select("id")
        .where("id", "=", request.params.id)
        .executeTakeFirst();

      return exists
        ? reply.send({ status: "not-waiting" as const })
        : reply.status(404).send({ error: "not-found" as const });
    }
  );

  // Removing a selection.
  //
  // Same rule as one row: only people still waiting, and a soft delete. Done
  // in a single statement rather than a loop, because unlike promotion there
  // is no per-row work to serialise, and a partial batch here would be a list
  // that half changed under someone.
  app.post(
    "/v1/admin/waitlist/remove",
    {
      preHandler: requireStaff(),
      schema: {
        body: z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH) }),
        response: {
          200: z.object({ removed: z.number().int(), skipped: z.number().int() }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const removed = await db
        .updateTable("accounts")
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where("id", "in", request.body.ids)
        .where("state", "=", "waitlist")
        .where("deleted_at", "is", null)
        .returning("id")
        .execute();

      // Skipped rather than failed: a selection can legitimately contain
      // someone who was invited between the page loading and the click, and
      // the honest report is what happened to each, not an error for all.
      return reply.send({
        removed: removed.length,
        skipped: request.body.ids.length - removed.length,
      });
    }
  );

  // The weekly batch: the oldest N still waiting.
  //
  // Oldest first, and chosen by the server rather than by whichever rows the
  // admin's browser happens to have loaded. A page showing 50 of 4,000 would
  // otherwise invite the first 25 of that page, which is not the same set.
  app.post(
    "/v1/admin/waitlist/invite-next",
    {
      preHandler: requireStaff(),
      schema: {
        body: z.object({ count: z.number().int().min(1).max(MAX_BATCH).optional() }),
        response: {
          200: z.object({ results: z.array(outcome), batchSize: z.number().int() }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const count = request.body.count ?? WEEKLY_BATCH;

      const waiting = await db
        .selectFrom("accounts")
        .select(["email"])
        .where("state", "=", "waitlist")
        .where("deleted_at", "is", null)
        // (created_at, id), not id alone. Ids are UUIDv7, which orders by
        // millisecond and randomly within one, and "the oldest twenty five"
        // has to mean the oldest. Safe to order on here in a way it was not
        // safe to paginate on: the comparison happens in Postgres at full
        // precision and never round trips through a JavaScript Date.
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .limit(count)
        .execute();

      const results = [];
      for (const account of waiting) {
        const result = await promote(account.email, { invitedBy: request.staff?.accountId ?? null });
        results.push({ accountId: result.accountId, status: result.status });
      }

      return reply.send({ results, batchSize: count });
    }
  );
}
