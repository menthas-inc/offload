// 052 T1.5. A turn's reply: slices of where it landed, read as ids and resolved
// under the reader's live access, in the order the turn wrote them.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { repliesFor, type Reply } from "../src/dumps/replies.js";
import { account, dump, join, row, thread, tool, wipe } from "./labels-kit.js";

let app: App;
await migrate(() => {});
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await db.deleteFrom("turn_changes").execute();
  await wipe();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function replyOf(me: string, turnId: string): Promise<Reply> {
  const messages = await db
    .selectFrom("messages")
    .select(["id", "role", "turn_id", "created_at"])
    .where("turn_id", "=", turnId)
    .execute();
  const replies = await repliesFor(me, messages);
  return replies.get(turnId)!;
}

/** A row filed a minute before the turn, so it is one of the turn's neighbours. */
async function earlier(me: string, threadId: string, title: string) {
  const id = await row(me, threadId, title);
  await sql`update content set created_at = now() - interval '1 minute' where id = ${id}::uuid`.execute(db);
  return id;
}

describe("a list slice", () => {
  it("shows two open rows from before the turn, then the turn's rows, marked", async () => {
    const me = await account();
    const groceries = await thread(me, "Groceries");
    await earlier(me, groceries, "Coffee beans");
    await earlier(me, groceries, "Bin bags");
    await earlier(me, groceries, "Washing up liquid");
    const d = await dump(me, "milk, eggs, basil and olive oil");
    for (const [i, title] of ["Milk", "Eggs", "Basil", "Olive oil"].entries()) {
      await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: `c${i}`, threadId: groceries, type: "task", title });
    }
    const reply = await replyOf(me, d.turnId);
    expect(reply.slices).toHaveLength(1);
    const slice = reply.slices[0]!;
    if (slice.kind !== "list") throw new Error(slice.kind);
    expect(slice.thread?.name).toBe("Groceries");
    expect(slice.rows.map((r) => r.title)).toEqual(["Bin bags", "Washing up liquid", "Milk", "Eggs", "Basil", "Olive oil"]);
    expect(slice.marked).toHaveLength(4);
    expect(slice.openCount).toBe(7);
    expect(reply.summary).toEqual({ kind: "new", count: 4 });
  });

  it("reports a zero open count as zero", async () => {
    const me = await account();
    const groceries = await thread(me, "Groceries");
    const milk = await row(me, groceries, "Milk");
    const d = await dump(me, "got the milk");
    await tool(app, { tool: "complete_content", jobId: d.jobId, toolCallId: "c1", contentId: milk, done: true });
    const reply = await replyOf(me, d.turnId);
    const slice = reply.slices[0]!;
    if (slice.kind !== "list") throw new Error(slice.kind);
    expect(slice.openCount).toBe(0);
    expect(slice.rows.map((r) => [r.title, r.done])).toEqual([["Milk", true]]);
    expect(reply.summary).toEqual({ kind: "ticked", count: 1 });
  });
});

describe("a mixed dump", () => {
  it("draws a calendar slice and a list slice, in the order written", async () => {
    const me = await account();
    const health = await thread(me, "Health");
    const bookshelf = await thread(me, "Bookshelf");
    const d = await dump(me, "Dentist in two days at 3, and oak brackets 30cm matte black");
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c1", threadId: health, type: "event", title: "Dentist", occursAt: `${day(2)}T15:00` });
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c2", threadId: bookshelf, type: "task", title: "Oak brackets, 30cm matte black" });
    const reply = await replyOf(me, d.turnId);
    expect(reply.slices.map((s) => s.kind)).toEqual(["calendar", "list"]);
    const cal = reply.slices[0]!;
    if (cal.kind !== "calendar") throw new Error(cal.kind);
    expect(cal.day).toBe(day(2));
    expect(cal.marked).toHaveLength(1);
    expect(cal.span).toBe(false);
    expect(reply.summary).toEqual({ kind: "filed", count: 2 });
  });

  it("uses the month for a date beyond next week", async () => {
    const me = await account();
    const family = await thread(me, "Family");
    const d = await dump(me, "dinner with Meera in a hundred days");
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c1", threadId: family, type: "event", title: "Dinner with Meera", occursAt: `${day(100)}T19:00` });
    const cal = (await replyOf(me, d.turnId)).slices[0]!;
    if (cal.kind !== "calendar") throw new Error(cal.kind);
    expect(cal.period.from.slice(8)).toBe("01");
    expect(cal.day).toBe(day(100));
  });
});

describe("four threads", () => {
  it("draw three slices and name the fourth", async () => {
    const me = await account();
    const names = ["A", "B", "C", "D"];
    const ids = await Promise.all(names.map((n) => thread(me, n)));
    const d = await dump(me, "one each");
    for (const [i, id] of ids.entries()) {
      await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: `c${i}`, threadId: id, type: "task", title: `Task ${i}` });
    }
    const reply = await replyOf(me, d.turnId);
    expect(reply.slices).toHaveLength(3);
    expect(reply.also.map((t) => t.name)).toEqual(["D"]);
  });
});

