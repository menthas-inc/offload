// The waitlist: read it, and let people in.
//
// Built by 002. Everything about what letting someone in means lives in
// admin/promote.ts; this file is the shape of the requests. 034 moved it under
// the admin plugin (paths here are relative to `/v1/admin`, and the staff
// check is the plugin's), gave every write its audit entry, and added invite
// by address, the stats row, and the weekly batch read from Limits.

import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { audit } from "../../admin/audit.js";
import { promote } from "../../admin/promote.js";
import { setting } from "../../settings.js";
import { enqueue, PRIORITY } from "../../jobs/queue.js";

const MAX_BATCH = 100;

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


export async function waitlistAdminRoutes(app: App): Promise<void> {
  app.get(
    "/waitlist",
    {
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
    "/waitlist/:id/invite",
    {
      config: { audit: "invited" },
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

      const result = await promote(account.email, { invitedBy: request.staff!.accountId });
      return reply.send({ accountId: result.accountId, status: result.status });
    }
  );

  // The batch variant. Sequential rather than concurrent: each promotion takes
  // a row lock and opens a transaction, and a hundred of those at once is a
  // hundred connections' worth of contention to save a second on a screen
  // nobody is watching a progress bar on.
  app.post(
    "/waitlist/invite",
    {
      config: { audit: "invited" },
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
        const result = await promote(account.email, { invitedBy: request.staff!.accountId });
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
    "/waitlist/:id/resend",
    {
      config: { audit: "resent" },
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

        await audit(tx, { staff: request.staff!, kind: "resent", targetAccountId: account.id });
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
    "/waitlist/:id",
    {
      config: { audit: "waitlist.removed" },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ status: z.enum(["removed", "not-waiting"]) }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const removed = await db.transaction().execute(async (tx) => {
        const gone = await tx
          .updateTable("accounts")
          .set({ deleted_at: new Date(), updated_at: new Date() })
          // Only someone still waiting. An invited account has keys, a thread
          // and a membership, and removing it here would leave all three behind.
          .where("id", "=", request.params.id)
          .where("state", "=", "waitlist")
          .where("deleted_at", "is", null)
          .returning("id")
          .executeTakeFirst();
        if (gone) await audit(tx, { staff: request.staff!, kind: "waitlist.removed", targetAccountId: gone.id });
        return gone;
      });

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
    "/waitlist/remove",
    {
      config: { audit: "waitlist.removed" },
      schema: {
        body: z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH) }),
        response: {
          200: z.object({ removed: z.number().int(), skipped: z.number().int() }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      const removed = await db.transaction().execute(async (tx) => {
        const gone = await tx
          .updateTable("accounts")
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where("id", "in", request.body.ids)
          .where("state", "=", "waitlist")
          .where("deleted_at", "is", null)
          .returning("id")
          .execute();
        // One entry per person removed, never one for the batch: the log is
        // read by person.
        for (const account of gone) await audit(tx, { staff: request.staff!, kind: "waitlist.removed", targetAccountId: account.id });
        return gone;
      });

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
    "/waitlist/invite-next",
    {
      config: { audit: "invited" },
      schema: {
        body: z.object({ count: z.number().int().min(1).max(MAX_BATCH).optional() }),
        response: {
          200: z.object({ results: z.array(outcome), batchSize: z.number().int() }),
          404: z.object({ error: z.enum(["not-found"]) }),
        },
      },
    },
    async (request, reply) => {
      // 034. The weekly batch is a setting on Limits, 25 until an owner says
      // otherwise.
      const count = request.body.count ?? (await setting("waitlist.batch"));

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
        const result = await promote(account.email, { invitedBy: request.staff!.accountId });
        results.push({ accountId: result.accountId, status: result.status });
      }

      return reply.send({ results, batchSize: count });
    }
  );

  // 034. Invite by address: whoever it is, waiting or never seen. The same
  // promotion and the same one email. An address already in answers
  // `already-in` and nothing is sent.
  //
  // The address is validated here and goes nowhere but the accounts row and
  // the mailer: it is never echoed back, and the audit entry names the
  // account by id.
  app.post(
    "/waitlist/invite-address",
    {
      config: { audit: "invited" },
      schema: {
        body: z.object({ email: z.string().trim().toLowerCase().max(320).pipe(z.email()) }),
        response: { 200: outcome, 404: z.object({ error: z.enum(["not-found"]) }) },
      },
    },
    async (request, reply) => {
      const result = await promote(request.body.email, { invitedBy: request.staff!.accountId });
      return reply.send({ accountId: result.accountId, status: result.status });
    }
  );

  // 034. The stats row the kit draws and 002 left out, straight from the
  // accounts table. Counts, one date, and the batch from Limits.
  app.get(
    "/waitlist/stats",
    {
      schema: {
        response: {
          200: z.object({
            waiting: z.number().int(),
            /** When the longest-waiting person joined. Null with nobody waiting. */
            oldestWaiting: z.string().nullable(),
            /** Invite emails that went out in the last seven days. */
            invitedThisWeek: z.number().int(),
            signedUp: z.number().int(),
            /** Invited and not yet signed in. */
            invitedNotSignedUp: z.number().int(),
            batch: z.number().int(),
          }),
          404: z.object({ error: z.literal("not-found") }),
        },
      },
    },
    async (_request, reply) => {
      const row = await db
        .selectFrom("accounts")
        .select([
          sql<string>`count(*) filter (where state = 'waitlist')`.as("waiting"),
          sql<Date | null>`min(created_at) filter (where state = 'waitlist')`.as("oldest"),
          sql<string>`count(*) filter (where invite_email_sent_at > now() - interval '7 days')`.as("invited_this_week"),
          sql<string>`count(*) filter (where state = 'active')`.as("signed_up"),
          sql<string>`count(*) filter (where state = 'invited')`.as("invited"),
        ])
        .where("deleted_at", "is", null)
        .executeTakeFirstOrThrow();

      return reply.send({
        waiting: Number(row.waiting),
        oldestWaiting: row.oldest ? row.oldest.toISOString() : null,
        invitedThisWeek: Number(row.invited_this_week),
        signedUp: Number(row.signed_up),
        invitedNotSignedUp: Number(row.invited),
        batch: await setting("waitlist.batch"),
      });
    }
  );
}
