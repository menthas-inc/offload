// Content waits for consent. A session exists from sign-in, while the account
// is still `invited` and has agreed to nothing; the privacy page names first
// run's consent as the lawful basis for holding what people put in. So every
// write behind a session is refused for an account that is not active, before
// its body is read, and first run's own routes are not.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { sealState } from "../src/connectors/state.js";

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
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("push_tokens").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("accounts").execute();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(state: "active" | "invited"): Promise<{ accountId: string; cookie: string }> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state, email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: row.id, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return { accountId: row.id, cookie: `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}` };
}

const ID = "0199e0d0-0000-7000-8000-0000000000aa";

/** A sample of every family of write: dumping, blobs, threads, notes,
 *  labels, people, sharing, Today, calendars. The rule is the prefix, not
 *  this list; the list proves the rule reaches each family. */
const WRITES: [string, string][] = [
  ["POST", "/v1/dumps"],
  ["POST", "/v1/blobs"],
  ["POST", "/v1/blobs/audio"],
  ["PATCH", `/v1/threads/${ID}`],
  ["POST", `/v1/threads/${ID}/quick-add`],
  ["DELETE", `/v1/content/${ID}`],
  ["POST", `/v1/notes/${ID}/move`],
  ["POST", `/v1/threads/${ID}/labels`],
  ["POST", "/v1/people/requests"],
  ["POST", `/v1/threads/${ID}/share`],
  ["POST", "/v1/today/put-off"],
  ["POST", `/api/connectors/${ID}/disconnect`],
  ["PATCH", `/api/connectors/calendars/${ID}`],
  ["POST", `/api/calendar/pending/${ID}/yes`],
  ["POST", "/v1/push-tokens"],
];

describe("an account that has not finished first run cannot write", () => {
  it("is refused on every family of write, whatever it sends", async () => {
    const { cookie } = await signedIn("invited");
    for (const [method, url] of WRITES) {
      const response = await app.inject({
        method: method as "POST",
        url,
        headers: { cookie, "content-type": "application/json" },
        payload: {},
      });
      expect(response.statusCode, `${method} ${url}`).toBe(403);
      expect(response.json(), `${method} ${url}`).toEqual({ error: "not_active" });
    }
    expect(await db.selectFrom("messages").select("id").execute()).toEqual([]);
  });

  it("is refused however the path is spelled", async () => {
    const { cookie } = await signedIn("invited");
    for (const url of ["/%76%31/dumps", "/v%31/dumps", "/v1/dumps?x=1"]) {
      const response = await app.inject({ method: "POST", url, headers: { cookie, "content-type": "application/json" }, payload: {} });
      expect(response.statusCode, url).toBe(403);
    }
  });

  it("answers a browser it can read: the refusal carries the CORS headers", async () => {
    const { cookie } = await signedIn("invited");
    const origin = env.WEB_URL;
    const response = await app.inject({
      method: "POST",
      url: "/v1/dumps",
      headers: { cookie, origin, "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("is not refused by the rule once active: the route decides", async () => {
    const { cookie } = await signedIn("active");
    for (const [method, url] of WRITES) {
      const response = await app.inject({
        method: method as "POST",
        url,
        headers: { cookie, "content-type": "application/json" },
        payload: {},
      });
      expect(response.statusCode, `${method} ${url}`).not.toBe(403);
    }
  });

  it("still finishes first run, still joins the waitlist, and can still take its token away", async () => {
    const { cookie } = await signedIn("invited");
    const finish = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      headers: { cookie, "content-type": "application/json" },
      payload: { readPolicy: true, agreeToProcessing: true, displayName: "Jo" },
    });
    expect(finish.statusCode).toBe(200);

    const { cookie: other } = await signedIn("invited");
    const forget = await app.inject({
      method: "DELETE",
      url: "/v1/push-tokens",
      headers: { cookie: other, "content-type": "application/json" },
      payload: { token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" },
    });
    expect(forget.statusCode).toBe(200);

    const waitlist = await app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { cookie: other, "content-type": "application/json" },
      payload: { email: "someone@example.com" },
    });
    expect(waitlist.statusCode).not.toBe(403);
  });

  it("leaves a request with no session to its route", async () => {
    // The route answers it (a body it refuses, or 401), not this rule.
    const response = await app.inject({ method: "POST", url: "/v1/dumps", headers: { "content-type": "application/json" }, payload: {} });
    expect(response.statusCode).not.toBe(403);
  });
});

describe("the calendar callback", () => {
  it("never exchanges a code for an account that is not active", async () => {
    const { accountId, cookie } = await signedIn("invited");
    const calls: string[] = [];
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(String(input));
      if (String(input).includes("oauth2.googleapis.com")) return new Response("{}", { status: 400 });
      return real(input, init);
    });
    const state = sealState({ accountId, verifier: "v", landing: "settings" }, Date.now());
    const response = await app.inject({
      method: "GET",
      url: `/api/connectors/google/callback?state=${encodeURIComponent(state)}&code=abc`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.WEB_URL}/settings/apps?calendar=failed`);
    expect(calls.filter((url) => url.includes("oauth2.googleapis.com"))).toEqual([]);
  });
});
