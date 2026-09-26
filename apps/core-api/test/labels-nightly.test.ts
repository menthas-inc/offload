// 025. The nightly sort, and Undo from Activity.
//
// AC-25 its own job, once per thread per day, only on a thread whose rows
//       changed since its last sort and that holds six or more; it creates and
//       applies and nothing else, creates only below six, and reads nothing
//       for an account no longer in the thread.
// AC-26 what a person set, removed or deleted is dropped from the plan.
// AC-27 one unsent Activity row per accepted member, with the thread and the
//       sort.
// AC-28 Undo from Activity: the pressing member must still be in the thread;
//       it takes back only what the sort set and nobody touched since, marks
//       every member's row, and is refused twice or past thirty days.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { applyLabels, contentLabelsFor, createLabel, deleteLabel, labelsOfThread } from "../src/threads/labels.js";
import { account, as, join, row, signIn, thread, wipe } from "./labels-kit.js";

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

async function sixRows(me: string, t: string): Promise<[string, string, string, string, string, string]> {
  const ids: string[] = [];
  for (const title of ["Ferry", "Palace", "Hammam", "Louvre", "Orsay", "Metro"]) ids.push(await row(me, t, title));
  return ids as [string, string, string, string, string, string];
}

async function sortJobs() {
  return db.selectFrom("jobs").select(["id", "account_id", "payload"]).where("kind", "=", "labels.sort").execute();
}

async function sortJob(accountId: string, threadId: string) {
  return db
    .insertInto("jobs")
    .values({
      kind: "labels.sort",
      account_id: accountId,
      payload: JSON.stringify({ threadId }),
      priority: 1,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

const sorted = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/labels-sorted",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

describe("booking the sort (AC-25)", () => {
  it("books a changed thread of six once, and not a small or an unchanged one", async () => {
    const me = await account();
    const sam = await account("Sam");
    const big = await thread(me, "Europe");
    await join(big, sam);
    await sixRows(me, big);
    const small = await thread(me, "Small");
    await row(me, small, "One");
    const quiet = await thread(me, "Quiet");
    await sixRows(me, quiet);
    await db.updateTable("threads").set({ labels_sorted_at: sql`now() + interval '1 minute'` }).where("id", "=", quiet).execute();

    await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
    await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, sam);
    const jobs = await sortJobs();
    expect(jobs).toHaveLength(1);
    expect((jobs[0]!.payload as { threadId: string }).threadId).toBe(big);
  });
});

describe("the sort's plan (AC-25, AC-26, AC-27)", () => {
  it("makes and applies labels, records every member's Activity, stamps the thread, closes the job", async () => {
    const me = await account();
    const sam = await account("Sam");
    const t = await thread(me, "Europe, October");
    await join(t, sam);
    const [ferry, palace, , louvre] = await sixRows(me, t);
    const job = await sortJob(me, t);

    const response = await sorted({
      jobId: job.id,
      create: [
        { name: "Istanbul", contentIds: [ferry, palace] },
        { name: "Paris", contentIds: [louvre] },
      ],
      apply: [],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ created: 2, applied: 3 });

    const labels = await labelsOfThread(t);
    expect(labels.map((l) => [l.name, l.count])).toEqual([["Istanbul", 2], ["Paris", 1]]);
    const joins = await db.selectFrom("content_labels").select(["set_by", "run_id"]).execute();
    expect(joins.every((j) => j.set_by === "offload" && j.run_id !== null)).toBe(true);

    const activity = await db.selectFrom("activity").selectAll().where("kind", "=", "labelled").execute();
    expect(activity.map((a) => a.account_id).sort()).toEqual([me, sam].sort());
    expect(activity[0]!.title).toBe("Sorted Europe, October into Istanbul and Paris. Three labelled.");
    expect(activity.every((a) => !a.sent && a.thread_id === t)).toBe(true);

    const stamped = await db.selectFrom("threads").select("labels_sorted_at").where("id", "=", t).executeTakeFirstOrThrow();
    expect(stamped.labels_sorted_at).not.toBeNull();
    const closed = await db.selectFrom("jobs").select("state").where("id", "=", job.id).executeTakeFirstOrThrow();
    expect(closed.state).toBe("done");
  });

  it("drops what a person set, removed or deleted, and stops making at six", async () => {
    const me = await account();
    const t = await thread(me);
    const [ferry, palace, hammam] = await sixRows(me, t);
    const kept = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [ferry] }, [kept.id], []);
    await applyLabels(db, person(me), t, { content: [ferry] }, [], [kept.id]);
    const gone = await createLabel(db, person(me), t, { name: "Paris" });
    await deleteLabel(db, person(me), gone.id);
    for (let i = 1; i <= 5; i++) await createLabel(db, person(me), t, { name: `L${i}` });
    const job = await sortJob(me, t);

    const response = await sorted({
      jobId: job.id,
      create: [
        { name: "paris", contentIds: [palace] },
        { name: "Boats", contentIds: [ferry] },
      ],
      apply: [{ labelId: kept.id, contentIds: [ferry, hammam] }],
    });
    // Paris was deleted by a person, and with six live labels offload makes
    // no more; the applied join to ferry is a person's removal and is dropped.
    expect(response.json()).toEqual({ created: 0, applied: 1 });
    expect((await contentLabelsFor([hammam])).get(hammam)).toEqual([kept.id]);
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
  });

  it("reads and writes nothing for an account no longer in the thread", async () => {
    const me = await account();
    const sam = await account("Sam");
    const t = await thread(me);
    await join(t, sam, "removed");
    const [ferry] = await sixRows(me, t);
    const job = await sortJob(sam, t);
    const response = await sorted({ jobId: job.id, create: [{ name: "Istanbul", contentIds: [ferry] }], apply: [] });
    expect(response.json()).toEqual({ created: 0, applied: 0 });
    expect(await labelsOfThread(t)).toEqual([]);
  });

  it("does nothing for a job already done", async () => {
    const me = await account();
    const t = await thread(me);
    const [ferry] = await sixRows(me, t);
    const job = await sortJob(me, t);
    const plan = { jobId: job.id, create: [{ name: "Istanbul", contentIds: [ferry] }], apply: [] };
    await sorted(plan);
    const again = await sorted(plan);
    expect(again.json()).toEqual({ created: 0, applied: 0 });
    expect(await db.selectFrom("label_runs").select("id").execute()).toHaveLength(1);
    expect(await db.selectFrom("activity").select("id").where("kind", "=", "labelled").execute()).toHaveLength(1);
  });

  it("refuses a row from another thread in the plan", async () => {
    const me = await account();
    const t = await thread(me);
    const other = await thread(me, "Other");
    await sixRows(me, t);
    const stray = await row(me, other, "Elsewhere");
    const job = await sortJob(me, t);
    const response = await sorted({ jobId: job.id, create: [{ name: "Istanbul", contentIds: [stray] }], apply: [] });
    expect(response.json()).toEqual({ created: 0, applied: 0 });
    expect(await db.selectFrom("content_labels").selectAll().execute()).toHaveLength(0);
  });
});

