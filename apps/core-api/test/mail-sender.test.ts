// 026. The sender check (AC-3): who may send to over@to.offload.club.
//
// Each refusal is one real signed message altered in one respect, so a test
// that goes green because of some other rule is visible as the wrong outcome.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { checkSender, spendSignature } from "../src/mail-in/sender.js";
import { wipe } from "./labels-kit.js";
import { uuidv7 } from "../src/uuid.js";
import { DOMAIN, raw, resolver, signed } from "./mail-kit.js";

await migrate(() => {});
afterAll(closeDb);

let jo: string;
beforeEach(async () => {
  await sql`delete from mail_signatures`.execute(db);
  await wipe();
  jo = (
    await db
      .insertInto("accounts")
      .values({ email: `Jo@${DOMAIN}`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
});

const check = (message: Buffer, opts: { down?: boolean; now?: Date } = {}) =>
  checkSender(message, { resolver: resolver({ down: opts.down }), now: opts.now });

describe("the sender check (AC-3)", () => {
  it("accepts a message signed by the sender's domain, from the account, to offload", async () => {
    expect(await check(await signed(raw()))).toMatchObject({ outcome: "accepted", accountId: jo });
  });

  it("accepts offload in a signed Cc", async () => {
    const message = raw({ to: "Sam <sam@elsewhere.test>", cc: "over@to.offload.club" });
    expect((await check(await signed(message))).outcome).toBe("accepted");
  });

  it("accepts a signature from a parent of the From domain", async () => {
    const message = raw({ from: `jo@eu.${DOMAIN}` });
    await db.updateTable("accounts").set({ email: `jo@eu.${DOMAIN}` }).where("id", "=", jo).execute();
    expect((await check(await signed(message))).outcome).toBe("accepted");
  });

  it("refuses an unsigned message", async () => {
    expect(await check(Buffer.from(raw()))).toEqual({ outcome: "unsigned", accountId: jo });
  });

  it("refuses a signature that does not verify", async () => {
    const message = (await signed(raw())).toString().replace("Dentist", "Dentisk");
    expect((await check(Buffer.from(message))).outcome).toBe("unsigned");
  });

  it("refuses a signature from another domain", async () => {
    expect((await check(await signed(raw(), { domain: "other.test" }))).outcome).toBe("unaligned");
  });

  it("refuses a signature carrying a body length limit", async () => {
    const message = await signed(raw(), { maxBodyLength: 10 });
    expect((await check(message)).outcome).toBe("length_tag");
  });

  // RFC 6376 makes a signature that leaves From out a permanent failure for
  // every verifier, and the library holds to it, so this arrives as unsigned.
  // `unsigned_from` stays in the check behind it as a second line.
  it("refuses a signature that does not cover From", async () => {
    const message = (await signed(raw())).toString().replace(/h=([^;]*)/, (_, list: string) =>
      `h=${list.split(":").filter((k) => k.trim().toLowerCase() !== "from").join(":")}`,
    );
    expect((await check(Buffer.from(message))).outcome).toBe("unsigned");
  });

  it("refuses offload named only in an unsigned Cc", async () => {
    const message = raw({ to: "sam@elsewhere.test", cc: "over@to.offload.club" });
    const out = await check(await signed(message, { headerList: ["From", "To", "Subject", "Date", "Message-ID"] }));
    expect(out.outcome).toBe("unsigned_recipient");
  });

  it("refuses a message with two From headers", async () => {
    const message = raw({ headers: [`From: mallory@${DOMAIN}`] });
    expect((await check(await signed(message))).outcome).toBe("from_shape");
  });

  it("refuses a From holding two addresses", async () => {
    const message = raw({ from: `jo@${DOMAIN}, mallory@${DOMAIN}` });
    expect((await check(await signed(message))).outcome).toBe("from_shape");
  });

  it("refuses a second To header", async () => {
    const message = raw({ headers: ["To: over@to.offload.club"], to: "sam@elsewhere.test" });
    expect((await check(await signed(message))).outcome).toBe("from_shape");
  });

  it("compares the address and never the display name", async () => {
    const message = raw({ from: `"jo@${DOMAIN}" <mallory@${DOMAIN}>` });
    expect(await check(await signed(message))).toEqual({ outcome: "no_account", accountId: null });
  });

  // 034 AC-12. Marked for deletion is locked like disabled: no mail in.
  it("finds no account for one marked for deletion", async () => {
    await db.updateTable("accounts").set({ delete_after: new Date(Date.now() + 86_400_000) }).execute();
    expect(await check(await signed(raw()))).toEqual({ outcome: "no_account", accountId: null });
  });

  it("matches only an account that is in: never the waitlist, first run or a disabled one", async () => {
    // A waitlist signup is an `accounts` row with an email, so matching on
    // the address alone accepted mail from somebody never let in.
    for (const state of ["waitlist", "invited", "disabled"] as const) {
      await db.updateTable("accounts").set({ state }).where("id", "=", jo).execute();
      await sql`delete from mail_signatures`.execute(db);
      expect(await check(await signed(raw())), state).toEqual({ outcome: "no_account", accountId: null });
    }
  });

  it("does not strip a +tag", async () => {
    const message = raw({ from: `jo+x@${DOMAIN}` });
    expect((await check(await signed(message))).outcome).toBe("no_account");
  });

  it("does not fold dots", async () => {
    const message = raw({ from: `j.o@${DOMAIN}` });
    expect((await check(await signed(message))).outcome).toBe("no_account");
  });

  it("refuses a non-ASCII local part", async () => {
    const message = raw({ from: `=?utf-8?B?${Buffer.from(`jö@${DOMAIN}`).toString("base64")}?=` });
    expect((await check(await signed(message))).outcome).toBe("from_shape");
  });

  it("refuses a signature once it has been spent", async () => {
    const message = await signed(raw());
    const first = await check(message);
    expect(first.outcome).toBe("accepted");
    await spendSignature(first.signature!);
    expect(await check(message)).toEqual({ outcome: "replayed", accountId: jo });
  });

  it("refuses a signature dated more than seven days ago", async () => {
    const eightDays = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect((await check(await signed(raw(), { signTime: eightDays }))).outcome).toBe("stale");
  });

  it("answers key_unavailable, and names no account, when the key cannot be fetched", async () => {
    expect(await check(await signed(raw()), { down: true })).toEqual({ outcome: "key_unavailable", accountId: null });
  });

  it("does not spend the signature on a refusal", async () => {
    const stale = await signed(raw(), { signTime: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    await check(stale);
    const [row] = (await sql<{ count: string }>`select count(*) from mail_signatures`.execute(db)).rows;
    expect(Number(row?.count)).toBe(0);
  });

  it("refuses an email carrying more than five signatures, before any key is fetched", async () => {
    let fetched = 0;
    const counting = async (name: string, rrtype: string) => {
      fetched++;
      return resolver()(name, rrtype);
    };
    let message = await signed(raw());
    for (let i = 0; i < 5; i++) message = await signed(message.toString());
    expect(await checkSender(message, { resolver: counting })).toEqual({ outcome: "from_shape", accountId: null });
    expect(fetched).toBe(0);
  });
});

describe("the replay guard's hash", () => {
  it("is the same for the same signature, and is nothing without one", async () => {
    const { signatureHash } = await import("../src/mail-in/sender.js");
    expect(signatureHash("Example.com", "abc")).toEqual(signatureHash("example.com", "abc"));
    expect(signatureHash("example.com", "abc")).not.toEqual(signatureHash("example.com", "abd"));
    // A random stand-in made every redelivery look new, to this table and to
    // the dump's own dedupe, which is keyed off the same hash.
    expect(signatureHash("example.com", undefined)).toBeNull();
    expect(signatureHash("example.com", "")).toBeNull();
  });
});
