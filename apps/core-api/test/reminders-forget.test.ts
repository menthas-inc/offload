// 042 E4: a send that named a memory goes when the memory is forgotten, as a
// record naming another member's words goes when they leave. (AC-23, OFF-1)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { record } from "../src/notifications/activity.js";
import { forget } from "../src/memories/store.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { sql } from "kysely";
import { account, memory, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(wipe);

describe("forgetting a memory", () => {
  it("deletes the records whose words named it once it is purged, and leaves the rest", async () => {
    const me = await account();
    const meera = await memory(me, "Meera's birthday is 30 November.");
    const sam = await memory(me, "Sam's birthday is 1 December.");
    await record(me, { kind: "digest", sent: true, title: "One coming up", body: "Meera's birthday on 30 November.", send: "morning", memories: [meera] });
    await record(me, { kind: "digest", sent: true, title: "One coming up", body: "Sam's birthday on 1 December.", send: "morning", memories: [sam] });
    await record(me, { kind: "digest", sent: true, title: "One today", body: "Pay the rent.", send: "morning" });
    await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: null, memoryId: meera }));
    // Once its Undo has passed (the review of 2026-10-10 moved this from the
    // forget, which can still be undone, to the purge).
    await db.updateTable("notes").set({ purge_after: sql<Date>`now() - interval '1 minute'` }).where("id", "=", meera).execute();
    await handlers["content.purge"]!({}, { mailer: new MemoryMailer() }, null);
    const left = await db.selectFrom("activity").select("body").where("account_id", "=", me).orderBy("body").execute();
    expect(left.map((row) => row.body)).toEqual(["Pay the rent.", "Sam's birthday on 1 December."]);
  });
});
