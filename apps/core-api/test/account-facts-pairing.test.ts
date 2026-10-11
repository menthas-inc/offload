import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { accountFacts } from "../src/search/read.js";
import { owner, thread, wipe } from "./loose-kit.js";

// Found by the swarm tuning run, 2026-10-10. Since 019 where a calendar
// files is the thread's pick, and account_facts said only the calendar
// names, so "which thread files into Team" had no answer the model could
// read: the eval's stub was leaking a field the product no longer sent, and
// 12 of 14 pairing cases passed on the leak.
await migrate(() => {});
afterAll(closeDb);
beforeEach(wipe);

describe("account facts say where each approved calendar files", () => {
  it("names the threads that pick a calendar, as the model is shown them, and none for one nobody picked", async () => {
    const { me, loose } = await owner();
    const studio = await thread(me, "Studio");
    const connection = await db
      .insertInto("connector_connections")
      .values({ account_id: me, provider: "google", external_account_email: "jo@g.com" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const [team, holidays] = await db
      .insertInto("connector_calendars")
      .values([
        { connection_id: connection.id, external_id: "team", summary: "Team", access_role: "owner", is_primary: false, selected: true },
        { connection_id: connection.id, external_id: "hol", summary: "Holidays", access_role: "reader", is_primary: false, selected: true },
      ])
      .returning("id")
      .execute();
    expect(holidays).toBeDefined();
    await db
      .insertInto("thread_calendars")
      .values([
        { thread_id: studio, calendar_id: team!.id, account_id: me },
        { thread_id: loose, calendar_id: team!.id, account_id: me },
      ])
      .execute();

    const facts = await accountFacts(me);

    expect(facts.calendars).toEqual([
      { name: "Holidays", threads: [] },
      { name: "Team", threads: ["Studio", "not in a thread"] },
    ]);
    expect(JSON.stringify(facts)).not.toContain("Miscellaneous");
  });

  it("does not list another member's pick as this account's", async () => {
    const { me } = await owner();
    const { me: other } = await owner();
    const theirs = await thread(other, "Theirs");
    const connection = await db
      .insertInto("connector_connections")
      .values({ account_id: me, provider: "google", external_account_email: "jo@g.com" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const cal = await db
      .insertInto("connector_calendars")
      .values({ connection_id: connection.id, external_id: "team", summary: "Team", access_role: "owner", is_primary: false, selected: true })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("thread_calendars").values({ thread_id: theirs, calendar_id: cal.id, account_id: other }).execute();

    expect((await accountFacts(me)).calendars).toEqual([{ name: "Team", threads: [] }]);
  });
});
