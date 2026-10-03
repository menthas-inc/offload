// The web's map switch. The only part of the map that bills is a web map load,
// so the owner can turn the map off on the web alone, without a deploy, and
// the phones' maps carry on. A stored setting rather than a variable, so the
// admin panel can flip it later; until then, through the owner-only route.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";

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

const saved = { MAPS: env.MAPS, KEY: env.GOOGLE_MAPS_API_KEY, PEPPER: env.PLACE_HASH_PEPPER };
function mapsOn() {
  env.MAPS = "on";
  env.GOOGLE_MAPS_API_KEY = "test-key";
  env.PLACE_HASH_PEPPER = "test-pepper-test-pepper-test-pepper";
}
afterEach(() => {
  env.MAPS = saved.MAPS;
  env.GOOGLE_MAPS_API_KEY = saved.KEY;
  env.PLACE_HASH_PEPPER = saved.PEPPER;
});

beforeEach(async () => {
  await db.deleteFrom("app_settings").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(email: string, role?: "owner" | "support"): Promise<string> {
  const { accountId } = await promote(email);
  await db.updateTable("accounts").set({ state: "active", display_name: "Jo" }).where("id", "=", accountId).execute();
  if (role) await db.insertInto("staff").values({ account_id: accountId, role }).execute();
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

const me = async (cookie: string) => (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json();
const put = (cookie: string, webMaps: unknown) =>
  app.inject({ method: "PUT", url: "/v1/admin/settings", headers: { cookie }, payload: { webMaps } });

describe("the web's map switch", () => {
  it("is on by default while the map is, and off with it", async () => {
    const cookie = await account("jo@example.test");
    expect((await me(cookie)).webMaps).toBe(false);
    mapsOn();
    expect((await me(cookie)).webMaps).toBe(true);
  });

  it("turns the web's map off for everyone and leaves the phones' on", async () => {
    mapsOn();
    const owner = await account("owner@example.test", "owner");
    const person = await account("jo@example.test");
    const res = await put(owner, false);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ webMaps: false });
    const seen = await me(person);
    expect(seen.webMaps).toBe(false);
    expect(seen.maps).toBe(true);
    expect((await put(owner, true)).json()).toEqual({ webMaps: true });
    expect((await me(person)).webMaps).toBe(true);
  });

  it("reads back for the owner", async () => {
    const owner = await account("owner@example.test", "owner");
    await put(owner, false);
    const res = await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: owner } });
    expect(res.json()).toEqual({ webMaps: false });
  });

  it("is the owner's alone: support and everyone else get nothing", async () => {
    const support = await account("support@example.test", "support");
    const person = await account("jo@example.test");
    expect((await put(support, false)).statusCode).toBe(404);
    expect((await put(person, false)).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: support } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/settings", payload: { webMaps: false } })).statusCode).toBe(404);
  });

  it("refuses anything but a boolean", async () => {
    const owner = await account("owner@example.test", "owner");
    expect((await put(owner, "off")).statusCode).toBe(400);
  });
});
