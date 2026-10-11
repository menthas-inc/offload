// 042 B1: the label table, the settings, the token's capability, the record's
// kind, and the fingerprints every reader compares. (DATA-1)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, label, memory, note, row, thread, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(wipe);

async function columnsOf(table: string): Promise<Map<string, { type: string; def: string | null }>> {
  const rows = await sql<{ column_name: string; data_type: string; column_default: string | null }>`
    select column_name, data_type, column_default from information_schema.columns where table_name = ${table}
  `.execute(db);
  return new Map(rows.rows.map((r) => [r.column_name, { type: r.data_type, def: r.column_default }]));
}

describe("042 the account's reminder settings", () => {
  it("are on, at Medium, by default", async () => {
    const columns = await columnsOf("accounts");
    expect(columns.get("notify_reminders")?.def).toBe("true");
    expect(columns.get("notify_reminder_count")?.def).toBe("2");
    const id = await account();
    await expect(db.updateTable("accounts").set({ notify_reminder_count: 4 } as never).where("id", "=", id).execute()).rejects.toThrow();
  });

  it("a push token says whether its phone takes a reminder of its own, false by default", async () => {
    const columns = await columnsOf("push_tokens");
    expect(columns.get("takes_reminders")?.def).toBe("false");
  });
});

describe("042 reminder_labels", () => {
  it("belongs to exactly one thing, and goes with it", async () => {
    const me = await account();
    const t = await thread([me]);
    const r = await row(me, t, "Pay the rent", { day: "2026-11-01" });
    const n = await note(me, t, "Lisbon 12 to 19 November", { day: "2026-11-12" });
    await expect(label(me, { contentId: r, noteId: n })).rejects.toThrow();
    await expect(label(me, {})).rejects.toThrow();
    await label(me, { contentId: r });
    await expect(label(me, { contentId: r })).rejects.toThrow();
    await db.deleteFrom("content").where("id", "=", r).execute();
    const left = await db.selectFrom("reminder_labels").select("id").execute();
    expect(left).toEqual([]);
  });

  it("holds only the enums, a kind and a lead together, and a name of one line within 60", async () => {
    const me = await account();
    const t = await thread([me]);
    const r = await row(me, t, "Pay the rent", { day: "2026-11-01" });
    await expect(label(me, { contentId: r }, { kind: "alarm" })).rejects.toThrow();
    await expect(label(me, { contentId: r }, { lead: "years" })).rejects.toThrow();
    await expect(label(me, { contentId: r }, { lead: null })).rejects.toThrow();
    await expect(label(me, { contentId: r }, { name: "a\nb" })).rejects.toThrow();
    await expect(label(me, { contentId: r }, { name: "x".repeat(61) })).rejects.toThrow();
    await expect(label(me, { contentId: r }, { yearly_on: "13-01" })).rejects.toThrow();
    // Stopped before anything labelled it: no kind, no lead.
    await label(me, { contentId: r }, { kind: null, lead: null, stopped_at: new Date() });
  });

  it("an anchor that goes leaves the task unanchored", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2026-11-12" });
    const visa = await row(me, t, "Get the visa");
    await label(me, { contentId: visa }, { anchor_note_id: trip, kind: "deadline", lead: "months" });
    await db.deleteFrom("notes").where("id", "=", trip).execute();
    const left = await db.selectFrom("reminder_labels").select(["anchor_note_id", "kind"]).executeTakeFirstOrThrow();
    expect(left).toEqual({ anchor_note_id: null, kind: "deadline" });
  });

  it("a memory can carry a yearly date", async () => {
    const me = await account();
    const m = await memory(me, "Meera's birthday is 14 March.");
    await label(me, { noteId: m }, { kind: "occasion", lead: "weeks", yearly_on: "03-14", name: "Meera's birthday" });
  });
});

describe("042 the fingerprints", () => {
  async function print(contentId: string): Promise<string> {
    const r = await sql<{ f: string }>`select content_fingerprint(c) as f from content c where id = ${contentId}`.execute(db);
    return r.rows[0]!.f;
  }

  it("change with the words, the type, and which kind of date, never with the date itself", async () => {
    const me = await account();
    const t = await thread([me]);
    const r = await row(me, t, "Pay the rent", { day: "2026-11-01" });
    const first = await print(r);
    await db.updateTable("content").set({ due_at: new Date("2026-11-05T12:00:00Z") }).where("id", "=", r).execute();
    expect(await print(r)).toBe(first);
    await db.updateTable("content").set({ due_at: new Date("2026-11-05T09:00:00Z"), attrs: {} }).where("id", "=", r).execute();
    const timed = await print(r);
    expect(timed).not.toBe(first);
    await db.updateTable("content").set({ title: "Pay the rent and the gas" }).where("id", "=", r).execute();
    expect(await print(r)).not.toBe(timed);
  });

  it("a note's changes with its text and its kind of date", async () => {
    const me = await account();
    const t = await thread([me]);
    const n = await note(me, t, "Lisbon 12 to 19 November", { day: "2026-11-12" });
    const of = async () =>
      (await sql<{ f: string }>`select note_fingerprint(n) as f from notes n where id = ${n}`.execute(db)).rows[0]!.f;
    const first = await of();
    await db.updateTable("notes").set({ occurs_at: new Date("2026-11-13T12:00:00Z") }).where("id", "=", n).execute();
    expect(await of()).toBe(first);
    await db.updateTable("notes").set({ text: "Lisbon 13 to 19 November" }).where("id", "=", n).execute();
    expect(await of()).not.toBe(first);
  });
});

describe("042 the record", () => {
  it("takes the reminder kind and a note's id", async () => {
    const me = await account();
    const t = await thread([me]);
    const n = await note(me, t, "Lisbon 12 to 19 November", { day: "2026-11-12" });
    await db
      .insertInto("activity")
      .values({ account_id: me, kind: "reminder", sent: true, title: "In an hour", body: "Lisbon.", thread_id: t, note_id: n } as never)
      .execute();
    await db.deleteFrom("notes").where("id", "=", n).execute();
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", me).execute()).toEqual([]);
    const named = await columnsOf("activity_memories");
    expect([...named.keys()].sort()).toEqual(["activity_id", "note_id"]);
  });
});
