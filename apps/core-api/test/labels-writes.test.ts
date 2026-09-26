// 025. The one write path every label change goes through.
//
// AC-1 ten per thread, and offload stops creating at six.
// AC-2 a name is normalised and unique per thread ignoring case.
// AC-3 the lowest free colour; a taken colour swaps.
// AC-4 membership, server-side, for every read and write.
// AC-5 a label and a row meet only inside one thread; a note must be that
//      thread's note.
// AC-6 who set it is the caller's, never the request's.
// AC-7 delete is soft, restorable, and purged after thirty days.
// AC-26 offload never overrides a person.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { NotYours } from "../src/threads/access.js";
import {
  LabelRefused,
  applyLabels,
  createLabel,
  deleteLabel,
  normaliseLabelName,
  purgeLabelRuns,
  purgeLabels,
  restoreLabel,
  updateLabel,
  type Actor,
} from "../src/threads/labels.js";
import { account, join, note, row, thread, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(wipe);

const person = (accountId: string): Actor => ({ accountId, via: "person" });
const offload = (accountId: string, runId: string | null = null): Actor => ({ accountId, via: "offload", runId });

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LabelRefused) return error.reason;
    if (error instanceof NotYours) return "not_found";
    throw error;
  }
  return "no refusal";
}

const joins = (contentId: string) =>
  db.selectFrom("content_labels").selectAll().where("content_id", "=", contentId).execute();

describe("a name (AC-2)", () => {
  it("is trimmed, collapsed, stripped of a leading # and keeps its case", () => {
    expect(normaliseLabelName("  #Lisbon   old  town ")).toBe("Lisbon old town");
    expect(normaliseLabelName("Paris")).toBe("Paris");
  });

  it("is refused empty, too long, or with a control character", () => {
    for (const raw of ["", "   ", "#", "x".repeat(25), "Lis\u0000bon", "Lis\nbon"]) {
      expect(() => normaliseLabelName(raw), JSON.stringify(raw)).toThrow(LabelRefused);
    }
    expect(normaliseLabelName("x".repeat(24))).toHaveLength(24);
  });

  it("counts characters, not code units", () => {
    expect(normaliseLabelName("🇵🇹".repeat(3))).toBeTruthy();
  });
});

describe("creating (AC-1, AC-2, AC-3, AC-4)", () => {
  it("takes the lowest free colour and keeps the creator", async () => {
    const me = await account();
    const t = await thread(me);
    const a = await createLabel(db, person(me), t, { name: "Lisbon" });
    const b = await createLabel(db, person(me), t, { name: "Paris" });
    expect([a.colour, b.colour]).toEqual([1, 2]);
    await deleteLabel(db, person(me), a.id);
    const c = await createLabel(db, person(me), t, { name: "Istanbul" });
    expect(c.colour).toBe(1);
    const stored = await db.selectFrom("labels").selectAll().where("id", "=", c.id).executeTakeFirstOrThrow();
    expect(stored.created_by).toBe(me);
    expect(stored.set_by).toBe("person");
  });

  it("refuses a name the thread already has, ignoring case", async () => {
    const me = await account();
    const t = await thread(me);
    await createLabel(db, person(me), t, { name: "Lisbon" });
    expect(await refusal(createLabel(db, person(me), t, { name: "LISBON" }))).toBe("label_taken");
  });

  it("refuses an eleventh for a person and a seventh for offload", async () => {
    const me = await account();
    const t = await thread(me);
    for (let i = 1; i <= 6; i++) await createLabel(db, person(me), t, { name: `L${i}` });
    expect(await refusal(createLabel(db, offload(me), t, { name: "L7" }))).toBe("label_limit");
    for (let i = 7; i <= 10; i++) await createLabel(db, person(me), t, { name: `L${i}` });
    expect(await refusal(createLabel(db, person(me), t, { name: "L11" }))).toBe("label_limit");
  });

  it("refuses a non-member, and a member who left", async () => {
    const me = await account();
    const them = await account("Sam");
    const t = await thread(me);
    expect(await refusal(createLabel(db, person(them), t, { name: "Lisbon" }))).toBe("not_found");
    await join(t, them, "left");
    expect(await refusal(createLabel(db, person(them), t, { name: "Lisbon" }))).toBe("not_found");
  });

  it("lets any accepted member create, and the label is the thread's", async () => {
    const me = await account();
    const sam = await account("Sam");
    const t = await thread(me);
    await join(t, sam);
    const l = await createLabel(db, person(sam), t, { name: "Lisbon" });
    const renamed = await updateLabel(db, person(me), l.id, { name: "Lisboa" });
    expect(renamed.label.name).toBe("Lisboa");
  });

  it("refuses offload re-creating a name a person deleted, while it is kept", async () => {
    const me = await account();
    const t = await thread(me);
    const l = await createLabel(db, person(me), t, { name: "Paris" });
    await deleteLabel(db, person(me), l.id);
    expect(await refusal(createLabel(db, offload(me), t, { name: "paris" }))).toBe("person_deleted");
    // A person may make it again.
    await expect(createLabel(db, person(me), t, { name: "Paris" })).resolves.toBeTruthy();
  });
});

