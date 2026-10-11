// 042 D8: Reminders and How many on /api/me, and a phone saying it takes a
// reminder of its own when it registers. (AC-15, AC-17, AC-22)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { account, signIn, wipe } from "./reminders-kit.js";

await migrate(() => {});
let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

describe("Reminders and How many", () => {
  it("are on, at two, until changed one field at a time", async () => {
    const cookie = await signIn(await account());
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ notifyReminders: true, notifyReminderCount: 2 });
    const changed = await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { notifyReminderCount: 1 } });
    expect(changed.json()).toMatchObject({ notifyReminders: true, notifyReminderCount: 1 });
    const off = await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { notifyReminders: false } });
    expect(off.json()).toMatchObject({ notifyReminders: false, notifyReminderCount: 1 });
  });

  it("How many is one, two or three", async () => {
    const cookie = await signIn(await account());
    for (const bad of [0, 4, 1.5]) {
      expect((await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { notifyReminderCount: bad } })).statusCode).toBe(400);
    }
  });
});

describe("a phone that takes a reminder of its own", () => {
  const token = "ExponentPushToken[abcdefghijklmnop]";
  const takes = async () => (await db.selectFrom("push_tokens").select("takes_reminders").executeTakeFirstOrThrow()).takes_reminders;

  it("says so when it registers, and a build that does not say so takes none", async () => {
    const id = await account();
    const cookie = await signIn(id);
    await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie }, payload: { token, platform: "ios", takes: ["reminder"] } });
    expect(await takes()).toBe(true);
    // The same phone, an older build: it cannot take one, so it is sent none.
    await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie }, payload: { token, platform: "ios" } });
    expect(await takes()).toBe(false);
  });
});
