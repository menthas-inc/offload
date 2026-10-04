// The web's map switch. The only part of the map that bills is a web map load,
// so the owner can turn the map off on the web alone, without a deploy, and
// the phones' maps carry on. A stored setting rather than a variable, so the
// admin panel can flip it later; until then, through the owner-only route.

import { PANEL_COOKIE, sealPanel } from "../src/admin/panel.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { clearSettingsCache } from "../src/settings.js";
import { sql } from "kysely";

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
  await sql`truncate staff_audit`.execute(db);
  await db.deleteFrom("app_settings").execute();
  clearSettingsCache();
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
  const session = await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) })
    .returning("id")
    .executeTakeFirstOrThrow();
  // With the panel open on it, as a fresh sign-in has it. It opens nothing
  // for an account that is not staff.
  const pass = `${PANEL_COOKIE}=${encodeURIComponent(sealPanel(session.id, accountId, Date.now()))}`;
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}; ${pass}`;
}

const me = async (cookie: string) => (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json();
// 034. One save for the Limits page: the changes, and what the page showed
// for each, so a save made against stale values is refused.
const put = (cookie: string, webMaps: unknown, was: unknown = webMaps === false) =>
  app.inject({
    method: "PATCH",
    url: "/v1/admin/settings",
    headers: { cookie },
    payload: { changes: { "switch.web_maps": webMaps }, expected: { "switch.web_maps": was } },
  });

const webMapsOf = (body: { settings: Array<{ key: string; value: unknown }> }) =>
  body.settings.find((row) => row.key === "switch.web_maps")?.value;

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
    expect(webMapsOf(res.json())).toBe(false);
    const seen = await me(person);
    expect(seen.webMaps).toBe(false);
    expect(seen.maps).toBe(true);
    expect(webMapsOf((await put(owner, true)).json())).toBe(true);
    expect((await me(person)).webMaps).toBe(true);
  });

  it("reads back for the owner", async () => {
    const owner = await account("owner@example.test", "owner");
    await put(owner, false);
    const res = await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: owner } });
    expect(webMapsOf(res.json())).toBe(false);
  });

  it("is the owner's alone: support and everyone else get nothing", async () => {
    const support = await account("support@example.test", "support");
    const person = await account("jo@example.test");
    expect((await put(support, false)).statusCode).toBe(404);
    expect((await put(person, false)).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: support } })).statusCode).toBe(404);
    expect((await put("", false)).statusCode).toBe(404);
  });

  it("refuses anything but a boolean", async () => {
    const owner = await account("owner@example.test", "owner");
    const res = await put(owner, "off", true);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "out_of_bounds", key: "switch.web_maps" });
  });

  it("keeps the row 0073 wrote, under the key it wrote it with", async () => {
    const owner = await account("owner@example.test", "owner");
    await db.insertInto("app_settings").values({ key: "web_maps", value: "false", updated_by_account_id: null }).execute();
    clearSettingsCache();
    const res = await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: owner } });
    expect(webMapsOf(res.json())).toBe(false);
    await put(owner, true, false);
    expect(await db.selectFrom("app_settings").select(["key", "value"]).execute()).toEqual([{ key: "web_maps", value: true }]);
  });
});
