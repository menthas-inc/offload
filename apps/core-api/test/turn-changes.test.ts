// 052 T1.1. Each of the six tools that change what was there before a turn
// records the previous value, so the reply can show the change and the turn's
// Undo can put it back. The first value wins; a second tool's field merges in.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { takeDump, undoTurn } from "../src/routes/dumps.js";
import { account, dump, row, thread, tool, wipe } from "./labels-kit.js";

let app: App;
await migrate(() => {});
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

async function changes(messageId: string) {
  const rows = await sql<{ target_kind: string; target_id: string; tool: string; previous: Record<string, unknown> | null }>`
    select target_kind, target_id, tool, previous from turn_changes where message_id = ${messageId}::uuid order by created_at`.execute(db);
  return rows.rows;
}

describe("what a turn changed", () => {
  it("records a tick, an archive and a move with the value from before", async () => {
    const me = await account();
    const home = await thread(me, "Groceries");
    const away = await thread(me, "Flat admin");
    const milk = await row(me, home, "Milk");
    const bins = await row(me, home, "Bin bags");
    const rent = await row(me, home, "Pay rent");
    const { jobId, messageId } = await dump(me, "got the milk, archive bin bags, rent goes in flat admin");
    expect((await tool(app, { tool: "complete_content", jobId, toolCallId: "c1", contentId: milk, done: true })).statusCode).toBe(200);
    expect((await tool(app, { tool: "archive_content", jobId, toolCallId: "c2", contentId: bins, archived: true })).statusCode).toBe(200);
    expect((await tool(app, { tool: "move_content", jobId, toolCallId: "c3", contentId: rent, threadId: away })).statusCode).toBe(200);
    const got = await changes(messageId);
    expect(got).toEqual([
      { target_kind: "content", target_id: milk, tool: "complete_content", previous: { done_at: null, due_at: null, occurs_at: null } },
      { target_kind: "content", target_id: bins, tool: "archive_content", previous: { archived_at: null } },
      { target_kind: "content", target_id: rent, tool: "move_content", previous: { thread_id: home } },
    ]);
  });

  it("records an edit's fields, keeps the first value, and merges a second tool's field", async () => {
    const me = await account();
    const home = await thread(me, "Health");
    const dentist = await row(me, home, "Dentist");
    const { jobId, messageId } = await dump(me, "dentist is the orthodontist, then tick it");
    await tool(app, { tool: "edit_content", jobId, toolCallId: "c1", contentId: dentist, title: "Orthodontist" });
    await tool(app, { tool: "edit_content", jobId, toolCallId: "c2", contentId: dentist, title: "Ortho" });
    await tool(app, { tool: "complete_content", jobId, toolCallId: "c3", contentId: dentist, done: true });
    const [only, ...rest] = await changes(messageId);
    expect(rest).toEqual([]);
    expect(only!.previous).toMatchObject({ title: "Dentist", done_at: null });
  });

  it("records a rename and a thread preference", async () => {
    const me = await account();
    const home = await thread(me, "Flat");
    const { jobId, messageId } = await dump(me, "call the flat Home, and show the map first");
    await tool(app, { tool: "rename_thread", jobId, toolCallId: "c1", threadId: home, name: "Home" });
    await tool(app, { tool: "set_thread_preference", jobId, toolCallId: "c2", threadId: home, widgets: ["todo"] });
    const [only] = await changes(messageId);
    expect(only).toMatchObject({ target_kind: "thread", target_id: home });
    expect(only!.previous).toMatchObject({ name: "Flat" });
    expect(only!.previous).toHaveProperty("widgets");
  });

  it("records offload's own columns and nothing else", async () => {
    const me = await account();
    const home = await thread(me, "Health");
    const dentist = await row(me, home, "Dentist", { body: "From the practice: bring your card." });
    const { jobId, messageId } = await dump(me, "dentist is the orthodontist");
    await tool(app, { tool: "edit_content", jobId, toolCallId: "c1", contentId: dentist, title: "Orthodontist" });
    const [only] = await changes(messageId);
    expect(Object.keys(only!.previous!).sort()).toEqual(
      ["body", "due_at", "image_url", "occurs_at", "occurs_end_at", "priority", "rrule", "title", "url"].sort(),
    );
  });
});

