// 028 T1.1. What the database itself holds a suggestion and a proposal to.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createSuggestion, moveSuggestion, note, owner, proposal, row, thread, wipe } from "./loose-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(wipe);

describe("suggestions (AC-17, AC-23)", () => {
  it("refuses a suggestion with both targets or with neither", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const r = await row(me, loose, "Boiler receipt");
    const n = await note(me, loose, "Ana's shoe size is 38");
    await expect(moveSuggestion(me, { contentId: r, noteId: n }, home)).rejects.toThrow();
    await expect(moveSuggestion(me, {}, home)).rejects.toThrow();
  });

  it("refuses a move without a thread and a create without a proposal", async () => {
    const { me, loose } = await owner();
    const r = await row(me, loose, "Boiler receipt");
    await expect(
      db.insertInto("suggestions").values({ account_id: me, content_id: r, kind: "move" }).execute()
    ).rejects.toThrow();
    await expect(
      db.insertInto("suggestions").values({ account_id: me, content_id: r, kind: "create" }).execute()
    ).rejects.toThrow();
  });

  it("refuses a second suggestion on the same row or note", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const r = await row(me, loose, "Boiler receipt");
    const n = await note(me, loose, "Ana's shoe size is 38");
    await moveSuggestion(me, { contentId: r }, home);
    await moveSuggestion(me, { noteId: n }, home);
    await expect(moveSuggestion(me, { contentId: r }, home)).rejects.toThrow(/suggestions_content_idx/);
    await expect(moveSuggestion(me, { noteId: n }, home)).rejects.toThrow(/suggestions_note_idx/);
  });

  it("goes with the row, the note, the thread, the proposal and the account", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const a = await row(me, loose, "A");
    const b = await row(me, loose, "B");
    const c = await row(me, loose, "C");
    const n = await note(me, loose, "A note");
    const p = await proposal(me);
    const sa = await moveSuggestion(me, { contentId: a }, home);
    const sn = await moveSuggestion(me, { noteId: n }, loose);
    const sb = await createSuggestion(me, { contentId: b }, p);
    const sc = await moveSuggestion(me, { contentId: c }, home);
    const left = async (id: string) => (await db.selectFrom("suggestions").select("id").where("id", "=", id).executeTakeFirst()) !== undefined;

    await db.deleteFrom("content").where("id", "=", a).execute();
    expect(await left(sa)).toBe(false);
    await db.deleteFrom("notes").where("id", "=", n).execute();
    expect(await left(sn)).toBe(false);
    await db.deleteFrom("thread_proposals").where("id", "=", p).execute();
    expect(await left(sb)).toBe(false);
    await db.deleteFrom("thread_members").where("thread_id", "=", home).execute();
    await db.deleteFrom("threads").where("id", "=", home).execute();
    expect(await left(sc)).toBe(false);
  });

  it("goes with the account, proposals included", async () => {
    const { me } = await owner();
    await proposal(me);
    await db.deleteFrom("thread_members").execute();
    await db.updateTable("accounts").set({ default_thread_id: null }).execute();
    await db.deleteFrom("threads").execute();
    await db.deleteFrom("accounts").where("id", "=", me).execute();
    const { n } = await db.selectFrom("thread_proposals").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
    expect(n).toBe(0);
  });
});

describe("proposals", () => {
  it("holds a name to one plain line of 1 to 60 characters", async () => {
    const { me } = await owner();
    await expect(proposal(me, "")).rejects.toThrow();
    await expect(proposal(me, "x".repeat(61))).rejects.toThrow();
    await expect(proposal(me, "Kitchen\nshelves")).rejects.toThrow();
    await expect(proposal(me, "x".repeat(60))).resolves.toBeTruthy();
  });
});

describe("the dismissal mark", () => {
  it("is a column on content and on notes", async () => {
    const { me, loose } = await owner();
    const r = await row(me, loose, "A");
    const n = await note(me, loose, "B");
    await db.updateTable("content").set({ suggest_dismissed_at: sql`now()` }).where("id", "=", r).execute();
    await db.updateTable("notes").set({ suggest_dismissed_at: sql`now()` }).where("id", "=", n).execute();
  });
});
