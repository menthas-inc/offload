// 025. What the database itself holds a label to.
//
// AC-2 a name is unique per thread, ignoring case, among live labels.
// AC-3 a colour is unique per thread among live labels.
// AC-7 a deleted label frees its name and colour.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, thread, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(wipe);

async function label(threadId: string, name: string, colour: number) {
  return db
    .insertInto("labels")
    .values({ thread_id: threadId, name, colour, set_by: "person" })
    .returning("id")
    .executeTakeFirstOrThrow();
}

describe("the labels table (AC-2, AC-3, AC-7)", () => {
  it("refuses a second live label of the same name, ignoring case", async () => {
    const me = await account();
    const t = await thread(me);
    await label(t, "Lisbon", 1);
    await expect(label(t, "lisbon", 2)).rejects.toThrow(/labels_thread_name_idx/);
  });

  it("refuses a second live label of the same colour", async () => {
    const me = await account();
    const t = await thread(me);
    await label(t, "Lisbon", 1);
    await expect(label(t, "Paris", 1)).rejects.toThrow(/labels_thread_colour_idx/);
  });

  it("allows both in another thread", async () => {
    const me = await account();
    await label(await thread(me, "A"), "Lisbon", 1);
    await expect(label(await thread(me, "B"), "Lisbon", 1)).resolves.toBeTruthy();
  });

  it("frees the name and the colour once the first is deleted", async () => {
    const me = await account();
    const t = await thread(me);
    const first = await label(t, "Lisbon", 1);
    await db.updateTable("labels").set({ deleted_at: sql`now()` }).where("id", "=", first.id).execute();
    await expect(label(t, "Lisbon", 1)).resolves.toBeTruthy();
  });

  it("holds a name to 1 to 24 characters and a colour to 1 to 10", async () => {
    const me = await account();
    const t = await thread(me);
    await expect(label(t, "x".repeat(25), 1)).rejects.toThrow();
    await expect(label(t, "", 1)).rejects.toThrow();
    await expect(label(t, "Lisbon", 11)).rejects.toThrow();
  });

  it("keeps one join per row and label, and cascades with the label", async () => {
    const me = await account();
    const t = await thread(me);
    const l = await label(t, "Lisbon", 1);
    const c = await db
      .insertInto("content")
      .values({ account_id: me, thread_id: t, title: "Ferry", type: "task", updated_at: new Date() })
      .returning("id").executeTakeFirstOrThrow();
    await db.insertInto("content_labels").values({ content_id: c.id, label_id: l.id, set_by: "person" }).execute();
    await expect(
      db.insertInto("content_labels").values({ content_id: c.id, label_id: l.id, set_by: "offload" }).execute(),
    ).rejects.toThrow();
    await db.deleteFrom("labels").where("id", "=", l.id).execute();
    expect(await db.selectFrom("content_labels").selectAll().execute()).toHaveLength(0);
  });

  it("gives activity a run and an undone mark, and the labelled kind", async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
       where table_name = 'activity' and column_name in ('label_run_id', 'undone_at')`.execute(db);
    expect(columns.rows.map((r) => r.column_name).sort()).toEqual(["label_run_id", "undone_at"]);
    const check = await sql<{ def: string }>`
      select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'activity_kind_check'`.execute(db);
    expect(check.rows[0]?.def).toMatch(/'labelled'/);
  });
});
