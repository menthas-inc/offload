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
  await db.deleteFrom("note_chunks").execute();
  await db.deleteFrom("message_chunks").execute();
  await db.deleteFrom("notes").execute();
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
  type?: "task" | "event" | "link";
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
      type: extra.type ?? "task",
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
    await add(lisbon, ana, "Flight number", { type: "link" });

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
    expect(result?.rows[0]!.threadName).toBe("Lisbon trip");
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
    expect(found?.rows[0]!.doneAt).not.toBeNull();
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
    expect(result?.rows[0]!.body).toHaveLength(ANSWER_ROW_CHARS);
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

  // 2026-10-17 (the owner). What has passed archives itself, and archive takes
  // a row off the list, never out of reach: "nothing expires on a clock,
  // because finding something from years ago is the point". Search and a
  // window of dates read archived rows too, behind the live ones; a thread's
  // list is the live list.
  it("keeps archived rows off a thread's list and finds them by search and by date, behind the live ones", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    const old = await add(lisbon, ana, "Ferry tickets to Cacilhas", { type: "event", occursAt: new Date("2026-09-10T09:00:00Z") });
    await add(lisbon, ana, "Ferry tickets for Sunday", { type: "event", occursAt: new Date("2026-09-12T09:00:00Z") });
    await db.updateTable("content").set({ archived_at: sql`now()` }).where("id", "=", old).execute();

    expect((await listContent(ana, { threadId: lisbon }))?.rows.map((r) => r.title)).toEqual(["Ferry tickets for Sunday"]);
    expect((await search(ana, { query: "ferry tickets" })).rows.map((r) => r.title)).toEqual(["Ferry tickets for Sunday", "Ferry tickets to Cacilhas"]);
    expect((await search(ana, { query: "Cacilhas" })).rows.map((r) => r.title)).toEqual(["Ferry tickets to Cacilhas"]);
    const week = await listAgenda(ana, { fromIso: "2026-09-08T00:00:00Z", toIso: "2026-09-14T23:59:59Z", when: "occurs" });
    expect(week.rows.map((r) => r.title)).toEqual(["Ferry tickets for Sunday", "Ferry tickets to Cacilhas"]);
  });
});