describe("Undo from Activity (AC-28)", () => {
  async function sortedThread() {
    const me = await account();
    const sam = await account("Sam");
    const t = await thread(me, "Europe, October");
    await join(t, sam);
    const [ferry, palace] = await sixRows(me, t);
    const job = await sortJob(me, t);
    await sorted({ jobId: job.id, create: [{ name: "Istanbul", contentIds: [ferry, palace] }], apply: [] });
    const mine = await db.selectFrom("activity").select("id").where("account_id", "=", me).executeTakeFirstOrThrow();
    return { me, sam, t, ferry, palace, activityId: mine.id };
  }

  it("takes back the sort, marks every member's row, and lists it as undone", async () => {
    const { me, t, ferry, activityId } = await sortedThread();
    const client = as(app, await signIn(me));
    const listed = (await client.get("/v1/activity")).json().rows[0];
    expect(listed).toMatchObject({ kind: "labelled", undoable: true, undone: false });

    const response = await client.post(`/v1/activity/${activityId}/undo`);
    expect(response.statusCode).toBe(200);
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    expect(await labelsOfThread(t)).toEqual([]);
    const rows = await db.selectFrom("activity").select("undone_at").execute();
    expect(rows.every((r) => r.undone_at !== null)).toBe(true);
    expect((await client.get("/v1/activity")).json().rows[0]).toMatchObject({ undoable: false, undone: true });
    expect((await client.post(`/v1/activity/${activityId}/undo`)).statusCode).toBe(409);
  });

  it("keeps what a person touched since, and the label they now use", async () => {
    const { me, t, ferry, palace, activityId } = await sortedThread();
    const istanbul = (await labelsOfThread(t))[0]!;
    // Ana ticks palace by hand: the join is hers now.
    await applyLabels(db, person(me), t, { content: [palace] }, [istanbul.id], []);
    await as(app, await signIn(me)).post(`/v1/activity/${activityId}/undo`);
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    expect((await contentLabelsFor([palace])).get(palace)).toEqual([istanbul.id]);
    expect((await labelsOfThread(t)).map((l) => l.name)).toEqual(["Istanbul"]);
  });

  it("keeps a label a later sort still uses", async () => {
    const { me, t, ferry, activityId } = await sortedThread();
    const istanbul = (await labelsOfThread(t))[0]!;
    const hammam = await row(me, t, "Hammam two");
    const job = await sortJob(me, t);
    await sorted({ jobId: job.id, create: [], apply: [{ labelId: istanbul.id, contentIds: [hammam] }] });

    await as(app, await signIn(me)).post(`/v1/activity/${activityId}/undo`);
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    expect((await contentLabelsFor([hammam])).get(hammam)).toEqual([istanbul.id]);
    expect((await labelsOfThread(t)).map((l) => l.name)).toEqual(["Istanbul"]);
  });

  it("refuses somebody else's row, a member who left, and a row past thirty days", async () => {
    const { me, sam, t, activityId } = await sortedThread();
    const stranger = await account("Stranger");
    expect((await as(app, await signIn(stranger)).post(`/v1/activity/${activityId}/undo`)).statusCode).toBe(404);
    const samsRow = await db.selectFrom("activity").select("id").where("account_id", "=", sam).executeTakeFirstOrThrow();
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", t).where("account_id", "=", sam).execute();
    expect((await as(app, await signIn(sam)).post(`/v1/activity/${samsRow.id}/undo`)).statusCode).toBe(404);
    await db.updateTable("activity").set({ occurred_at: sql`now() - interval '31 days'` as never }).where("id", "=", activityId).execute();
    expect((await as(app, await signIn(me)).post(`/v1/activity/${activityId}/undo`)).statusCode).toBe(409);
  });
});
