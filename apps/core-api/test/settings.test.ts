// 034. The settings registry: every cap and switch an owner can change while
// offload runs, read through one function that can only ever answer with a
// value the registry allows (AC-29, AC-30, AC-33, AC-34).
//
// The property that matters most is the dull one: a cap can never quietly
// stop existing. An unset row, a row of the wrong shape and a row outside its
// bounds all read as the default.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import {
  SETTING_KEYS,
  SettingsRefused,
  clearOverrides,
  clearSettingsCache,
  limitFor,
  listSettings,
  saveSettings,
  setting,
  settingDef,
} from "../src/settings.js";
import { DAILY_MODEL_BUDGET_MICROS, DAILY_TURNS } from "../src/budget.js";
import { DAILY_BYTES, DAILY_PHOTOS } from "../src/blobs/photos.js";
import { DAILY_VOICE_MS, DAILY_VOICE_NOTES } from "../src/blobs/audio.js";
import { DAILY_MAIL, HOURLY_MAIL } from "../src/mail-in/receive.js";
import { WEEKLY_BATCH } from "../src/settings.js";

await migrate(() => {});

afterAll(async () => {
  // Settings are global: one left behind here would be read by the next file.
  await db.deleteFrom("app_settings").execute();
  await closeDb();
});

beforeEach(async () => {
  await sql`truncate staff_audit`.execute(db);
  await db.deleteFrom("app_settings").execute();
  await db.deleteFrom("account_limits").execute();
  await db.deleteFrom("accounts").execute();
  clearSettingsCache();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.test`, state: "active", email_verified: true })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A stored row, written past the registry, the way a bad deploy or a hand
 *  edit would leave one. */
async function store(key: string, value: unknown): Promise<void> {
  await db
    .insertInto("app_settings")
    .values({ key, value: JSON.stringify(value), updated_by_account_id: null })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(value) }))
    .execute();
  clearSettingsCache();
}

const save = (changes: Record<string, unknown>, expected: Record<string, unknown>, staff: string) =>
  db.transaction().execute((tx) => saveSettings(changes, expected, { accountId: staff }, tx));

describe("AC-29 a setting unset", () => {
  it("is today's constant, for every cap and the batch", async () => {
    expect(await setting("cap.spend_micros")).toBe(DAILY_MODEL_BUDGET_MICROS);
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
    expect(await setting("cap.photos")).toBe(DAILY_PHOTOS);
    expect(await setting("cap.photo_bytes")).toBe(DAILY_BYTES);
    expect(await setting("cap.voice_notes")).toBe(DAILY_VOICE_NOTES);
    expect(await setting("cap.voice_ms")).toBe(DAILY_VOICE_MS);
    expect(await setting("cap.mail_day")).toBe(DAILY_MAIL);
    expect(await setting("cap.mail_hour")).toBe(HOURLY_MAIL);
    expect(await setting("waitlist.batch")).toBe(WEEKLY_BATCH);
  });

  it("leaves the platform cap and the monthly budget off, which is not zero", async () => {
    expect(await setting("platform.spend_micros")).toBeNull();
    expect(await setting("budget.month_micros")).toBeNull();
  });

  it("leaves every switch on and no fixed cost", async () => {
    for (const key of ["switch.web_maps", "switch.maps", "switch.web_search", "switch.web_links", "switch.nightly"] as const) {
      expect(await setting(key), key).toBe(true);
    }
    expect(await setting("costs.fixed")).toEqual({});
  });

  it("names seventeen keys, each with a default inside its own bounds", () => {
    expect(SETTING_KEYS).toHaveLength(17);
    for (const key of SETTING_KEYS) {
      const def = settingDef(key);
      if (typeof def.default === "number") {
        expect(def.default, key).toBeGreaterThanOrEqual(def.min!);
        expect(def.default, key).toBeLessThanOrEqual(def.max!);
      }
    }
  });
});

describe("AC-33 a stored value that makes no sense", () => {
  it("reads as the default: the wrong shape", async () => {
    await store("cap.turns", "many");
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
    await store("cap.turns", { n: 4 });
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
    await store("cap.turns", 12.5);
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
    await store("switch.nightly", "off");
    expect(await setting("switch.nightly")).toBe(true);
    await store("costs.fixed", { railway: "lots" });
    expect(await setting("costs.fixed")).toEqual({});
  });

  it("reads as the default: outside its bounds", async () => {
    await store("cap.turns", 0);
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
    await store("cap.turns", -3);
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
    await store("cap.spend_micros", settingDef("cap.spend_micros").max! + 1);
    expect(await setting("cap.spend_micros")).toBe(DAILY_MODEL_BUDGET_MICROS);
  });

  it("reads a null as the default where off is not a value", async () => {
    await store("cap.turns", null);
    expect(await setting("cap.turns")).toBe(DAILY_TURNS);
  });

  it("is marked for the page, with the default beside it", async () => {
    await store("cap.turns", "many");
    const row = (await listSettings()).find((one) => one.key === "cap.turns")!;
    expect(row).toMatchObject({ value: DAILY_TURNS, default: DAILY_TURNS, malformed: true });
    expect(row.min).toBe(settingDef("cap.turns").min);
    expect(row.max).toBe(settingDef("cap.turns").max);
  });
});

describe("a stored value", () => {
  it("is read, within the cache's fifteen seconds", async () => {
    await store("cap.turns", 40);
    expect(await setting("cap.turns")).toBe(40);
    // Written behind the cache's back: still the cached value until it ages.
    await db.updateTable("app_settings").set({ value: JSON.stringify(41) }).where("key", "=", "cap.turns").execute();
    expect(await setting("cap.turns")).toBe(40);
    clearSettingsCache();
    expect(await setting("cap.turns")).toBe(41);
  });

  it("keeps 0073's stored key for the web's map", async () => {
    await store("web_maps", false);
    expect(await setting("switch.web_maps")).toBe(false);
    const row = (await listSettings()).find((one) => one.key === "switch.web_maps")!;
    expect(row.value).toBe(false);
  });
});

describe("AC-30 a person's override", () => {
  it("beats the global value, for each per-person cap, and only for them", async () => {
    const me = await account();
    const other = await account();
    await store("cap.turns", 40);
    await db.insertInto("account_limits").values({ account_id: me, key: "cap.turns", value: 7 }).execute();
    clearSettingsCache();
    expect(await limitFor(me, "cap.turns")).toBe(7);
    expect(await limitFor(other, "cap.turns")).toBe(40);
    expect(await limitFor(me, "cap.photos")).toBe(DAILY_PHOTOS);
  });

  it("stands while the global value moves", async () => {
    const me = await account();
    await db.insertInto("account_limits").values({ account_id: me, key: "cap.spend_micros", value: 9_000_000 }).execute();
    await store("cap.spend_micros", 1_000_000);
    expect(await limitFor(me, "cap.spend_micros")).toBe(9_000_000);
  });

  it("forgets one account's overrides without forgetting anybody else's, or the settings", async () => {
    const me = await account();
    const other = await account();
    await store("cap.turns", 40);
    clearSettingsCache();
    expect(await limitFor(me, "cap.turns")).toBe(40);
    expect(await limitFor(other, "cap.turns")).toBe(40);

    // All three move underneath; only what was asked for is read again.
    await db.insertInto("account_limits").values({ account_id: me, key: "cap.turns", value: 7 }).execute();
    await db.insertInto("account_limits").values({ account_id: other, key: "cap.turns", value: 9 }).execute();
    // Written straight to the table: `store` forgets the settings itself.
    await db.insertInto("app_settings").values({ key: "cap.photos", value: "3", updated_by_account_id: null }).execute();
    expect(await setting("cap.photos")).toBe(DAILY_PHOTOS);
    clearOverrides(me);
    expect(await limitFor(me, "cap.turns")).toBe(7);
    expect(await limitFor(other, "cap.turns")).toBe(40);
    expect(await setting("cap.photos")).toBe(DAILY_PHOTOS);
  });

  it("outside the setting's bounds reads as the global value", async () => {
    const me = await account();
    await db.insertInto("account_limits").values({ account_id: me, key: "cap.turns", value: 0 }).execute();
    clearSettingsCache();
    expect(await limitFor(me, "cap.turns")).toBe(DAILY_TURNS);
  });
});

describe("AC-33 and AC-34 saving", () => {
  it("writes each change and one audit entry per setting changed", async () => {
    const owner = await account();
    const done = await save(
      { "cap.turns": 50, "switch.nightly": false, "cap.photos": DAILY_PHOTOS },
      { "cap.turns": DAILY_TURNS, "switch.nightly": true, "cap.photos": DAILY_PHOTOS },
      owner
    );
    clearSettingsCache();
    expect(done.changed.sort()).toEqual(["cap.turns", "switch.nightly"]);
    expect(await setting("cap.turns")).toBe(50);
    expect(await setting("switch.nightly")).toBe(false);

    const entries = await db
      .selectFrom("staff_audit")
      .select(["kind", "staff_account_id", "setting_key", "old_value", "new_value", "target_account_id"])
      .orderBy("setting_key")
      .execute();
    expect(entries).toEqual([
      { kind: "setting.changed", staff_account_id: owner, setting_key: "cap.turns", old_value: DAILY_TURNS, new_value: 50, target_account_id: null },
      { kind: "setting.changed", staff_account_id: owner, setting_key: "switch.nightly", old_value: true, new_value: false, target_account_id: null },
    ]);
  });

  it("refuses an unknown setting and saves nothing", async () => {
    const owner = await account();
    await expect(save({ "cap.turns": 50, "cap.everything": 1 }, { "cap.turns": DAILY_TURNS, "cap.everything": 0 }, owner)).rejects.toMatchObject({
      code: "unknown_key",
      key: "cap.everything",
    });
    expect(await db.selectFrom("app_settings").select("key").execute()).toEqual([]);
  });

  it("refuses a value outside its bounds, names them, and saves nothing", async () => {
    const owner = await account();
    const def = settingDef("cap.turns");
    const refused = await save({ "cap.photos": 10, "cap.turns": 0 }, { "cap.photos": DAILY_PHOTOS, "cap.turns": DAILY_TURNS }, owner).catch((e) => e);
    expect(refused).toBeInstanceOf(SettingsRefused);
    expect(refused).toMatchObject({ code: "out_of_bounds", key: "cap.turns", min: def.min, max: def.max });
    expect(await db.selectFrom("app_settings").select("key").execute()).toEqual([]);
    expect(await db.selectFrom("staff_audit").select("id").execute()).toEqual([]);

    await expect(save({ "switch.nightly": "off" }, { "switch.nightly": true }, owner)).rejects.toMatchObject({ code: "out_of_bounds" });
    await expect(save({ "cap.turns": null }, { "cap.turns": DAILY_TURNS }, owner)).rejects.toMatchObject({ code: "out_of_bounds" });
  });

  it("takes null for the platform cap, which turns it off", async () => {
    const owner = await account();
    await save({ "platform.spend_micros": 20_000_000 }, { "platform.spend_micros": null }, owner);
    clearSettingsCache();
    expect(await setting("platform.spend_micros")).toBe(20_000_000);
    await save({ "platform.spend_micros": null }, { "platform.spend_micros": 20_000_000 }, owner);
    clearSettingsCache();
    expect(await setting("platform.spend_micros")).toBeNull();
  });

  it("refuses a save made against values somebody else has since changed", async () => {
    const owner = await account();
    const other = await account();
    await save({ "cap.turns": 60 }, { "cap.turns": DAILY_TURNS }, other);

    const refused = await save({ "cap.turns": 50, "cap.photos": 10 }, { "cap.turns": DAILY_TURNS, "cap.photos": DAILY_PHOTOS }, owner).catch((e) => e);
    expect(refused).toMatchObject({ code: "conflict", key: "cap.turns" });
    clearSettingsCache();
    // Nothing of the refused save landed, including the key that did match.
    expect(await setting("cap.turns")).toBe(60);
    expect(await setting("cap.photos")).toBe(DAILY_PHOTOS);
    expect(await db.selectFrom("staff_audit").select("id").execute()).toHaveLength(1);
  });

  it("refuses a change with nothing to compare it to", async () => {
    const owner = await account();
    await expect(save({ "cap.turns": 50 }, {}, owner)).rejects.toMatchObject({ code: "conflict", key: "cap.turns" });
  });

  it("saves the fixed costs as a map of whole micros", async () => {
    const owner = await account();
    await save({ "costs.fixed": { railway: 20_000_000, expo: 0 } }, { "costs.fixed": {} }, owner);
    clearSettingsCache();
    expect(await setting("costs.fixed")).toEqual({ railway: 20_000_000, expo: 0 });
    await expect(save({ "costs.fixed": { railway: -1 } }, { "costs.fixed": { railway: 20_000_000, expo: 0 } }, owner)).rejects.toMatchObject({
      code: "out_of_bounds",
    });
  });
});
