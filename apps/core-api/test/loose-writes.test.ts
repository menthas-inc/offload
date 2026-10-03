// 028. The writes: moving a note (T1.10), the move rule (T1.11), a Move to
// accepted, undone and dismissed (T1.14), Create and its Undo (T1.15, T1.16),
// and the floor under a proposal (T1.17).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { as, account, createSuggestion, join, moveSuggestion, note, owner, proposal, row, signIn, thread, wipe } from "./loose-kit.js";

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

const threadOf = async (contentId: string) =>
  (await db.selectFrom("content").select("thread_id").where("id", "=", contentId).executeTakeFirstOrThrow()).thread_id;
const subjectOf = async (noteId: string) =>
  (await db.selectFrom("notes").select("subject_id").where("id", "=", noteId).executeTakeFirstOrThrow()).subject_id;
const suggestion = (id: string) => db.selectFrom("suggestions").selectAll().where("id", "=", id).executeTakeFirst();

async function label(threadId: string, name: string, colour: number): Promise<string> {
  return (await db.insertInto("labels").values({ thread_id: threadId, name, colour, set_by: "person" }).returning("id").executeTakeFirstOrThrow()).id;
}

describe("moving a note (T1.10, AC-31, AC-32)", () => {
  it("moves the author's note and says where it was", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const n = await note(me, loose, "Boiler is a Vaillant");
    const response = await as(app, await signIn(me)).post(`/v1/notes/${n}/move`, { threadId: home });
    expect(response.statusCode).toBe(200);
    expect(response.json().previous).toEqual({ threadId: loose });
    expect(await subjectOf(n)).toBe(home);
  });

  it("refuses another member's note, a thread the caller is not in, and a note that is not a thread's", async () => {
    const { me, loose } = await owner();
    const sam = await account("Sam Ibekwe");
    const shared = await thread(me, "Flat admin");
    await join(shared, sam);
    const mine = await thread(me, "Lisbon trip");
    const theirs = await thread(sam, "Sam's");
    const samsNote = await note(sam, shared, "Sam wrote this");
    const myNote = await note(me, loose, "Mine");
    const personal = await note(me, loose, "About me", "account");
    const cookie = await signIn(me);
    expect((await as(app, cookie).post(`/v1/notes/${samsNote}/move`, { threadId: mine })).statusCode).toBe(404);
    expect((await as(app, cookie).post(`/v1/notes/${myNote}/move`, { threadId: theirs })).statusCode).toBe(404);
    expect((await as(app, cookie).post(`/v1/notes/${personal}/move`, { threadId: mine })).statusCode).toBe(404);
  });

  it("leaves the labels behind unseen and shows them again on the way back", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const receipts = await label(loose, "Receipts", 1);
    const n = await note(me, loose, "Boiler receipt");
    await db.insertInto("note_labels").values({ note_id: n, label_id: receipts, set_by: "person" }).execute();
    const cookie = await signIn(me);
    const moved = await as(app, cookie).post(`/v1/notes/${n}/move`, { threadId: home });
    expect(moved.json().note.labels).toEqual([]);
    const back = await as(app, cookie).post(`/v1/notes/${n}/move`, { threadId: loose });
    expect(back.json().note.labels).toEqual([receipts]);
  });

  it("keeps the origin, the untrusted mark and when it was put down", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const n = await note(me, loose, "From an email");
    await db.updateTable("notes").set({ origin: "learned", derived_from_untrusted: true }).where("id", "=", n).execute();
    const before = await db.selectFrom("notes").select(["origin", "derived_from_untrusted", "created_at"]).where("id", "=", n).executeTakeFirstOrThrow();
    await as(app, await signIn(me)).post(`/v1/notes/${n}/move`, { threadId: home });
    const after = await db.selectFrom("notes").select(["origin", "derived_from_untrusted", "created_at"]).where("id", "=", n).executeTakeFirstOrThrow();
    expect(after).toEqual(before);
  });

  it("refuses a learned note whose words the destination already holds", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const there = await note(me, home, "Boiler is a Vaillant");
    const here = await note(me, loose, "boiler is a vaillant");
    await db.updateTable("notes").set({ origin: "learned" }).where("id", "in", [there, here]).execute();
    const response = await as(app, await signIn(me)).post(`/v1/notes/${here}/move`, { threadId: home });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "duplicate" });
    expect(await subjectOf(here)).toBe(loose);
  });
});

