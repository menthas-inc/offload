// Sweep 2026-10-07, S19. A review code is made for one store review and lives
// up to ninety days and fifty uses. One still live a fortnight on is one
// somebody forgot, so Health raises it the way it raises everything else: a
// condition, mailed to the owners once, cleared when the code stops being live.
// One condition for any number of codes, so a backlog takes one of the day's
// ten sends rather than all of them, and none while review codes are off,
// because then no code can let anybody in.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { checkAlerts } from "../src/health/alerts.js";
import { clearSettingsCache } from "../src/settings.js";
import { clearPlatformSpent } from "../src/budget.js";
import { uuidv7 } from "../src/uuid.js";
import { staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let owner: { id: string };

beforeEach(async () => {
  await wipeAdmin();
  await db.deleteFrom("review_codes").execute();
  await db.deleteFrom("app_settings").where("key", "=", "switch.review_codes").execute();
  owner = await staffMember("owner");
  await db.deleteFrom("jobs").execute();
  await sql`insert into backup_runs (finished_at, bytes, ok) values (now() - interval '2 hours', 1000, true)`.execute(db);
});
afterAll(async () => {
  await db.deleteFrom("review_codes").execute();
  await db.deleteFrom("app_settings").where("key", "=", "switch.review_codes").execute();
  await wipeAdmin();
  await closeDb();
});

async function code(daysOld: number, extra: { revoked?: boolean; expired?: boolean; usedUp?: boolean } = {}): Promise<string> {
  const row = await db
    .insertInto("review_codes")
    .values({
      code_hash: Buffer.from(uuidv7()),
      note: "App Store review 1.0",
      max_uses: 5,
      uses: extra.usedUp ? 5 : 0,
      expires_at: extra.expired ? sql<Date>`now() - interval '1 hour'` : sql<Date>`now() + interval '60 days'`,
      revoked_at: extra.revoked ? sql<Date>`now() - interval '1 day'` : null,
      created_by: owner.id,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await sql`update review_codes set created_at = now() - make_interval(days => ${daysOld}) where id = ${row.id}`.execute(db);
  return row.id;
}

const open = async () => {
  clearSettingsCache();
  clearPlatformSpent();
  await checkAlerts();
  return (
    await db.selectFrom("alert_states").select("condition").where("cleared_at", "is", null).orderBy("condition").execute()
  ).map((row) => row.condition);
};

describe("S19 a review code still live after fourteen days", () => {
  it("raises an alert for a live code fifteen days old", async () => {
    await code(15);
    expect(await open()).toEqual(["review_code_old"]);
    // Booked for the owner, as every condition is.
    const booked = await db.selectFrom("jobs").select("payload").where("kind", "=", "email.alert").execute();
    expect(booked.map((job) => (job.payload as { condition: string }).condition)).toEqual(["review_code_old"]);
  });

  it("raises nothing for one thirteen days old, or an old one that is revoked, expired or used up", async () => {
    await code(13);
    await code(30, { revoked: true });
    await code(30, { expired: true });
    await code(30, { usedUp: true });
    expect(await open()).toEqual([]);
  });

  it("clears once the code is revoked", async () => {
    const old = await code(20);
    expect(await open()).toEqual(["review_code_old"]);
    await db.updateTable("review_codes").set({ revoked_at: new Date() }).where("id", "=", old).execute();
    expect(await open()).toEqual([]);
  });

  it("opens one condition and books one mail for several old codes", async () => {
    await code(20);
    await code(30);
    await code(40);
    expect(await open()).toEqual(["review_code_old"]);
    const booked = await db.selectFrom("jobs").select("payload").where("kind", "=", "email.alert").execute();
    expect(booked.map((job) => (job.payload as { condition: string }).condition)).toEqual(["review_code_old"]);
  });

  it("raises nothing while review codes are switched off", async () => {
    await code(20);
    await db.insertInto("app_settings").values({ key: "switch.review_codes", value: "false", updated_by_account_id: null }).execute();
    expect(await open()).toEqual([]);
  });
});
