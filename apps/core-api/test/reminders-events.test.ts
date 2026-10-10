// 042 E5: what analytics hears about reminders: counts, windows and enums,
// under the pseudonym, never a title, a name, a date or an account id.
// (AC-16, OFF-1)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { runDigest } from "../src/notifications/digest.js";
import { MemoryPush, push } from "../src/notifications/push.js";
import { account, label, memory, note, row, thread, token, wipe } from "./reminders-kit.js";

await migrate(() => {});
let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await wipe();
  (push() as MemoryPush).sent.length = 0;
});

const events = () => db.selectFrom("analytics_events").select(["name", "subject_id", "properties"]).execute();

function clean(properties: unknown, accountId: string): void {
  const text = JSON.stringify(properties);
  expect(text).not.toContain(accountId);
  expect(text).not.toMatch(/Meera|Lisbon|birthday|\d{4}-\d{2}-\d{2}/);
}

describe("reminder events", () => {
  it("a send says how many by window, under the pseudonym", async () => {
    const me = await account();
    await token(me);
    const meera = await memory(me, "Meera's birthday is 30 November.");
    await label(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "11-30", name: "Meera's birthday", labelled_at: new Date("2026-06-01T00:00:00Z") });
    await runDigest(me, "morning", "2026-11-02", new Date("2026-11-02T08:00:00Z"), new Date("2026-11-02T08:00:00Z"));
    const sent = (await events()).filter((one) => one.name === "reminder_sent");
    expect(sent).toHaveLength(1);
    const subject = (await db.selectFrom("accounts").select("analytics_subject_id").where("id", "=", me).executeTakeFirstOrThrow()).analytics_subject_id;
    expect(sent[0]!.subject_id).toBe(subject);
    expect(sent[0]!.properties).toEqual({ via: "morning", long: 1, short: 0, day: 0 });
    clean(sent[0]!.properties, me);
  });

  it("a pass says how many it labelled, and nothing about what", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2099-11-12" });
    await row(me, t, "Receipt", { day: "2099-11-12" });
    const job = await db
      .insertInto("jobs")
      .values({ kind: "thread.nightly", account_id: me, payload: JSON.stringify({ threadId: t, propose: false }), priority: 200, run_after: new Date(), state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    await app.inject({
      method: "POST",
      url: "/internal/v1/nightly-result",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { jobId: job.id, supersede: [], remove: [], add: [], learned: [], sent: [], groups: [], labels: [{ id: trip, of: "note", kind: "trip", lead: "weeks", name: "Lisbon" }] },
    });
    const labelled = (await events()).filter((one) => one.name === "reminders_labelled");
    expect(labelled).toHaveLength(1);
    expect(labelled[0]!.properties).toEqual({ labelled: 1, ignored: 0 });
    clean(labelled[0]!.properties, me);
  });
});
