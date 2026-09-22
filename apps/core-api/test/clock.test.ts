// 023: one clock per account.
//
// AC-1 accounts carries time_zone, kept_time_zone and follow_device; an
//      existing account is backfilled from its latest message's zone; the
//      worker may read the one column.

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("accounts").execute();
});

const MIGRATION = readFileSync(new URL("../migrations/0056_one_clock.sql", import.meta.url), "utf8");

function marked(name: string): string {
  const begin = MIGRATION.indexOf(`-- ${name}:begin`);
  const end = MIGRATION.indexOf(`-- ${name}:end`);
  if (begin < 0 || end < 0) throw new Error(`no ${name} markers in the migration`);
  return MIGRATION.slice(MIGRATION.indexOf("\n", begin) + 1, end);
}

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function message(accountId: string, zone: string | null, agoMinutes: number): Promise<void> {
  const conversation = await db
    .insertInto("conversations")
    .values({ account_id: accountId, last_message_at: new Date() })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id,
      account_id: accountId,
      role: "person",
      type: "text",
      turn_id: uuidv7(),
      text: "rent by friday",
      state: "seen",
      time_zone: zone,
      created_at: new Date(Date.now() - agoMinutes * 60_000),
    } as never)
    .execute();
}

describe("AC-1 the columns", () => {
  it("exist, with follow_device on by default", async () => {
    const result = await sql<{ column_name: string; column_default: string | null }>`
      select column_name, column_default from information_schema.columns
      where table_name = 'accounts' and column_name in ('time_zone', 'kept_time_zone', 'follow_device')
    `.execute(db);
    const columns = new Map(result.rows.map((row) => [row.column_name, row.column_default]));
    expect([...columns.keys()].sort()).toEqual(["follow_device", "kept_time_zone", "time_zone"]);
    expect(columns.get("follow_device")).toBe("true");
  });

  it("hold an IANA name in 0051's alphabet and nothing else", async () => {
    const me = await account();
    await expect(
      db.updateTable("accounts").set({ time_zone: "Europe/Lisbon" } as never).where("id", "=", me).execute(),
    ).resolves.toBeDefined();
    await expect(
      db.updateTable("accounts").set({ time_zone: "Europe/Lisbon; drop table accounts" } as never).where("id", "=", me).execute(),
    ).rejects.toThrow(/time_zone/);
  });

  it("the worker may read time_zone and nothing new beside it", async () => {
    const result = await sql<{ column_name: string }>`
      select column_name from information_schema.column_privileges
      where grantee = 'offload_agent' and table_name = 'accounts' and privilege_type = 'SELECT'
    `.execute(db);
    const granted = new Set(result.rows.map((row) => row.column_name));
    expect(granted.has("time_zone")).toBe(true);
    expect(granted.has("kept_time_zone")).toBe(false);
    expect(granted.has("follow_device")).toBe(false);
  });
});

describe("AC-1 the backfill", () => {
  it("takes the latest zone a message carried, and leaves an account with none alone", async () => {
    const travelled = await account();
    await message(travelled, "Europe/Lisbon", 60);
    await message(travelled, "Asia/Tokyo", 5);
    await message(travelled, null, 1);
    const quiet = await account();
    await message(quiet, null, 10);

    await sql.raw(marked("backfill")).execute(db);

    const rows = await db.selectFrom("accounts").select(["id", "time_zone" as never]).execute();
    const zones = new Map(rows.map((row) => [row.id, (row as unknown as { time_zone: string | null }).time_zone]));
    expect(zones.get(travelled)).toBe("Asia/Tokyo");
    expect(zones.get(quiet)).toBeNull();
  });

  it("does not overwrite a clock somebody already set", async () => {
    const me = await account();
    await db.updateTable("accounts").set({ time_zone: "Europe/Lisbon" } as never).where("id", "=", me).execute();
    await message(me, "Asia/Tokyo", 5);
    await sql.raw(marked("backfill")).execute(db);
    const row = await db.selectFrom("accounts").select(["time_zone" as never]).where("id", "=", me).executeTakeFirstOrThrow();
    expect((row as unknown as { time_zone: string }).time_zone).toBe("Europe/Lisbon");
  });
});

// ------------------------------------------------------------ the routes
//
// AC-1 onboarding sets the clock from the device; a dump adopts one for an
//      account that has none; every writer resolves through ICU.
// AC-3 Use writes the clock and clears kept; Keep writes kept.
// AC-4 a wall time is read in the account's zone.

import { makeSignature } from "better-auth/crypto";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { adoptZone } from "../src/accounts/zone.js";
import { instantIn, parseWhen } from "../src/threads/dates.js";

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function clockOf(accountId: string) {
  const row = await db
    .selectFrom("accounts")
    .select(["time_zone", "kept_time_zone", "follow_device"])
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  return row;
}

