// Sweep 2026-10-07, S25. The privacy page says a disconnected calendar keeps
// nothing. The connection row stays, soft-deleted, so it has to stop saying
// which Google account it was.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
