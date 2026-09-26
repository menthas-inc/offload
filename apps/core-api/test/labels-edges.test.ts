// 025. What happens to labels when something else happens to their rows.
//
// AC-8  a member who leaves or is taken out leaves their labels in place.
// AC-29 folding notes gives the new note every label the folded ones had.
// AC-31 a move takes a row's labels off; moving back puts them back; a delete
//       and its Undo keep them.
// AC-33 no label name reaches a log line.
// OFF-3 the name resolves to its author, and outlives the author's account.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { deleteContent, moveContent, setArchived } from "../src/routes/threads.js";
import { takeOut } from "../src/threads/sharing.js";
import { applyCompaction } from "../src/threads/notes.js";
import { applyLabels, contentLabelsFor, createLabel, labelsOfThread, noteLabelsFor, type Actor } from "../src/threads/labels.js";
import { account, join, note, row, thread, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(wipe);

const person = (accountId: string): Actor => ({ accountId, via: "person" });

describe("moving and deleting a row (AC-31)", () => {
  it("drops its labels in the new thread and has them back when it returns", async () => {
    const me = await account();
    const trip = await thread(me, "Europe");
    const work = await thread(me, "Work");
    const ferry = await row(me, trip, "Ferry");
    const l = await createLabel(db, person(me), trip, { name: "Istanbul" });
    await applyLabels(db, person(me), trip, { content: [ferry] }, [l.id], []);

    await moveContent(me, ferry, work);
    expect((await contentLabelsFor([ferry])).get(ferry)).toBeUndefined();
    expect((await labelsOfThread(trip))[0]!.count).toBe(0);

    await moveContent(me, ferry, trip);
    expect((await contentLabelsFor([ferry])).get(ferry)).toEqual([l.id]);
  });

  it("keeps a deleted row's labels for its Undo", async () => {
    const me = await account();
    const t = await thread(me);
    const ferry = await row(me, t, "Ferry");
    const l = await createLabel(db, person(me), t, { name: "Istanbul" });
    await applyLabels(db, person(me), t, { content: [ferry] }, [l.id], []);
    await deleteContent(me, ferry);
    expect((await labelsOfThread(t))[0]!.count).toBe(0);
    await setArchived(me, ferry, false);
    expect((await contentLabelsFor([ferry])).get(ferry)).toEqual([l.id]);
    expect((await labelsOfThread(t))[0]!.count).toBe(1);
  });
});

describe("folding notes (AC-29)", () => {
  it("gives the new note the union of what it replaced, a person's kept as a person's", async () => {
    const me = await account();
    const t = await thread(me);
    const a = await note(me, t, "Hotel is in Alfama");
    const b = await note(me, t, "The Alfama flat has a lift");
    await db.updateTable("notes").set({ origin: "learned" }).where("id", "in", [a, b]).execute();
    const lisbon = await createLabel(db, person(me), t, { name: "Lisbon" });
    const stay = await createLabel(db, { accountId: me, via: "offload" }, t, { name: "Stay" });
    await applyLabels(db, person(me), t, { notes: [a] }, [lisbon.id], []);
    await applyLabels(db, { accountId: me, via: "offload" }, t, { notes: [b] }, [stay.id, lisbon.id], []);

    await applyCompaction(t, { supersede: [], remove: [], add: [{ text: "The Alfama flat, with a lift", foldedFrom: [a, b] }] });
    const fresh = await db.selectFrom("notes").select("id").where("subject_id", "=", t).where("superseded_at", "is", null).executeTakeFirstOrThrow();
    expect((await noteLabelsFor([fresh.id])).get(fresh.id)).toEqual([lisbon.id, stay.id]);
    const joins = await db.selectFrom("note_labels").select(["label_id", "set_by"]).where("note_id", "=", fresh.id).execute();
    expect(Object.fromEntries(joins.map((j) => [j.label_id, j.set_by]))).toEqual({ [lisbon.id]: "person", [stay.id]: "offload" });
  });
});

describe("people leaving (AC-8, OFF-3)", () => {
  it("keeps the labels a removed member made and applied", async () => {
    const me = await account();
    const sam = await account("Sam");
    const t = await thread(me);
    await join(t, sam);
    const ferry = await row(me, t, "Ferry");
    const l = await createLabel(db, person(sam), t, { name: "Istanbul" });
    await applyLabels(db, person(sam), t, { content: [ferry] }, [l.id], []);
    await takeOut(me, t, sam);
    expect(await labelsOfThread(t)).toEqual([{ id: l.id, name: "Istanbul", colour: 1, count: 1 }]);
  });

  it("names the author until they delete their account, then keeps the label", async () => {
    const me = await account();
    const sam = await account("Sam");
    const t = await thread(me);
    await join(t, sam);
    const l = await createLabel(db, person(sam), t, { name: "Istanbul" });
    expect((await db.selectFrom("labels").select("created_by").where("id", "=", l.id).executeTakeFirstOrThrow()).created_by).toBe(sam);
    await db.deleteFrom("thread_members").where("account_id", "=", sam).execute();
    await db.deleteFrom("accounts").where("id", "=", sam).execute();
    const kept = await db.selectFrom("labels").select(["name", "created_by"]).where("id", "=", l.id).executeTakeFirstOrThrow();
    expect(kept).toEqual({ name: "Istanbul", created_by: null });
  });
});

describe("no label name in a log line (AC-33)", () => {
  const lines: string[] = [];
  beforeEach(() => {
    lines.length = 0;
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it("writes, refuses and restores without printing a name", async () => {
    const me = await account();
    const t = await thread(me);
    const ferry = await row(me, t, "Ferry");
    const secret = "Zzsecretlabel";
    const l = await createLabel(db, person(me), t, { name: secret });
    await applyLabels(db, person(me), t, { content: [ferry] }, [l.id], []);
    await createLabel(db, person(me), t, { name: secret.toLowerCase() }).catch(() => undefined);
    expect(lines.filter((line) => line.toLowerCase().includes(secret.toLowerCase()))).toEqual([]);
  });
});
