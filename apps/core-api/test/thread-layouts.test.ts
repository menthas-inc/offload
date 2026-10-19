// Thread layouts (2026-10-19): the layout at creation, the switch with its
// labels and Undo, the refusal, and Today's predicate.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { account, as, dump, owner, row, signIn, thread, tool } from "./loose-kit.js";
import { wipe } from "./labels-kit.js";

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

const layoutOf = (id: string) =>
  db.selectFrom("threads").select(["layout", "layout_set_by"]).where("id", "=", id).executeTakeFirstOrThrow();
const labelNames = async (client: ReturnType<typeof as>, id: string): Promise<string[]> =>
  (await client.get(`/v1/threads/${id}`)).json().labels.map((l: { name: string }) => l.name).sort();

describe("at creation", () => {
  it("create_thread sets the layout and makes its labels as offload (AC-7)", async () => {
    const { me } = await owner();
    const { jobId } = await dump(me);
    const made = (await tool(app, { tool: "create_thread", jobId, toolCallId: "c1", name: "Lisbon", layout: "events" })).json();
    expect(made.ok).toBe(true);
    expect(await layoutOf(made.threadId)).toEqual({ layout: "events", layout_set_by: "offload" });
    expect(await labelNames(as(app, await signIn(me)), made.threadId)).toEqual(["Booked", "Passed on", "Still deciding"]);
  });

  it("New thread takes the person's layout and makes its labels", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const made = (await client.post("/v1/threads", { name: "Kitchen", layout: "project" })).json().thread;
    expect(await layoutOf(made.id)).toEqual({ layout: "project", layout_set_by: "person" });
    expect(await labelNames(client, made.id)).toEqual(["Later", "Next", "Now"]);
  });

  it("a thread with no layout reads default, set by offload, exactly as today", async () => {
    const me = await account();
    expect(await layoutOf(await thread(me, "Plain"))).toEqual({ layout: "default", layout_set_by: "offload" });
  });
});

describe("the switch (AC-2)", () => {
  it("makes the new layout's missing labels in one write and says what it made", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const t = await thread(me, "Trip");
    const res = await client.patch(`/v1/threads/${t}`, { layout: "events" });
    expect(res.statusCode).toBe(200);
    expect(res.json().layout.previous).toEqual({ layout: "default", layoutSetBy: "offload" });
    expect(res.json().layout.made).toHaveLength(3);
    expect(await layoutOf(t)).toEqual({ layout: "events", layout_set_by: "person" });
    expect(await labelNames(client, t)).toEqual(["Booked", "Passed on", "Still deciding"]);
  });

  it("switching away deletes the empty ones the new layout does not use, keeping a label with rows", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const t = await thread(me, "Trip");
    await client.patch(`/v1/threads/${t}`, { layout: "events" });
    // Put a row under Booked so it is not empty.
    const booked = (await client.get(`/v1/threads/${t}`)).json().labels.find((l: { name: string }) => l.name === "Booked");
    const r = await row(me, t, "ferry");
    await db.insertInto("content_labels").values({ content_id: r, label_id: booked.id, set_by: "person" } as never).execute();
    await client.patch(`/v1/threads/${t}`, { layout: "default" });
    expect(await layoutOf(t)).toMatchObject({ layout: "default" });
    // The empty two go, Booked stays because it has a row.
    expect(await labelNames(client, t)).toEqual(["Booked"]);
  });

  it("refuses a switch that needs more labels than the thread has room for (AC-3)", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const t = await thread(me, "Busy");
    for (let i = 1; i <= 8; i++) {
      await db.insertInto("labels").values({ thread_id: t, name: `L${i}`, colour: i, set_by: "person", created_by: me } as never).execute();
    }
    const res = await client.patch(`/v1/threads/${t}`, { layout: "events" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "layout_labels_full", needed: 3, free: 2 });
    // Nothing written: still default, still eight labels.
    expect(await layoutOf(t)).toMatchObject({ layout: "default" });
    expect((await labelNames(client, t)).length).toBe(8);
  });

  it("Undo removes the labels it made and restores the ones it dropped", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const t = await thread(me, "Trip");
    const { layout } = (await client.patch(`/v1/threads/${t}`, { layout: "events" })).json();
    const undo = await client.patch(`/v1/threads/${t}`, {
      layout: layout.previous.layout,
      layoutSetBy: layout.previous.layoutSetBy,
      undoLabels: { remove: layout.made, restore: layout.dropped },
    });
    expect(undo.statusCode).toBe(200);
    expect(await layoutOf(t)).toEqual({ layout: "default", layout_set_by: "offload" });
    expect(await labelNames(client, t)).toEqual([]);
  });
});

describe("the bundle read", () => {
  it("carries the layout and whose pick it is", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const t = await thread(me, "Plain");
    const bundle = (await client.get(`/v1/threads/${t}`)).json();
    expect(bundle).toMatchObject({ layout: "default", layoutSetBy: "offload", layoutSuggestion: null, layoutChange: null });
  });
});

describe("Today's To do, open in your threads (AC-9)", () => {
  // This surface is open UNDATED to-dos grouped by thread. The predicate keeps
  // Default and Project, and drops Todo list, Gallery, Timeline and Events.
  async function pageIds(client: ReturnType<typeof as>): Promise<string[]> {
    const res = await client.get("/v1/today/threads");
    expect(res.statusCode).toBe(200);
    return res.json().pages.map((p: { threadId: string }) => p.threadId);
  }

  it("keeps Default and Project, drops a Todo list thread's undated rows", async () => {
    const me = await account();
    const client = as(app, await signIn(me));
    const plain = await thread(me, "Plain");
    await row(me, plain, "buy stamps");

    const project = await thread(me, "Reno");
    await db.updateTable("threads").set({ layout: "project", layout_set_by: "person" }).where("id", "=", project).execute();
    await row(me, project, "pick tiles");

    const list = await thread(me, "Groceries");
    await db.updateTable("threads").set({ layout: "todo", layout_set_by: "person" }).where("id", "=", list).execute();
    await row(me, list, "milk");

    const ids = await pageIds(client);
    expect(ids).toContain(plain);
    expect(ids).toContain(project);
    expect(ids).not.toContain(list);
  });
});
