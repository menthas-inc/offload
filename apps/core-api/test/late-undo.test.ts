// 052 T1.4. The reply's Undo lasts until the next dump. Past its first eight
// seconds, by server time, it undoes the filing and keeps the dump, and leaves
// anything somebody changed after the turn, naming it (AC-17, AC-18).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { account, as, dump, row, signIn, thread, tool, wipe } from "./labels-kit.js";

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

/** A turn that filed one new row and ticked one that was there. */
async function turn() {
  const me = await account();
  const home = await thread(me, "Groceries");
  const milk = await row(me, home, "Milk");
  const d = await dump(me, "eggs, and got the milk");
  await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c1", threadId: home, type: "task", title: "Eggs" });
  await tool(app, { tool: "complete_content", jobId: d.jobId, toolCallId: "c2", contentId: milk, done: true });
  const eggs = await db.selectFrom("content").select("id").where("derived_from_message_id", "=", d.messageId).executeTakeFirstOrThrow();
  return { me, home, milk, eggs: eggs.id, ...d };
}

/** The turn's result came `ago`, and what it wrote is from before that. */
async function settled(messageId: string, ago: string) {
  await sql`update messages set settled_at = now() - ${ago}::interval where id = ${messageId}::uuid`.execute(db);
  await sql`update content set updated_at = now() - ${ago}::interval - interval '1 second'`.execute(db);
}

const undo = async (me: string, turnId: string) => as(app, await signIn(me)).post(`/v1/turns/${turnId}/undo`);

describe("a late Undo", () => {
  it("removes what the turn made and puts back what it changed, and keeps the dump", async () => {
    const t = await turn();
    await settled(t.messageId, "1 minute");
    const res = await undo(t.me, t.turnId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ undone: true });
    const eggs = await db.selectFrom("content").select("deleted_at").where("id", "=", t.eggs).executeTakeFirstOrThrow();
    expect(eggs.deleted_at).not.toBeNull();
    const milk = await db.selectFrom("content").select("done_at").where("id", "=", t.milk).executeTakeFirstOrThrow();
    expect(milk.done_at).toBeNull();
    const kept = await db.selectFrom("messages").select("deleted_at").where("id", "=", t.messageId).executeTakeFirstOrThrow();
    expect(kept.deleted_at).toBeNull();
  });

  it("leaves a row somebody changed after the turn, and names it", async () => {
    const t = await turn();
    await settled(t.messageId, "1 minute");
    await db.updateTable("content").set({ title: "Oat milk", updated_at: new Date() }).where("id", "=", t.milk).execute();
    const res = await undo(t.me, t.turnId);
    expect(res.json()).toMatchObject({ undone: true, changed: ["Oat milk"] });
    const milk = await db.selectFrom("content").select("done_at").where("id", "=", t.milk).executeTakeFirstOrThrow();
    expect(milk.done_at).not.toBeNull();
  });
});

describe("an Undo inside the eight seconds", () => {
  it("is 004's, and takes the dump too", async () => {
    const t = await turn();
    await settled(t.messageId, "1 second");
    const res = await undo(t.me, t.turnId);
    expect(res.json()).toMatchObject({ undone: true });
    const gone = await db.selectFrom("messages").select("deleted_at").where("id", "=", t.messageId).executeTakeFirstOrThrow();
    expect(gone.deleted_at).not.toBeNull();
  });
});

describe("settled_at", () => {
  it("is stamped when the turn's result arrives", async () => {
    const t = await turn();
    await app.inject({
      method: "POST",
      url: "/internal/v1/turn-result",
      headers: { authorization: `Bearer ${(await import("../src/env.js")).env.INTERNAL_SERVICE_TOKEN}` },
      payload: { outcome: "answered", jobId: t.jobId, usage: [] },
    });
    const m = await db.selectFrom("messages").select("settled_at").where("id", "=", t.messageId).executeTakeFirstOrThrow();
    expect(m.settled_at).not.toBeNull();
  });
});
