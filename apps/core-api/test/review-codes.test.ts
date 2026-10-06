// 039. A way in for store reviewers: a code staff make, that lets in the
// address a refused sign-in just used, through the one promotion there is.
//
// AC-1  a code is made with a note, uses and days, shown once, stored as a hash
// AC-2  listed and revoked, both audited
// AC-3  redeeming promotes the proven address and spends one use, together
// AC-4  the database holds the limit, under concurrency
// AC-5  expired, revoked, used up and unknown are one answer and spend nothing
// AC-6  already in is in and spends nothing; disabled is refused
// AC-7  no proof, no read
// AC-8  tries are limited per address and per IP; the limiter's rows go with
//       the account and with the daily purge

import { createHash } from "node:crypto";
import { sql } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { recordAttempt, seal, unsealAttempt } from "../src/auth/attempt.js";
import { auth } from "../src/auth/auth.js";
import { hashCode, newCode, normaliseCode, redeem, codeAttemptHmac } from "../src/admin/review-codes.js";
import { deleteAccount } from "../src/accounts/delete.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { activeAccount, auditEntries, staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await db.deleteFrom("review_code_attempts").execute();
  await wipeAdmin();
  await db.deleteFrom("review_codes").execute();
});

const FORMAT = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const proof = (email: string, reason: "disabled" | null = null) =>
  `offload_attempt=${encodeURIComponent(seal(email, Date.now(), reason))}`;

const make = async (cookie: string, body: Record<string, unknown> = { note: "App Store review 1.0" }) =>
  app.inject({ method: "POST", url: "/v1/admin/codes", headers: { cookie }, payload: body });

/** A live code, made through the panel as staff make one. */
async function aCode(body: Record<string, unknown> = { note: "App Store review 1.0" }): Promise<{ id: string; code: string }> {
  const staff = await staffMember("support");
  const res = await make(staff.cookie, body);
  expect(res.statusCode).toBe(200);
  return res.json() as { id: string; code: string };
}

const use = (code: string, cookie?: string, ip = "203.0.113.7") =>
  app.inject({
    method: "POST",
    url: "/api/sign-in/code",
    headers: cookie ? { cookie } : {},
    payload: { code },
    remoteAddress: ip,
  });

const usesOf = async (id: string) =>
  (await db.selectFrom("review_codes").select("uses").where("id", "=", id).executeTakeFirstOrThrow()).uses;

const accountOf = (email: string) =>
  db.selectFrom("accounts").select(["id", "state", "review_code_id"]).where("email", "=", email).executeTakeFirst();

