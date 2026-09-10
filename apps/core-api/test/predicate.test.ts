// One authorization rule per table, in SQL, from migration 0026.
//
// AC-2   every read resolves through a predicate defined once, not per plane.
// AC-2a  a pending invitation reaches nothing.
// AC-2b  an accepted member reads what other members wrote.
// AC-2c  a thread note has account_id IS NULL and resolves through subject_id.
// AC-2d  a conversation resolves through its owner and is never shared.
//
// **These tests go through the views directly**, rather than through the
// functions that read them. The functions have their own tests and those cover
// the behaviour; what is not covered anywhere else is the predicate itself, and
// 013 adds a second reader in another language that will only ever see the
// view. If the rule is wrong here it is wrong for the agent plane too, and no
// TypeScript test would say so.

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
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string, name = "Lisbon trip"): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("thread_members")
    .values({ thread_id: row.id, account_id: accountId, state: "accepted" })
    .execute();
  return row.id;
}

async function member(
  threadId: string,
  accountId: string,
  state: "accepted" | "pending" = "accepted",
): Promise<void> {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state }).execute();
}

async function content(threadId: string, accountId: string, title: string): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({ thread_id: threadId, account_id: accountId, title, type: "task" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** What this account may read, straight through the view. */
function contentFor(accountId: string) {
  return db
    .selectFrom("readable_content")
    .select(["id", "title"])
    .where("viewer_account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .execute();
}

describe("AC-2b content resolves through membership, not authorship", () => {
  it("returns what another member wrote in a thread you are in", async () => {
    const ana = await account();
    const bea = await account();
    const trip = await thread(ana);
    await member(trip, bea);

    await content(trip, ana, "Book the flat");
    await content(trip, bea, "Find a restaurant");

    const forAna = await contentFor(ana);
    expect(forAna.map((r) => r.title).sort()).toEqual(["Book the flat", "Find a restaurant"]);

    // The point of the test. Filtering by content.account_id would pass every
    // single-account fixture and return one row here, which reads as broken and
    // gets "fixed" by dropping the filter altogether.
    const forBea = await contentFor(bea);
    expect(forBea.map((r) => r.title).sort()).toEqual(["Book the flat", "Find a restaurant"]);
  });

  it("returns nothing from a thread you are not in at all", async () => {
    const ana = await account();
    const stranger = await account();
    const trip = await thread(ana);
    await content(trip, ana, "Book the flat");

    expect(await contentFor(stranger)).toEqual([]);
  });
});

describe("AC-2a a pending invitation reaches nothing", () => {
  it("shows a pending member no content", async () => {
    const ana = await account();
    const invited = await account();
    const trip = await thread(ana);
    await member(trip, invited, "pending");
    await content(trip, ana, "Book the flat");

    expect(await contentFor(invited)).toEqual([]);
  });

  it("shows it the moment the invitation is accepted", async () => {
    const ana = await account();
    const invited = await account();
    const trip = await thread(ana);
    await member(trip, invited, "pending");
    await content(trip, ana, "Book the flat");

    await db
      .updateTable("thread_members")
      .set({ state: "accepted" })
      .where("thread_id", "=", trip)
      .where("account_id", "=", invited)
      .execute();

    expect((await contentFor(invited)).map((r) => r.title)).toEqual(["Book the flat"]);
  });

  it("shows a pending member no notes either", async () => {
    const ana = await account();
    const invited = await account();
    const trip = await thread(ana);
    await member(trip, invited, "pending");
    await db
      .insertInto("notes")
      .values({ scope: "thread", subject_id: trip, account_id: ana, kind: "standing", text: "Book aisle seats", origin: "stated" })
      .execute();

    const rows = await db
      .selectFrom("readable_notes")
      .select("id")
      .where("viewer_account_id", "=", invited)
      .execute();
    expect(rows).toEqual([]);
  });
});

describe("AC-2c a thread note has no account_id and still resolves", () => {
  it("is readable by every accepted member and by nobody else", async () => {
    const ana = await account();
    const bea = await account();
    const stranger = await account();
    const trip = await thread(ana);
    await member(trip, bea);

    // account_id null is the case the obvious predicate gets wrong: filtering
    // `where account_id = :viewer` returns nothing at all, and the obvious fix
    // for returning nothing is to drop the filter.
    await db
      .insertInto("notes")
      .values({ scope: "thread", subject_id: trip, account_id: null, kind: "going_on", text: "Three nights in Alfama", origin: "learned" })
      .execute();

    const readable = async (accountId: string) =>
      db.selectFrom("readable_notes").select("text").where("viewer_account_id", "=", accountId).execute();

    expect((await readable(ana)).map((r) => r.text)).toEqual(["Three nights in Alfama"]);
    expect((await readable(bea)).map((r) => r.text)).toEqual(["Three nights in Alfama"]);
    expect(await readable(stranger)).toEqual([]);
  });

  it("carries no scope but thread, because nothing writes the others", async () => {
    const ana = await account();
    const trip = await thread(ana);
    await db
      .insertInto("notes")
      .values({ scope: "account", subject_id: null, account_id: ana, kind: "preference", text: "Mornings are quiet", origin: "stated" })
      .execute();

    // Not a leak and not a loss: nothing writes account scope today, and the
    // view gains a branch when something does. Asserted so that whoever adds
    // the writer finds this test rather than a silent absence.
    const rows = await db
      .selectFrom("readable_notes")
      .select("id")
      .where("viewer_account_id", "=", ana)
      .execute();
    expect(rows).toEqual([]);
  });
});

describe("AC-2d a conversation resolves through its owner", () => {
  it("is never readable by another member of a thread it filed into", async () => {
    const ana = await account();
    const bea = await account();
    const trip = await thread(ana);
    await member(trip, bea);

    const conversation = await db
      .insertInto("conversations")
      .values({ account_id: ana })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id,
        account_id: ana,
        role: "person",
        turn_id: uuidv7(),
        text: "book the flat for the 14th",
        state: "answered",
      })
      .execute();
    // Ana's dump landed in the thread they share. What she said while dumping
    // is still hers alone.
    await content(trip, ana, "Book the flat");

    const forAna = await db
      .selectFrom("readable_messages")
      .select("text")
      .where("viewer_account_id", "=", ana)
      .execute();
    expect(forAna.map((r) => r.text)).toEqual(["book the flat for the 14th"]);

    const forBea = await db
      .selectFrom("readable_messages")
      .select("text")
      .where("viewer_account_id", "=", bea)
      .execute();
    expect(forBea).toEqual([]);

    // And the content it produced is shared, which is the distinction.
    expect((await contentFor(bea)).map((r) => r.title)).toEqual(["Book the flat"]);
  });

  it("hides a message whose conversation belongs to somebody else", async () => {
    const ana = await account();
    const bea = await account();
    const conversation = await db
      .insertInto("conversations")
      .values({ account_id: ana })
      .returning("id")
      .executeTakeFirstOrThrow();
    // Denormalised account_id disagreeing with its conversation should never
    // happen. The view makes it unreadable rather than readable by whichever
    // copy a query happened to consult.
    await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id,
        account_id: bea,
        role: "person",
        turn_id: uuidv7(),
        text: "not bea's to read",
        state: "answered",
      })
      .execute();

    const forBea = await db
      .selectFrom("readable_messages")
      .select("text")
      .where("viewer_account_id", "=", bea)
      .execute();
    expect(forBea).toEqual([]);
  });
});

