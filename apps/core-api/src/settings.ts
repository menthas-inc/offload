// Settings the owner changes while offload runs, stored in `app_settings`
// (0073) and read through a short cache, so a read on every `/api/me` costs
// nothing and a change lands within seconds on every instance.

import { sql } from "kysely";
import { db } from "./db.js";
import { mapsConfig } from "./places/resolve.js";

/** How long a read is trusted. A write here clears it at once; another
 *  instance sees the change within this long. */
const CACHE_MS = 15_000;

let cached: { webMaps: boolean; at: number } | null = null;

/** Whether the web draws a thread's map: the owner's switch, on unless turned
 *  off. The phones are not asked; their maps cost nothing. */
export async function webMapsSetting(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.webMaps;
  const row = await db.selectFrom("app_settings").select("value").where("key", "=", "web_maps").executeTakeFirst();
  const webMaps = row?.value !== false;
  cached = { webMaps, at: Date.now() };
  return webMaps;
}

/** The web's map is drawn only while the map itself is on and the owner has
 *  not turned the web's off. */
export async function webMapsOn(): Promise<boolean> {
  return mapsConfig().on && (await webMapsSetting());
}

export async function setWebMaps(on: boolean, accountId: string): Promise<boolean> {
  await db
    .insertInto("app_settings")
    .values({ key: "web_maps", value: JSON.stringify(on), updated_by_account_id: accountId })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(on), updated_at: sql`now()`, updated_by_account_id: accountId }))
    .execute();
  cached = null;
  return webMapsSetting();
}
