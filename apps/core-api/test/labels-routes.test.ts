// 025. The person's routes, and what every read of a row now carries.
//
// AC-4  membership on every route.
// AC-6  no request carries who set it.
// AC-7  delete and restore by id.
// AC-11 the row's labels in one write, with what they were.
// AC-12 the label's list in one write, as deltas, with what changed.
// AC-18 the thread's lists narrow on the server; counts come from the server.
// AC-22 Today's rows carry their labels and the labels they name.
// AC-27 a label is never returned on a row outside its thread.
// AC-32 two members ticking different rows of one label both land.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { account, as, join, note, row, signIn, thread, wipe } from "./labels-kit.js";

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

async function setup() {
  const me = await account();
  const t = await thread(me);
  const client = as(app, await signIn(me));
  return { me, t, client };
}

describe("making and changing a label (AC-4, AC-6, AC-7)", () => {
  it("creates, renames with what it was, swaps colours, deletes and restores", async () => {
    const { t, client } = await setup();
    const lisbon = await client.post(`/v1/threads/${t}/labels`, { name: "Lisbon" });
    expect(lisbon.statusCode).toBe(200);
    expect(lisbon.json().label).toMatchObject({ name: "Lisbon", colour: 1, count: 0 });
    const paris = (await client.post(`/v1/threads/${t}/labels`, { name: "Paris" })).json().label;

    const renamed = await client.patch(`/v1/labels/${lisbon.json().label.id}`, { name: "Lisboa", colour: 2 });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({
      label: { name: "Lisboa", colour: 2 },
      previous: { name: "Lisbon", colour: 1 },
      swappedWith: paris.id,
    });

    expect((await client.delete(`/v1/labels/${paris.id}`)).statusCode).toBe(200);
    const back = await client.post(`/v1/labels/${paris.id}/restore`);
    expect(back.statusCode).toBe(200);
    expect(back.json().label).toMatchObject({ id: paris.id, name: "Paris" });
  });

  it("answers a clash, a full thread and a gone label by name", async () => {
    const { t, client } = await setup();
    await client.post(`/v1/threads/${t}/labels`, { name: "Lisbon" });
    const taken = await client.post(`/v1/threads/${t}/labels`, { name: "lisbon" });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: "label_taken" });
    for (let i = 2; i <= 10; i++) await client.post(`/v1/threads/${t}/labels`, { name: `L${i}` });
    const full = await client.post(`/v1/threads/${t}/labels`, { name: "Eleven" });
    expect(full.json()).toEqual({ error: "label_limit" });
    const bad = await client.post(`/v1/threads/${t}/labels`, { name: "x".repeat(40) });
    expect(bad.statusCode).toBe(409);
    expect(bad.json()).toEqual({ error: "bad_label_name" });
  });

  it("refuses a body that says who set it", async () => {
    const { t, client } = await setup();
    const response = await client.post(`/v1/threads/${t}/labels`, { name: "Lisbon", setBy: "offload" });
    expect(response.statusCode).toBe(400);
  });

  it("is 404 to anybody outside the thread, for every route", async () => {
    const { t, client } = await setup();
    const label = (await client.post(`/v1/threads/${t}/labels`, { name: "Lisbon" })).json().label;
    const stranger = as(app, await signIn(await account("Stranger")));
    expect((await stranger.post(`/v1/threads/${t}/labels`, { name: "Mine" })).statusCode).toBe(404);
    expect((await stranger.patch(`/v1/labels/${label.id}`, { name: "Mine" })).statusCode).toBe(404);
    expect((await stranger.delete(`/v1/labels/${label.id}`)).statusCode).toBe(404);
    expect((await stranger.post(`/v1/labels/${label.id}/rows`, { add: { content: [] }, remove: {} })).statusCode).toBe(404);
  });
});

