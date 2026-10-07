// 040. The Memories tab: five kinds, a memory's own embedding and place, and
// the routes the tab writes through.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("memory_forgotten").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

export async function account(name = "Jo Alves"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: name, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("0086: five kinds, and a memory's own vector and place", () => {
  it("refuses words at account scope, and takes the five", async () => {
    const me = await account();
    for (const kind of ["people", "things", "about", "rules", "patterns"] as const) {
      await db.insertInto("notes").values({ account_id: me, scope: "account", subject_id: me, kind, text: `A ${kind}.`, origin: "stated" }).execute();
    }
    await expect(
      db.insertInto("notes").values({ account_id: me, scope: "account", subject_id: me, kind: "words" as never, text: "x", origin: "stated" }).execute(),
    ).rejects.toThrow();
  });

  it("keeps an embedding and a place on a memory, and refuses them on a thread note", async () => {
    const me = await account();
    const vector = `[${Array.from({ length: 1024 }, () => 0.01).join(",")}]`;
    await db
      .insertInto("notes")
      .values({ account_id: me, scope: "account", subject_id: me, kind: "people", text: "Their wife is Meera.", origin: "stated", place_dx: 10, place_dy: -58 } as never)
      .execute();
    await sql`update notes set embedding = ${vector}::halfvec, embedded_at = now(), embedding_model = 'voyage-4' where scope = 'account'`.execute(db);
    await expect(
      db.insertInto("notes").values({ account_id: me, scope: "thread", subject_id: uuidv7(), kind: "going_on", text: "y", origin: "stated", place_dx: 1 } as never).execute(),
    ).rejects.toThrow();
  });

  it("lets the agent role write a memory's embedding and nothing else of it", async () => {
    const me = await account();
    const id = (
      await db.insertInto("notes").values({ account_id: me, scope: "account", subject_id: me, kind: "people", text: "x.", origin: "stated" }).returning("id").executeTakeFirstOrThrow()
    ).id;
    const asAgent = async (statement: string) => {
      try {
        await db.transaction().execute(async (trx) => {
          await sql`set local role offload_agent`.execute(trx);
          await sql.raw(statement).execute(trx);
          throw new Error("__rollback__");
        });
        return true;
      } catch (e) {
        return (e as Error).message === "__rollback__";
      }
    };
    expect(await asAgent(`update notes set embedded_at = now(), embedding_model = 'voyage-4' where id = '${id}'`)).toBe(true);
    expect(await asAgent(`update notes set text = 'changed' where id = '${id}'`)).toBe(false);
    expect(await asAgent(`update notes set place_dx = 1 where id = '${id}'`)).toBe(false);
  });
});

import {
  addMemory,
  changeMemory,
  forget,
  listMemories,
  memoriesForPrompt,
  remember,
  restoreMemory,
} from "../src/memories/store.js";

async function thread(owner: string, name = "Lisbon trip", always = false): Promise<string> {
  const t = await db.insertInto("threads").values({ created_by_account_id: owner, name, always_on: always, last_activity_at: new Date() } as never).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: t.id, account_id: owner, state: "accepted", responded_at: new Date() } as never).execute();
  return t.id;
}

async function said(accountId: string, text: string, landedIn: string | null = null): Promise<string> {
  const c = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const m = await db
    .insertInto("messages")
    .values({ conversation_id: c.id, account_id: accountId, role: "person", type: "text", turn_id: uuidv7(), text, state: "answered" })
    .returning("id")
    .executeTakeFirstOrThrow();
  if (landedIn) await db.insertInto("message_threads").values({ message_id: m.id, thread_id: landedIn, landed: true } as never).execute();
  return m.id;
}

const tx = <T,>(f: (trx: typeof db) => Promise<T>) => db.transaction().execute((trx) => f(trx as never));

