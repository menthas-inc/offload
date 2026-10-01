// 026. What a mail turn writes to remember is marked as somebody else's words
// (AC-12), decided from the stored message and never from the job's payload.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, dump, thread, tool, wipe } from "./labels-kit.js";

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

async function note(mail: boolean, payloadSays?: boolean) {
  const me = await account();
  const t = await thread(me, "Health");
  const { jobId, messageId } = await dump(me, "Dentist, Tuesday 15:00");
  if (mail) {
    await db.updateTable("messages").set({ source: "mail", attrs: JSON.stringify({ mail: { noteLength: 0 } }) }).where("id", "=", messageId).execute();
  }
  if (payloadSays !== undefined) {
    await db.updateTable("jobs").set({ payload: sql`payload || ${JSON.stringify({ sawMail: payloadSays })}::jsonb` }).where("id", "=", jobId).execute();
  }
  const res = await tool(app, { tool: "add_note", jobId, toolCallId: "n1", threadId: t, text: "Sees the dentist on Tuesdays" });
  expect(res.statusCode).toBe(200);
  const row = await db.selectFrom("notes").select("derived_from_untrusted").where("account_id", "=", me).executeTakeFirstOrThrow();
  return row.derived_from_untrusted;
}

describe("a mail turn's notes (AC-12)", () => {
  it("marks a note a mail turn writes", async () => {
    expect(await note(true)).toBe(true);
  });

  it("leaves a typed dump's note unmarked", async () => {
    expect(await note(false)).toBe(false);
  });

  it("reads the message, not the payload", async () => {
    expect(await note(true, false)).toBe(true);
    expect(await note(false, true)).toBe(false);
  });
});