describe("renaming and recolouring (AC-2, AC-3, AC-26)", () => {
  it("returns what it was, and marks the label touched by a person", async () => {
    const me = await account();
    const t = await thread(me);
    const l = await createLabel(db, offload(me), t, { name: "Lisbon" });
    const out = await updateLabel(db, person(me), l.id, { name: "Lisboa" });
    expect(out.previous).toEqual({ name: "Lisbon", colour: 1 });
    const stored = await db.selectFrom("labels").selectAll().where("id", "=", l.id).executeTakeFirstOrThrow();
    expect(stored.touched_by_person_at).not.toBeNull();
  });

  it("swaps a taken colour in one write", async () => {
    const me = await account();
    const t = await thread(me);
    const a = await createLabel(db, person(me), t, { name: "Lisbon" });
    const b = await createLabel(db, person(me), t, { name: "Paris" });
    const out = await updateLabel(db, person(me), a.id, { colour: 2 });
    expect(out.swappedWith).toBe(b.id);
    const rows = await db.selectFrom("labels").select(["id", "colour", "deleted_at"]).where("thread_id", "=", t).execute();
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ colour: 2, deleted_at: null });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ colour: 1, deleted_at: null });
  });

  it("refuses offload renaming or recolouring anything", async () => {
    const me = await account();
    const t = await thread(me);
    const l = await createLabel(db, offload(me), t, { name: "Lisbon" });
    expect(await refusal(updateLabel(db, offload(me), l.id, { name: "Lisboa" }))).toBe("person_set");
    expect(await refusal(deleteLabel(db, offload(me), l.id))).toBe("person_set");
  });
});

describe("applying (AC-5, AC-6, AC-26)", () => {
  it("applies and removes, and a person's removal is a tombstone", async () => {
    const me = await account();
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [c] }, [l.id], []);
    expect(await joins(c)).toMatchObject([{ label_id: l.id, set_by: "person", removed_at: null }]);
    await applyLabels(db, person(me), t, { content: [c] }, [], [l.id]);
    expect(await joins(c)).toMatchObject([{ label_id: l.id, removed_by: "person" }]);
    // offload will not put it back.
    expect(await refusal(applyLabels(db, offload(me), t, { content: [c] }, [l.id], []))).toBe("person_set");
    // A person can.
    await applyLabels(db, person(me), t, { content: [c] }, [l.id], []);
    expect(await joins(c)).toMatchObject([{ set_by: "person", removed_at: null, removed_by: null }]);
  });

  it("refuses offload taking off a label a person put on", async () => {
    const me = await account();
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [c] }, [l.id], []);
    expect(await refusal(applyLabels(db, offload(me), t, { content: [c] }, [], [l.id]))).toBe("person_set");
  });

  it("skips what a person set when asked to, and applies the rest", async () => {
    const me = await account();
    const t = await thread(me);
    const kept = await row(me, t, "Ferry");
    const free = await row(me, t, "Palace");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [kept] }, [l.id], []);
    await applyLabels(db, person(me), t, { content: [kept] }, [], [l.id]);
    const out = await applyLabels(db, offload(me), t, { content: [kept, free] }, [l.id], [], { skipRefused: true });
    expect(out.applied).toEqual([{ kind: "content", rowId: free, labelId: l.id }]);
  });

  it("refuses a label from another thread on a row in this one, and writes nothing", async () => {
    const me = await account();
    const a = await thread(me, "A");
    const b = await thread(me, "B");
    const c = await row(me, b, "Ferry");
    const foreign = await createLabel(db, person(me), a, { name: "Lisbon" });
    expect(await refusal(applyLabels(db, person(me), b, { content: [c] }, [foreign.id], []))).toBe("not_found");
    expect(await refusal(applyLabels(db, person(me), a, { content: [c] }, [foreign.id], []))).toBe("not_found");
    expect(await joins(c)).toHaveLength(0);
  });

  it("refuses an account note and another thread's note", async () => {
    const me = await account();
    const t = await thread(me);
    const other = await thread(me, "Other");
    const l = await createLabel(db, person(me), t, { name: "Lisbon" });
    const mine = await note(me, t, "Hotel is in Alfama");
    const personal = await note(me, t, "I prefer aisle seats", "account");
    const elsewhere = await note(me, other, "Somewhere else");
    await applyLabels(db, person(me), t, { notes: [mine] }, [l.id], []);
    expect(await refusal(applyLabels(db, person(me), t, { notes: [personal] }, [l.id], []))).toBe("not_found");
    expect(await refusal(applyLabels(db, person(me), t, { notes: [elsewhere] }, [l.id], []))).toBe("not_found");
    const rows = await db.selectFrom("note_labels").select("note_id").execute();
    expect(rows.map((r) => r.note_id)).toEqual([mine]);
  });

  it("refuses a non-member", async () => {
    const me = await account();
    const stranger = await account("Stranger");
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    expect(await refusal(applyLabels(db, person(stranger), t, { content: [c] }, [l.id], []))).toBe("not_found");
  });

  it("stamps offload's joins with its run", async () => {
    const me = await account();
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const run = await db.insertInto("label_runs").values({ thread_id: t, kind: "live", set_by: "offload" }).returning("id").executeTakeFirstOrThrow();
    const l = await createLabel(db, offload(me, run.id), t, { name: "Istanbul" });
    await applyLabels(db, offload(me, run.id), t, { content: [c] }, [l.id], []);
    expect(await joins(c)).toMatchObject([{ set_by: "offload", run_id: run.id }]);
    const stored = await db.selectFrom("labels").select(["run_id", "set_by", "created_by"]).where("id", "=", l.id).executeTakeFirstOrThrow();
    expect(stored).toEqual({ run_id: run.id, set_by: "offload", created_by: null });
  });
});

