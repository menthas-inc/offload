// 042 D3 and D4: a memory that states a date that comes round every year
// carries it, and a memory no pass has dated books the memory pass. (AC-4,
// AC-5, AC-6)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { passOwed } from "../src/memories/pass.js";
import { memoriesToDate } from "../src/notifications/labels.js";
import { account, label, memory, wipe } from "./reminders-kit.js";

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

async function job(accountId: string): Promise<string> {
  const inserted = await db
    .insertInto("jobs")
    .values({ kind: "account.memories", account_id: accountId, payload: "{}", priority: 200, run_after: new Date(), state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

const post = (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/memory-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: { add: [], supersede: [], fold: [], ...payload },
  });

const labels = () => db.selectFrom("reminder_labels").select(["note_id", "kind", "lead", "yearly_on", "name"]).execute();

describe("which memories a pass may date", () => {
  it("People and About, active, with no label or changed words", async () => {
    const me = await account();
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const own = await memory(me, "Their birthday is 2 May.", "about");
    await memory(me, "Home is in Toronto.", "things");
    const dated = await memory(me, "Mum's birthday is 3 June.");
    await label(me, { noteId: dated }, { kind: "occasion", lead: "weeks", fingerprint: "stale" });
    const done = await memory(me, "Sam's birthday is 1 July.");
    const { sql } = await import("kysely");
    await label(me, { noteId: done }, { kind: "occasion", lead: "none", fingerprint: sql<string>`(select note_fingerprint(n) from notes n where n.id = ${done})` });
    const forgotten = await memory(me, "Leo's birthday is 9 May.");
    await db.updateTable("notes").set({ deleted_at: new Date() }).where("id", "=", forgotten).execute();
    expect((await memoriesToDate(db, me)).map((m) => m.id).sort()).toEqual([meera, own, dated].sort());
    expect(await passOwed(db, me)).toBe(true);
  });
});

describe("the memory result carries dates", () => {
  it("writes the month and day, the lead and a name that is a run of the memory, as an occasion", async () => {
    const me = await account();
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const colleague = await memory(me, "Ravi from work has his birthday on 2 April.");
    const own = await memory(me, "Their birthday is 2 May.", "about");
    const response = await post({
      jobId: await job(me),
      dates: [
        { id: meera, on: "03-14", lead: "weeks", name: "Meera's birthday" },
        { id: colleague, on: "04-02", lead: "none", name: "Ravi's birthday" },
      ],
      dateShown: [meera, colleague, own],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dated: 3, datesIgnored: 0 });
    const byNote = new Map((await labels()).map((l) => [l.note_id, l]));
    expect(byNote.get(meera)).toEqual({ note_id: meera, kind: "occasion", lead: "weeks", yearly_on: "03-14", name: "Meera's birthday" });
    // Not a run of its words: kept without a name, and named by its text.
    expect(byNote.get(colleague)).toMatchObject({ kind: "occasion", lead: "none", yearly_on: "04-02", name: null });
    expect(byNote.get(own)).toMatchObject({ kind: "none", lead: "none", yearly_on: null });
    expect(await passOwed(db, me)).toBe(false);
  });

  it("refuses a day that does not exist, and ignores a memory it may not date", async () => {
    const me = await account();
    const other = await account();
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const theirs = await memory(other, "Ana's birthday is 1 May.");
    expect((await post({ jobId: await job(me), dates: [{ id: meera, on: "02-30", lead: "weeks", name: "Meera's birthday" }] })).statusCode).toBe(400);
    const response = await post({ jobId: await job(me), dates: [{ id: theirs, on: "05-01", lead: "none", name: "Ana's birthday" }] });
    expect(response.json()).toMatchObject({ dated: 0, datesIgnored: 1 });
    expect(await labels()).toEqual([]);
  });
});
