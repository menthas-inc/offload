// 042 D1 and D2: what a pass may label, what a task may be for, and what the
// Core API keeps of what the pass answered. (AC-1, AC-2, AC-5, SEC-1, SEC-2,
// OFF-3, OFF-4)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { applyLabels, nameIsOwn, wantedLabels, anchorsFor } from "../src/notifications/labels.js";
import { account, label, message, note, row, thread, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(wipe);

const SOON = "2099-11-12";

async function keys(rows: { of: string; id: string }[]): Promise<string[]> {
  return rows.map((r) => `${r.of}:${r.id}`).sort();
}

describe("what a pass may label", () => {
  it("is the member's own dated rows and notes, and their new undated tasks", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: SOON });
    const visa = await row(me, t, "Get the visa", {}, { created_at: new Date() });
    await row(me, t, "Old undated task", {}, { created_at: new Date("2020-01-01T00:00:00Z") });
    await row(me, t, "A link", {}, { type: "link", created_at: new Date() });
    await row(ana, t, "Ana's party", { day: SOON });
    expect(await keys(await wantedLabels(db, me, t))).toEqual(
      [`content:${rent}`, `content:${visa}`, `note:${trip}`].sort(),
    );
  });

  it("never mail, a calendar, a capture, anything untrusted, done, archived, past or stopped", async () => {
    const me = await account();
    const t = await thread([me]);
    const mail = await message(me, { source: "mail" });
    const untrusted = await message(me, { derived_from_untrusted: true });
    await row(me, t, "From an email", { day: SOON }, { derived_from_message_id: mail });
    await row(me, t, "From a page", { day: SOON }, { derived_from_message_id: untrusted });
    await row(me, t, "A calendar's event", { day: SOON }, { type: "event", source: "calendar", source_ref: "g:1" });
    await row(me, t, "Captured", { day: SOON }, { source: "browser" });
    await note(me, t, "An untrusted note", { day: SOON }, { derived_from_untrusted: true });
    await row(me, t, "Done", { day: SOON }, { done_at: new Date() });
    await row(me, t, "Archived", { day: SOON }, { archived_at: new Date() });
    await row(me, t, "Past", { day: "2020-01-01" });
    const stopped = await row(me, t, "Stopped", { day: SOON });
    await label(me, { contentId: stopped }, { kind: null, lead: null, stopped_at: new Date() });
    expect(await wantedLabels(db, me, t)).toEqual([]);
  });

  it("asks again when the words or the kind of date change, never when the date only moves", async () => {
    const me = await account();
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    await applyLabels(db, { accountId: me, threadId: t, shown: [{ of: "content", id: rent }], entries: [{ of: "content", id: rent, kind: "deadline", lead: "days" }] });
    expect(await wantedLabels(db, me, t)).toEqual([]);
    await db.updateTable("content").set({ due_at: new Date("2099-11-20T12:00:00Z") }).where("id", "=", rent).execute();
    expect(await wantedLabels(db, me, t)).toEqual([]);
    await db.updateTable("content").set({ title: "Pay the rent and the gas" }).where("id", "=", rent).execute();
    expect(await keys(await wantedLabels(db, me, t))).toEqual([`content:${rent}`]);
  });
});

describe("what a task may be for", () => {
  it("is a dated row or note in the same thread, by anybody, never untrusted, past or undated", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const other = await thread([me]);
    const trip = await note(ana, t, "Lisbon 12 to 19 November", { day: SOON });
    const flight = await row(me, t, "Flight to Lisbon", { at: new Date("2099-11-12T06:00:00Z") }, { type: "event" });
    await note(me, t, "Untrusted", { day: SOON }, { derived_from_untrusted: true });
    await note(me, t, "Past", { day: "2020-01-01" });
    await note(me, t, "Undated");
    await note(me, other, "Elsewhere", { day: SOON });
    expect(await keys(await anchorsFor(db, t))).toEqual([`content:${flight}`, `note:${trip}`].sort());
  });
});

