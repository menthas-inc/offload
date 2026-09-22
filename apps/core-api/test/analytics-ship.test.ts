// Product events leave the database on a clock.
//
// Security review 2026-09-22, M8. `analytics.ts` said a scheduled job ships
// the outbox to R2 and nothing did, so every pseudonymous event ever emitted
// sat in Postgres for good. Shipped rows are written to the store as one file
// per run and dropped from the database once they are thirty days old.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { emit } from "../src/analytics.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { objectStore, resetObjectStore } from "../src/blobs/store.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  resetObjectStore();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
});

async function ship(): Promise<void> {
  await handlers["analytics.ship"]!({}, { mailer: new MemoryMailer() }, null);
}

describe("shipping the outbox", () => {
  it("writes every unshipped event to the store as one file, and marks them", async () => {
    await emit({ name: "first_sign_in", subjectId: null });
    await emit({ name: "dump_sent", subjectId: null, properties: { platform: "ios" } });

    await ship();

    const rows = await db.selectFrom("analytics_events").select(["id", "shipped_at"]).orderBy("id").execute();
    expect(rows.map((row) => row.shipped_at !== null)).toEqual([true, true]);

    const key = `analytics/${new Date().toISOString().slice(0, 10)}/${rows[0]!.id}.ndjson`;
    const file = await objectStore()!.get(key);
    expect(file).not.toBeNull();
    const lines = file!.toString("utf8").trim().split("\n").map((line) => JSON.parse(line) as { name: string; properties: unknown });
    expect(lines.map((line) => line.name)).toEqual(["first_sign_in", "dump_sent"]);
    expect(lines[1]!.properties).toEqual({ platform: "ios" });
  });

  it("ships nothing twice", async () => {
    await emit({ name: "first_sign_in", subjectId: null });
    await ship();
    const first = await db.selectFrom("analytics_events").select("shipped_at").executeTakeFirstOrThrow();
    await ship();
    const again = await db.selectFrom("analytics_events").select("shipped_at").executeTakeFirstOrThrow();
    expect(again.shipped_at?.getTime()).toBe(first.shipped_at?.getTime());
  });

  it("drops shipped events after thirty days, and ships an old one before it goes", async () => {
    await emit({ name: "first_sign_in", subjectId: null });
    await emit({ name: "dump_sent", subjectId: null });
    await ship();
    await db
      .updateTable("analytics_events")
      .set({ received_at: sql`now() - interval '40 days'` })
      .where("name", "=", "first_sign_in")
      .execute();
    // Old and never shipped: it leaves through the store first, never by the
    // purge alone.
    await emit({ name: "dump_failed", subjectId: null });
    await db
      .updateTable("analytics_events")
      .set({ received_at: sql`now() - interval '40 days'` })
      .where("name", "=", "dump_failed")
      .execute();
    const old = await db.selectFrom("analytics_events").select("id").where("name", "=", "dump_failed").executeTakeFirstOrThrow();

    await ship();

    const names = (await db.selectFrom("analytics_events").select("name").orderBy("name").execute()).map((row) => row.name);
    expect(names).toEqual(["dump_sent"]);
    const file = await objectStore()!.get(`analytics/${new Date().toISOString().slice(0, 10)}/${old.id}.ndjson`);
    expect(file?.toString("utf8")).toContain("dump_failed");
  });
});