describe("the next dump retires a turn's values (T1.2)", () => {
  async function ticked() {
    const me = await account();
    const home = await thread(me, "Groceries");
    const milk = await row(me, home, "Milk");
    const { jobId, messageId } = await dump(me, "got the milk");
    await tool(app, { tool: "complete_content", jobId, toolCallId: "c1", contentId: milk, done: true });
    return { me, messageId, milk };
  }

  it("nulls them once the turn is past its eight seconds, and keeps the ids", async () => {
    const { me, messageId, milk } = await ticked();
    await sql`update turn_changes set created_at = now() - interval '1 minute' where message_id = ${messageId}::uuid`.execute(db);
    await takeDump(me, "eggs");
    const [only] = await changes(messageId);
    expect(only).toMatchObject({ target_id: milk, previous: null });
  });

  it("keeps them when the next dump comes inside the eight seconds", async () => {
    const { me, messageId } = await ticked();
    await takeDump(me, "eggs");
    const [only] = await changes(messageId);
    expect(only!.previous).toEqual({ done_at: null, due_at: null, occurs_at: null });
  });
});

describe("the turn's Undo puts back what it changed (T1.3)", () => {
  it("unticks, moves back, unarchives, renames back and restores the widgets", async () => {
    const me = await account();
    const home = await thread(me, "Groceries");
    const away = await thread(me, "Flat admin");
    const milk = await row(me, home, "Milk");
    const basil = await row(me, home, "Basil");
    const rent = await row(me, home, "Pay rent");
    const bins = await row(me, home, "Bin bags");
    const { jobId, turnId } = await dump(me, "got the milk and basil, rent goes in flat admin, archive bins, call groceries Shop");
    await tool(app, { tool: "complete_content", jobId, toolCallId: "c1", contentId: milk, done: true });
    await tool(app, { tool: "complete_content", jobId, toolCallId: "c2", contentId: basil, done: true });
    await tool(app, { tool: "move_content", jobId, toolCallId: "c3", contentId: rent, threadId: away });
    await tool(app, { tool: "archive_content", jobId, toolCallId: "c4", contentId: bins, archived: true });
    await tool(app, { tool: "rename_thread", jobId, toolCallId: "c5", threadId: home, name: "Shop" });
    await tool(app, { tool: "set_thread_preference", jobId, toolCallId: "c6", threadId: home, widgets: ["todo"] });

    expect(await undoTurn(me, turnId)).toMatchObject({ undone: true });

    const rows = await db.selectFrom("content").select(["id", "done_at", "thread_id", "archived_at", "deleted_at"]).where("id", "in", [milk, basil, rent, bins]).execute();
    for (const one of rows) {
      expect(one.done_at, one.id).toBeNull();
      expect(one.archived_at, one.id).toBeNull();
      expect(one.deleted_at, one.id).toBeNull();
      expect(one.thread_id, one.id).toBe(home);
    }
    const t = await db.selectFrom("threads").select(["name", "attrs"]).where("id", "=", home).executeTakeFirstOrThrow();
    expect(t.name).toBe("Groceries");
    expect((t.attrs as { widgets?: unknown }).widgets ?? null).toBeNull();
  });
});

describe("a deleted row's earlier values", () => {
  it("go when the row is purged, so the undo record keeps no words of it", async () => {
    const { handlers } = await import("../src/jobs/handlers.js");
    const me = await account();
    const home = await thread(me, "Health");
    const dentist = await row(me, home, "Dentist");
    const { jobId, messageId } = await dump(me, "dentist is the orthodontist");
    await tool(app, { tool: "edit_content", jobId, toolCallId: "c1", contentId: dentist, title: "Orthodontist" });
    expect(await changes(messageId)).toHaveLength(1);
    await sql`update content set deleted_at = now(), purge_after = now() - interval '1 second' where id = ${dentist}::uuid`.execute(db);
    await handlers["content.purge"]!({}, { mailer: null as never }, null);
    expect(await changes(messageId)).toEqual([]);
  });
});