describe("what the Core API keeps", () => {
  async function labels() {
    return db
      .selectFrom("reminder_labels")
      .select(["content_id", "note_id", "kind", "lead", "anchor_content_id", "anchor_note_id", "name", "date_set_at"])
      .orderBy("created_at")
      .execute();
  }

  it("a label for each found it may label, nothing for anything else", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    const hers = await row(ana, t, "Ana's party", { day: SOON });
    const result = await applyLabels(db, {
      accountId: me,
      threadId: t,
      shown: [{ of: "content", id: rent }],
      entries: [
        { of: "content", id: rent, kind: "deadline", lead: "days" },
        { of: "content", id: hers, kind: "appointment", lead: "none" },
      ],
    });
    expect(result).toEqual({ labelled: 1, ignored: 1 });
    expect(await labels()).toEqual([
      expect.objectContaining({ content_id: rent, kind: "deadline", lead: "days", anchor_content_id: null, name: null }),
    ]);
    const [kept] = await labels();
    expect(kept!.date_set_at?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("an anchor only on an undated task, and only one it may name", async () => {
    const me = await account();
    const t = await thread([me]);
    const elsewhere = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: SOON });
    const far = await note(me, elsewhere, "Porto in December", { day: SOON });
    const visa = await row(me, t, "Get the visa", {}, { created_at: new Date() });
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    await applyLabels(db, {
      accountId: me,
      threadId: t,
      shown: [],
      entries: [
        { of: "content", id: visa, kind: "deadline", lead: "months", before: { of: "note", id: trip } },
        { of: "content", id: rent, kind: "deadline", lead: "days", before: { of: "note", id: trip } },
        { of: "note", id: trip, kind: "trip", lead: "weeks", before: { of: "note", id: far }, name: "Lisbon" },
      ],
    });
    const byThing = new Map((await labels()).map((l) => [l.content_id ?? l.note_id, l]));
    expect(byThing.get(visa)).toMatchObject({ anchor_note_id: trip });
    expect(byThing.get(rent)).toMatchObject({ anchor_note_id: null });
    expect(byThing.get(trip)).toMatchObject({ anchor_note_id: null, name: "Lisbon" });
  });

  it("a name only on a note, and only as a run of its own words", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "We're staying in Istanbul the 10th to the 12th", { day: SOON });
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    await applyLabels(db, {
      accountId: me,
      threadId: t,
      shown: [],
      entries: [
        { of: "note", id: trip, kind: "trip", lead: "days", name: "Click here now" },
        { of: "content", id: rent, kind: "deadline", lead: "days", name: "Pay" },
      ],
    });
    const byThing = new Map((await labels()).map((l) => [l.content_id ?? l.note_id, l]));
    expect(byThing.get(trip)?.name).toBeNull();
    expect(byThing.get(rent)?.name).toBeNull();
  });

  it("whatever it was shown and left out is none, so it is not asked again every night", async () => {
    const me = await account();
    const t = await thread([me]);
    const receipt = await row(me, t, "Receipt from the plumber", { day: SOON });
    const notShown = await row(me, t, "Pay the rent", { day: SOON });
    await applyLabels(db, { accountId: me, threadId: t, shown: [{ of: "content", id: receipt }], entries: [] });
    expect(await labels()).toEqual([expect.objectContaining({ content_id: receipt, kind: "none", lead: "none" })]);
    expect(await keys(await wantedLabels(db, me, t))).toEqual([`content:${notShown}`]);
  });

  it("a new label keeps a stop and a hold the found already had", async () => {
    const me = await account();
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: SOON });
    const held = new Date("2026-05-05T00:00:00Z");
    await label(me, { contentId: rent }, { kind: null, lead: null, held_at: held, fingerprint: "old" });
    await applyLabels(db, { accountId: me, threadId: t, shown: [], entries: [{ of: "content", id: rent, kind: "deadline", lead: "days" }] });
    const kept = await db.selectFrom("reminder_labels").select(["kind", "held_at", "fingerprint"]).executeTakeFirstOrThrow();
    expect(kept.kind).toBe("deadline");
    expect(kept.held_at?.toISOString()).toBe(held.toISOString());
    const now = await sql<{ f: string }>`select content_fingerprint(c) as f from content c where id = ${rent}`.execute(db);
    expect(kept.fingerprint).toBe(now.rows[0]!.f);
  });
});

describe("a run of the found's own words", () => {
  it("is found in the text, case and spacing aside", () => {
    expect(nameIsOwn("Meera's birthday", "Meera's birthday is 14 March.")).toBe(true);
    expect(nameIsOwn("istanbul", "We're staying in  Istanbul the 10th")).toBe(true);
  });

  it("is never words that are not there, an address, or four digits in a row", () => {
    expect(nameIsOwn("Open the link", "Lisbon 12 to 19 November")).toBe(false);
    expect(nameIsOwn("example.com/pay", "Pay at https://example.com/pay")).toBe(false);
    expect(nameIsOwn("www.pay.me", "go to www.pay.me")).toBe(false);
    expect(nameIsOwn("ana@example.com", "write to ana@example.com")).toBe(false);
    expect(nameIsOwn("Card 4242", "Card 4242 renewal")).toBe(false);
    expect(nameIsOwn("", "Lisbon")).toBe(false);
  });
});