describe("deleting and restoring (AC-7)", () => {
  it("hides the label and its joins, deletes no row, and restores all of it", async () => {
    const me = await account();
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [c] }, [l.id], []);
    await deleteLabel(db, person(me), l.id);
    const stored = await db.selectFrom("labels").selectAll().where("id", "=", l.id).executeTakeFirstOrThrow();
    expect(stored.deleted_at).not.toBeNull();
    expect(stored.deleted_by_person).toBe(true);
    expect(stored.purge_after).not.toBeNull();
    expect(await db.selectFrom("content").select("id").where("id", "=", c).execute()).toHaveLength(1);

    const back = await restoreLabel(db, person(me), l.id);
    expect(back).toMatchObject({ id: l.id, name: "Istanbul", colour: 1 });
    expect(await joins(c)).toMatchObject([{ label_id: l.id, removed_at: null }]);
  });

  it("gives a restored label a free colour when its own was taken meanwhile", async () => {
    const me = await account();
    const t = await thread(me);
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await deleteLabel(db, person(me), l.id);
    await createLabel(db, person(me), t, { name: "Paris" });
    const back = await restoreLabel(db, person(me), l.id);
    expect(back.colour).toBe(2);
  });

  it("purges past thirty days, with its joins, and a restore after is label_gone", async () => {
    const me = await account();
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [c] }, [l.id], []);
    await deleteLabel(db, person(me), l.id);
    await db.updateTable("labels").set({ purge_after: sql`now() - interval '1 minute'` }).where("id", "=", l.id).execute();
    expect(await purgeLabels()).toBe(1);
    expect(await joins(c)).toHaveLength(0);
    expect(await refusal(restoreLabel(db, person(me), l.id))).toBe("label_gone");
  });
});

describe("a sort's record (AC-28)", () => {
  it("is purged with Activity's thirty days, and what it set stays", async () => {
    const me = await account();
    const t = await thread(me);
    const c = await row(me, t, "Ferry");
    const old = await db.insertInto("label_runs").values({ thread_id: t, kind: "nightly", set_by: "offload", created_at: sql`now() - interval '31 days'` as never }).returning("id").executeTakeFirstOrThrow();
    const fresh = await db.insertInto("label_runs").values({ thread_id: t, kind: "nightly", set_by: "offload" }).returning("id").executeTakeFirstOrThrow();
    const l = await createLabel(db, offload(me, old.id), t, { name: "Istanbul" });
    await applyLabels(db, offload(me, old.id), t, { content: [c] }, [l.id], []);
    expect(await purgeLabelRuns()).toBe(1);
    const runs = await db.selectFrom("label_runs").select("id").execute();
    expect(runs.map((r) => r.id)).toEqual([fresh.id]);
    expect(await joins(c)).toMatchObject([{ label_id: l.id, run_id: null, removed_at: null }]);
  });
});
