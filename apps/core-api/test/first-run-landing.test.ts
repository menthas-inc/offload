// 033 AC-9, AC-10: Bring things in connects a calendar and comes back to
// itself. The landing is still an enum sealed into the state and resolved
// here, never a URL from the request.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { openState, sealState } from "../src/connectors/state.js";
import { landingUrl } from "../src/routes/connectors.js";

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
  await db.deleteFrom("accounts").execute();
});

async function signedIn(state: "active" | "invited" = "active"): Promise<{ accountId: string; cookie: string }> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state,
      email_verified: true,
      display_name: "Jo Alves",
      analytics_subject_id: uuidv7(),
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

describe("033 the first-run-bring landing", () => {
  it("is a landing the start route accepts", async () => {
    // Without a session the handler answers 401; a landing the schema refuses
    // never reaches it and is a 400.
    const accepted = await app.inject({ method: "GET", url: "/api/connectors/google/start?landing=first-run-bring" });
    expect(accepted.statusCode).toBe(401);
    const refused = await app.inject({ method: "GET", url: "/api/connectors/google/start?landing=https://evil.example" });
    expect(refused.statusCode).toBe(400);
  });

  it("survives the sealed state", () => {
    const state = sealState({ accountId: "a1", verifier: "v", landing: "first-run-bring" }, Date.now());
    expect(openState(state, Date.now())?.landing).toBe("first-run-bring");
  });

  it("comes back to Bring things in whether it connected or not", () => {
    expect(landingUrl("first-run-bring", "connected")).toBe(`${env.WEB_URL}/welcome/bring?calendar=connected`);
    expect(landingUrl("first-run-bring", "failed")).toBe(`${env.WEB_URL}/welcome/bring?calendar=failed`);
  });

  it("keeps the older landings where they were, for phones on an older build", () => {
    expect(landingUrl("first-run", "connected")).toBe(`${env.WEB_URL}/settings/apps?calendar=connected`);
    expect(landingUrl("first-run", "failed")).toBe(`${env.WEB_URL}/welcome?calendar=failed`);
    expect(landingUrl("settings", "failed")).toBe(`${env.WEB_URL}/settings/apps?calendar=failed`);
  });

  it("sends a declined consent back to Bring things in", async () => {
    const { accountId, cookie } = await signedIn();
    const state = sealState({ accountId, verifier: "v", landing: "first-run-bring" }, Date.now());
    const response = await app.inject({
      method: "GET",
      url: `/api/connectors/google/callback?state=${encodeURIComponent(state)}&error=access_denied`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.WEB_URL}/welcome/bring?calendar=failed`);
  });
});

describe("033 AC-20 connecting needs an active account", () => {
  it("refuses an account still in first run", async () => {
    const { cookie } = await signedIn("invited");
    const response = await app.inject({
      method: "GET",
      url: "/api/connectors/google/start?landing=first-run-bring",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "not_active" });
  });

  it("lets an active account through to the connector", async () => {
    const { cookie } = await signedIn("active");
    const response = await app.inject({
      method: "GET",
      url: "/api/connectors/google/start?landing=first-run-bring",
      headers: { cookie },
    });
    // 302 to Google where the connector is configured, 503 where it is not;
    // either way past the account check.
    expect([302, 503]).toContain(response.statusCode);
  });
});
