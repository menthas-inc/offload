// 039. A way in for store reviewers.
//
// Apple and Google review the apps signed in with their own accounts, often
// behind an Apple relay address nobody can know in advance, so an emailed
// invite cannot reach them. Staff make a code instead, and it goes in the
// review notes. A reviewer signs in, is refused like any stranger, types the
// code on the no-invite screen, and the address they just signed in with is
// promoted exactly as an admin invite would promote it.
//
// Three rules carry the design:
//
//   One way to make an account. Redeeming calls `promoteIn`, the body of the
//   promotion the Waitlist page runs, in a transaction this module owns.
//
//   The limit is the database's. A use is claimed by one conditional update,
//   so concurrent redemptions queue on the row and the second one re-reads
//   `uses < max_uses` against the first one's commit. Not a read and then a
//   write, and not a lock taken outside the transaction that acts on it
//   (CLAUDE.md, the staff-linking guard). The check constraint in 0084 is the
//   backstop for anything that writes the row another way.
//
//   Only a hash is kept. The code is shown once, when it is made. Twelve
//   characters from a 32-letter alphabet is 60 bits: with a handful of codes
//   live and tries limited per address and per IP, guessing is pointless, and
//   a fast hash of a random value that long is as good as a slow one.

import { createHash, createHmac, randomInt } from "node:crypto";
import { sql } from "kysely";
import { db } from "../db.js";
import { derivedKey } from "../crypto/derived.js";
import { audit } from "./audit.js";
import { promoteIn } from "./promote.js";

/** Crockford's base 32: no I, L, O or U, so nothing reads as something else. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 12;

export const DEFAULT_USES = 5;
export const MAX_USES = 50;
export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 90;
export const NOTE_MAX = 80;

/** Tries per hour. Counted whether or not they work, so a guesser cannot
 *  reset the count by succeeding once. */
const LIMIT = { perAddress: 10, perIp: 20 };

/** `XXXX-XXXX-XXXX`, from a uniform draw per character. */
export function newCode(): string {
  let raw = "";
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** The code as it is hashed: the way people type it, read the way it was
 *  meant. Any case, any spaces or dashes, O for zero, I or L for one. */
export function normaliseCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function hashCode(code: string): Buffer {
  return createHash("sha256").update(normaliseCode(code)).digest();
}

/** The limiter's key, its own (`crypto/derived.ts`). */
const KEY = derivedKey("review-code-attempts");

/** The limiter's record of an address, so deleting an account can remove it. */
export function codeAttemptHmac(value: string): Buffer {
  return createHmac("sha256", KEY).update(value).digest();
}

export type CodeState = "live" | "expired" | "used" | "revoked";

export interface CodeRow {
  id: string;
  note: string;
  uses: number;
  maxUses: number;
  expiresAt: string;
  state: CodeState;
}

const SELECT = ["id", "note", "uses", "max_uses", "expires_at", "revoked_at"] as const;

function toRow(row: { id: string; note: string; uses: number; max_uses: number; expires_at: Date; revoked_at: Date | null }): CodeRow {
  const state: CodeState = row.revoked_at
    ? "revoked"
    : row.expires_at.getTime() <= Date.now()
      ? "expired"
      : row.uses >= row.max_uses
        ? "used"
        : "live";
  return { id: row.id, note: row.note, uses: row.uses, maxUses: row.max_uses, expiresAt: row.expires_at.toISOString(), state };
}

/** Make a code. The only time the code itself exists outside the person
 *  reading it off the screen. Audited in the same transaction. */
export async function createCode(
  input: { note: string; maxUses: number; days: number },
  staff: { accountId: string }
): Promise<CodeRow & { code: string }> {
  const code = newCode();
  return db.transaction().execute(async (tx) => {
    const row = await tx
      .insertInto("review_codes")
      .values({
        code_hash: hashCode(code),
        note: input.note,
        max_uses: input.maxUses,
        expires_at: sql<Date>`now() + make_interval(days => ${input.days})`,
      })
      .returning(SELECT)
      .executeTakeFirstOrThrow();
    await audit(tx, { staff, kind: "code.created", new: row.id });
    return { ...toRow(row), code };
  });
}

/** Newest first. Never the code: it is not kept. */
export async function listCodes(): Promise<CodeRow[]> {
  const rows = await db.selectFrom("review_codes").select(SELECT).orderBy("id", "desc").execute();
  return rows.map(toRow);
}

/** Revoking twice is revoking once, and is audited once. */
export async function revokeCode(id: string, staff: { accountId: string }): Promise<"revoked" | "already"> {
  return db.transaction().execute(async (tx) => {
    const revoked = await tx
      .updateTable("review_codes")
      .set({ revoked_at: sql<Date>`now()` })
      .where("id", "=", id)
      .where("revoked_at", "is", null)
      .returning("id")
      .executeTakeFirst();
    if (!revoked) return "already" as const;
    await audit(tx, { staff, kind: "code.revoked", old: id });
    return "revoked" as const;
  });
}

/** Record a try and answer whether it is over either limit. */
export async function overLimit(email: string, ip: string): Promise<boolean> {
  const emailHmac = codeAttemptHmac(email);
  const ipHmac = codeAttemptHmac(ip);
  await db.insertInto("review_code_attempts").values({ email_hmac: emailHmac, ip_hmac: ipHmac }).execute();

  const { rows } = await sql<{ by_email: string; by_ip: string }>`
    select
      (select count(*) from review_code_attempts
        where email_hmac = ${emailHmac} and created_at > now() - interval '1 hour') as by_email,
      (select count(*) from review_code_attempts
        where ip_hmac = ${ipHmac} and created_at > now() - interval '1 hour') as by_ip
  `.execute(db);
  const counts = rows[0];
  if (!counts) return false;
  return Number(counts.by_email) > LIMIT.perAddress || Number(counts.by_ip) > LIMIT.perIp;
}

/** Thrown inside the transaction to give the claimed use back. */
class NotSpent extends Error {
  constructor(readonly outcome: "in" | "refused") {
    super(outcome);
  }
}

/** Let `email` in with `code`, or not.
 *
 *  `in` when the address is now invited, or already was. `refused` for a code
 *  that is unknown, expired, revoked or used up, and for a disabled account:
 *  one answer, so the screen cannot be used to learn which. Only a promotion
 *  that changed something spends a use. */
export async function redeem(email: string, code: string): Promise<"in" | "refused"> {
  try {
    return await db.transaction().execute(async (tx) => {
      const claimed = await tx
        .updateTable("review_codes")
        .set({ uses: sql<number>`uses + 1` })
        .where("code_hash", "=", hashCode(code))
        .where("revoked_at", "is", null)
        .where(sql<boolean>`expires_at > now()`)
        .where(sql<boolean>`uses < max_uses`)
        .returning("id")
        .executeTakeFirst();
      if (!claimed) return "refused" as const;

      const outcome = await promoteIn(tx, email);
      if (outcome.status === "already-in") throw new NotSpent("in");
      if (outcome.status === "refused") throw new NotSpent("refused");

      await tx.updateTable("accounts").set({ review_code_id: claimed.id }).where("id", "=", outcome.accountId).execute();
      return "in" as const;
    });
  } catch (error) {
    if (error instanceof NotSpent) return error.outcome;
    throw error;
  }
}