describe("the views keep up with the tables they are made of", () => {
  // A view over `table.*` freezes its column list when it is created. 0027
  // added `search_text` to content, notes and messages, and the views made
  // in 0026 did not gain it: reads failed with "column content.search_text does
  // not exist", named after a table where it plainly does exist.
  //
  // 0028 recreates them. This is the guard, so the next migration that adds a
  // column finds out here instead of in production, where the same mistake can
  // also be silent rather than loud.
  it.each([
    ["content", "readable_content"],
    ["notes", "readable_notes"],
    ["messages", "readable_messages"],
  ])("%s and %s have the same columns", async (table, view) => {
    const columns = async (name: string) => {
      const rows = await sql<{ column_name: string }>`
        select column_name from information_schema.columns
        where table_schema = current_schema() and table_name = ${name}
        order by column_name
      `.execute(db);
      return rows.rows.map((r) => r.column_name);
    };
    const base = await columns(table);
    const derived = await columns(view);
    // The view is its table plus exactly the viewer column.
    expect(derived).toEqual([...base, "viewer_account_id"].sort());
  });
});

describe("AC-2 the views carry authorization and not lifecycle", () => {
  it("still returns a deleted row, so restore can find what it is undoing", async () => {
    const ana = await account();
    const trip = await thread(ana);
    const id = await content(trip, ana, "Book the flat");
    await db.updateTable("content").set({ deleted_at: new Date() }).where("id", "=", id).execute();

    // The caller filters deleted_at, and one caller deliberately does not.
    // Baking it into the view would break Undo and look like a missing row.
    const all = await db
      .selectFrom("readable_content")
      .select("id")
      .where("viewer_account_id", "=", ana)
      .execute();
    expect(all.map((r) => r.id)).toEqual([id]);

    expect(await contentFor(ana)).toEqual([]);
  });
});
