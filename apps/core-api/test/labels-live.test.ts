// 025. The model's label tool, inside a live turn.
//
// AC-5  a label or row from another thread is refused.
// AC-24 apply an existing label; create one only when its name is in the
//       message's own words and the thread has fewer than six; remove one a
//       person has not set.
// AC-26 never override a person.
// AC-27 a turn that labelled anything records one unsent Activity row per
//       accepted member, with its thread and its sort.
// OFF-6 undoing the turn takes it all back.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { streamStep, undoTurn } from "../src/routes/dumps.js";
import { applyLabels, contentLabelsFor, createLabel, deleteLabel, labelsForTurns, nameInDump } from "../src/threads/labels.js";
import { account, dump, join, row, thread, tool, wipe } from "./labels-kit.js";

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

const person = (accountId: string) => ({ accountId, via: "person" as const });

describe("a name in the dump's words (AC-24)", () => {
  it("admits a name every word of which the person wrote", () => {
    expect(nameInDump("Istanbul", "ferry across the bosphorus, istanbul day two")).toBe(true);
    expect(nameInDump("Old town", "tram through the old town")).toBe(true);
    expect(nameInDump("Kadıköy", "lunch in Kadıköy")).toBe(true);
  });

  it("refuses a name the words do not hold, or hold only inside a link", () => {
    expect(nameInDump("Istanbul", "ferry across the bosphorus")).toBe(false);
    expect(nameInDump("Old town", "tram through town")).toBe(false);
    expect(nameInDump("Istanbul", "see https://example.com/istanbul/ferry")).toBe(false);
  });
});

describe("label_content (AC-5, AC-24, AC-26)", () => {
  async function turn(text = "put the ferry under istanbul") {
    const me = await account();
    const t = await thread(me);
    const ferry = await row(me, t, "Ferry");
    const { jobId, turnId } = await dump(me, text);
    return { me, t, ferry, jobId, turnId };
  }

  it("applies an existing label, as offload's, under the turn's sort", async () => {
    const { me, t, ferry, jobId, turnId } = await turn();
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    const response = await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [l.id], remove: [] });
    expect(response.json()).toEqual({ ok: true, done: true });
    const joins = await db.selectFrom("content_labels").select(["set_by", "run_id"]).where("content_id", "=", ferry).execute();
    expect(joins[0]?.set_by).toBe("offload");
    const run = await db.selectFrom("label_runs").selectAll().where("id", "=", joins[0]!.run_id!).executeTakeFirstOrThrow();
    expect(run).toMatchObject({ kind: "live", set_by: "offload", turn_id: turnId, thread_id: t });
  });

  it("makes a label the dump names, and refuses one it does not", async () => {
    const { t, ferry, jobId } = await turn("ferry on tuesday, file it under Boats");
    const named = await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [], new: ["boats"], remove: [] });
    expect(named.json()).toEqual({ ok: true, done: true });
    const made = await db.selectFrom("labels").select(["name", "set_by", "created_by"]).where("thread_id", "=", t).execute();
    expect(made).toEqual([{ name: "boats", set_by: "offload", created_by: null }]);

    const invented = await tool(app, { tool: "label_content", jobId, toolCallId: "l2", contentIds: [ferry], add: [], new: ["Istanbul"], remove: [] });
    expect(invented.json()).toEqual({ ok: false, error: "not_in_the_dump" });
  });

  it("uses a label of that name rather than making a second", async () => {
    const { me, t, ferry, jobId } = await turn("ferry, istanbul");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [], new: ["istanbul"], remove: [] });
    expect((await contentLabelsFor([ferry])).get(ferry)).toEqual([l.id]);
    expect(await db.selectFrom("labels").select("id").execute()).toHaveLength(1);
  });

  it("stops making labels at six", async () => {
    const { me, t, ferry, jobId } = await turn("ferry, boats");
    for (let i = 1; i <= 6; i++) await createLabel(db, person(me), t, { name: `L${i}` });
    const response = await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [], new: ["Boats"], remove: [] });
    expect(response.json()).toEqual({ ok: false, error: "label_limit" });
  });

  it("refuses what a person set, removed or deleted", async () => {
    const { me, t, ferry, jobId } = await turn("ferry, paris, istanbul");
    const paris = await createLabel(db, person(me), t, { name: "Paris" });
    const istanbul = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [ferry] }, [paris.id, istanbul.id], []);
    await applyLabels(db, person(me), t, { content: [ferry] }, [], [istanbul.id]);
    const off = await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [], remove: [paris.id] });
    expect(off.json()).toEqual({ ok: false, error: "person_set" });
    const back = await tool(app, { tool: "label_content", jobId, toolCallId: "l2", contentIds: [ferry], add: [istanbul.id], remove: [] });
    expect(back.json()).toEqual({ ok: false, error: "person_set" });
    await deleteLabel(db, person(me), paris.id);
    const again = await tool(app, { tool: "label_content", jobId, toolCallId: "l3", contentIds: [ferry], add: [], new: ["Paris"], remove: [] });
    expect(again.json()).toEqual({ ok: false, error: "person_deleted" });
  });

  it("refuses a label or a row from another thread", async () => {
    const { me, ferry, jobId } = await turn("ferry, elsewhere");
    const other = await thread(me, "Other");
    const foreign = await createLabel(db, person(me), other, { name: "Elsewhere" });
    const a = await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [foreign.id], remove: [] });
    expect(a.json()).toEqual({ ok: false, error: "unknown_content" });
    const stranger = await account("Stranger");
    const theirs = await thread(stranger, "Theirs");
    const theirRow = await row(stranger, theirs, "Their row");
    const b = await tool(app, { tool: "label_content", jobId, toolCallId: "l2", contentIds: [theirRow], add: [], remove: [] });
    expect(b.json()).toEqual({ ok: false, error: "unknown_content" });
  });

  it("records the turn in Activity for every member, unsent, and undoing the turn takes it back", async () => {
    const { me, t, ferry, jobId, turnId } = await turn("ferry under boats");
    const sam = await account("Sam");
    await join(t, sam);
    await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [], new: ["Boats"], remove: [] });
    const activity = await db.selectFrom("activity").selectAll().where("kind", "=", "labelled").execute();
    expect(activity.map((a) => a.account_id).sort()).toEqual([me, sam].sort());
    expect(activity.every((a) => a.sent === false && a.thread_id === t && a.label_run_id !== null)).toBe(true);
    expect(activity[0]!.title).toBe("Labelled one in Europe, October under Boats.");

    await undoTurn(me, turnId);
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    const boats = await db.selectFrom("labels").select("deleted_at").executeTakeFirstOrThrow();
    expect(boats.deleted_at).not.toBeNull();
  });
});

