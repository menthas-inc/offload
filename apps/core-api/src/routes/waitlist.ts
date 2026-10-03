// POST /v1/waitlist
//
// The only unauthenticated write in the product, which makes it the most
// exposed surface we have. Three properties matter more than the feature:
//
//   Enumeration-safe. Identical body, status and timing whether the address is
//   new, already waiting, or already an account. Otherwise this endpoint is an
//   oracle that tells anyone whether a given person uses offload.
//
//   Send-once. The confirmation email is gated on the account row, not on the
//   rate limiter, because rate limiting bounds request rate and not total
//   sends across time or addresses.
//
//   Normalised. Trim and lowercase on every boundary, with the unique index
//   making that a guarantee rather than a convention.

import { createHmac, randomUUID } from "node:crypto";
import { sql } from "kysely";
import { z } from "zod";
import type { App } from "../app.js";
import { db } from "../db.js";
import { derivedKey } from "../crypto/derived.js";
import { emit } from "../analytics.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";

/** Every branch takes at least this long, so a faster one cannot be timed. */
const MIN_RESPONSE_MS = 250;

/** Per address and per IP, in a rolling window. Crude on purpose: the real
 *  defence against a determined actor is Turnstile, which is a pre-public gate. */
const RATE_LIMIT = { perEmailPerDay: 5, perIpPerHour: 20 };

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  // A honeypot. Real people never see this field; scripts fill everything.
  // Named plausibly, because "honeypot" is a giveaway.
  company: z.string().max(0).optional(),
});

const response = z.object({ status: z.literal("ok") });

export async function waitlistRoutes(app: App): Promise<void> {
  app.post(
    "/v1/waitlist",
    { schema: { body, response: { 200: response } } },
    async (request) => {
      const started = Date.now();
      const { email, company } = request.body;

      // Everything below returns the same thing. Which branch ran is never
      // observable, so the shape of this handler is the security property.
      try {
        if (company) return await settle(started);

        const ip = request.ip;
        if (await overLimit(email, ip)) return await settle(started);

        await joinWaitlist(email, request.log);
      } catch (error) {
        // Even a failure returns ok. An error body would distinguish "already
        // an account" from "new address" for anyone watching.
        request.log.error({ err: String(error).slice(0, 120) }, "waitlist join failed");
      }

      return settle(started);
    }
  );
}

async function settle(started: number): Promise<{ status: "ok" }> {
  const elapsed = Date.now() - started;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }
  return { status: "ok" };
}

/** HMAC, not a hash. An unsalted digest of an email address is reversible
 *  against any common address list, and this row outlives the request. Keyed
 *  by a key of its own rather than the auth secret, see `crypto/derived.ts`. */
const KEY = derivedKey("waitlist-attempts");

function hmac(value: string): Buffer {
  return createHmac("sha256", KEY).update(value).digest();
}

/** 035. The limiter's record of an address, so deleting an account can remove it. */
export function attemptHmac(email: string): Buffer {
  return hmac(email);
}

/** Record the attempt and answer whether it is over either limit.
 *
 *  Recorded for every submission, including the ones that create nothing, so
 *  the limit counts attempts rather than successes. Counting successes would
 *  let an attacker resubmit one known address without limit while never
 *  incrementing anything.
 *
 *  Deliberately not a count over analytics_events, which is what this used to
 *  be: that outbox ships to R2 and is never a second copy of anything (OFF-1),
 *  and the two properties it matched on were never written, so the limit had
 *  never once fired.
 */
async function overLimit(email: string, ip: string): Promise<boolean> {
  const emailHmac = hmac(email);
  const ipHmac = hmac(ip);

  await db.insertInto("waitlist_attempts").values({ email_hmac: emailHmac, ip_hmac: ipHmac }).execute();

  const { rows } = await sql<{ by_email: string; by_ip: string }>`
    select
      (select count(*) from waitlist_attempts
        where email_hmac = ${emailHmac}
          and created_at > now() - interval '1 day') as by_email,
      (select count(*) from waitlist_attempts
        where ip_hmac = ${ipHmac}
          and created_at > now() - interval '1 hour') as by_ip
  `.execute(db);

  const counts = rows[0];
  if (!counts) return false;
  return (
    Number(counts.by_email) > RATE_LIMIT.perEmailPerDay ||
    Number(counts.by_ip) > RATE_LIMIT.perIpPerHour
  );
}

async function joinWaitlist(email: string, log: App["log"]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // One upsert in every case, so the database work is identical whether the
    // address is new or not. do-nothing rather than do-update: an existing
    // account must not have its state or name touched by a public endpoint.
    const inserted = await trx
      .insertInto("accounts")
      .values({ email, state: "waitlist", analytics_subject_id: randomUUID() })
      .onConflict((oc) => oc.doNothing())
      .returning(["id", "analytics_subject_id"])
      .executeTakeFirst();

    // Nothing returned means the address already exists in some state. Emit
    // nothing further and send nothing: telling them would be the oracle.
    if (!inserted) return;

    await enqueue({
      kind: "email.waitlist_joined",
      payload: { accountId: inserted.id },
      accountId: inserted.id,
      priority: PRIORITY.interactive,
      idempotencyKey: `email.waitlist_joined:${inserted.id}`,
      tx: trx,
    });

    await emit({
      name: "waitlist_joined",
      subjectId: inserted.analytics_subject_id,
      properties: { referred: false },
      tx: trx,
    });

    log.info({ accountId: inserted.id }, "waitlist joined");
  });
}
