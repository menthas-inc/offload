// 049. The Search page's read.
//
// AC-4   *lisb* finds Lisbon trip and its rows; *lisb fl* the flight; *bon* the
//        thread by name and no row.
// AC-7   group limits; one letter matches names only.
// AC-9   archived rows after live ones.
// AC-10  Not in a thread: its rows carry `loose`; its name matches as *not in a thread*.
// AC-20  only what the person can see.
// AC-21  a shared thread's rows, whoever added them.
// AC-22  any typed text is a result or none, never an error; 128 characters.
// AC-6b  meaning joins the words when a vector is given.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { escapeLike, searchPage, terms } from "../src/search/page.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("content_chunks").execute();
  await db.deleteFrom("note_chunks").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("content").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
  // Deleted chunks stay in the HNSW graph until a vacuum, and a scan that walks
  // them can come back empty: "meaning joins the words" failed that way in the
  // gate's full run and never alone (search-index.test.ts has the history).
  await sql`vacuum content_chunks, note_chunks`.execute(db);
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string, name: string, state: "accepted" | "pending" | "removed" | "left" = "accepted"): Promise<string> {
  const row = await db.insertInto("threads").values({ created_by_account_id: accountId, name }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state }).execute();
  return row.id;
}

async function join(threadId: string, accountId: string, state: "accepted" | "pending" | "removed" | "left" = "accepted"): Promise<void> {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state }).execute();
}