describe("search reads notes and conversations, and does not draw them", () => {
  async function conversation(accountId: string) {
    const row = await db
      .insertInto("conversations")
      .values({ account_id: accountId })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function message(
    conversationId: string,
    accountId: string,
    role: "person" | "offload",
    text: string,
  ) {
    const row = await db
      .insertInto("messages")
      .values({
        conversation_id: conversationId,
        account_id: accountId,
        role,
        turn_id: uuidv7(),
        text,
        state: "answered",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  it("finds a standing rule and keeps it out of the rows", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await db
      .insertInto("notes")
      .values({
        scope: "thread",
        subject_id: lisbon,
        account_id: ana,
        kind: "standing",
        text: "Ana always books aisle seats",
        origin: "stated",
      })
      .execute();

    const found = await search(ana, { query: "aisle" });
    // A note has no checkbox, so it informs the sentence and is not a row.
    expect(found.rows).toEqual([]);
    expect(found.asides?.map((a) => a.kind)).toEqual(["note"]);
    expect(found.asides?.[0]!.text).toContain("aisle seats");
    expect(found.asides?.[0]!.threadName).toBe("Lisbon trip");
  });

  it("says whether offload or the person said a message", async () => {
    // The distinction the prompt turns on. Offload's own earlier reply is a
    // record of what was said and evidence of nothing else about the world;
    // without the label, one wrong answer becomes a source for the next.
    const ana = await account();
    const chat = await conversation(ana);
    await message(chat, ana, "offload", "I filed the ferry booking under Istanbul");

    const found = await search(ana, { query: "ferry" });
    expect(found.asides?.map((a) => a.who)).toEqual(["offload"]);
  });

  it("prefers the content row over the message it was written from", async () => {
    const ana = await account();
    const istanbul = await thread(ana, "Istanbul trip");
    const chat = await conversation(ana);
    const dump = await message(chat, ana, "person", "airbnb in Beyoglu, 3rd to the 7th");
    await db
      .insertInto("content")
      .values({
        thread_id: istanbul,
        account_id: ana,
        title: "airbnb in Beyoglu",
        type: "task",
        derived_from_message_id: dump,
      })
      .execute();

    const found = await search(ana, { query: "Beyoglu" });
    // The row still exists in a thread and can be ticked; the message is only
    // provenance, so returning both would be one answer twice.
    expect(found.rows.map((r) => r.title)).toEqual(["airbnb in Beyoglu"]);
    expect(found.asides ?? []).toEqual([]);
  });

  it("never reads another account's conversation", async () => {
    const ana = await account();
    const bea = await account();
    const shared = await thread(ana, "Lisbon trip");
    await db
      .insertInto("thread_members")
      .values({ thread_id: shared, account_id: bea, state: "accepted" })
      .execute();

    const chat = await conversation(ana);
    await message(chat, ana, "person", "book the flat for the 14th");

    // A conversation is never shared, including the one that filed into a
    // thread they both use.
    const forBea = await search(bea, { query: "flat" });
    expect(forBea.asides ?? []).toEqual([]);
  });

  it("skips a muted note, matching what the model already sees", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await db
      .insertInto("notes")
      .values({
        scope: "thread",
        subject_id: lisbon,
        account_id: ana,
        kind: "standing",
        text: "Ana always books aisle seats",
        origin: "stated",
        muted_at: sql`now()`,
      })
      .execute();

    // A muted rule is one somebody switched off. Answering from it contradicts
    // the switch, and context.py already filters it where notes reach a
    // prompt, so the two agree.
    expect((await search(ana, { query: "aisle" })).asides ?? []).toEqual([]);
  });
});

describe("notes and conversations are found by meaning too, as content is", () => {
  /** A unit vector along one axis: two notes on different axes are far apart,
   *  and a query on one axis is nearest the note on it. */
  const along = (axis: number) => `[${Array.from({ length: 1024 }, (_, i) => (i === axis ? 1 : 0)).join(",")}]`;

  async function note(threadId: string, accountId: string, text: string, axis: number, extra: { mutedAt?: boolean } = {}) {
    const row = await db
      .insertInto("notes")
      .values({
        scope: "thread",
        subject_id: threadId,
        account_id: accountId,
        kind: "standing",
        text,
        origin: "stated",
        ...(extra.mutedAt ? { muted_at: sql`now()` } : {}),
      } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    await sql`insert into note_chunks (note_id, subject_id, ord, text, embedding, embedded_at)
      values (${row.id}, ${threadId}, 0, ${text}, ${along(axis)}::halfvec, now())`.execute(db);
    return row.id;
  }

  async function said(accountId: string, role: "person" | "offload", text: string, axis: number) {
    const chat = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
    const row = await db
      .insertInto("messages")
      .values({ conversation_id: chat.id, account_id: accountId, role, turn_id: uuidv7(), text, state: "answered" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await sql`insert into message_chunks (message_id, account_id, role, ord, text, embedding, embedded_at)
      values (${row.id}, ${accountId}, ${role}, 0, ${text}, ${along(axis)}::halfvec, now())`.execute(db);
    return row.id;
  }

  it("finds a note that shares no word with the question, nearest first", async () => {
    const ana = await account();
    const home = await thread(ana, "Home");
    await note(home, ana, "Bins go out on Tuesday night", 2);
    await note(home, ana, "The heater was replaced in 2024", 1);

    const found = await search(ana, { query: "boiler", queryVector: along(1) });
    expect(found.asides?.filter((a) => a.kind === "note")[0]?.text).toBe("The heater was replaced in 2024");
  });

  it("finds a message that shares no word with the question", async () => {
    const ana = await account();
    await said(ana, "person", "the plumber comes on Friday", 1);

    const found = await search(ana, { query: "boiler", queryVector: along(1) });
    expect(found.asides?.filter((a) => a.kind === "message").map((a) => a.text)).toEqual(["the plumber comes on Friday"]);
  });

  it("keeps every filter the words obey: muted notes, other accounts, messages already filed", async () => {
    const ana = await account();
    const bea = await account();
    const home = await thread(ana, "Home");
    await note(home, ana, "The heater was replaced in 2024", 1, { mutedAt: true });
    await said(bea, "person", "the plumber comes on Friday", 1);
    const filed = await said(ana, "person", "buy a new boiler filter", 1);
    await db.insertInto("content").values({ thread_id: home, account_id: ana, title: "Boiler filter", type: "task", derived_from_message_id: filed }).execute();

    const found = await search(ana, { query: "plumbing", queryVector: along(1) });
    expect(found.asides ?? []).toEqual([]);
  });

  it("reads nothing past the meaning floor: rows, notes or messages", async () => {
    // A unit vector at cosine distance `d` from axis 0.
    const at = (d: number) =>
      `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 - d : i === 1 ? Math.sqrt(1 - (1 - d) ** 2) : 0)).join(",")}]`;
    const ana = await account();
    const home = await thread(ana, "Home");
    for (const [text, d] of [["Heater replaced", 0.5], ["Bins on Tuesday", 0.7]] as const) {
      const id = await add(home, ana, text);
      await sql`insert into content_chunks (content_id, thread_id, ord, text, embedding, embedded_at)
        values (${id}::uuid, ${home}::uuid, 0, ${text}, ${at(d)}::halfvec, now())`.execute(db);
      const n = await db
        .insertInto("notes")
        .values({ scope: "thread", subject_id: home, account_id: ana, kind: "standing", text: `note ${text}`, origin: "stated" } as never)
        .returning("id")
        .executeTakeFirstOrThrow();
      await sql`insert into note_chunks (note_id, subject_id, ord, text, embedding, embedded_at)
        values (${n.id}, ${home}, 0, ${text}, ${at(d)}::halfvec, now())`.execute(db);
      const chat = await db.insertInto("conversations").values({ account_id: ana }).returning("id").executeTakeFirstOrThrow();
      const m = await db
        .insertInto("messages")
        .values({ conversation_id: chat.id, account_id: ana, role: "person", turn_id: uuidv7(), text: `said ${text}`, state: "answered" })
        .returning("id")
        .executeTakeFirstOrThrow();
      await sql`insert into message_chunks (message_id, account_id, role, ord, text, embedding, embedded_at)
        values (${m.id}, ${ana}, 'person', 0, ${text}, ${at(d)}::halfvec, now())`.execute(db);
    }

    const found = await search(ana, { query: "zzzz", queryVector: at(0) });
    expect(found.rows.map((r) => r.title)).toEqual(["Heater replaced"]);
    expect(found.asides?.map((a) => a.text).sort()).toEqual(["note Heater replaced", "said Heater replaced"]);
  });

  it("still finds by words alone when there is no vector", async () => {
    const ana = await account();
    const home = await thread(ana, "Home");
    await note(home, ana, "The heater was replaced in 2024", 1);
    expect((await search(ana, { query: "heater" })).asides?.map((a) => a.text)).toEqual(["The heater was replaced in 2024"]);
  });
});

describe("AC-9 retrieval shortlists and never decides", () => {
  it("returns every candidate rather than picking the best one", async () => {
    // **No distance threshold decides between candidates.** `decisions.md`
    // records why: embedders score below random on negation, so "not Lisbon"
    // and "Lisbon" are neighbours, and anything that decides on a score alone
    // gets that wrong silently. Retrieval hands the model candidates; the model
    // reads them and answers. The meaning floor (2026-10-31) only drops far
    // candidates, and a negation's neighbour is near by definition.
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    // Through the meaning arm too, each a little further from the query than
    // the last, the negated row furthest and still inside the floor.
    const at = (d: number) =>
      `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 - d : i === 1 ? Math.sqrt(1 - (1 - d) ** 2) : 0)).join(",")}]`;
    for (const [title, d, body] of [["Airbnb in Alfama", 0.1, "Booked for the 14th"], ["Airbnb cancellation policy", 0.15, ""], ["Not the Airbnb, the hotel", 0.2, ""]] as const) {
      const id = await add(lisbon, ana, title, body ? { body } : {});
      await sql`insert into content_chunks (content_id, thread_id, ord, text, embedding, embedded_at)
        values (${id}::uuid, ${lisbon}::uuid, 0, ${title}, ${at(d)}::halfvec, now())`.execute(db);
    }

    // Words alone and with meaning: three matches either way, including the
    // negated one, which is exactly the row a threshold deciding between
    // neighbours would have been most confident about dropping.
    for (const queryVector of [null, at(0)]) {
      const found = await search(ana, { query: "airbnb", queryVector });
      expect(found.rows).toHaveLength(3);
      expect(found.rows.map((r) => r.title)).toContain("Not the Airbnb, the hotel");
    }
  });

  it("never returns a verdict, only rows and whether there were more", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    await add(lisbon, ana, "Airbnb in Alfama");
    const found = await search(ana, { query: "airbnb" });

    // The shape is the assertion. There is no `answer`, no `best`, no score:
    // nothing the caller could mistake for a decision already made.
    expect(Object.keys(found).sort()).toEqual([
      "asides",
      "rows",
      "threadId",
      "threadName",
      "truncated",
    ]);
  });
});

describe("a deleted thread is gone from every read, not only from listContent", () => {
  // **The predicate is authorization, not lifecycle**, and 0026 says so in a
  // comment: `restore` depends on a deleted row still resolving. So each reader
  // has to state its own lifecycle, and three of them did not.
  //
  // The failure it produced: delete a thread, ask what is due this week, and the
  // rows come back with a working link to the thread you just deleted. Undo has
  // eight seconds and the purge is much later, so the window is not small.
  async function deletedThreadWith(title: string, extra: Extra = {}) {
    const ana = await account();
    const gone = await thread(ana, "Lisbon trip");
    const kept = await thread(ana, "Groceries");
    await add(gone, ana, title, extra);
    await add(kept, ana, `${title} kept`, extra);
    await db
      .updateTable("threads")
      .set({ deleted_at: sql`now()` })
      .where("id", "=", gone)
      .execute();
    return { ana, gone, kept };
  }

  it("is gone from listAgenda", async () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const { ana } = await deletedThreadWith("Book the flat", { type: "task", dueAt: soon });

    const rows = await listAgenda(ana, {
      when: "due",
      fromIso: new Date(Date.now() - 60_000).toISOString(),
      toIso: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(rows.rows.map((r) => r.title)).toEqual(["Book the flat kept"]);
  });

  it("is gone from search", async () => {
    const { ana } = await deletedThreadWith("Sunscreen");

    const result = await search(ana, { query: "sunscreen" });

    expect(result.rows.map((r) => r.title)).toEqual(["Sunscreen kept"]);
  });

  it("takes its notes out of the asides with it", async () => {
    const ana = await account();
    const gone = await thread(ana, "Lisbon trip");
    await db
      .insertInto("notes")
      .values({
        account_id: ana,
        scope: "thread",
        kind: "preference",
        origin: "stated",
        subject_id: gone,
        text: "Ana always flies out of Gatwick",
      })
      .execute();
    await db
      .updateTable("threads")
      .set({ deleted_at: sql`now()` })
      .where("id", "=", gone)
      .execute();

    const result = await search(ana, { query: "Gatwick" });

    // A standing rule about a thread that no longer exists would still be
    // steering the answer.
    expect(result.asides).toEqual([]);
  });
});
