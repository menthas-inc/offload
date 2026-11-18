// 051. A memory can carry the calendar event it became, and nothing else can.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});
afterAll(closeDb);

beforeEach(async () => {
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("notes.event_ref", () => {
  it("is held by a memory", async () => {
    const me = await account();
    const row = await sql<{ id: string }>`
      insert into notes (account_id, scope, subject_id, kind, text, origin, event_ref)
      values (${me}::uuid, 'account', ${me}::uuid, 'people', 'Kristina''s birthday is 1 February.', 'stated', 'cal@example.com:e1')
      returning id`.execute(db);
    expect(row.rows).toHaveLength(1);
  });

  it("is refused on a thread's note", async () => {
    const me = await account();
    const thread = await db.insertInto("threads").values({ name: "Home" } as never).returning("id").executeTakeFirstOrThrow();
    await expect(
      sql`insert into notes (account_id, scope, subject_id, kind, text, origin, event_ref)
          values (${me}::uuid, 'thread', ${thread.id}::uuid, 'going_on', 'Bins on Tuesday.', 'stated', 'cal@example.com:e1')`.execute(db),
    ).rejects.toThrow(/notes_event_ref_scope/);
  });
});

describe("connector_pending_writes.note_id", () => {
  it("exists", async () => {
    const cols = await sql<{ column_name: string }>`
      select column_name from information_schema.columns where table_name = 'connector_pending_writes' and column_name = 'note_id'`.execute(db);
    expect(cols.rows).toHaveLength(1);
  });
});

describe("memories_to_date", () => {
  it("offers a linked memory whose words changed, with its reminders off", async () => {
    const me = await account();
    const note = await sql<{ id: string }>`
      insert into notes (account_id, scope, subject_id, kind, text, origin, event_ref)
      values (${me}::uuid, 'account', ${me}::uuid, 'people', 'Kristina''s birthday is 2 February.', 'stated', 'cal@example.com:e1')
      returning id`.execute(db);
    const id = note.rows[0]!.id;
    await sql`insert into reminder_labels (account_id, note_id, kind, lead, yearly_on, name, fingerprint, labelled_at, date_set_at, stopped_at)
      values (${me}::uuid, ${id}::uuid, 'occasion', 'days', '02-01', 'Kristina''s birthday', 'stale', now(), now(), now())`.execute(db);
    const offered = await sql<{ id: string }>`select id from memories_to_date(${me}::uuid)`.execute(db);
    expect(offered.rows.map((r) => r.id)).toEqual([id]);
  });

  it("still skips an unlinked memory whose reminders are off", async () => {
    const me = await account();
    const note = await sql<{ id: string }>`
      insert into notes (account_id, scope, subject_id, kind, text, origin)
      values (${me}::uuid, 'account', ${me}::uuid, 'people', 'Ana''s birthday is 2 March.', 'stated')
      returning id`.execute(db);
    await sql`insert into reminder_labels (account_id, note_id, kind, lead, yearly_on, name, fingerprint, labelled_at, date_set_at, stopped_at)
      values (${me}::uuid, ${note.rows[0]!.id}::uuid, 'occasion', 'days', '03-01', null, 'stale', now(), now(), now())`.execute(db);
    const offered = await sql<{ id: string }>`select id from memories_to_date(${me}::uuid)`.execute(db);
    expect(offered.rows).toEqual([]);
  });
});