describe("labelling rows (AC-11, AC-12, AC-32)", () => {
  it("sets one row's labels as a full set and returns the previous one", async () => {
    const { me, t, client } = await setup();
    const c = await row(me, t, "Ferry");
    const a = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul" })).json().label;
    const b = (await client.post(`/v1/threads/${t}/labels`, { name: "Paris" })).json().label;

    const first = await client.patch(`/v1/content/${c}`, { labels: [a.id, b.id] });
    expect(first.statusCode).toBe(200);
    expect(first.json().previous.labels).toEqual([]);
    expect(first.json().content.labels).toEqual([a.id, b.id]);

    const second = await client.patch(`/v1/content/${c}`, { labels: [b.id] });
    expect(second.json().previous.labels).toEqual([a.id, b.id]);
    expect(second.json().content.labels).toEqual([b.id]);
  });

  it("leaves labels alone when the field is absent", async () => {
    const { me, t, client } = await setup();
    const c = await row(me, t, "Ferry");
    const a = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul" })).json().label;
    await client.patch(`/v1/content/${c}`, { labels: [a.id] });
    const renamed = await client.patch(`/v1/content/${c}`, { title: "Ferry to Kadikoy" });
    expect(renamed.json().content.labels).toEqual([a.id]);
  });

  it("labels a note, and refuses a label from another thread on a row", async () => {
    const { me, t, client } = await setup();
    const other = await thread(me, "Other");
    const n = await note(me, t, "Hotel in Alfama");
    const c = await row(me, t, "Ferry");
    const mine = (await client.post(`/v1/threads/${t}/labels`, { name: "Lisbon" })).json().label;
    const foreign = (await client.post(`/v1/threads/${other}/labels`, { name: "Elsewhere" })).json().label;
    const labelled = await client.patch(`/v1/notes/${n}`, { labels: [mine.id] });
    expect(labelled.statusCode).toBe(200);
    expect(labelled.json().note.labels).toEqual([mine.id]);
    expect((await client.patch(`/v1/content/${c}`, { labels: [foreign.id] })).statusCode).toBe(404);
  });

  it("writes the label's list as deltas, so two members ticking different rows both land", async () => {
    const { me, t, client } = await setup();
    const sam = await account("Sam");
    await join(t, sam);
    const samClient = as(app, await signIn(sam));
    const ferry = await row(me, t, "Ferry");
    const palace = await row(sam, t, "Palace");
    const label = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul" })).json().label;

    const mine = await client.post(`/v1/labels/${label.id}/rows`, { add: { content: [ferry] }, remove: {} });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().changed).toEqual({ added: { content: [ferry], notes: [] }, removed: { content: [], notes: [] } });
    await samClient.post(`/v1/labels/${label.id}/rows`, { add: { content: [palace] }, remove: {} });

    const joins = await db.selectFrom("content_labels").select("content_id").where("removed_at", "is", null).execute();
    expect(joins.map((j) => j.content_id).sort()).toEqual([ferry, palace].sort());
  });

  it("creates a label with its rows in one write", async () => {
    const { me, t, client } = await setup();
    const ferry = await row(me, t, "Ferry");
    const made = await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry] } });
    expect(made.json().label).toMatchObject({ name: "Istanbul", count: 1 });
  });
});