describe("the move rule (T1.11, AC-31)", () => {
  it("lets a remaining member move what a member who left wrote, and nobody else's", async () => {
    const { me } = await owner();
    const sam = await account("Sam Ibekwe");
    const ines = await account("Ines Costa");
    const shared = await thread(me, "Flat admin");
    await join(shared, sam);
    await join(shared, ines);
    const mine = await thread(me, "Mine");
    const samsRow = await row(sam, shared, "Sam's row");
    const samsNote = await note(sam, shared, "Sam's note");
    const inesRow = await row(ines, shared, "Ines's row");
    const cookie = await signIn(me);
    expect((await as(app, cookie).post(`/v1/content/${inesRow}/move`, { threadId: mine })).statusCode).toBe(404);
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", shared).where("account_id", "=", sam).execute();
    expect((await as(app, cookie).post(`/v1/content/${samsRow}/move`, { threadId: mine })).statusCode).toBe(200);
    expect((await as(app, cookie).post(`/v1/notes/${samsNote}/move`, { threadId: mine })).statusCode).toBe(200);
  });
});

describe("a Move to (T1.14, AC-16, AC-23, AC-26)", () => {
  it("moves the row and marks the suggestion accepted; Undo puts both back", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const r = await row(me, loose, "Boiler receipt");
    const s = await moveSuggestion(me, { contentId: r }, home);
    const cookie = await signIn(me);
    const accepted = await as(app, cookie).post(`/v1/suggestions/${s}/accept`);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ thread: { id: home, name: "Flat admin", icon: "lasso", hue: 1 } });
    expect(await threadOf(r)).toBe(home);
    expect((await suggestion(s))!.accepted_at).not.toBeNull();

    expect((await as(app, cookie).post(`/v1/suggestions/${s}/undo`)).statusCode).toBe(200);
    expect(await threadOf(r)).toBe(loose);
    expect((await suggestion(s))!.accepted_at).toBeNull();
  });

  it("moves a note the same way", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const n = await note(me, loose, "Boiler is a Vaillant");
    const s = await moveSuggestion(me, { noteId: n }, home);
    expect((await as(app, await signIn(me)).post(`/v1/suggestions/${s}/accept`)).statusCode).toBe(200);
    expect(await subjectOf(n)).toBe(home);
  });

  it("refuses a suggestion whose row already left, another account's, and an undo after the window", async () => {
    const { me, loose } = await owner();
    const { me: them, loose: theirs } = await owner("Sam Ibekwe");
    const home = await thread(me, "Flat admin");
    const elsewhere = await thread(me, "Elsewhere");
    const r = await row(me, loose, "Moved by hand");
    const s = await moveSuggestion(me, { contentId: r }, home);
    await db.updateTable("content").set({ thread_id: elsewhere }).where("id", "=", r).execute();
    const cookie = await signIn(me);
    expect((await as(app, cookie).post(`/v1/suggestions/${s}/accept`)).statusCode).toBe(404);

    const theirsRow = await row(them, theirs, "Theirs");
    const theirHome = await thread(them, "Theirs");
    const t = await moveSuggestion(them, { contentId: theirsRow }, theirHome);
    expect((await as(app, cookie).post(`/v1/suggestions/${t}/accept`)).statusCode).toBe(404);
    expect((await as(app, cookie).delete(`/v1/suggestions/${t}`)).statusCode).toBe(404);

    const late = await row(me, loose, "Late");
    const u = await moveSuggestion(me, { contentId: late }, home);
    expect((await as(app, cookie).post(`/v1/suggestions/${u}/accept`)).statusCode).toBe(200);
    await db.updateTable("suggestions").set({ accepted_at: sql`now() - interval '1 minute'` }).where("id", "=", u).execute();
    const undo = await as(app, cookie).post(`/v1/suggestions/${u}/undo`);
    expect(undo.statusCode).toBe(409);
    expect(undo.json()).toEqual({ error: "too_late" });
  });

  it("dismisses for good: the mark is set, the suggestion goes", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const r = await row(me, loose, "Boiler receipt");
    const s = await moveSuggestion(me, { contentId: r }, home);
    expect((await as(app, await signIn(me)).delete(`/v1/suggestions/${s}`)).statusCode).toBe(200);
    expect(await suggestion(s)).toBeUndefined();
    const mark = await db.selectFrom("content").select("suggest_dismissed_at").where("id", "=", r).executeTakeFirstOrThrow();
    expect(mark.suggest_dismissed_at).not.toBeNull();
  });
});

async function threeThings(me: string, loose: string) {
  const p = await proposal(me, "Kitchen shelves");
  const a = await row(me, loose, "Oak brackets");
  const b = await row(me, loose, "Wall plugs", { type: "link" });
  const n = await note(me, loose, "Alcove is 92cm wide");
  const sa = await createSuggestion(me, { contentId: a }, p);
  const sb = await createSuggestion(me, { contentId: b }, p);
  const sn = await createSuggestion(me, { noteId: n }, p);
  return { p, a, b, n, sa, sb, sn };
}

