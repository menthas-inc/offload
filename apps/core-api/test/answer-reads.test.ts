// The three reads an answer is built from.
//
// AC-5   a set returns as many rows as there are. Two is two.
// AC-4b  a truncated read cannot support a "no".
// AC-5d  a filtered list is unranked; a search is relevance then recency.
// AC-15  a date range works across threads, scoped by membership not authorship.
// AC-2b  a shared thread returns what another member wrote and timed.
// AC-8   what leaves is bounded by named constants.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import {
  ANSWER_RESULTS,
  ANSWER_ROW_CHARS,
  ANSWER_SETS,
  listAgenda,
  listContent,
  search,
} from "../src/search/read.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("content_chunks").execute();
  await db.deleteFrom("content").execute();
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

async function thread(accountId: string, name: string): Promise<string> {
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

interface Extra {
  type?: "note" | "task" | "event";
  done?: boolean;
  body?: string;
  dueAt?: Date;
  occursAt?: Date;
}

async function add(threadId: string, accountId: string, title: string, extra: Extra = {}) {
  const row = await db
    .insertInto("content")
    .values({
      thread_id: threadId,
      account_id: accountId,
      title,
      type: extra.type ?? "note",
      body: extra.body ?? null,
      done_at: extra.done ? new Date() : null,
      due_at: extra.dueAt ?? null,
      occurs_at: extra.occursAt ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("AC-5 a filtered list answers with however many there are", () => {
  it("returns two rows when two match, not a page padded out", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await add(lisbon, ana, "Book the flat", { type: "task" });
    await add(lisbon, ana, "Find a restaurant", { type: "task" });
    await add(lisbon, ana, "Buy sunscreen", { type: "task", done: true });
    await add(lisbon, ana, "Flight number", { type: "note" });

    const result = await listContent(ana, { threadId: lisbon, type: "task", done: false });

    expect(result?.rows.map((r) => r.title).sort()).toEqual(["Book the flat", "Find a restaurant"]);
    expect(result?.truncated).toBe(false);
    expect(result?.threadName).toBe("Lisbon trip");
  });

  it("names the thread on every row, not only on the result", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await add(lisbon, ana, "Book the flat");
    const result = await listContent(ana, { threadId: lisbon });
    // A row is drawn by the same component wherever it came from, so a row that
    // knows its thread in one result and not in another is two shapes.
    expect(result?.rows[0].threadName).toBe("Lisbon trip");
  });

  it("refuses a thread you are not in the same way as one that does not exist", async () => {
    const ana = await account();
    const stranger = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    expect(await listContent(stranger, { threadId: lisbon })).toBeNull();
    expect(await listContent(stranger, { threadId: uuidv7() })).toBeNull();
  });
});

describe("AC-4b a truncated read cannot support a no", () => {
  it("says it was truncated when there is more than a page", async () => {
    const ana = await account();
    const groceries = await thread(ana, "Groceries");
    for (let i = 0; i < ANSWER_RESULTS + 5; i++) {
      await add(groceries, ana, `item ${i}`, { type: "task" });
    }
    const result = await listContent(ana, { threadId: groceries, type: "task" });
    expect(result?.rows).toHaveLength(ANSWER_RESULTS);
    expect(result?.truncated).toBe(true);
  });

  it("finds the row outside the first page when the question narrows to it", async () => {
    // **The wrong-no test.** A thread longer than a page, with the asked-about
    // row deliberately outside it. Without `matching` the check reads whichever
    // twenty rows came back, answers "no", and somebody buys butter twice.
    const ana = await account();
    const groceries = await thread(ana, "Groceries");
    await add(groceries, ana, "buy butter", { type: "task" });
    for (let i = 0; i < ANSWER_RESULTS + 10; i++) {
      await add(groceries, ana, `item ${i}`, { type: "task" });
    }

    const blind = await listContent(ana, { threadId: groceries, type: "task" });
    expect(blind?.truncated).toBe(true);
    expect(blind?.rows.some((r) => r.title === "buy butter")).toBe(false);

    const narrowed = await listContent(ana, { threadId: groceries, matching: "butter" });
    expect(narrowed?.rows.map((r) => r.title)).toEqual(["buy butter"]);
    expect(narrowed?.truncated).toBe(false);
  });

  it("finds it even when it is already ticked", async () => {
    // Butter may be on the list and bought. "You got it on Tuesday" is the
    // answer, not "no".
    const ana = await account();
    const groceries = await thread(ana, "Groceries");
    await add(groceries, ana, "buy butter", { type: "task", done: true });
    const found = await listContent(ana, { threadId: groceries, matching: "butter" });
    expect(found?.rows).toHaveLength(1);
    expect(found?.rows[0].doneAt).not.toBeNull();
  });
});

describe("AC-15 a span of time, across threads", () => {
  it("answers what is due in a range without being told a thread", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    const flat = await thread(ana, "Flat admin");
    await add(lisbon, ana, "Pay the deposit", { type: "task", dueAt: new Date("2026-09-10T09:00:00Z") });
    await add(flat, ana, "Renew insurance", { type: "task", dueAt: new Date("2026-09-11T09:00:00Z") });
    await add(flat, ana, "Much later", { type: "task", dueAt: new Date("2026-12-01T09:00:00Z") });

    const week = await listAgenda(ana, {
      fromIso: "2026-09-08T00:00:00Z",
      toIso: "2026-09-14T23:59:59Z",
      when: "due",
    });

    expect(week.rows.map((r) => r.title)).toEqual(["Pay the deposit", "Renew insurance"]);
    expect(week.threadName).toBeNull();
    expect(week.rows.map((r) => r.threadName)).toEqual(["Lisbon trip", "Flat admin"]);
  });

  it("includes what another member timed in a shared thread", async () => {
    // Membership, not authorship. Author scoping passes every single-account
    // fixture and quietly omits half a shared trip.
    const ana = await account();
    const bea = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await db
      .insertInto("thread_members")
      .values({ thread_id: lisbon, account_id: bea, state: "accepted" })
      .execute();

    await add(lisbon, bea, "Bea booked dinner", { type: "event", occursAt: new Date("2026-09-12T19:00:00Z") });

    const thursday = await listAgenda(ana, {
      fromIso: "2026-09-12T00:00:00Z",
      toIso: "2026-09-12T23:59:59Z",
      when: "occurs",
    });
    expect(thursday.rows.map((r) => r.title)).toEqual(["Bea booked dinner"]);
  });

  it("answers what was dumped in a range, which falls out of the same read", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await add(lisbon, ana, "Yesterday's note");
    const recent = await listAgenda(ana, {
      fromIso: new Date(Date.now() - 86_400_000).toISOString(),
      toIso: new Date(Date.now() + 86_400_000).toISOString(),
      when: "created",
    });
    expect(recent.rows.map((r) => r.title)).toEqual(["Yesterday's note"]);
  });
});