describe("023 AC-1 adopting a zone", () => {
  it("sets the clock once, from the first zone heard, and drops what ICU does not know", async () => {
    const me = await account();
    await adoptZone(me, "Mars/Olympus");
    expect((await clockOf(me)).time_zone).toBeNull();
    await adoptZone(me, "Europe/Lisbon");
    expect((await clockOf(me)).time_zone).toBe("Europe/Lisbon");
    await adoptZone(me, "Asia/Tokyo");
    expect((await clockOf(me)).time_zone).toBe("Europe/Lisbon");
    await adoptZone(me, null);
    expect((await clockOf(me)).time_zone).toBe("Europe/Lisbon");
  });

  it("stores the resolved name, never the header as sent", async () => {
    const me = await account();
    await adoptZone(me, "US/Pacific-New");
    expect((await clockOf(me)).time_zone).toBe("America/Los_Angeles");
  });

  it("finishing first run carries the device's zone, and an unknown one does not fail first run", async () => {
    const invited = await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "invited", email_verified: true, analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow();
    const cookie = await signIn(invited.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      headers: { cookie, "content-type": "application/json" },
      payload: { readPolicy: true, agreeToProcessing: true, displayName: "Ana", timeZone: "Europe/Lisbon" },
    });
    expect(response.statusCode).toBe(200);
    expect((await clockOf(invited.id)).time_zone).toBe("Europe/Lisbon");

    const other = await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "invited", email_verified: true, analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow();
    const second = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      headers: { cookie: await signIn(other.id), "content-type": "application/json" },
      payload: { readPolicy: true, agreeToProcessing: true, displayName: "Sam", timeZone: "Nowhere/AtAll" },
    });
    expect(second.statusCode).toBe(200);
    expect((await clockOf(other.id)).time_zone).toBeNull();
  });
});

describe("023 AC-3 the clock on /api/me", () => {
  it("returns the three fields, with follow on and nothing kept", async () => {
    const me = await account();
    const response = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ timeZone: null, followDevice: true, keptTimeZone: null });
  });

  it("Use writes the clock and clears what was kept; Keep writes kept; unknown is refused", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const patch = (payload: Record<string, unknown>) =>
      app.inject({ method: "PATCH", url: "/api/me", headers: { cookie, "content-type": "application/json" }, payload });

    expect((await patch({ keptTimeZone: "Asia/Tokyo" })).statusCode).toBe(200);
    expect(await clockOf(me)).toMatchObject({ kept_time_zone: "Asia/Tokyo" });

    const used = await patch({ timeZone: "Asia/Tokyo" });
    expect(used.statusCode).toBe(200);
    expect(used.json()).toMatchObject({ timeZone: "Asia/Tokyo", keptTimeZone: null });
    expect(await clockOf(me)).toMatchObject({ time_zone: "Asia/Tokyo", kept_time_zone: null });

    expect((await patch({ followDevice: false })).json()).toMatchObject({ followDevice: false });
    expect((await patch({ timeZone: "Mars/Olympus" })).statusCode).toBe(400);
    expect((await patch({ keptTimeZone: null })).json()).toMatchObject({ keptTimeZone: null });
    expect((await clockOf(me)).time_zone).toBe("Asia/Tokyo");
  });
});

describe("023 AC-4 a wall time in the account's zone", () => {
  it("reads a naive time in the zone, on either side of a clock change", () => {
    expect(instantIn("2026-09-25T09:00", "Europe/Lisbon")?.toISOString()).toBe("2026-09-25T08:00:00.000Z");
    expect(instantIn("2026-11-12T09:00", "Europe/Lisbon")?.toISOString()).toBe("2026-11-12T09:00:00.000Z");
    expect(instantIn("2026-09-25T09:00", "Pacific/Auckland")?.toISOString()).toBe("2026-09-24T21:00:00.000Z");
    expect(instantIn("2026-09-25T09:00", null)?.toISOString()).toBe("2026-09-25T09:00:00.000Z");
  });

  it("parseWhen reads a naive time in the zone and a bare day as noon UTC, whatever the zone", () => {
    expect(parseWhen("2026-09-25T09:00:00", "Europe/Lisbon")?.toISOString()).toBe("2026-09-25T08:00:00.000Z");
    expect(parseWhen("2026-09-25T09:00:00Z", "Europe/Lisbon")?.toISOString()).toBe("2026-09-25T09:00:00.000Z");
    expect(parseWhen("2026-09-25", "Pacific/Auckland")?.toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });
});
