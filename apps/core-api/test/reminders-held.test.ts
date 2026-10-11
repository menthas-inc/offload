// 042 D5: only a date the author set reminds anybody. A date set or moved by
// another member holds the thing's reminders until its author edits it; the
// author setting it is what the two-day rule counts from. (AC-21, OFF-3)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { editContent } from "../src/routes/threads.js";
import { dateSet } from "../src/notifications/labels.js";
import { account, label, row, thread, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(wipe);

const labelOf = (contentId: string) =>
  db.selectFrom("reminder_labels").select(["account_id", "kind", "held_at", "date_set_at"]).where("content_id", "=", contentId).executeTakeFirst();

describe("a date another member set", () => {
  it("holds the author's reminders, labelled or not", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const dentist = await row(me, t, "Dentist", { day: "2027-11-12" });
    await editContent(ana, dentist, { dueAt: "2027-11-12T03:00:00Z" });
    const held = await labelOf(dentist);
    expect(held?.account_id).toBe(me);
    expect(held?.held_at).not.toBeNull();
    expect(held?.kind).toBeNull();
  });

  it("is let go when the author edits the thing, by any field", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const dentist = await row(me, t, "Dentist", { day: "2027-11-12" });
    await label(me, { contentId: dentist }, { kind: "appointment", lead: "none" });
    await editContent(ana, dentist, { dueAt: "2027-11-13" });
    expect((await labelOf(dentist))?.held_at).not.toBeNull();
    await editContent(me, dentist, { title: "Dentist, Dr Lopes" });
    expect((await labelOf(dentist))?.held_at).toBeNull();
  });

  // Since the security review of 2026-10-10 a title another member rewrites
  // holds the author's reminders too: their words are what a reminder says
  // (reminders-review.test.ts). A label the author changes is let go above.
});

describe("the author setting a date", () => {
  it("is when the two-day rule counts from", async () => {
    const me = await account();
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" });
    const before = Date.now();
    await editContent(me, rent, { dueAt: "2027-11-20" });
    const set = await labelOf(rent);
    expect(set?.date_set_at?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(set?.held_at).toBeNull();
  });

  it("through a turn, the same as by hand", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" });
    await db.transaction().execute((trx) => dateSet(trx, { contentId: rent, actorId: ana, dated: true }));
    expect((await labelOf(rent))?.held_at).not.toBeNull();
    await db.transaction().execute((trx) => dateSet(trx, { contentId: rent, actorId: me, dated: true }));
    expect((await labelOf(rent))?.held_at).toBeNull();
  });
});