async function row(threadId: string, accountId: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const inserted = await db
    .insertInto("content")
    .values({ thread_id: threadId, account_id: accountId, title, type: "event", ...extra })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

async function note(threadId: string, accountId: string, text: string, extra: Record<string, unknown> = {}): Promise<string> {
  const inserted = await db
    .insertInto("notes")
    .values({ scope: "thread", subject_id: threadId, account_id: accountId, kind: "standing", text, origin: "stated", ...extra })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

async function memory(accountId: string, text: string, extra: Record<string, unknown> = {}): Promise<string> {
  const inserted = await db
    .insertInto("notes")
    .values({ scope: "account", subject_id: accountId, account_id: accountId, kind: "about", text, origin: "stated", ...extra })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

describe("terms", () => {
  it("keeps letters and digits, folds case, drops everything else", () => {
    expect(terms("Lisb FL")).toEqual(["lisb", "fl"]);
    expect(terms("TP1351")).toEqual(["tp1351"]);
    expect(terms("& | ! : * ( ) ' \" % _ \\ <->")).toEqual([]);
    expect(terms("a:b&c")).toEqual(["a", "b", "c"]);
    expect(terms("one two three four five six seven eight nine ten")).toHaveLength(8);
  });

  it("escapes LIKE's own characters", () => {
    expect(escapeLike("50% off_now\\")).toBe("50\\% off\\_now\\\\");
  });
});

describe("the page read", () => {
  it("finds a thread and its rows as the word is typed, and narrows", async () => {
    const me = await account();
    const lisbon = await thread(me, "Lisbon trip");
    await row(lisbon, me, "Flight to Lisbon TP1351");
    await row(lisbon, me, "Hotel in Lisbon");
    await row(lisbon, me, "Pastéis de nata");

    const typed = await searchPage(me, "lisb");
    expect(typed.threads.map((t) => t.name)).toEqual(["Lisbon trip"]);
    expect(typed.rows.map((r) => r.title).sort()).toEqual(["Flight to Lisbon TP1351", "Hotel in Lisbon"]);
    expect(typed.rows.every((r) => r.threadId === lisbon && !r.loose && !r.archived)).toBe(true);

    const narrowed = await searchPage(me, "lisb fl");
    expect(narrowed.rows.map((r) => r.title)).toEqual(["Flight to Lisbon TP1351"]);

    const middle = await searchPage(me, "bon");
    expect(middle.threads.map((t) => t.name)).toEqual(["Lisbon trip"]);
    expect(middle.rows).toEqual([]);
  });

  it("caps each group and puts archived rows after live ones", async () => {
    const me = await account();
    for (let i = 0; i < 7; i++) await thread(me, `Paris ${i}`);
    const paris = await thread(me, "Paris trip");
    await row(paris, me, "Paris old ticket", { archived_at: sql`now()` });
    for (let i = 0; i < 8; i++) await row(paris, me, `Paris thing ${i}`);
    for (let i = 0; i < 5; i++) await note(paris, me, `Paris note ${i}`);
    for (let i = 0; i < 5; i++) await memory(me, `Paris memory ${i}`);

    const found = await searchPage(me, "paris");
    expect(found.threads).toHaveLength(5);
    expect(found.rows).toHaveLength(6);
    expect(found.notes).toHaveLength(3);
    expect(found.memories).toHaveLength(3);
    expect(found.rows.some((r) => r.archived)).toBe(false);

    const old = await searchPage(me, "paris old");
    expect(old.rows.map((r) => [r.title, r.archived])).toEqual([["Paris old ticket", true]]);

    const mixed = await searchPage(me, "ticket");
    await row(paris, me, "Live ticket");
    const again = await searchPage(me, "ticket");
    expect(mixed.rows.map((r) => r.title)).toEqual(["Paris old ticket"]);
    expect(again.rows.map((r) => r.title)).toEqual(["Live ticket", "Paris old ticket"]);
  });

  it("one letter matches names only", async () => {
    const me = await account();
    const lisbon = await thread(me, "Lisbon trip");
    await row(lisbon, me, "Lunch");
    await memory(me, "Loves lemons");
    const one = await searchPage(me, "l");
    expect(one.threads.map((t) => t.name)).toEqual(["Lisbon trip"]);
    expect(one.rows).toEqual([]);
    expect(one.memories).toEqual([]);
  });

  it("Not in a thread: its rows are loose, and its name is matched as itself, never as stored", async () => {
    const me = await account();
    const own = await thread(me, "Stored default name");
    await db.updateTable("accounts").set({ default_thread_id: own }).where("id", "=", me).execute();
    await row(own, me, "Receipt for the plumber");

    const receipt = await searchPage(me, "plumb");
    expect(receipt.rows.map((r) => [r.title, r.loose])).toEqual([["Receipt for the plumber", true]]);

    const stored = await searchPage(me, "stored");
    expect(stored.threads).toEqual([]);
    expect(stored.loose).toBe(false);

    expect((await searchPage(me, "not in")).loose).toBe(true);
    expect((await searchPage(me, "a thr")).loose).toBe(true);
    expect((await searchPage(me, "lisbon")).loose).toBe(false);
  });

  it("returns only what the person can see", async () => {
    const me = await account();
    const other = await account();

    const shared = await thread(other, "Shared garden");
    await join(shared, me);
    await row(shared, other, "Garden hose by the shed");

    const pending = await thread(other, "Pending garden");
    await join(pending, me, "pending");
    await row(pending, other, "Garden pending row");
    const removed = await thread(other, "Removed garden");
    await join(removed, me, "removed");
    await row(removed, other, "Garden removed row");
    const left = await thread(other, "Left garden");
    await join(left, me, "left");
    await row(left, other, "Garden left row");
    const theirs = await thread(other, "Their garden");
    await row(theirs, other, "Garden private row");
    await note(theirs, other, "Garden private note");
    await memory(other, "Garden is their hobby");

    const mine = await thread(me, "My garden plans");
    await row(mine, me, "Garden deleted row", { deleted_at: sql`now()` });
    await note(mine, me, "Garden deleted note", { deleted_at: sql`now()` });
    await note(mine, me, "Garden superseded note", { superseded_at: sql`now()` });
    await note(mine, me, "Garden muted note", { muted_at: sql`now()` });
    await note(mine, me, "Garden live note");
    await memory(me, "Garden forgotten memory", { deleted_at: sql`now()` });
    await memory(me, "Garden live memory");
    const gone = await thread(me, "Deleted garden");
    await row(gone, me, "Garden in a deleted thread");
    await db.updateTable("threads").set({ deleted_at: sql`now()` }).where("id", "=", gone).execute();

    const found = await searchPage(me, "garden");
    expect(found.threads.map((t) => t.name).sort()).toEqual(["My garden plans", "Shared garden"]);
    expect(found.rows.map((r) => r.title)).toEqual(["Garden hose by the shed"]);
    expect(found.notes.map((n) => n.text)).toEqual(["Garden live note"]);
    expect(found.memories.map((m) => m.text)).toEqual(["Garden live memory"]);
  });

  it("any typed text is a result or none, never an error", async () => {
    const me = await account();
    const lisbon = await thread(me, "Lisbon 100% _done_");
    await row(lisbon, me, "Flight");
    for (const q of ["&", "|", "!", ":", "*", "(", ")", "'", "\"", "%", "_", "\\", "<->", "fl:*", "fl & !x", "''''", "%%", "a\\b"]) {
      await expect(searchPage(me, q), q).resolves.toBeDefined();
    }
    expect((await searchPage(me, "%")).threads.map((t) => t.name)).toEqual(["Lisbon 100% _done_"]);
    expect((await searchPage(me, "x%y")).threads).toEqual([]);
    expect((await searchPage(me, "_")).threads.map((t) => t.name)).toEqual(["Lisbon 100% _done_"]);
    expect((await searchPage(me, "a_c")).threads).toEqual([]);
  });

  it("cuts a long query to 128 characters and still searches", async () => {
    const me = await account();
    const lisbon = await thread(me, "Lisbon");
    await row(lisbon, me, "Flight");
    const found = await searchPage(me, "flight " + "x".repeat(400));
    expect(found).toBeDefined();
    const kept = await searchPage(me, "fli" + " ".repeat(200) + "zzz");
    expect(kept.rows.map((r) => r.title)).toEqual(["Flight"]);
  });

  it("caps text at 200 characters", async () => {
    const me = await account();
    const t = await thread(me, "Long");
    await row(t, me, "Lisbon " + "a".repeat(400));
    const found = await searchPage(me, "lisbon");
    expect(found.rows[0]!.title.length).toBe(200);
  });

  it("meaning joins the words when a vector is given", async () => {
    const me = await account();
    const home = await thread(me, "Home");
    const heater = await row(home, me, "Heater replaced");
    // A chunk pointing one way, and a query vector pointing the same way.
    const along = sql<string>`('[' || array_to_string(array_fill(0.0::float, array[1023]), ',') || ',1]')::halfvec(1024)`;
    await sql`insert into content_chunks (content_id, thread_id, ord, text, embedding, embedded_at)
      values (${heater}::uuid, ${home}::uuid, 0, 'Heater replaced', ${along}, now())`.execute(db);
    const vector = (await sql<{ v: string }>`select ${along}::text as v`.execute(db)).rows[0]!.v;

    expect((await searchPage(me, "boiler")).rows).toEqual([]);
    expect((await searchPage(me, "boiler", { vector })).rows.map((r) => r.title)).toEqual(["Heater replaced"]);
  });

  it("meaning reads nothing past the floor, in rows, notes and memories", async () => {
    // A unit vector at cosine distance `d` from the query's axis.
    const at = (d: number) =>
      `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 - d : i === 1 ? Math.sqrt(1 - (1 - d) ** 2) : 0)).join(",")}]`;
    const me = await account();
    const home = await thread(me, "Home");
    for (const [title, d] of [["Heater replaced", 0.5], ["Bins on Tuesday", 0.7]] as const) {
      const id = await row(home, me, title);
      await sql`insert into content_chunks (content_id, thread_id, ord, text, embedding, embedded_at)
        values (${id}::uuid, ${home}::uuid, 0, ${title}, ${at(d)}::halfvec, now())`.execute(db);
      const n = await note(home, me, `note ${title}`);
      await sql`insert into note_chunks (note_id, subject_id, ord, text, embedding, embedded_at)
        values (${n}::uuid, ${home}::uuid, 0, ${title}, ${at(d)}::halfvec, now())`.execute(db);
      await memory(me, `memory ${title}`, { embedding: sql`${at(d)}::halfvec` });
    }

    const found = await searchPage(me, "zzzz", { vector: at(0) });
    expect(found.rows.map((r) => r.title)).toEqual(["Heater replaced"]);
    expect(found.notes.map((n) => n.text)).toEqual(["note Heater replaced"]);
    expect(found.memories.map((m) => m.text)).toEqual(["memory Heater replaced"]);
  });
});
