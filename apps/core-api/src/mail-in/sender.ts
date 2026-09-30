/** 026. The sender check: who may send to over@to.offload.club.
 *
 *  An email is accepted when a DKIM signature from the From address's own
 *  domain verifies over From and over the To or Cc that names offload, the
 *  From is exactly one address and it is an account's sign-in email, and the
 *  signature is fresh and has never been seen. Everything else is refused
 *  with an outcome from a closed list, which is the only thing that is ever
 *  logged: an address, a subject or a body never is (OFF-1).
 *
 *  The library verifies signatures. Every rule about what a verified signature
 *  has to cover is here, because the library's own notion of "aligned" is
 *  DMARC's, which leaves the To header and the body length tag to the domain's
 *  published policy, and for gmail.com that policy is lenient. */

import { createHash, randomUUID } from "node:crypto";
import { domainToASCII } from "node:url";
import { sql } from "kysely";
import { dkimVerify } from "mailauth/lib/dkim/verify.js";
import addressparser from "nodemailer/lib/addressparser/index.js";
import libmime from "libmime";
import { db } from "../db.js";

export const ADDRESS = "over@to.offload.club";
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type SenderOutcome =
  | "accepted"
  | "unsigned"
  | "unaligned"
  | "length_tag"
  | "unsigned_from"
  | "unsigned_recipient"
  | "from_shape"
  | "no_account"
  | "stale"
  | "replayed"
  | "key_unavailable";

/** `accountId` is the account the From names, whatever the outcome, so the
 *  caller can write its one refused row; null where no account is named or
 *  where the check could not be run at all, which writes nothing. */
export type SenderResult = { outcome: SenderOutcome; accountId: string | null; signature?: Buffer };

/** Spend an accepted email's signature, once it has been handled: filed,
 *  dropped at a cap, or found empty. Spent after rather than during the
 *  check, so a failure between the two leaves the redelivery acceptable
 *  rather than refused as a replay of an email nothing kept. */
export async function spendSignature(hash: Buffer): Promise<void> {
  await sql`insert into mail_signatures (hash) values (${hash}) on conflict do nothing`.execute(db);
}

export type Resolver = (name: string, rrtype: string) => Promise<string[][] | string[]>;

/** The header block, unfolded, as (lowercased key, value) pairs in order. */
function headersOf(raw: Buffer): { key: string; value: string }[] {
  const text = raw.toString("latin1");
  const end = text.search(/\r?\n\r?\n/);
  const block = (end === -1 ? text : text.slice(0, end)).replace(/\r?\n[ \t]+/g, " ");
  return block
    .split(/\r?\n/)
    .map((line) => {
      const colon = line.indexOf(":");
      return colon <= 0 ? null : { key: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1).trim() };
    })
    .filter((h): h is { key: string; value: string } => h !== null);
}

/** Every mailbox address a header value holds, groups included. */
function addresses(value: string): string[] {
  const out: string[] = [];
  for (const entry of addressparser(value)) {
    for (const box of entry.group ?? [entry]) if (box.address) out.push(box.address);
  }
  return out;
}

/** The address as the account table compares it, or null when it cannot be
 *  compared honestly: a non-ASCII local part is refused rather than folded,
 *  and nothing else is normalised. No `+tag` stripping and no Gmail dot
 *  folding, in either direction: `jo+x@` is somebody's address and it is not
 *  `jo@`'s. */
function comparable(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  const local = address.slice(0, at);
  if (!/^[\x21-\x7e]+$/.test(local)) return null;
  const domain = domainToASCII(address.slice(at + 1));
  if (!domain) return null;
  return `${local.toLowerCase()}@${domain.toLowerCase()}`;
}

async function accountFor(address: string): Promise<string | null> {
  const row = await db
    .selectFrom("accounts")
    .select("id")
    .where(sql<boolean>`lower(email) = ${address}`)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function checkSender(raw: Buffer, opts: { resolver?: Resolver; now?: Date } = {}): Promise<SenderResult> {
  const headers = headersOf(raw);
  const count = (key: string) => headers.filter((h) => h.key === key).length;

  // One From, one To at most, one Cc at most: a duplicate of a signed header
  // is how an unsigned copy rides beside a signed one.
  if (count("from") !== 1 || count("to") > 1 || count("cc") > 1) return { outcome: "from_shape", accountId: null };
  const fromValue = libmime.decodeWords(headers.find((h) => h.key === "from")!.value);
  const fromAddresses = addresses(fromValue);
  if (fromAddresses.length !== 1) return { outcome: "from_shape", accountId: null };
  const from = comparable(fromAddresses[0]!);
  if (!from) return { outcome: "from_shape", accountId: null };

  const accountId = await accountFor(from);
  const refuse = (outcome: SenderOutcome): SenderResult => ({ outcome, accountId });

  const verified = await dkimVerify(raw, {
    ...(opts.resolver ? { resolver: opts.resolver } : {}),
    ...(opts.now ? { curTime: opts.now } : {}),
  });
  const results = verified.results ?? [];
  const passes = results.filter((r) => r.status?.result === "pass");
  if (passes.length === 0) {
    if (results.some((r) => r.status?.result === "temperror")) return { outcome: "key_unavailable", accountId: null };
    return refuse("unsigned");
  }

  const fromDomain = from.slice(from.lastIndexOf("@") + 1);
  const aligned = passes.filter((r) => {
    const d = String(r.signingDomain ?? "").toLowerCase();
    return d !== "" && (fromDomain === d || fromDomain.endsWith(`.${d}`));
  });
  if (aligned.length === 0) return refuse("unaligned");
  const whole = aligned.filter((r) => r.canonBodyLengthLimited !== true);
  if (whole.length === 0) return refuse("length_tag");

  const signedKeys = (r: (typeof whole)[number]) =>
    String(r.signingHeaders?.keys ?? "")
      .split(":")
      .map((k) => k.trim().toLowerCase());
  const coversFrom = whole.filter((r) => signedKeys(r).includes("from"));
  if (coversFrom.length === 0) return refuse("unsigned_from");

  const toOffload = coversFrom.filter((r) =>
    (r.signingHeaders?.headers ?? []).some((line: string) => {
      const colon = line.indexOf(":");
      const key = line.slice(0, colon).trim().toLowerCase();
      if (key !== "to" && key !== "cc") return false;
      return addresses(libmime.decodeWords(line.slice(colon + 1).replace(/\r?\n[ \t]+/g, " "))).some(
        (a) => comparable(a) === ADDRESS,
      );
    }),
  );
  if (toOffload.length === 0) return refuse("unsigned_recipient");

  if (!accountId) return { outcome: "no_account", accountId: null };

  const now = (opts.now ?? new Date()).getTime();
  const fresh = toOffload.filter((r) => !r.signTime || now - new Date(r.signTime).getTime() <= STALE_MS);
  if (fresh.length === 0) return refuse("stale");

  // Read here and spent by the caller once the email is handled: a refusal
  // must not burn the signature for the real delivery behind it.
  const chosen = fresh[0]!;
  const hash = createHash("sha256")
    .update(`${String(chosen.signingDomain).toLowerCase()}\n${chosen.signature ?? randomUUID()}`)
    .digest();
  const seen = await db.selectFrom("mail_signatures").select("hash").where("hash", "=", hash).executeTakeFirst();
  if (seen) return refuse("replayed");

  return { outcome: "accepted", accountId, signature: hash };
}