describe("a proposal read (for the create sheet)", () => {
  it("lists every still-loose thing of the caller's proposal, and 404s another's", async () => {
    const { me, loose } = await owner();
    const { me: them } = await owner("Sam Ibekwe");
    const { p } = await threeThings(me, loose);
    const response = await as(app, await signIn(me)).get(`/v1/proposals/${p}`);
    expect(response.statusCode).toBe(200);
    const body = response.json() as { name: string; entries: { kind: string }[] };
    expect(body.name).toBe("Kitchen shelves");
    expect(body.entries).toHaveLength(3);
    expect((await as(app, await signIn(them)).get(`/v1/proposals/${p}`)).statusCode).toBe(404);
  });
});

describe("Create (T1.15, AC-19, AC-20, AC-21)", () => {
  it("makes a single-member thread, moves the ticked things and spends the proposal", async () => {
    const { me, loose } = await owner();
    const { p, a, b, n, sb } = await threeThings(me, loose);
    const response = await as(app, await signIn(me)).post(`/v1/proposals/${p}/create`, {
      name: "  Kitchen shelves  ",
      contentIds: [a],
      noteIds: [n],
    });
    expect(response.statusCode).toBe(200);
    const created = response.json().thread as { id: string; name: string };
    expect(created.name).toBe("Kitchen shelves");
    const members = await db.selectFrom("thread_members").select(["account_id", "state"]).where("thread_id", "=", created.id).execute();
    expect(members).toEqual([{ account_id: me, state: "accepted" }]);
    expect(await threadOf(a)).toBe(created.id);
    expect(await subjectOf(n)).toBe(created.id);
    expect(await threadOf(b)).toBe(loose);
    expect(await suggestion(sb)).toBeUndefined();
    const spent = await db.selectFrom("thread_proposals").select(["spent_at", "spent_thread_id"]).where("id", "=", p).executeTakeFirstOrThrow();
    expect(spent.spent_at).not.toBeNull();
    expect(spent.spent_thread_id).toBe(created.id);
  });

  it("refuses the whole call when any id is not this proposal's, not loose, or not the caller's", async () => {
    const { me, loose } = await owner();
    const { p, a } = await threeThings(me, loose);
    const other = await proposal(me, "Other");
    const stranger = await row(me, loose, "Not proposed");
    await createSuggestion(me, { contentId: stranger }, other);
    const cookie = await signIn(me);
    const refused = await as(app, cookie).post(`/v1/proposals/${p}/create`, { name: "Kitchen", contentIds: [a, stranger], noteIds: [] });
    expect(refused.statusCode).toBe(404);
    expect(await threadOf(a)).toBe(loose);
    const { n } = await db.selectFrom("threads").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow();
    expect(Number(n)).toBe(1);
  });

  it("refuses a bad name with 400, and a spent proposal with 404", async () => {
    const { me, loose } = await owner();
    const { p, a } = await threeThings(me, loose);
    const cookie = await signIn(me);
    for (const name of ["   ", "x".repeat(61), "Kitchen\nshelves"]) {
      const response = await as(app, cookie).post(`/v1/proposals/${p}/create`, { name, contentIds: [a], noteIds: [] });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "bad_name" });
    }
    expect((await as(app, cookie).post(`/v1/proposals/${p}/create`, { name: "Kitchen", contentIds: [a], noteIds: [] })).statusCode).toBe(200);
    expect((await as(app, cookie).post(`/v1/proposals/${p}/create`, { name: "Again", contentIds: [a], noteIds: [] })).statusCode).toBe(404);
  });

  it("refuses an empty selection", async () => {
    const { me, loose } = await owner();
    const { p } = await threeThings(me, loose);
    expect((await as(app, await signIn(me)).post(`/v1/proposals/${p}/create`, { name: "Kitchen", contentIds: [], noteIds: [] })).statusCode).toBe(400);
  });
});