async function learned(accountId: string, text: string, at = new Date(), from: string | null = null): Promise<string> {
  return (
    await db
      .insertInto("notes")
      .values({ account_id: accountId, scope: "account", subject_id: accountId, kind: "about", text, origin: "learned", derived_from_message_id: from, created_at: at })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

describe("the list the tab reads", () => {
  it("is every active memory, each with where it came from, and never a calendar's name", async () => {
    const me = await account();
    const trip = await thread(me);
    const loose = await thread(me, "Miscellaneous", true);
    await db.updateTable("accounts").set({ default_thread_id: loose }).where("id", "=", me).execute();
    const left = await thread(me, "Old flat");
    const inTrip = await said(me, "remember that Meera is my wife", trip);
    const inLoose = await said(me, "remember I like aisle seats", loose);
    const inLeft = await said(me, "remember the landlord is Mr Costa", left);
    await db.updateTable("thread_members").set({ state: "left" } as never).where("thread_id", "=", left).execute();
    await tx((trx) => remember(trx, { accountId: me, messageId: inTrip, text: "Their wife is Meera.", kind: "people" }));
    await tx((trx) => remember(trx, { accountId: me, messageId: inLoose, text: "They like aisle seats.", kind: "about" }));
    await tx((trx) => remember(trx, { accountId: me, messageId: inLeft, text: "Their landlord is Mr Costa.", kind: "people" }));
    await tx((trx) => addMemory(trx, { accountId: me, text: "My sister is Rina.", kind: "people" }));

    const list = await listMemories(me);
    const by = (t: string) => list.memories.find((m) => m.text === t)!;
    expect(list.memories).toHaveLength(4);
    expect(by("Their wife is Meera.").source).toEqual({ type: "message", thread: { id: trip, name: "Lisbon trip", notInAThread: false } });
    expect(by("They like aisle seats.").source).toEqual({ type: "message", thread: { id: loose, name: null, notInAThread: true } });
    expect(by("Their landlord is Mr Costa.").source).toEqual({ type: "message", thread: null });
    expect(by("My sister is Rina.")).toMatchObject({ origin: "stated", source: { type: "none" }, kind: "people" });
    expect(JSON.stringify(list)).not.toContain("calendar_id");
    expect(list.full).toBe(false);
  });
});

describe("adding from the tab", () => {
  it("keeps it as typed, as the person's own, About when no kind is given, rules and health allowed", async () => {
    const me = await account();
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "I'm allergic to nuts." }))).toMatchObject({ ok: true });
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "Always put work things in Work.", kind: "rules" }))).toMatchObject({ ok: true });
    const rows = await memoriesForPrompt(me);
    expect(rows.map((m) => [m.text, m.kind, m.origin]).sort()).toEqual([
      ["Always put work things in Work.", "rules", "stated"],
      ["I'm allergic to nuts.", "about", "stated"],
    ]);
  });

  it("refuses what no memory holds, a duplicate, and a twenty-first rule", async () => {
    const me = await account();
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "My card is 4111 1111 1111 1111.", kind: "things" }))).toEqual({ ok: false, error: "never_list" });
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "Meera's email is p@x.com.", kind: "people" }))).toEqual({ ok: false, error: "never_list" });
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "   ", kind: "about" }))).toEqual({ ok: false, error: "empty" });
    await tx((trx) => addMemory(trx, { accountId: me, text: "Their wife is Meera.", kind: "people" }));
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "their wife is meera.", kind: "people" }))).toEqual({ ok: false, error: "duplicate" });
    for (let i = 0; i < 20; i += 1) await tx((trx) => addMemory(trx, { accountId: me, text: `Always rule ${i}.`, kind: "rules" }));
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "Always one more.", kind: "rules" }))).toEqual({ ok: false, error: "rules_full" });
  });

  it("at 300, retires the oldest learned to make room, and refuses when all are the person's own", async () => {
    const me = await account();
    const oldest = await learned(me, "Learned first.", new Date(Date.now() - 10 * 86400_000));
    await learned(me, "Learned second.", new Date(Date.now() - 5 * 86400_000));
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${me}, 'account', ${me}, 'about', 'Mine ' || n || '.', 'stated' from generate_series(1, 298) n`.execute(db);
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "One more of mine.", kind: "about" }))).toMatchObject({ ok: true });
    const gone = await db.selectFrom("notes").select("deleted_at").where("id", "=", oldest).executeTakeFirstOrThrow();
    expect(gone.deleted_at).not.toBeNull();
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "And another.", kind: "about" }))).toMatchObject({ ok: true });
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "Past the cap.", kind: "about" }))).toEqual({ ok: false, error: "memories_full" });
    expect((await listMemories(me)).full).toBe(true);
    const said_ = await said(me, "remember the bins go out tuesdays");
    expect(await tx((trx) => remember(trx, { accountId: me, messageId: said_, text: "Bins go out Tuesdays.", kind: "things" }))).toEqual({ ok: false, error: "memories_full" });
  });
});

describe("changing from the tab", () => {
  it("makes a learned one the person's own, so its words are not learned again, and moves it on the map", async () => {
    const me = await account();
    const from = await said(me, "we moved to Montreal");
    const id = await learned(me, "They live in Toronto.", new Date(), from);
    await db.updateTable("notes").set({ place_dx: 5, place_dy: 58, embedded_at: new Date() } as never).where("id", "=", id).execute();
    expect(await tx((trx) => changeMemory(trx, { accountId: me, id, text: "They live in Montreal." }))).toMatchObject({ ok: true });
    const row = await db.selectFrom("notes").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ origin: "stated", text: "They live in Montreal.", derived_from_message_id: null, place_dx: null, embedded_at: null });
    expect(await db.selectFrom("memory_forgotten").select("message_id").execute()).toEqual([{ message_id: from }]);
  });

  it("keeps an answered memory's calendar while only its kind changes, and severs it when the words change", async () => {
    const me = await account();
    const answered = await db
      .insertInto("notes")
      .values({ account_id: me, scope: "account", subject_id: me, kind: "things", text: "They share a calendar with Meera.", origin: "answered", attrs: JSON.stringify({ with: "meera" }) })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx((trx) => changeMemory(trx, { accountId: me, id: answered.id, kind: "people" }));
    let row = await db.selectFrom("notes").select(["origin", "attrs"]).where("id", "=", answered.id).executeTakeFirstOrThrow();
    expect(row.origin).toBe("answered");
    expect((row.attrs as { with?: string }).with).toBe("meera");
    await tx((trx) => changeMemory(trx, { accountId: me, id: answered.id, text: "They share a calendar with Meera Sen." }));
    row = await db.selectFrom("notes").select(["origin", "attrs", "calendar_id"] as never).where("id", "=", answered.id).executeTakeFirstOrThrow() as never;
    expect(row).toMatchObject({ origin: "stated", calendar_id: null });
    expect((row.attrs as { with?: string }).with).toBeUndefined();
  });

  it("refuses words another memory already says, and another account's memory", async () => {
    const me = await account();
    const other = await account("Sam");
    await tx((trx) => addMemory(trx, { accountId: me, text: "Their wife is Meera.", kind: "people" }));
    const mine = await tx((trx) => addMemory(trx, { accountId: me, text: "Their sister is Rina.", kind: "people" }));
    if (!mine.ok) throw new Error("not added");
    expect(await tx((trx) => changeMemory(trx, { accountId: me, id: mine.id, text: "THEIR WIFE IS MEERA." }))).toEqual({ ok: false, error: "duplicate" });
    expect(await tx((trx) => changeMemory(trx, { accountId: other, id: mine.id, text: "Hijacked." }))).toEqual({ ok: false, error: "not_found" });
  });
});

describe("forgetting from the tab", () => {
  it("forgets without a message, and Undo by id puts it back", async () => {
    const me = await account();
    const added = await tx((trx) => addMemory(trx, { accountId: me, text: "My sister is Rina.", kind: "people" }));
    if (!added.ok) throw new Error("not added");
    expect(await tx((trx) => forget(trx, { accountId: me, messageId: null, memoryId: added.id }))).toEqual({ ok: true, id: added.id });
    expect(await memoriesForPrompt(me)).toEqual([]);
    expect(await tx((trx) => restoreMemory(trx, me, added.id))).toBe(true);
    expect((await memoriesForPrompt(me)).map((m) => m.text)).toEqual(["My sister is Rina."]);
    // Not after the window.
    await tx((trx) => forget(trx, { accountId: me, messageId: null, memoryId: added.id }));
    await db.updateTable("notes").set({ purge_after: new Date(Date.now() - 1000) }).where("id", "=", added.id).execute();
    expect(await tx((trx) => restoreMemory(trx, me, added.id))).toBe(false);
  });
});

import { howOf } from "../src/exports/build.js";

describe("the export says how each was come by", () => {
  it("you added, you changed, as the editor does", () => {
    expect(howOf("stated", { added: "tab" })).toBe("you added");
    expect(howOf("learned", { changed: "tab" })).toBe("you changed");
    expect(howOf("stated", {})).toBe("you asked");
    expect(howOf("answered", {})).toBe("you answered");
    expect(howOf("learned", null)).toBe("offload learned");
  });
});

import { pendingEmbeds, EMBED_MODEL } from "../src/search/sweep.js";

describe("a memory's embedding", () => {
  it("is booked as embed.memory when missing or older than the words, and not once it is current", async () => {
    const me = await account();
    const added = await tx((trx) => addMemory(trx, { accountId: me, text: "My sister is Rina.", kind: "people" }));
    if (!added.ok) throw new Error("not added");
    const booked = (await pendingEmbeds()).filter((p) => p.rowId === added.id);
    expect(booked.map((p) => p.kind)).toEqual(["embed.memory"]);

    await sql`update notes set embedding_model = ${EMBED_MODEL}, embedded_at = updated_at + interval '1 second' where id = ${added.id}`.execute(db);
    expect((await pendingEmbeds()).some((p) => p.rowId === added.id)).toBe(false);

    await tx((trx) => changeMemory(trx, { accountId: me, id: added.id, text: "My sister is Rina Sen." }));
    expect((await pendingEmbeds()).filter((p) => p.rowId === added.id).map((p) => p.kind)).toEqual(["embed.memory"]);
  });

  it("is never booked for a forgotten or replaced memory", async () => {
    const me = await account();
    const added = await tx((trx) => addMemory(trx, { accountId: me, text: "My sister is Rina.", kind: "people" }));
    if (!added.ok) throw new Error("not added");
    await tx((trx) => forget(trx, { accountId: me, messageId: null, memoryId: added.id }));
    expect((await pendingEmbeds()).some((p) => p.rowId === added.id)).toBe(false);
  });
});

describe("two changes at once", () => {
  it("never make a twenty-first rule", async () => {
    const me = await account();
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${me}, 'account', ${me}, 'rules', 'Always rule ' || n || '.', 'stated' from generate_series(1, 19) n`.execute(db);
    const a = await tx((trx) => addMemory(trx, { accountId: me, text: "Never file receipts in Home.", kind: "about" }));
    const b = await tx((trx) => addMemory(trx, { accountId: me, text: "Never file work in Home.", kind: "about" }));
    if (!a.ok || !b.ok) throw new Error("not added");
    const outcomes = await Promise.all(
      [
        [a.id, "Never file receipts in Home."],
        [b.id, "Never file work in Home."],
      ].map(([id, text]) =>
        db.transaction().execute(async (trx) => {
          const out = await changeMemory(trx as never, { accountId: me, id: id!, kind: "rules", text: text! });
          await new Promise((r) => setTimeout(r, 50));
          return out;
        }),
      ),
    );
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok && o.error === "rules_full")).toHaveLength(1);
    const rules = await db.selectFrom("notes").select(sql<number>`count(*)::int`.as("n")).where("subject_id", "=", me).where("kind", "=", "rules").where("deleted_at", "is", null).executeTakeFirstOrThrow();
    expect(rules.n).toBe(20);
  });
});

