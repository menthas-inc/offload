// 028, the model's side. T1.12 a filing into the default thread may carry a
// suggested thread; T1.13 a row 018 asks about carries none; T1.6 labels skip
// the default thread; T2.1 server side, a tool result never names it.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { storeQuestions } from "../src/questions.js";
import { sortableThreads } from "../src/jobs/handlers.js";
import { accountFacts, listContent } from "../src/search/read.js";
import { account, dump, join, moveSuggestion, owner, row, thread, tool, wipe } from "./loose-kit.js";

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

const suggestions = () => db.selectFrom("suggestions").select(["kind", "content_id", "note_id", "thread_id"]).execute();

async function file(jobId: string, threadId: string, extra: Record<string, unknown> = {}) {
  return tool(app, { tool: "add_content", jobId, toolCallId: `c${Math.random()}`, threadId, title: "Boiler service receipt", type: "image", ...extra });
}

describe("a suggested thread at filing time (T1.12, AC-16, AC-17)", () => {
  it("is written when the row lands in the default thread", async () => {
    const { me, loose } = await owner();
    const flat = await thread(me, "Flat admin");
    const { jobId } = await dump(me);
    const response = await file(jobId, loose, { suggestThreadId: flat });
    expect(response.json().ok).toBe(true);
    const contentId = response.json().contentId as string;
    expect(await suggestions()).toEqual([{ kind: "move", content_id: contentId, note_id: null, thread_id: flat }]);
  });

  it("is written on a note the same way", async () => {
    const { me, loose } = await owner();
    const flat = await thread(me, "Flat admin");
    const { jobId } = await dump(me);
    const response = await tool(app, { tool: "add_note", jobId, toolCallId: "n1", threadId: loose, text: "Boiler is a Vaillant", suggestThreadId: flat });
    expect(response.json().ok).toBe(true);
    const [s] = await suggestions();
    expect(s).toMatchObject({ kind: "move", content_id: null, thread_id: flat });
  });

  it("is ignored, and the filing still lands, for every case it must not be written", async () => {
    const { me, loose } = await owner();
    const sam = await account("Sam Ibekwe");
    const flat = await thread(me, "Flat admin");
    const gone = await thread(me, "Gone");
    await db.updateTable("threads").set({ deleted_at: new Date() }).where("id", "=", gone).execute();
    const theirs = await thread(sam, "Sam's");
    const left = await thread(me, "Left");
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", left).execute();
    const { jobId } = await dump(me);

    for (const [threadId, suggested] of [
      [flat, flat],
      [flat, loose],
      [loose, loose],
      [loose, gone],
      [loose, theirs],
      [loose, left],
    ] as const) {
      const response = await file(jobId, threadId, { suggestThreadId: suggested });
      expect(response.json().ok, `${threadId} ${suggested}`).toBe(true);
    }
    expect(await suggestions()).toEqual([]);
  });

  it("is ignored on a turn that read a calendar", async () => {
    const { me, loose } = await owner();
    const flat = await thread(me, "Flat admin");
    const { jobId } = await dump(me);
    await db.updateTable("jobs").set({ payload: sql`payload || '{"sawApps": true}'::jsonb` }).where("id", "=", jobId).execute();
    expect((await file(jobId, loose, { suggestThreadId: flat })).json().ok).toBe(true);
    expect(await suggestions()).toEqual([]);
  });

  it("is ignored on a forwarded email's turn", async () => {
    const { me, loose } = await owner();
    const flat = await thread(me, "Flat admin");
    const { jobId, messageId } = await dump(me);
    await db.updateTable("messages").set({ source: "mail" }).where("id", "=", messageId).execute();
    expect((await file(jobId, loose, { suggestThreadId: flat })).json().ok).toBe(true);
    expect(await suggestions()).toEqual([]);
  });

  it("may name a shared thread", async () => {
    const { me, loose } = await owner();
    const sam = await account("Sam Ibekwe");
    const flat = await thread(me, "Flat admin");
    await join(flat, sam);
    const { jobId } = await dump(me);
    await file(jobId, loose, { suggestThreadId: flat });
    expect(await suggestions()).toHaveLength(1);
  });
});

describe("018's question (T1.13, AC-30)", () => {
  it("takes the suggestion off the row it asks about", async () => {
    const { me, loose } = await owner();
    const flat = await thread(me, "Flat admin");
    const { messageId, conversationId, turnId } = await dump(me);
    const r = await row(me, loose, "A photo", { type: "image" });
    await moveSuggestion(me, { contentId: r }, flat);
    await db.transaction().execute((trx) =>
      storeQuestions(
        trx,
        [{ field: "thread", text: "Which thread does this go in?", options: [], targetContentId: r, targetNoteId: null }] as never,
        { accountId: me, conversationId, messageId, turnId, derivedFromUntrusted: false }
      )
    );
    expect(await suggestions()).toEqual([]);
  });
});

describe("labels (T1.6, AC-5)", () => {
  it("label nothing in the default thread, without an error", async () => {
    const { me, loose } = await owner();
    const { jobId, messageId } = await dump(me, "receipts");
    const r = await row(me, loose, "Boiler receipt", { derived_from_message_id: messageId });
    const response = await tool(app, { tool: "label_content", jobId, toolCallId: "l1", contentIds: [r], add: [], new: ["receipts"], remove: [] });
    expect(response.json().ok).toBe(true);
    expect(await db.selectFrom("labels").select("id").where("thread_id", "=", loose).execute()).toEqual([]);
    expect(await db.selectFrom("content_labels").select("label_id").where("content_id", "=", r).execute()).toEqual([]);
  });
});

describe("the nightly sort (T1.6, AC-5)", () => {
  it("never takes the default thread", async () => {
    const { me, loose } = await owner();
    for (let i = 0; i < 12; i += 1) await row(me, loose, `Loose ${i}`);
    expect(await sortableThreads(me)).toEqual([]);
  });
});

describe("the model never reads the stored name (T2.1, AC-29)", () => {
  it("a loose filing's result says not in a thread", async () => {
    const { me, loose } = await owner();
    const { jobId } = await dump(me);
    const result = (await file(jobId, loose)).json() as { threadName: string };
    expect(result.threadName).toBe("not in a thread");
    const note = (await tool(app, { tool: "add_note", jobId, toolCallId: "n1", threadId: loose, text: "Ana's shoe size is 38" })).json() as { threadName: string };
    expect(note.threadName).toBe("not in a thread");
  });

  it("nor does a read or the account's facts", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "Renew passport");
    expect((await accountFacts(me)).defaultThread).toEqual({ id: loose, name: "not in a thread" });
    const listed = await listContent(me, { threadId: loose });
    expect(JSON.stringify(listed)).not.toContain("Miscellaneous");
    expect(listed?.threadName).toBe("not in a thread");
  });
});