describe("Undo on Create (T1.16, AC-22)", () => {
  it("returns everything with its suggestion, unspends the proposal and deletes only the thread", async () => {
    const { me, loose } = await owner();
    const { p, a, b, n, sa, sn } = await threeThings(me, loose);
    const cookie = await signIn(me);
    const created = (await as(app, cookie).post(`/v1/proposals/${p}/create`, { name: "Kitchen", contentIds: [a, b], noteIds: [n] })).json().thread;
    const undo = await as(app, cookie).post(`/v1/proposals/${p}/undo`);
    expect(undo.statusCode).toBe(200);
    expect(await threadOf(a)).toBe(loose);
    expect(await threadOf(b)).toBe(loose);
    expect(await subjectOf(n)).toBe(loose);
    expect((await suggestion(sa))!.accepted_at).toBeNull();
    expect((await suggestion(sn))!.accepted_at).toBeNull();
    expect((await db.selectFrom("thread_proposals").select("spent_at").where("id", "=", p).executeTakeFirstOrThrow()).spent_at).toBeNull();
    const gone = await db.selectFrom("threads").select("deleted_at").where("id", "=", created.id).executeTakeFirstOrThrow();
    expect(gone.deleted_at).not.toBeNull();
    const scheduled = await db
      .selectFrom("content")
      .select("id")
      .where("id", "in", [a, b])
      .where((eb) => eb.or([eb("deleted_at", "is not", null), eb("purge_after", "is not", null)]))
      .execute();
    expect(scheduled).toEqual([]);
  });

  it("is refused, moving nothing, once something else landed, the thread was renamed, or somebody was invited", async () => {
    for (const change of ["landed", "renamed", "invited"] as const) {
      await wipe();
      const { me, loose } = await owner();
      const sam = await account("Sam Ibekwe");
      const { p, a } = await threeThings(me, loose);
      const cookie = await signIn(me);
      const created = (await as(app, cookie).post(`/v1/proposals/${p}/create`, { name: "Kitchen", contentIds: [a], noteIds: [] })).json().thread;
      if (change === "landed") await row(me, created.id, "Something new");
      if (change === "renamed") await db.updateTable("threads").set({ name: "Kitchen, renamed" }).where("id", "=", created.id).execute();
      if (change === "invited") await db.insertInto("thread_members").values({ thread_id: created.id, account_id: sam, state: "pending", invited_by: me } as never).execute();
      const undo = await as(app, cookie).post(`/v1/proposals/${p}/undo`);
      expect(undo.statusCode, change).toBe(409);
      expect(undo.json()).toEqual({ error: "changed" });
      expect(await threadOf(a)).toBe(created.id);
    }
  });

  it("is refused after the window", async () => {
    const { me, loose } = await owner();
    const { p, a } = await threeThings(me, loose);
    const cookie = await signIn(me);
    await as(app, cookie).post(`/v1/proposals/${p}/create`, { name: "Kitchen", contentIds: [a], noteIds: [] });
    await db.updateTable("thread_proposals").set({ spent_at: sql`now() - interval '1 minute'` }).where("id", "=", p).execute();
    const undo = await as(app, cookie).post(`/v1/proposals/${p}/undo`);
    expect(undo.statusCode).toBe(409);
    expect(undo.json()).toEqual({ error: "too_late" });
  });
});

describe("the floor (T1.17, AC-23)", () => {
  it("keeps a proposal at two and removes it with its suggestions below two", async () => {
    const { me, loose } = await owner();
    const { p, a, b, sa } = await threeThings(me, loose);
    const cookie = await signIn(me);
    expect((await as(app, cookie).delete(`/v1/suggestions/${sa}`)).statusCode).toBe(200);
    expect(await db.selectFrom("thread_proposals").select("id").where("id", "=", p).executeTakeFirst()).toBeDefined();
    const sb = (await db.selectFrom("suggestions").select("id").where("content_id", "=", b).executeTakeFirstOrThrow()).id;
    expect((await as(app, cookie).delete(`/v1/suggestions/${sb}`)).statusCode).toBe(200);
    expect(await db.selectFrom("thread_proposals").select("id").where("id", "=", p).executeTakeFirst()).toBeUndefined();
    expect(await db.selectFrom("suggestions").select("id").where("proposal_id", "=", p).execute()).toEqual([]);
    expect(a).toBeTruthy();
  });

  it("is checked when a target is moved or deleted by hand", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const p = await proposal(me);
    const a = await row(me, loose, "A");
    const b = await row(me, loose, "B");
    await createSuggestion(me, { contentId: a }, p);
    await createSuggestion(me, { contentId: b }, p);
    const cookie = await signIn(me);
    expect((await as(app, cookie).post(`/v1/content/${a}/move`, { threadId: home })).statusCode).toBe(200);
    expect(await db.selectFrom("thread_proposals").select("id").where("id", "=", p).executeTakeFirst()).toBeUndefined();

    const q = await proposal(me);
    const c = await row(me, loose, "C");
    const d = await row(me, loose, "D");
    await createSuggestion(me, { contentId: c }, q);
    await createSuggestion(me, { contentId: d }, q);
    expect((await as(app, cookie).delete(`/v1/content/${c}`)).statusCode).toBeLessThan(300);
    expect(await db.selectFrom("thread_proposals").select("id").where("id", "=", q).executeTakeFirst()).toBeUndefined();
  });
});