describe("AC-5d search ranks; a filter does not", () => {
  it("finds by exact term without any embedding at all", async () => {
    // Voyage unreachable is worse search, not broken search: the text arm
    // answers alone and there is no failure line, because there is nothing for
    // the person to do about it.
    const ana = await account();
    const istanbul = await thread(ana, "Istanbul trip");
    await add(istanbul, ana, "Airbnb in Beyoglu", { body: "Checked in on the 3rd" });
    await add(istanbul, ana, "Ferry times");

    const found = await search(ana, { query: "Airbnb" });
    expect(found.rows.map((r) => r.title)).toEqual(["Airbnb in Beyoglu"]);
  });

  it("returns nothing rather than everything when nothing matches", async () => {
    const ana = await account();
    const istanbul = await thread(ana, "Istanbul trip");
    await add(istanbul, ana, "Ferry times");
    const found = await search(ana, { query: "dentist" });
    expect(found.rows).toEqual([]);
    expect(found.truncated).toBe(false);
  });

  it("never returns another account's rows", async () => {
    const ana = await account();
    const stranger = await account();
    const theirs = await thread(stranger, "Their trip");
    await add(theirs, stranger, "Airbnb in Beyoglu");
    expect((await search(ana, { query: "Airbnb" })).rows).toEqual([]);
  });
});

describe("AC-8 what leaves is bounded by named constants", () => {
  it("truncates a long body to the row cap", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await add(lisbon, ana, "Long one", { body: "x".repeat(ANSWER_ROW_CHARS * 3) });
    const result = await listContent(ana, { threadId: lisbon });
    expect(result?.rows[0].body).toHaveLength(ANSWER_ROW_CHARS);
  });

  it("has an OFF-8 ceiling that is a constant, not a function of account age", async () => {
    // The whole bound: three results of twenty rows at two hundred characters.
    // A test rather than a comment, because the number is the thing a reviewer
    // can check and prose is not.
    expect(ANSWER_SETS * ANSWER_RESULTS).toBe(60);
    expect(ANSWER_ROW_CHARS).toBe(200);
  });

  it("costs the same on a large account as on a small one", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    for (let i = 0; i < 200; i++) await add(lisbon, ana, `note ${i}`);

    const result = await listContent(ana, { threadId: lisbon });
    const bytes = JSON.stringify(result?.rows).length;
    expect(result?.rows).toHaveLength(ANSWER_RESULTS);

    await db.deleteFrom("content").where("thread_id", "=", lisbon).execute();
    for (let i = 0; i < 5; i++) await add(lisbon, ana, `note ${i}`);
    const small = await listContent(ana, { threadId: lisbon });
    expect(JSON.stringify(small?.rows).length).toBeLessThan(bytes);
    // and the large one is capped rather than growing
    expect(bytes).toBeLessThan(ANSWER_RESULTS * (ANSWER_ROW_CHARS + 400));
  });
});

describe("the reads go through the predicate rather than restating it", () => {
  it("uses readable_content, so a pending member gets nothing", async () => {
    const ana = await account();
    const invited = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await db
      .insertInto("thread_members")
      .values({ thread_id: lisbon, account_id: invited, state: "pending" })
      .execute();
    await add(lisbon, ana, "Book the flat");

    expect(await listContent(invited, { threadId: lisbon })).toBeNull();
    expect((await search(invited, { query: "flat" })).rows).toEqual([]);
    const agenda = await listAgenda(invited, {
      fromIso: new Date(Date.now() - 86_400_000).toISOString(),
      toIso: new Date(Date.now() + 86_400_000).toISOString(),
      when: "created",
    });
    expect(agenda.rows).toEqual([]);
  });

  it("excludes archived rows from every read", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    const id = await add(lisbon, ana, "Old news");
    await db.updateTable("content").set({ archived_at: sql`now()` }).where("id", "=", id).execute();

    expect((await listContent(ana, { threadId: lisbon }))?.rows).toEqual([]);
    expect((await search(ana, { query: "Old news" })).rows).toEqual([]);
  });
});