describe("the turn footer's marks (AC-16)", () => {
  it("names what a turn applied, in order, and nothing once it is undone", async () => {
    const me = await account();
    const t = await thread(me);
    const ferry = await row(me, t, "Ferry");
    const { jobId, turnId, messageId } = await dump(me, "ferry, paris then boats");
    const paris = await createLabel(db, person(me), t, { name: "Paris" });
    await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [ferry], add: [paris.id], remove: [] });
    await tool(app, { tool: "label_content", jobId, toolCallId: "l2", contentIds: [ferry], add: [], new: ["Boats"], remove: [] });

    const footer = (await labelsForTurns([turnId], me)).get(turnId);
    expect(footer?.map((l) => [l.name, l.colour])).toEqual([["Paris", 1], ["Boats", 2]]);

    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
    const step = await streamStep(messageId, me);
    expect(step.do === "answered" && step.labels.map((l) => l.name)).toEqual(["Paris", "Boats"]);

    const stranger = await account("Stranger");
    expect((await labelsForTurns([turnId], stranger)).get(turnId)).toBeUndefined();

    await undoTurn(me, turnId);
    expect((await labelsForTurns([turnId], me)).get(turnId)).toBeUndefined();
  });
});

describe("the shared cases the eval stub reads too (AC-24)", () => {
  it("agrees with every case in the fixture", async () => {
    const { readFileSync } = await import("node:fs");
    const fixture = JSON.parse(
      readFileSync(new URL("../../agent/evals/fixtures/label-names.json", import.meta.url), "utf8"),
    ) as { cases: { name: string; text: string; ok: boolean }[] };
    for (const c of fixture.cases) expect([c.name, c.text, nameInDump(c.name, c.text)]).toEqual([c.name, c.text, c.ok]);
  });
});
