// 034 AC-32. The owner's switches, in the Core API: the map and reading
// links. Off stops the path for everyone within the settings' cache, on
// restores it, and a person's own setting reads exactly as they left it.
//
// The worker reads the same rows on its own turn query; its half is
// `apps/agent/tests/test_switches_db.py`.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { clearSettingsCache, mapsOn } from "../src/settings.js";
import { bookLocate, mayReadForPlace, resolvePlace } from "../src/places/resolve.js";
import { hasPoint, threadPoints } from "../src/places/points.js";
import { backfillMaps, linkReadable } from "../src/places/backfill.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await db.deleteFrom("app_settings").execute();
  await app.close();
  await closeDb();
});

const saved = { MAPS: env.MAPS, KEY: env.GOOGLE_MAPS_API_KEY, PEPPER: env.PLACE_HASH_PEPPER };
afterEach(() => {
  env.MAPS = saved.MAPS;
  env.GOOGLE_MAPS_API_KEY = saved.KEY;
  env.PLACE_HASH_PEPPER = saved.PEPPER;
});

beforeEach(async () => {
  env.MAPS = "on";
  env.GOOGLE_MAPS_API_KEY = "test-key";
  env.PLACE_HASH_PEPPER = "test-pepper-test-pepper-test-pepper";
  await db.deleteFrom("app_settings").execute();
  clearSettingsCache();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("content").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

async function person(): Promise<{ id: string; cookie: string; thread: string }> {
  const { accountId } = await promote(`${uuidv7()}@example.test`);
  await db.updateTable("accounts").set({ state: "active", display_name: "Jo" }).where("id", "=", accountId).execute();
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
  const row = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirstOrThrow();
  return {
    id: accountId,
    cookie: `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`,
    thread: row.default_thread_id!,
  };
}

async function turn(key: string, on: boolean): Promise<void> {
  await db
    .insertInto("app_settings")
    .values({ key, value: JSON.stringify(on), updated_by_account_id: null })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(on) }))
    .execute();
  clearSettingsCache();
}

const me = async (cookie: string) => (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json();

describe("the map switch", () => {
  it("turns the map off for everyone, phones and web, and on again", async () => {
    const jo = await person();
    expect(await mapsOn()).toBe(true);
    expect(await me(jo.cookie)).toMatchObject({ maps: true, webMaps: true });

    await turn("switch.maps", false);
    expect(await mapsOn()).toBe(false);
    expect(await me(jo.cookie)).toMatchObject({ maps: false, webMaps: false });

    await turn("switch.maps", true);
    expect(await me(jo.cookie)).toMatchObject({ maps: true, webMaps: true });
  });

  it("stays off whatever the switch says while the environment has no map", async () => {
    env.MAPS = "off";
    await turn("switch.maps", true);
    expect(await mapsOn()).toBe(false);
  });

  it("stops every path that asks the map company anything", async () => {
    const jo = await person();
    const place = await db
      .insertInto("content")
      .values({ account_id: jo.id, thread_id: jo.thread, type: "location", title: "Museu do Azulejo, Lisboa", updated_at: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow();
    await turn("switch.maps", false);

    let asked = 0;
    const geocode = async () => {
      asked += 1;
      return null;
    };
    expect(await resolvePlace(place.id, geocode)).toBe("skipped");
    expect(asked).toBe(0);
    expect(await hasPoint(jo.thread)).toBe(false);
    expect(await threadPoints(jo.id, jo.thread)).toEqual({ points: [], pending: 0 });
    expect(await backfillMaps()).toEqual({ places: 0, links: 0 });
    expect(await mayReadForPlace(jo.id)).toBe(false);
    await bookLocate(uuidv7(), `test:${uuidv7()}`);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "event.locate").execute()).toEqual([]);
  });
});

describe("the reading links switch", () => {
  it("stops a page being read for a place, and leaves the person's own setting as they chose it", async () => {
    const jo = await person();
    await db.updateTable("accounts").set({ web_links_enabled: true }).where("id", "=", jo.id).execute();
    expect(await mayReadForPlace(jo.id)).toBe(true);

    await turn("switch.web_links", false);
    expect(await mayReadForPlace(jo.id)).toBe(false);
    expect(await linkReadable(uuidv7())).toBe(false);
    // Theirs is untouched and still reads as they left it.
    expect((await me(jo.cookie)).webLinks).toBe(true);
    const own = await db.selectFrom("accounts").select("web_links_enabled").where("id", "=", jo.id).executeTakeFirstOrThrow();
    expect(own.web_links_enabled).toBe(true);

    await turn("switch.web_links", true);
    expect(await mayReadForPlace(jo.id)).toBe(true);
  });
});
