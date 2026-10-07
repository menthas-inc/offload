// Asking for consent again when the privacy policy or the terms move.
//
// The policy promises notice of a material change. `consent_version` records
// which wording somebody agreed to, and an active account on an older one is
// asked again: `/api/me` says so and `/api/consent` takes the two ticks.

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { CONSENT_VERSION } from "../src/routes/session.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

async function signedIn(
  state: "active" | "invited",
  consentVersion: string | null,
): Promise<{ accountId: string; cookie: string }> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state,
      email_verified: true,
      display_name: "Jo Alves",
      analytics_subject_id: uuidv7(),
      consent_version: consentVersion,
      consented_at: consentVersion === null ? null : new Date("2026-09-22T10:00:00Z"),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: row.id, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return {
    accountId: row.id,
    cookie: `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`,
  };
}

const me = async (cookie: string) =>
  (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json() as {
    needsFirstRun: boolean;
    needsConsent: boolean;
  };

const consent = (cookie: string, payload: unknown) =>
  app.inject({ method: "POST", url: "/api/consent", headers: { cookie }, payload: payload as object });

const consentOf = (id: string) =>
  db.selectFrom("accounts").select(["consent_version", "consented_at", "state"]).where("id", "=", id).executeTakeFirstOrThrow();

const BOTH = { readPolicy: true, agreeToProcessing: true };

describe("S20 asking again when the policy or the terms change", () => {
  it("asks an active account on an older version, and stops asking once it agrees", async () => {
    const { accountId, cookie } = await signedIn("active", "2026-09-22");
    expect((await me(cookie)).needsConsent).toBe(true);

    const response = await consent(cookie, BOTH);
    expect(response.statusCode).toBe(200);

    expect((await me(cookie)).needsConsent).toBe(false);
    const row = await consentOf(accountId);
    expect(row.consent_version).toBe(CONSENT_VERSION);
    expect(row.consented_at!.getTime()).toBeGreaterThan(new Date("2026-09-22T10:00:00Z").getTime());
  });

  it("asks an active account that never recorded a version", async () => {
    const { cookie } = await signedIn("active", null);
    expect((await me(cookie)).needsConsent).toBe(true);
  });

  it("does not ask an account already on this version", async () => {
    const { cookie } = await signedIn("active", CONSENT_VERSION);
    expect((await me(cookie)).needsConsent).toBe(false);
  });

  it("leaves an invited account to first run, and writes nothing for it", async () => {
    const { accountId, cookie } = await signedIn("invited", null);
    const answer = await me(cookie);
    expect(answer.needsFirstRun).toBe(true);
    expect(answer.needsConsent).toBe(false);

    await consent(cookie, BOTH);
    const row = await consentOf(accountId);
    expect(row.state).toBe("invited");
    expect(row.consent_version).toBeNull();
  });

  it("is idempotent: a second agreement moves nothing", async () => {
    const { accountId, cookie } = await signedIn("active", "2026-09-22");
    await consent(cookie, BOTH);
    const first = await consentOf(accountId);
    await consent(cookie, BOTH);
    const second = await consentOf(accountId);
    expect(second.consented_at!.getTime()).toBe(first.consented_at!.getTime());
  });

  it.each([
    ["no body at all", undefined],
    ["neither tick", {}],
    ["only the policy tick", { readPolicy: true }],
    ["only the processing tick", { agreeToProcessing: true }],
    ["a tick that is false", { readPolicy: true, agreeToProcessing: false }],
  ])("refuses %s", async (_label, payload) => {
    const { accountId, cookie } = await signedIn("active", "2026-09-22");
    const response = await consent(cookie, payload);
    expect(response.statusCode).toBe(400);
    expect((await consentOf(accountId)).consent_version).toBe("2026-09-22");
  });

  it("answers 401 without a session", async () => {
    const response = await app.inject({ method: "POST", url: "/api/consent", payload: BOTH });
    expect(response.statusCode).toBe(401);
  });
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The page's `UPDATED`, "6 October 2026", as the ISO day. */
function updatedOf(page: string): string {
  const source = readFileSync(new URL(`../../web/src/app/(marketing)/${page}/page.tsx`, import.meta.url), "utf8");
  const match = /const UPDATED = "(\d{1,2}) ([A-Z][a-z]+) (\d{4})";/.exec(source);
  expect(match, page).not.toBeNull();
  const [, day, month, year] = match!;
  const index = MONTHS.indexOf(month!);
  expect(index, `${page} month`).toBeGreaterThanOrEqual(0);
  return `${year}-${String(index + 1).padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

describe("S24 the consent covers the terms and the companies list as well as the policy", () => {
  // Privacy section 6 promises a re-ask on a material change to who handles
  // content, and the companies list carries its own UPDATED.
  it("is the latest of the three pages' dates", () => {
    const dates = [updatedOf("privacy"), updatedOf("terms"), updatedOf("privacy/companies")];
    expect(CONSENT_VERSION).toBe(dates.reduce((a, b) => (a > b ? a : b)));
  });
});
