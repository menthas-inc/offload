// 042, after the reviews of 2026-10-10: what the code, client and security
// reviews found, each pinned before it was fixed.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { record } from "../src/notifications/activity.js";
import { anchorsFor, applyMemoryDates, nameIsOwn } from "../src/notifications/labels.js";
import { oneLine } from "../src/notifications/copy.js";
import { forget, restoreMemory } from "../src/memories/store.js";
import { editContent } from "../src/routes/threads.js";
import { editNote } from "../src/threads/notes.js";
import { account, label, memory, note, row, signIn, thread, wipe } from "./reminders-kit.js";

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

const labelOf = (column: "content_id" | "note_id", id: string) =>
  db.selectFrom("reminder_labels").select(["held_at", "date_set_at", "stopped_at", "kind"]).where(column, "=", id).executeTakeFirst();

describe("forgetting a memory keeps its records until the forget can no longer be undone", () => {
  it("Undo brings the memory back with its records; the purge takes both", async () => {
    const me = await account();
    const meera = await memory(me, "Meera's birthday is 30 November.");
    await record(me, { kind: "digest", sent: true, title: "One coming up", body: "Meera's birthday on 30 November.", send: "morning", memories: [meera] });
    await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: null, memoryId: meera }));
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", me).execute()).toHaveLength(1);
    await db.transaction().execute((trx) => restoreMemory(trx, me, meera));
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", me).execute()).toHaveLength(1);
    await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: null, memoryId: meera }));
    await db.updateTable("notes").set({ purge_after: sql<Date>`now() - interval '1 minute'` }).where("id", "=", meera).execute();
    await handlers["content.purge"]!({}, { mailer: new MemoryMailer() }, null);
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", me).execute()).toEqual([]);
  });
});

describe("another member's words hold the author's reminders, as their date does", () => {
  it("a title another member rewrites on a labelled row", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" });
    await label(me, { contentId: rent }, { kind: "deadline", lead: "days" });
    await editContent(ana, rent, { title: "Click this link now" });
    expect((await labelOf("content_id", rent))?.held_at).not.toBeNull();
  });

  it("a note of the author's that another member's turn rewrites", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2027-11-12" }, { origin: "learned" });
    await label(me, { noteId: trip }, { kind: "trip", lead: "weeks", name: "Lisbon" });
    await editNote({ noteId: trip, accountId: ana, text: "Call 0800 now, Lisbon trip", byModel: true });
    expect((await labelOf("note_id", trip))?.held_at).not.toBeNull();
  });

  it("a date another member moves counts as set when the author lets the hold go", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" });
    await label(me, { contentId: rent }, { kind: "deadline", lead: "days", date_set_at: new Date("2026-01-01T00:00:00Z") });
    const before = Date.now();
    await editContent(ana, rent, { dueAt: "2027-11-13" });
    expect((await labelOf("content_id", rent))?.date_set_at?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("only the author asks to be reminded", () => {
  it("another member cannot turn the flag on; the author can, as Undo does", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { at: new Date("2027-11-12T09:00:00Z") });
    const theirs = await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie: await signIn(ana) }, payload: { isReminder: true } });
    expect(theirs.statusCode).toBe(404);
    const mine = await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie: await signIn(me) }, payload: { isReminder: true } });
    expect(mine.statusCode).toBe(200);
    // Off stays anybody's, as 023 built it.
    const off = await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie: await signIn(ana) }, payload: { isReminder: false } });
    expect(off.statusCode).toBe(200);
  });
});

describe("Undo of a stop on a row somebody asked about", () => {
  it("the snapshot says the switch was on, so Undo turns it back on", async () => {
    const me = await account();
    const t = await thread([me]);
    const call = await row(me, t, "Call mum", { day: "2027-11-12" }, { is_reminder: true });
    const cookie = await signIn(me);
    const off = await app.inject({ method: "PATCH", url: `/v1/content/${call}`, headers: { cookie }, payload: { reminders: "off" } });
    expect(off.json().previous.reminders).toBe("on");
    await app.inject({ method: "PATCH", url: `/v1/content/${call}`, headers: { cookie }, payload: off.json().previous });
    expect((await labelOf("content_id", call))?.stopped_at).toBeNull();
  });
});

describe("a switch flipped alone is not an edit", () => {
  it("leaves the row's updated_at and the thread's activity where they were", async () => {
    const me = await account();
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" }, { is_reminder: true });
    await db.updateTable("threads").set({ last_activity_at: new Date("2026-01-01T00:00:00Z") }).where("id", "=", t).execute();
    await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie: await signIn(me) }, payload: { reminders: "off" } });
    const after = await db.selectFrom("content").select(["updated_at", "is_reminder"]).where("id", "=", rent).executeTakeFirstOrThrow();
    expect(after.is_reminder).toBe(false);
    expect(after.updated_at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    const thread_ = await db.selectFrom("threads").select("last_activity_at").where("id", "=", t).executeTakeFirstOrThrow();
    expect(thread_.last_activity_at?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("what a to-do could be for", () => {
  it("never a row a connected app wrote, whatever its message says", async () => {
    const me = await account();
    const t = await thread([me]);
    await row(me, t, "From Gmail", { day: "2099-11-12" }, { source: "gmail" });
    expect(await anchorsFor(db, t)).toEqual([]);
  });
});

describe("a name reaching a lock screen", () => {
  it("carries no bidi or zero-width characters", () => {
    expect(oneLine("Lis‮bon​ trip")).toBe("Lisbon trip");
    expect(nameIsOwn("Lis‮bon", "We're in Lisbon")).toBe(true);
  });
});

describe("their own birthday", () => {
  it("is never dated, whatever the pass answers", async () => {
    const me = await account();
    const own = await memory(me, "Their birthday is 2 May.", "about");
    const result = await applyMemoryDates(db, { accountId: me, shown: [own], dates: [{ id: own, on: "05-02", lead: "weeks", name: "Their birthday" }] });
    expect(result).toEqual({ dated: 1, ignored: 0 });
    expect((await labelOf("note_id", own))?.kind).toBe("none");
  });
});