describe("a new thread", () => {
  it("shows its inside", async () => {
    const me = await account();
    const d = await dump(me, "Porto with Ana in March, flights around 200 each");
    const made = (await tool(app, { tool: "create_thread", jobId: d.jobId, toolCallId: "c1", name: "Porto weekend" })).json() as { threadId?: string; thread?: { id: string } };
    const threadId = made.threadId ?? made.thread!.id;
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c2", threadId, type: "task", title: "Book flights" });
    const reply = await replyOf(me, d.turnId);
    expect(reply.slices.map((s) => s.kind)).toEqual(["newThread"]);
    const slice = reply.slices[0]!;
    if (slice.kind !== "newThread") throw new Error(slice.kind);
    expect(slice.thread.name).toBe("Porto weekend");
    expect(slice.rows.map((r) => r.title)).toEqual(["Book flights"]);
    expect(reply.summary).toEqual({ kind: "started", count: 1 });
  });
});

describe("a remember", () => {
  it("draws the kind's memories with the new one marked", async () => {
    const me = await account();
    const d = await dump(me, "remember Meera is allergic to cashews");
    const res = await tool(app, { tool: "memory", jobId: d.jobId, toolCallId: "c1", action: "remember", text: "Meera is allergic to cashews", kind: "people" });
    expect(res.statusCode).toBe(200);
    const reply = await replyOf(me, d.turnId);
    const slice = reply.slices[0]!;
    if (slice.kind !== "memories") throw new Error(slice.kind);
    expect(slice.memoryKind).toBe("people");
    expect(slice.memories.filter((m) => m.marked).map((m) => m.text)).toEqual(["Meera is allergic to cashews"]);
    expect(reply.summary).toEqual({ kind: "remembered", count: 1 });
  });
});

describe("an answer", () => {
  it("draws its found rows as a list slice", async () => {
    const me = await account();
    const lisbon = await thread(me, "Lisbon trip");
    const transfer = await row(me, lisbon, "Book the airport transfer");
    const d = await dump(me, "what's left for Lisbon?");
    await app.inject({
      method: "POST",
      url: "/internal/v1/turn-result",
      headers: { authorization: `Bearer ${(await import("../src/env.js")).env.INTERNAL_SERVICE_TOKEN}` },
      payload: { outcome: "answered", jobId: d.jobId, replyText: "One left.", found: [{ threadId: lisbon, truncated: false, contentIds: [transfer] }], usage: [] },
    });
    const reply = await replyOf(me, d.turnId);
    const slice = reply.slices[0]!;
    if (slice.kind !== "list") throw new Error(slice.kind);
    expect(slice.rows.map((r) => r.title)).toEqual(["Book the airport transfer"]);
    expect(reply.summary).toBeNull();
  });

  it("draws what it showed as a calendar: a span, or a day in its month", async () => {
    const me = await account();
    const d = await dump(me, "what's on this week?");
    const offload = await db
      .insertInto("messages")
      .values({ conversation_id: d.conversationId, account_id: me, role: "offload", type: "text", turn_id: d.turnId, text: "Three this week.", state: "answered", shown: JSON.stringify({ span: { from: day(0), to: day(6) } }) as never })
      .returning("id")
      .executeTakeFirstOrThrow();
    const span = (await replyOf(me, d.turnId)).slices[0]!;
    expect(span).toMatchObject({ kind: "calendar", span: true, period: { from: day(0), to: day(6) } });
    await db.updateTable("messages").set({ shown: JSON.stringify({ on: day(130) }) as never }).where("id", "=", offload.id).execute();
    const on = (await replyOf(me, d.turnId)).slices[0]!;
    expect(on).toMatchObject({ kind: "calendar", span: false, day: day(130) });
  });
});

describe("live access", () => {
  it("drops a row in a thread the reader has left, never naming it", async () => {
    const me = await account();
    const them = await account("Tom Reilly");
    const shared = await thread(them, "Their thread");
    await join(shared, me);
    const d = await dump(me, "ferry on Tuesday");
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c1", threadId: shared, type: "task", title: "Ferry" });
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", shared).where("account_id", "=", me).execute();
    const reply = await replyOf(me, d.turnId);
    expect(reply.slices).toEqual([{ kind: "removed" }]);
    expect(JSON.stringify(reply)).not.toContain("Their thread");
  });
});

describe("on the wire", () => {
  it("rides each turn of the current conversation", async () => {
    const me = await account();
    const groceries = await thread(me, "Groceries");
    const d = await dump(me, "milk");
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c1", threadId: groceries, type: "task", title: "Milk" });
    await db.updateTable("conversations").set({ last_message_at: new Date() }).where("id", "=", d.conversationId).execute();
    const { as, signIn } = await import("./labels-kit.js");
    const res = await as(app, await signIn(me)).get("/v1/conversations/current");
    const person = (res.json() as { messages: Array<{ role: string; parts?: Reply }> }).messages.find((m) => m.role === "person")!;
    expect(person.parts?.slices[0]).toMatchObject({ kind: "list" });
    expect(person.parts?.summary).toEqual({ kind: "new", count: 1 });
  });
});