describe("the code itself", () => {
  it("is twelve characters from a 32 letter alphabet, in three groups, and new each time", () => {
    const codes = new Set(Array.from({ length: 200 }, newCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(FORMAT);
  });

  it("reads the way people type it: any case, spaces and dashes, O for 0, I and L for 1", () => {
    expect(normaliseCode(" ab0c-1def gh2j ")).toBe("AB0C1DEFGH2J");
    expect(normaliseCode("abOc-idef-Gh2l")).toBe("AB0C1DEFGH21");
    expect(hashCode("ABCD-EFGH-JKMN").equals(hashCode("abcd efgh jkmn"))).toBe(true);
    expect(hashCode("ABCD-EFGH-JKMN").equals(createHash("sha256").update("ABCDEFGHJKMN").digest())).toBe(true);
  });
});

describe("AC-1 staff make a code", () => {
  it("returns it once, keeps only its hash, and records who made it", async () => {
    const staff = await staffMember("support");
    const res = await make(staff.cookie, { note: "App Store review 1.0" });
    expect(res.statusCode).toBe(200);
    const made = res.json() as { id: string; code: string; note: string; uses: number; maxUses: number; expiresAt: string; state: string };
    expect(made.code).toMatch(FORMAT);
    expect(made).toMatchObject({ note: "App Store review 1.0", uses: 0, maxUses: 5, state: "live" });
    const days = (Date.parse(made.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    const row = await db.selectFrom("review_codes").selectAll().where("id", "=", made.id).executeTakeFirstOrThrow();
    expect(Buffer.from(row.code_hash).equals(hashCode(made.code))).toBe(true);
    // Nothing in the row is the code, in any spelling.
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(made.code);
    expect(stored).not.toContain(normaliseCode(made.code));

    expect((await auditEntries()).filter((e) => e.kind === "code.created")).toEqual([
      expect.objectContaining({ staff_account_id: staff.id, new_value: made.id, target_account_id: null }),
    ]);
  });

  it("takes uses and days, within bounds", async () => {
    const staff = await staffMember("support");
    const ok = await make(staff.cookie, { note: "Play review", maxUses: 2, days: 7 });
    expect(ok.json()).toMatchObject({ maxUses: 2 });
    for (const bad of [
      { note: "", maxUses: 2 },
      { note: "x".repeat(81) },
      { note: "n", maxUses: 0 },
      { note: "n", maxUses: 51 },
      { note: "n", days: 0 },
      { note: "n", days: 91 },
    ]) {
      expect((await make(staff.cookie, bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it("is not reachable by somebody who is not staff", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/codes", payload: { note: "n" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("AC-2 listed and revoked", () => {
  it("lists codes without the code, and says what state each is in", async () => {
    const staff = await staffMember("owner");
    const live = (await make(staff.cookie, { note: "live" })).json() as { id: string; code: string };
    const old = (await make(staff.cookie, { note: "old" })).json() as { id: string };
    await db.updateTable("review_codes").set({ expires_at: new Date(Date.now() - 1000) }).where("id", "=", old.id).execute();
    const full = (await make(staff.cookie, { note: "full", maxUses: 1 })).json() as { id: string };
    await db.updateTable("review_codes").set({ uses: 1 }).where("id", "=", full.id).execute();

    const res = await app.inject({ method: "GET", url: "/v1/admin/codes", headers: { cookie: staff.cookie } });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain(live.code);
    const states = Object.fromEntries((res.json() as { rows: Array<{ note: string; state: string }> }).rows.map((r) => [r.note, r.state]));
    expect(states).toEqual({ live: "live", old: "expired", full: "used" });
  });

  it("revokes once, audited once", async () => {
    const staff = await staffMember("support");
    const made = (await make(staff.cookie)).json() as { id: string };
    const revoke = () => app.inject({ method: "POST", url: `/v1/admin/codes/${made.id}/revoke`, headers: { cookie: staff.cookie } });
    expect((await revoke()).json()).toEqual({ status: "revoked" });
    expect((await revoke()).json()).toEqual({ status: "already" });
    expect((await auditEntries()).filter((e) => e.kind === "code.revoked")).toEqual([
      expect.objectContaining({ staff_account_id: staff.id, old_value: made.id }),
    ]);
  });
});

describe("AC-3 redeeming", () => {
  it("lets in the address that just signed in, through promotion, and spends one use", async () => {
    const made = await aCode();
    const res = await use(made.code, proof("reviewer@privaterelay.appleid.com"));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "in" });

    const account = await accountOf("reviewer@privaterelay.appleid.com");
    expect(account).toMatchObject({ state: "invited", review_code_id: made.id });
    expect(await usesOf(made.id)).toBe(1);
    // What promotion makes, made: a key, the default thread, the invite email.
    expect(await db.selectFrom("account_keys").select("account_id").where("account_id", "=", account!.id).executeTakeFirst()).toBeTruthy();
    expect(await db.selectFrom("thread_members").select("thread_id").where("account_id", "=", account!.id).executeTakeFirst()).toBeTruthy();
    expect(await db.selectFrom("jobs").select("kind").where("account_id", "=", account!.id).where("kind", "=", "email.invited").executeTakeFirst()).toBeTruthy();
    // And the proof is spent with it.
    expect(String(res.headers["set-cookie"])).toMatch(/offload_attempt=;.*Max-Age=0/);
  });

  it("lets in somebody already waiting", async () => {
    const made = await aCode();
    await db.insertInto("accounts").values({ email: "waiting@example.test", state: "waitlist" }).execute();
    expect((await use(made.code, proof("waiting@example.test"))).json()).toEqual({ status: "in" });
    expect(await accountOf("waiting@example.test")).toMatchObject({ state: "invited", review_code_id: made.id });
  });

  it("works however the code is typed", async () => {
    const made = await aCode();
    const typed = ` ${made.code.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l")} `;
    expect((await use(typed, proof("typed@example.test"))).json()).toEqual({ status: "in" });
  });
});

describe("AC-4 the limit is the database's", () => {
  it("lets exactly one of five in on a code with one use left", async () => {
    const made = await aCode({ note: "one", maxUses: 1 });
    const emails = Array.from({ length: 5 }, (_, i) => `racer${i}@example.test`);
    const outcomes = await Promise.all(emails.map((email) => redeem(email, made.code)));
    expect(outcomes.filter((o) => o === "in")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "refused")).toHaveLength(4);
    expect(await usesOf(made.id)).toBe(1);
    const admitted = await db.selectFrom("accounts").select("email").where("review_code_id", "=", made.id).execute();
    expect(admitted).toHaveLength(1);
    expect(await db.selectFrom("accounts").select("email").where("email", "like", "racer%").execute()).toHaveLength(1);
  });

  it("refuses a write past the limit even from outside the redemption", async () => {
    const made = await aCode({ note: "one", maxUses: 1 });
    await expect(db.updateTable("review_codes").set({ uses: 2 }).where("id", "=", made.id).execute()).rejects.toThrow(/review_codes_within_limit/);
  });
});

describe("AC-5 a code that does not work is one answer and spends nothing", () => {
  it("refuses expired, revoked, used up and unknown alike", async () => {
    const expired = await aCode({ note: "expired" });
    await db.updateTable("review_codes").set({ expires_at: new Date(Date.now() - 1000) }).where("id", "=", expired.id).execute();
    const revoked = await aCode({ note: "revoked" });
    await db.updateTable("review_codes").set({ revoked_at: new Date() }).where("id", "=", revoked.id).execute();
    const used = await aCode({ note: "used", maxUses: 1 });
    await db.updateTable("review_codes").set({ uses: 1 }).where("id", "=", used.id).execute();

    for (const [code, email] of [
      [expired.code, "a@example.test"],
      [revoked.code, "b@example.test"],
      [used.code, "c@example.test"],
      [newCode(), "d@example.test"],
    ] as const) {
      expect((await use(code, proof(email))).json(), code).toEqual({ status: "refused" });
      expect(await accountOf(email)).toBeUndefined();
    }
    expect(await usesOf(expired.id)).toBe(0);
    expect(await usesOf(revoked.id)).toBe(0);
    expect(await usesOf(used.id)).toBe(1);
  });
});

describe("AC-6 an address that is already in, or disabled", () => {
  it("tells somebody already in that they are in, and spends nothing", async () => {
    const made = await aCode();
    await activeAccount("already@example.test");
    expect((await use(made.code, proof("already@example.test"))).json()).toEqual({ status: "in" });
    expect(await usesOf(made.id)).toBe(0);
    expect(await accountOf("already@example.test")).toMatchObject({ state: "active", review_code_id: null });
  });

  it("does not reopen a disabled account", async () => {
    const made = await aCode();
    const id = await activeAccount("off@example.test");
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();
    expect((await use(made.code, proof("off@example.test", "disabled"))).json()).toEqual({ status: "refused" });
    expect((await use(made.code, proof("off@example.test"))).json()).toEqual({ status: "refused" });
    expect(await usesOf(made.id)).toBe(0);
    expect(await accountOf("off@example.test")).toMatchObject({ state: "disabled" });
  });
});

describe("AC-7 without a live proof", () => {
  it("asks for a sign-in and reads nothing", async () => {
    const made = await aCode();
    expect((await use(made.code)).json()).toEqual({ status: "sign-in" });
    const stale = `offload_attempt=${encodeURIComponent(seal("late@example.test", Date.now() - 11 * 60 * 1000))}`;
    expect((await use(made.code, stale)).json()).toEqual({ status: "sign-in" });
    expect((await use(made.code, "offload_attempt=forged.1.mac")).json()).toEqual({ status: "sign-in" });
    expect(await usesOf(made.id)).toBe(0);
    expect(await db.selectFrom("review_code_attempts").select("id").execute()).toHaveLength(0);
  });

  it("leaves the proof in place when the address is read, so a code can follow it", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sign-in/attempt", headers: { cookie: proof("jo@example.test") } });
    expect(res.json()).toEqual({ email: "jo@example.test", reason: null });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("AC-10 the phones' proof", () => {
  // A phone signs in with an ID token by a plain POST, and a refusal comes back
  // as an error body, not a redirect. The phones read the proof off that
  // response's set-cookie, so it has to be there. The refusal itself is Better
  // Auth's hook calling recordAttempt, stood in for here.
  it("rides out on a refused ID-token sign-in, which is not a redirect", async () => {
    vi.spyOn(auth, "handler").mockImplementation(async () => {
      recordAttempt("reviewer@privaterelay.appleid.com");
      return new Response(JSON.stringify({ message: "unable to create user" }), { status: 422, headers: { "content-type": "application/json" } });
    });
    const res = await app.inject({ method: "POST", url: "/api/auth/sign-in/social", payload: { provider: "apple", idToken: { token: "t" } } });
    expect(res.statusCode).toBe(422);
    const cookie = /offload_attempt=([^;]+)/.exec(String(res.headers["set-cookie"]))![1]!;
    expect(unsealAttempt(decodeURIComponent(cookie), Date.now())).toEqual({ email: "reviewer@privaterelay.appleid.com", reason: null });
  });
});

describe("AC-8 tries are limited", () => {
  it("refuses an address after ten tries in an hour, even with a good code", async () => {
    const made = await aCode();
    for (let i = 0; i < 10; i++) {
      expect((await use(newCode(), proof("guess@example.test"))).json()).toEqual({ status: "refused" });
    }
    expect((await use(made.code, proof("guess@example.test"))).json()).toEqual({ status: "refused" });
    expect(await usesOf(made.id)).toBe(0);
  });

  it("refuses an IP after twenty tries in an hour, whatever the address", async () => {
    const made = await aCode();
    for (let i = 0; i < 20; i++) {
      await use(newCode(), proof(`g${i}@example.test`), "198.51.100.9");
    }
    expect((await use(made.code, proof("fresh@example.test"), "198.51.100.9")).json()).toEqual({ status: "refused" });
    // Another IP is not held up by that one.
    expect((await use(made.code, proof("fresh@example.test"), "198.51.100.10")).json()).toEqual({ status: "in" });
  });

  it("keeps HMACs, not addresses or IPs", async () => {
    await use(newCode(), proof("kept@example.test"), "192.0.2.44");
    const rows = await db.selectFrom("review_code_attempts").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]!.email_hmac).equals(codeAttemptHmac("kept@example.test"))).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/kept@|192\.0\.2\.44/);
  });

  it("forgets an account's tries when it is deleted", async () => {
    const id = await activeAccount("gone@example.test");
    await use(newCode(), proof("gone@example.test"));
    await use(newCode(), proof("stays@example.test"));
    await deleteAccount(id);
    const left = await db.selectFrom("review_code_attempts").select("email_hmac").execute();
    expect(left.map((r) => Buffer.from(r.email_hmac).equals(codeAttemptHmac("stays@example.test")))).toEqual([true]);
  });

  it("forgets tries older than two days in the daily purge", async () => {
    await use(newCode(), proof("old@example.test"));
    await use(newCode(), proof("new@example.test"));
    await sql`update review_code_attempts set created_at = now() - interval '3 days'
      where email_hmac = ${codeAttemptHmac("old@example.test")}`.execute(db);
    await handlers["jobs.purge"]!({}, { mailer: new MemoryMailer() }, null);
    expect(await db.selectFrom("review_code_attempts").select("id").execute()).toHaveLength(1);
  });
});
