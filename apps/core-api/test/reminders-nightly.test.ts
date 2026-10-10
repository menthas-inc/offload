// 042 D2 and D4: the nightly result carries labels, and the daily run books a
// pass for a member who holds a thing no pass has labelled. (AC-1, AC-6, SEC-2)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { account, note, row, thread, wipe } from "./reminders-kit.js";

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

const SOON = "2099-11-12";

async function job(accountId: string, threadId: string): Promise<string> {
  const inserted = await db
    .insertInto("jobs")
    .values({
      kind: "thread.nightly",
      account_id: accountId,
      payload: JSON.stringify({ threadId, propose: false }),
      priority: 200,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

const post = (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/nightly-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: { supersede: [], remove: [], add: [], learned: [], sent: [], groups: [], ...payload },
  });

const labels = () => db.selectFrom("reminder_labels").select(["content_id", "note_id", "kind", "lead", "anchor_note_id", "name"]).execute();

describe("the nightly result carries labels", () => {
  it("applies them for the job's member and thread, with what it was shown", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: SOON });
    const visa = await row(me, t, "Get the visa", {}, { created_at: new Date() });
    const receipt = await row(me, t, "Receipt from the plumber", { day: SOON });
    const response = await post({
      jobId: await job(me, t),
      labels: [
        { id: trip, of: "note", kind: "trip", lead: "weeks", name: "Lisbon" },
        { id: visa, of: "content", kind: "deadline", lead: "months", before: { id: trip, of: "note" } },
      ],
      labelShown: [
        { id: trip, of: "note" },
        { id: visa, of: "content" },
        { id: receipt, of: "content" },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ labelled: 3, labelsIgnored: 0 });
    const byThing = new Map((await labels()).map((l) => [l.content_id ?? l.note_id, l]));
    expect(byThing.get(trip)).toMatchObject({ kind: "trip", lead: "weeks", name: "Lisbon" });
    expect(byThing.get(visa)).toMatchObject({ kind: "deadline", lead: "months", anchor_note_id: trip });
    expect(byThing.get(receipt)).toMatchObject({ kind: "none", lead: "none" });
  });

  it("refuses a kind outside the seven, and a label for somebody else's thing does nothing", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const hers = await row(ana, t, "Ana's party", { day: SOON });
    const bad = await post({ jobId: await job(me, t), labels: [{ id: hers, of: "content", kind: "alarm", lead: "none" }] });
    expect(bad.statusCode).toBe(400);
    const ok = await post({ jobId: await job(me, t), labels: [{ id: hers, of: "content", kind: "appointment", lead: "none" }] });
    expect(ok.json()).toMatchObject({ labelled: 0, labelsIgnored: 1 });
    expect(await labels()).toEqual([]);
  });

  it("a member taken out since the booking labels nothing", async () => {
    const me = await account();
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    const pass = await job(me, t);
    await db.updateTable("thread_members").set({ state: "left" } as never).where("account_id", "=", me).execute();
    await post({ jobId: pass, labels: [{ id: rent, of: "content", kind: "deadline", lead: "days" }] });
    expect(await labels()).toEqual([]);
  });
});

describe("the daily run books a pass for a thing no pass has labelled", () => {
  const passes = (me: string) =>
    db.selectFrom("jobs").select(["payload"]).where("kind", "=", "thread.nightly").where("account_id", "=", me).execute();

  it("in a thread with nothing else new", async () => {
    const me = await account();
    const t = await thread([me]);
    await db.updateTable("thread_members").set({ nightly_at: new Date() }).where("account_id", "=", me).execute();
    await row(me, t, "Dentist", { at: new Date("2099-11-12T15:00:00Z") }, { type: "event" });
    await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
    expect((await passes(me)).map((p) => (p.payload as { threadId: string }).threadId)).toEqual([t]);
  });

  it("and not once it is labelled", async () => {
    const me = await account();
    const t = await thread([me]);
    await db.updateTable("thread_members").set({ nightly_at: new Date() }).where("account_id", "=", me).execute();
    const dentist = await row(me, t, "Dentist", { at: new Date("2099-11-12T15:00:00Z") }, { type: "event" });
    await db
      .insertInto("reminder_labels")
      .values({ account_id: me, content_id: dentist, kind: "appointment", lead: "none", fingerprint: sql<string>`(select content_fingerprint(c) from content c where c.id = ${dentist})` } as never)
      .execute();
    await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
    expect(await passes(me)).toEqual([]);
  });

  it("wakes a quiet account whose only change is a dated row nobody labelled", async () => {
    const me = await account();
    const t = await thread([me]);
    await db.updateTable("threads").set({ last_activity_at: sql<Date>`now() - interval '10 days'` }).where("id", "=", t).execute();
    await row(me, t, "Renew the passport", { day: SOON });
    await handlers["account.daily"]!({}, { mailer: new MemoryMailer() }, null);
    const runs = await db.selectFrom("jobs").select("account_id").where("kind", "=", "account.daily.run").execute();
    expect(runs.map((r) => r.account_id)).toContain(me);
  });
});