describe("reading (AC-18, AC-22, AC-27)", () => {
  it("serves the thread's labels with counts, and each row's labels", async () => {
    const { me, t, client } = await setup();
    const ferry = await row(me, t, "Ferry");
    const palace = await row(me, t, "Palace");
    await row(me, t, "Loose");
    await row(me, t, "Old", { archived_at: new Date() });
    const n = await note(me, t, "Hotel in Alfama");
    const a = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry, palace], notes: [n] } })).json().label;
    const b = (await client.post(`/v1/threads/${t}/labels`, { name: "Paris", rows: { content: [ferry] } })).json().label;

    const bundle = (await client.get(`/v1/threads/${t}`)).json();
    expect(bundle.labels).toEqual([
      { id: a.id, name: "Istanbul", colour: 1, count: 3 },
      { id: b.id, name: "Paris", colour: 2, count: 1 },
    ]);
    expect(bundle.counts.unlabelled).toBe(1);
    expect(bundle.notes[0].labels).toEqual([a.id]);

    const page = (await client.get(`/v1/threads/${t}/content`)).json();
    const byTitle = Object.fromEntries(page.rows.map((r: { title: string; labels: string[] }) => [r.title, r.labels]));
    expect(byTitle).toEqual({ Ferry: [a.id, b.id], Palace: [a.id], Loose: [] });
  });

  it("narrows a page by either of the picked labels, or by none", async () => {
    const { me, t, client } = await setup();
    const ferry = await row(me, t, "Ferry");
    const palace = await row(me, t, "Palace");
    const louvre = await row(me, t, "Louvre");
    await row(me, t, "Loose");
    const a = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry, palace] } })).json().label;
    const b = (await client.post(`/v1/threads/${t}/labels`, { name: "Paris", rows: { content: [louvre] } })).json().label;

    const titles = async (query: string) =>
      (await client.get(`/v1/threads/${t}/content?${query}`)).json().rows.map((r: { title: string }) => r.title).sort();
    expect(await titles(`labels=${a.id}`)).toEqual(["Ferry", "Palace"]);
    expect(await titles(`labels=${a.id},${b.id}`)).toEqual(["Ferry", "Louvre", "Palace"]);
    expect(await titles(`unlabelled=true`)).toEqual(["Loose"]);
    expect(await titles(`labels=${b.id}&unlabelled=true`)).toEqual(["Loose", "Louvre"]);
  });

  it("pages a narrowed list across the cursor", async () => {
    const { me, t, client } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 35; i++) ids.push(await row(me, t, `Row ${i}`));
    const label = (await client.post(`/v1/threads/${t}/labels`, { name: "All", rows: { content: ids } })).json().label;
    const first = (await client.get(`/v1/threads/${t}/content?labels=${label.id}`)).json();
    expect(first.rows).toHaveLength(30);
    const second = (await client.get(`/v1/threads/${t}/content?labels=${label.id}&cursor=${first.nextCursor}`)).json();
    expect(second.rows).toHaveLength(5);
  });

  it("marks what a label's list ticks, ignoring any filter", async () => {
    const { me, t, client } = await setup();
    const ferry = await row(me, t, "Ferry");
    await row(me, t, "Loose");
    const label = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry] } })).json().label;
    const page = (await client.get(`/v1/threads/${t}/content?ticksFor=${label.id}`)).json();
    const ticks = Object.fromEntries(page.rows.map((r: { title: string; ticked: boolean }) => [r.title, r.ticked]));
    expect(ticks).toEqual({ Ferry: true, Loose: false });
  });

  // 2026-10-07. The list is for what is still ahead: an event that is over and
  // a ticked off task are not offered, unless the label already carries them,
  // so they can still be taken off it. Today's events and a series stay.
  it("leaves out what is over, unless the label carries it", async () => {
    const { me, t, client } = await setup();
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    await row(me, t, "Open task");
    await row(me, t, "Done task", { done_at: new Date(now - day) });
    const carriedDone = await row(me, t, "Done, carried", { done_at: new Date(now - day) });
    await row(me, t, "Last week", { type: "event", occurs_at: new Date(now - 7 * day) });
    await row(me, t, "Ended a minute ago", {
      type: "event",
      occurs_at: new Date(now - 2 * 60 * 1000),
      occurs_end_at: new Date(now - 60 * 1000),
    });
    await row(me, t, "Next week", { type: "event", occurs_at: new Date(now + 7 * day) });
    await row(me, t, "Weekly since spring", { type: "event", occurs_at: new Date(now - 90 * day), rrule: "FREQ=WEEKLY" });
    const label = (await client.post(`/v1/threads/${t}/labels`, { name: "Trip", rows: { content: [carriedDone] } })).json().label;
    const page = (await client.get(`/v1/threads/${t}/content?ticksFor=${label.id}`)).json();
    expect(page.rows.map((r: { title: string }) => r.title).sort()).toEqual(
      ["Done, carried", "Ended a minute ago", "Next week", "Open task", "Weekly since spring"].sort(),
    );
    // The thread's own list is unchanged.
    const all = (await client.get(`/v1/threads/${t}/content`)).json();
    expect(all.rows).toHaveLength(7);
  });

  it("never returns a label on a row that moved to another thread", async () => {
    const { me, t, client } = await setup();
    const other = await thread(me, "Other");
    const ferry = await row(me, t, "Ferry");
    await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry] } });
    // A move that bypassed the route, so only the read's own check stands.
    await db.updateTable("content").set({ thread_id: other }).where("id", "=", ferry).execute();
    const page = (await client.get(`/v1/threads/${other}/content`)).json();
    expect(page.rows[0].labels).toEqual([]);
  });

  it("does not count a deleted label, and a removed join does not show", async () => {
    const { me, t, client } = await setup();
    const ferry = await row(me, t, "Ferry");
    const a = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry] } })).json().label;
    await client.delete(`/v1/labels/${a.id}`);
    const bundle = (await client.get(`/v1/threads/${t}`)).json();
    expect(bundle.labels).toEqual([]);
    const page = (await client.get(`/v1/threads/${t}/content`)).json();
    expect(page.rows[0].labels).toEqual([]);
  });

  it("gives Today's rows their labels and the labels they name", async () => {
    const { me, t, client } = await setup();
    const today = new Date();
    const ferry = await row(me, t, "Ferry", { due_at: today });
    const a = (await client.post(`/v1/threads/${t}/labels`, { name: "Istanbul", rows: { content: [ferry] } })).json().label;
    await client.post(`/v1/threads/${t}/labels`, { name: "Unused" });
    const agenda = (await client.get(`/v1/today`)).json();
    const found = agenda.today.find((r: { id: string }) => r.id === ferry);
    expect(found.labels).toEqual([a.id]);
    expect(agenda.threadLabels).toEqual([{ id: a.id, name: "Istanbul", colour: 1 }]);
    void sql;
  });
});
