import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { takeDump } from "../src/routes/dumps.js";

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
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function signedIn(): Promise<{ id: string; cookie: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: outcome.accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  const cookie = `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
  return { id: outcome.accountId, cookie };
}

describe("the conversation's tail", () => {
  // The phones start a new conversation once one has been put away for thirty
  // minutes (30 September 2026). After a cold start the only record of when it
  // was last used is its messages, so each carries its time.
  it("says when each message was sent", async () => {
    const me = await signedIn();
    const before = Date.now();
    await takeDump(me.id, "the brackets", uuidv7());

    const tail = await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie: me.cookie } });
    expect(tail.statusCode).toBe(200);
    const [message] = tail.json().messages;
    expect(typeof message.createdAt).toBe("string");
    const at = Date.parse(message.createdAt);
    expect(at).toBeGreaterThanOrEqual(before - 5_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});
