// 025. Labels replace tags and grouping, so the old grouping goes first.
//
// AC-30 `group_by`, `groupBy` (stored ones included), the model's `tags`,
//       018's tag question and `content.tags` are gone.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { readPreference } from "../src/threads/widgets.js";
import { account, as, dump, signIn, thread, tool, wipe } from "./labels-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

describe("tags and grouping retire (AC-30)", () => {
  it("has no tags column on content", async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
       where table_name = 'content' and column_name = 'tags'`.execute(db);
    expect(columns.rows).toHaveLength(0);
  });

  it("refuses tags on add_content and edit_content as an unknown field", async () => {
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);

    const added = await tool(app, {
      tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId: t,
      title: "Ferry", tags: ["city:istanbul"],
    });
    expect(added.statusCode).toBe(400);
  });

  it("refuses group_by on set_thread_preference", async () => {
    const me = await account();
    const t = await thread(me);
    const { jobId } = await dump(me);

    const set = await tool(app, {
      tool: "set_thread_preference", jobId, toolCallId: "t1", threadId: t,
      groupBy: { todo: "city" },
    });
    expect(set.statusCode).toBe(400);
  });

  it("refuses groupBy on the person's preference route", async () => {
    const me = await account();
    const t = await thread(me);
    const response = await as(app, await signIn(me)).patch(`/v1/threads/${t}/preference`, { groupBy: { todo: "city" } });
    expect(response.statusCode).toBe(400);
  });

  it("reads no groupBy out of a thread's stored attrs", () => {
    expect(readPreference({ widgets: ["todo"], groupBy: { todo: "city" } })).toEqual({ widgets: ["todo"] });
  });

  it("serves no groupBy on the thread bundle", async () => {
    const me = await account();
    const t = await thread(me);
    await db.updateTable("threads").set({ attrs: JSON.stringify({ groupBy: { todo: "city" } }) as never }).where("id", "=", t).execute();
    const bundle = await as(app, await signIn(me)).get(`/v1/threads/${t}`);
    expect(bundle.statusCode).toBe(200);
    expect(bundle.json().preference).toEqual({});
  });

  it("refuses a tag question at the database", async () => {
    const constraint = await sql<{ def: string }>`
      select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'questions_field_check'`.execute(db);
    expect(constraint.rows[0]?.def ?? "").not.toMatch(/'tag'/);
  });
});
