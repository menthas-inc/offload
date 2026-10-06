// 039, as the owner changed it on 2026-10-05: the code is typed on the
// sign-in screen and rides through sign-in, and an un-promoted identity with a
// good code is promoted and signed in by that one sign-in.
//
// These run Better Auth's real sign-in, both ways it happens: the ID token a
// phone's native sheet hands over (Apple on iPhone, Google on Android), and
// the redirect and callback the web and the phones' browser flows use. The
// one thing stood in for is the provider: its signature check and its token
// exchange. Everything after that, our profile hook, the gate's three hooks
// and the session, is what production runs.
//
// AC-3  a good code admits and signs in once, audited
// AC-6  an identity already in signs in and spends nothing
// AC-7  a bad code ends at the refusal, which says so
// AC-11 the switch: off, the clients are told and a code is ignored
// AC-12 an address the provider did not verify is never let in by a code

// The provider has to exist for its routes to: CI sets no client id.
process.env["GOOGLE_CLIENT_ID"] ||= "test-client.apps.googleusercontent.com";
process.env["GOOGLE_CLIENT_SECRET"] ||= "test-secret";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { db, closeDb } = await import("../src/db.js");
const { migrate } = await import("../src/migrate.js");
const { buildApp } = await import("../src/app.js");
const { auth } = await import("../src/auth/auth.js");
const { unsealAttempt } = await import("../src/auth/attempt.js");
const { env } = await import("../src/env.js");
const { clearSettingsCache } = await import("../src/settings.js");
const { activeAccount, auditEntries, staffMember, wipeAdmin } = await import("./admin-kit.js");
const { uuidv7 } = await import("../src/uuid.js");

await migrate(() => {});

type App = Awaited<ReturnType<typeof buildApp>>;
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
  if (stood) delete stood.verifyIdToken;
  stood = null;
});
beforeEach(async () => {
  await db.deleteFrom("review_code_attempts").execute();
  await wipeAdmin();
  await db.deleteFrom("review_codes").execute();
});

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** An ID token as Google shapes one. Its signature is never read: the
 *  provider's check is the one thing stood in for. */
function idToken(email: string, verified = true): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: "RS256", kid: "test" }),
    b64({ iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, sub: uuidv7(), email, email_verified: verified, name: "Rev Iewer", iat: now, exp: now + 600 }),
    "signature",
  ].join(".");
}

/** The provider, with its signature check stood in for through the one seam
 *  Better Auth offers for it, `options.verifyIdToken`, taken off again after. */
let stood: { verifyIdToken?: unknown } | null = null;
async function google() {
  const context = await auth.$context;
  const provider = context.socialProviders.find((one) => one.id === "google")!;
  stood = provider.options as { verifyIdToken?: unknown };
  stood.verifyIdToken = async () => true;
  return provider;
}

async function aCode(maxUses = 5): Promise<{ id: string; code: string; staffId: string }> {
  const staff = await staffMember("support");
  const res = await app.inject({ method: "POST", url: "/v1/admin/codes", headers: { cookie: staff.cookie }, payload: { note: "App Store review 1.0", maxUses } });
  expect(res.statusCode).toBe(200);
  return { ...(res.json() as { id: string; code: string }), staffId: staff.id };
}

/** The native sheet's path: one POST with the token, the code beside it. */
const native = (email: string, code?: string, verified = true) =>
  app.inject({
    method: "POST",
    url: "/api/auth/sign-in/social",
    headers: { origin: env.WEB_URL },
    payload: { provider: "google", idToken: { token: idToken(email, verified) }, ...(code === undefined ? {} : { additionalData: { reviewCode: code } }) },
    remoteAddress: "203.0.113.7",
  });

const usesOf = async (id: string) =>
  (await db.selectFrom("review_codes").select("uses").where("id", "=", id).executeTakeFirstOrThrow()).uses;
const accountOf = (email: string) =>
  db.selectFrom("accounts").select(["id", "state", "review_code_id"]).where("email", "=", email).executeTakeFirst();
const sessionsOf = async (accountId: string) =>
  (await db.selectFrom("sessions").select("id").where("account_id", "=", accountId).execute()).length;
const cookies = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"] ?? "");
const attemptIn = (res: { headers: Record<string, unknown> }) => {
  const raw = /offload_attempt=([^;,]+)/.exec(cookies(res))?.[1];
  return raw ? unsealAttempt(decodeURIComponent(raw), Date.now()) : null;
};

