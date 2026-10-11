// Sweep 2026-10-07, S25. The privacy page says a disconnected calendar keeps
// nothing. The connection row stays, soft-deleted, so it has to stop saying
// which Google account it was.

import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { revokeAndForget } from "../src/connectors/tokens.js";

await migrate(() => {});
afterAll(closeDb);

beforeEach(async () => {
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("S25 a disconnected calendar forgets the Google account", () => {
  it("keeps no address on the connection row", async () => {
    const owner = await account();
    const address = `${uuidv7()}@gmail.com`;
    // No secret row, so nothing is handed back to Google from a test.
    const connection = await db
      .insertInto("connector_connections")
      .values({ account_id: owner, provider: "google", external_account_email: address })
      .returning("id")
      .executeTakeFirstOrThrow();

    await revokeAndForget(connection.id);

    const rows = await db.selectFrom("connector_connections").selectAll().where("account_id", "=", owner).execute();
    expect(JSON.stringify(rows)).not.toContain(address);
    for (const row of rows) {
      expect(row.external_account_email).toBe("");
      expect(row.deleted_at).not.toBeNull();
    }
  });
});

describe("a calendar whose secret no longer opens", () => {
  it("still disconnects, and asks Google nothing it cannot", async () => {
    const owner = await account();
    const connection = await db
      .insertInto("connector_connections")
      .values({ account_id: owner, provider: "google", external_account_email: `${uuidv7()}@gmail.com` })
      .returning("id")
      .executeTakeFirstOrThrow();
    // Sealed under a key the vault no longer holds.
    await db
      .insertInto("connector_secrets")
      .values({ connection_id: connection.id, access_token: randomBytes(48), refresh_token: randomBytes(48), access_expires_at: null, scope: null, wrapped_by: "vault:v1" })
      .execute();
    const asked: unknown[] = [];
    vi.stubGlobal("fetch", async (...args: unknown[]) => {
      asked.push(args);
      return new Response("", { status: 200 });
    });

    await revokeAndForget(connection.id);
    vi.unstubAllGlobals();

    expect(asked).toEqual([]);
    expect(await db.selectFrom("connector_secrets").select("connection_id").where("connection_id", "=", connection.id).execute()).toEqual([]);
    const row = await db.selectFrom("connector_connections").select(["state", "deleted_at"]).where("id", "=", connection.id).executeTakeFirstOrThrow();
    expect(row.state).toBe("revoked");
    expect(row.deleted_at).not.toBeNull();
  });
});
