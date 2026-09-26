// 025. `#` in the composer, as the server sees it.
//
// AC-6  a pick is the person's, decided by the route.
// AC-14 a pick travels as an id, a new one as a name; the server resolves both
//       against the thread the rows landed in, and undoing the turn takes off
//       what it applied and deletes a label it made that nothing else carries.
// AC-15 a #word sent from Today is applied by name where the dump was filed.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { takeDump, undoTurn } from "../src/routes/dumps.js";
import { contentLabelsFor, createLabel, labelsOfThread } from "../src/threads/labels.js";
import { account, row, thread, wipe } from "./labels-kit.js";

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

const usage = { model: "claude-sonnet-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, costMicros: 0, latencyMs: 1 };

/** The turn the worker would run: its job, a row it filed, its result. */
async function fileAndFinish(accountId: string, messageId: string, threadId: string, title: string) {
  const job = await db
    .selectFrom("jobs")
    .select("id")
    .where("kind", "=", "dump.answer")
    .where(sql<boolean>`payload->>'messageId' = ${messageId}`)
    .executeTakeFirstOrThrow();
  await db.updateTable("jobs").set({ state: "running", locked_at: new Date(), locked_by: "test" }).where("id", "=", job.id).execute();
  const filed = await row(accountId, threadId, title, { derived_from_message_id: messageId });
  const response = await app.inject({
    method: "POST",
    url: "/internal/v1/turn-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: { outcome: "answered", jobId: job.id, usage: [usage] },
  });
  expect(response.statusCode).toBe(200);
  return filed;
}

describe("a # pick on a thread (AC-6, AC-14)", () => {
  it("applies a picked label and makes a new one, as the person's", async () => {
    const me = await account();
    const t = await thread(me);
    const istanbul = await createLabel(db, { accountId: me, via: "person" }, t, { name: "Istanbul" });
    const sent = await takeDump(me, "ferry on tuesday #Istanbul #Boats", undefined, t, undefined, null, [], [
      { id: istanbul.id },
      { name: "Boats" },
    ]);
    const ferry = await fileAndFinish(me, sent.messageId, t, "Ferry on Tuesday");

    const labels = await labelsOfThread(t);
    expect(labels.map((l) => [l.name, l.count])).toEqual([["Istanbul", 1], ["Boats", 1]]);
    expect((await contentLabelsFor([ferry])).get(ferry)).toEqual(labels.map((l) => l.id));
    const joins = await db.selectFrom("content_labels").select("set_by").where("content_id", "=", ferry).execute();
    expect(joins.every((j) => j.set_by === "person")).toBe(true);
    const made = await db.selectFrom("labels").select(["set_by", "created_by"]).where("name", "=", "Boats").executeTakeFirstOrThrow();
    expect(made).toEqual({ set_by: "person", created_by: me });
  });

  it("drops a pick from another thread rather than applying it", async () => {
    const me = await account();
    const t = await thread(me);
    const other = await thread(me, "Other");
    const foreign = await createLabel(db, { accountId: me, via: "person" }, other, { name: "Elsewhere" });
    const sent = await takeDump(me, "ferry #Elsewhere", undefined, t, undefined, null, [], [{ id: foreign.id }]);
    const ferry = await fileAndFinish(me, sent.messageId, t, "Ferry");
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    expect(await db.selectFrom("content_labels").selectAll().execute()).toHaveLength(0);
  });

  it("undoing the turn takes the labels off and deletes the one it made", async () => {
    const me = await account();
    const t = await thread(me);
    const istanbul = await createLabel(db, { accountId: me, via: "person" }, t, { name: "Istanbul" });
    const sent = await takeDump(me, "ferry #Istanbul #Boats", undefined, t, undefined, null, [], [{ id: istanbul.id }, { name: "Boats" }]);
    await fileAndFinish(me, sent.messageId, t, "Ferry");

    await undoTurn(me, sent.turnId);
    const labels = await labelsOfThread(t);
    expect(labels.map((l) => [l.name, l.count])).toEqual([["Istanbul", 0]]);
    const boats = await db.selectFrom("labels").select(["deleted_at", "deleted_by_person"]).where("name", "=", "Boats").executeTakeFirstOrThrow();
    expect(boats.deleted_at).not.toBeNull();
    expect(boats.deleted_by_person).toBe(false);
  });
});

describe("a #word from Today (AC-15)", () => {
  it("is applied by name in the thread the dump was filed into, made if missing", async () => {
    const me = await account();
    const t = await thread(me);
    await createLabel(db, { accountId: me, via: "person" }, t, { name: "Istanbul" });
    const sent = await takeDump(me, "ferry on tuesday #istanbul and #Boats, not a#tag or #3", undefined, undefined, undefined, null, []);
    const ferry = await fileAndFinish(me, sent.messageId, t, "Ferry on Tuesday");
    const labels = await labelsOfThread(t);
    expect(labels.map((l) => [l.name, l.count])).toEqual([["Istanbul", 1], ["Boats", 1]]);
    expect((await contentLabelsFor([ferry])).get(ferry)).toHaveLength(2);
  });

  it("applies nothing when the thread is full and the name is new", async () => {
    const me = await account();
    const t = await thread(me);
    for (let i = 1; i <= 10; i++) await createLabel(db, { accountId: me, via: "person" }, t, { name: `L${i}` });
    const sent = await takeDump(me, "ferry #Boats", undefined, undefined, undefined, null, []);
    const ferry = await fileAndFinish(me, sent.messageId, t, "Ferry");
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    expect((await labelsOfThread(t)).map((l) => l.name)).not.toContain("Boats");
  });
});
