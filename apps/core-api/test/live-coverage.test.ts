// 048. Every table a screen draws from has its trigger.
//
// A table without one is a screen that goes on showing what it held until a
// reload, and no other test can see that: nothing fails, the screen is just
// quietly stale. So the list lives here, read against `pg_trigger`, and a
// table dropped from the migration or added to a screen without one is red.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";

afterAll(async () => {
  await closeDb();
});

/** The impl-spec's trigger table: table, and the kinds its writes say. */
const LIVE: Record<string, string[]> = {
  threads: ["thread"],
  content: ["thread"],
  notes: ["thread", "memories"],
  labels: ["thread"],
  content_labels: ["thread"],
  content_blobs: ["thread"],
  note_labels: ["thread", "memories"],
  thread_members: ["thread", "removed", "invitation"],
  pending_shares: ["thread"],
  thread_calendars: ["thread"],
  messages: ["conversation"],
  questions: ["conversation", "today"],
  connections: ["people"],
  connection_requests: ["people"],
  activity: ["activity"],
  reminder_dismissals: ["today"],
  reminder_labels: ["today"],
  today_put_offs: ["today"],
  connector_events: ["today"],
  connector_connections: ["today"],
};

describe("live triggers", () => {
  it("every table a screen draws from says when it changes", async () => {
    const { rows } = await sql<{ table: string }>`
      select distinct c.relname as table
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where t.tgname like 'live\\_%' and not t.tgisinternal`.execute(db);
    const have = new Set(rows.map((row) => row.table));
    expect(Object.keys(LIVE).filter((table) => !have.has(table))).toEqual([]);
  });
});