describe("040 security review", () => {
  it("refuses a password or an immigration status from the tab, as the privacy page says", async () => {
    const me = await account();
    for (const text of ["My Vanguard password is swordfish.", "The wifi passcode: hunter22.", "My immigration status is a work permit until May.", "I'm undocumented."]) {
      expect(await tx((trx) => addMemory(trx, { accountId: me, text, kind: "about" })), text).toEqual({ ok: false, error: "never_list" });
    }
    // Words near them that hold neither are kept.
    expect(await tx((trx) => addMemory(trx, { accountId: me, text: "They reset passwords for their parents.", kind: "about" }))).toMatchObject({ ok: true });
  });

  it("a change drops the old words' vector, not only its clock", async () => {
    const me = await account();
    const added = await tx((trx) => addMemory(trx, { accountId: me, text: "Their partner is Sam.", kind: "people" }));
    if (!added.ok) throw new Error("not added");
    await sql`update notes set embedding = ${`[${new Array(1024).fill(0.1).join(",")}]`}::halfvec, embedding_model = 'voyage-4', embedded_at = now() where id = ${added.id}`.execute(db);
    await tx((trx) => changeMemory(trx, { accountId: me, id: added.id, text: "Their partner is Sam Ibekwe." }));
    const row = await db.selectFrom("notes").select([sql<boolean>`embedding is null`.as("cleared"), "embedding_model"]).where("id", "=", added.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ cleared: true, embedding_model: null });
  });

  it("a learned memory the cap retires waits the same ten minutes a forget does", async () => {
    const me = await account();
    const oldest = await learned(me, "Learned first.", new Date(Date.now() - 10 * 86400_000));
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${me}, 'account', ${me}, 'about', 'Mine ' || n || '.', 'stated' from generate_series(1, 299) n`.execute(db);
    await tx((trx) => addMemory(trx, { accountId: me, text: "One more of mine.", kind: "about" }));
    const gone = await db.selectFrom("notes").select(sql<boolean>`purge_after > now() + interval '9 minutes'`.as("waits")).where("id", "=", oldest).executeTakeFirstOrThrow();
    expect(gone.waits).toBe(true);
  });

  it("Undo at the cap is refused rather than retiring another memory", async () => {
    const me = await account();
    const keep = await learned(me, "Learned and kept.", new Date(Date.now() - 10 * 86400_000));
    const added = await tx((trx) => addMemory(trx, { accountId: me, text: "Mine to forget.", kind: "about" }));
    if (!added.ok) throw new Error("not added");
    await tx((trx) => forget(trx, { accountId: me, messageId: null, memoryId: added.id }));
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${me}, 'account', ${me}, 'about', 'Mine ' || n || '.', 'stated' from generate_series(1, 299) n`.execute(db);
    expect(await tx((trx) => restoreMemory(trx, me, added.id))).toBe(false);
    const kept = await db.selectFrom("notes").select("deleted_at").where("id", "=", keep).executeTakeFirstOrThrow();
    expect(kept.deleted_at).toBeNull();
  });

  it("turning a memory into a rule needs its words in the change, the words it already says", async () => {
    const me = await account();
    const added = await tx((trx) => addMemory(trx, { accountId: me, text: "Never file receipts in Home.", kind: "about" }));
    if (!added.ok) throw new Error("not added");
    expect(await tx((trx) => changeMemory(trx, { accountId: me, id: added.id, kind: "rules" }))).toEqual({ ok: false, error: "empty" });
    expect(await tx((trx) => changeMemory(trx, { accountId: me, id: added.id, kind: "rules", text: "Never file receipts in Home." }))).toMatchObject({ ok: true });
  });
});