describe("AC-3 a good code at sign-in", () => {
  it("admits a stranger and signs them in with that one native sign-in", async () => {
    await google();
    const made = await aCode();
    const res = await native("reviewer@example.test", made.code);
    expect(res.statusCode, res.payload).toBe(200);
    expect(cookies(res)).toContain("better-auth.session_token=");

    const account = await accountOf("reviewer@example.test");
    expect(account).toMatchObject({ state: "invited", review_code_id: made.id });
    expect(await sessionsOf(account!.id)).toBe(1);
    expect(await db.selectFrom("account_identities").select("id").where("account_id", "=", account!.id).execute()).toHaveLength(1);
    expect(await usesOf(made.id)).toBe(1);
    expect((await auditEntries()).filter((e) => e.kind === "code.redeemed")).toEqual([
      expect.objectContaining({ staff_account_id: made.staffId, target_account_id: account!.id, new_value: made.id }),
    ]);
  });

  it("rides through the browser's redirect, bound to that sign-in's state, and signs in at the callback", async () => {
    const provider = await google();
    const made = await aCode();
    vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({ idToken: idToken("browser@example.test"), accessToken: "a", tokenType: "Bearer" } as never);

    const start = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/social",
      headers: { origin: env.WEB_URL },
      payload: { provider: "google", callbackURL: `${env.WEB_URL}/welcome`, errorCallbackURL: `${env.WEB_URL}/no-invite`, additionalData: { reviewCode: made.code } },
    });
    expect(start.statusCode, start.payload).toBe(200);
    const state = new URL((start.json() as { url: string }).url).searchParams.get("state")!;
    // Nothing is spent until the provider has said who it is.
    expect(await usesOf(made.id)).toBe(0);

    const jar = cookies(start)
      .split(/,(?=\s*[\w.-]+=)/)
      .map((one) => one.split(";")[0]!.trim())
      .join("; ");
    const back = await app.inject({ method: "GET", url: `/api/auth/callback/google?state=${encodeURIComponent(state)}&code=c`, headers: { cookie: jar } });
    expect(back.statusCode, back.payload).toBe(302);
    expect(back.headers["location"]).toBe(`${env.WEB_URL}/welcome`);
    expect(cookies(back)).toContain("better-auth.session_token=");
    expect(await accountOf("browser@example.test")).toMatchObject({ state: "invited", review_code_id: made.id });
  });
});

describe("AC-6 an identity already in", () => {
  it("signs in and spends nothing", async () => {
    await google();
    const made = await aCode();
    const id = await activeAccount("member@example.test");
    const res = await native("member@example.test", made.code);
    expect(res.statusCode, res.payload).toBe(200);
    expect(await sessionsOf(id)).toBe(1);
    expect(await usesOf(made.id)).toBe(0);
    expect((await auditEntries()).filter((e) => e.kind === "code.redeemed")).toEqual([]);
  });
});

describe("AC-7 a code that does not work", () => {
  it("ends at the refusal, which says it was the code, and spends nothing", async () => {
    await google();
    const made = await aCode(1);
    await db.updateTable("review_codes").set({ uses: 1 }).where("id", "=", made.id).execute();
    const res = await native("late@example.test", made.code);
    expect(res.statusCode).not.toBe(200);
    expect(cookies(res)).not.toContain("better-auth.session_token=");
    expect(attemptIn(res)).toEqual({ email: "late@example.test", reason: "code" });
    expect(await accountOf("late@example.test")).toBeUndefined();
  });

  it("is a plain refusal with no code at all, as before", async () => {
    await google();
    const res = await native("stranger@example.test");
    expect(attemptIn(res)).toEqual({ email: "stranger@example.test", reason: null });
  });
});

describe("AC-11 the switch", () => {
  it("is on unless an owner turns it off, and the clients are told", async () => {
    expect((await app.inject({ method: "GET", url: "/api/sign-in/options" })).json()).toEqual({ codes: true });
    await db.insertInto("app_settings").values({ key: "switch.review_codes", value: JSON.stringify(false) }).execute();
    clearSettingsCache();
    expect((await app.inject({ method: "GET", url: "/api/sign-in/options" })).json()).toEqual({ codes: false });
  });

  it("off, ignores a good code: no account, no use, a plain refusal", async () => {
    await google();
    const made = await aCode();
    await db.insertInto("app_settings").values({ key: "switch.review_codes", value: JSON.stringify(false) }).execute();
    clearSettingsCache();
    const res = await native("ignored@example.test", made.code);
    expect(res.statusCode).not.toBe(200);
    expect(await accountOf("ignored@example.test")).toBeUndefined();
    expect(await usesOf(made.id)).toBe(0);
    expect(attemptIn(res)).toEqual({ email: "ignored@example.test", reason: null });
  });
});

describe("AC-12 an address the provider did not verify", () => {
  it("is never let in by a code", async () => {
    await google();
    const made = await aCode();
    const res = await native("unverified@example.test", made.code, false);
    expect(res.statusCode).not.toBe(200);
    expect(await accountOf("unverified@example.test")).toBeUndefined();
    expect(await usesOf(made.id)).toBe(0);
  });
});
