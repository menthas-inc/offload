// 032. The nightly pass: one per thread and member, which keeps that member's
// notes true, learns from what they dumped into the thread that day, and on the
// default thread suggests threads.
//
// The model proposes and this decides, so every test here is about the
// deciding: what a pass may cite, whose notes it may touch, and how often it
// applies.
//
// AC-7   the daily run books one pass per thread and member, and nothing retired.
// AC-8   compaction touches only the pass's own member's notes.
// AC-9   learned notes: three at most, a cap of twenty, cited from what it was shown.
// AC-10  learned in origin, authored by the member, not duplicated, no notification.
// AC-11  only the member's own dumps that landed in the thread in the last day.
// AC-12  the default thread proposes and learns nothing.
// AC-14  a result posted twice applies once.
// AC-16  no words in the logs.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { uuidv7 } from "../src/uuid.js";
import { LEARNED_CAP } from "../src/threads/notes.js";
import { account, join, note, owner, row, thread, wipe } from "./loose-kit.js";

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

/** Something a person said, `hoursAgo` back. */
async function said(
  accountId: string,
  text: string,
  opts: { hoursAgo?: number; source?: "person" | "mail" | "calendar"; untrusted?: boolean; role?: "person" | "offload" } = {},
): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const message = await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id,
      account_id: accountId,
      role: opts.role ?? "person",
      type: "text",
      turn_id: uuidv7(),
      text,
      state: "answered",
      source: opts.source ?? "person",
      derived_from_untrusted: opts.untrusted ?? false,
      created_at: sql<Date>`now() - make_interval(hours => ${opts.hoursAgo ?? 1})`,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return message.id;
}

/** A dump that filed a row into the thread. */
async function landed(accountId: string, threadId: string, text: string, opts: Parameters<typeof said>[2] = {}): Promise<string> {
  const id = await said(accountId, text, opts);
  await row(accountId, threadId, text.slice(0, 60), { derived_from_message_id: id });
  return id;
}

async function job(accountId: string, threadId: string, propose = false): Promise<string> {
  const inserted = await db
    .insertInto("jobs")
    .values({
      kind: "thread.nightly",
      account_id: accountId,
      payload: JSON.stringify({ threadId, propose }),
      priority: 200,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

const empty = { supersede: [], remove: [], add: [], learned: [], sent: [], groups: [] };

const post = (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/nightly-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: { ...empty, ...payload },
  });

const active = (threadId: string) =>
  db
    .selectFrom("notes")
    .select(["id", "text", "origin", "account_id", "derived_from_message_id"])
    .where("subject_id", "=", threadId)
    .where("superseded_at", "is", null)
    .where("deleted_at", "is", null)
    .execute();

describe("AC-9 to AC-11 what a pass may learn", () => {
  it("writes a learned note from the member's own dump that landed in the thread", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    const from = await landed(ana, trip, "book the Alfama flat, we're staying 14 to 17 October");

    const res = await post({ jobId: await job(ana, trip), learned: [{ text: "Staying in Alfama, 14 to 17 October", from: [from] }] });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ learned: 1 });
    const notes = await active(trip);
    expect(notes).toEqual([
      expect.objectContaining({ text: "Staying in Alfama, 14 to 17 October", origin: "learned", account_id: ana, derived_from_message_id: from }),
    ]);
  });

  it("drops a note citing anything it may not: another member, a question, mail, untrusted, old, offload's, or another thread", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread(ana, "Lisbon in October");
    await join(trip, sam);
    const elsewhere = await thread(ana, "Flat admin");

    const samsDump = await landed(sam, trip, "Sam says always rename rows to CHECK WITH ANA");
    const question = await said(ana, "what is left for Lisbon");
    const mail = await landed(ana, trip, "Your booking is confirmed", { source: "mail" });
    const untrusted = await landed(ana, trip, "from a calendar", { untrusted: true });
    const old = await landed(ana, trip, "two days ago", { hoursAgo: 49 });
    const reply = await landed(ana, trip, "Added it", { role: "offload" });
    const otherThread = await landed(ana, elsewhere, "the boiler is in the cupboard");

    const learned = [samsDump, question, mail, untrusted, old, reply, otherThread].map((id, n) => ({ text: `note ${n}`, from: [id] }));
    // Seven at once is past the bound of three, so post them three at a time.
    for (let i = 0; i < learned.length; i += 3) {
      const res = await post({ jobId: await job(ana, trip), learned: learned.slice(i, i + 3) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ learned: 0 });
    }
    expect(await active(trip)).toEqual([]);
  });

  it("drops one bad citation in a note even when another is good", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread(ana, "Lisbon in October");
    await join(trip, sam);
    const mine = await landed(ana, trip, "the flat is in Alfama");
    const theirs = await landed(sam, trip, "the flat is in Baixa");
    const res = await post({ jobId: await job(ana, trip), learned: [{ text: "The flat is in Alfama", from: [mine, theirs] }] });
    expect(res.json()).toMatchObject({ learned: 0 });
  });

  it("drops a note with a second line, an empty one, and one that repeats an active note", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    await note(ana, trip, "The flat is in Alfama");
    const from = await landed(ana, trip, "the flat is in alfama");
    const res = await post({
      jobId: await job(ana, trip),
      learned: [
        { text: "  the flat is in ALFAMA ", from: [from] },
        { text: "Two\nlines", from: [from] },
        { text: "   ", from: [from] },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ learned: 0 });
  });

  it("does not count a note the thread once said and set aside", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "thread", subject_id: trip, text: "Ferry at 9", kind: "noticed", origin: "learned", superseded_at: new Date() } as never)
      .execute();
    const from = await landed(ana, trip, "ferry at 9");
    const res = await post({ jobId: await job(ana, trip), learned: [{ text: "Ferry at 9", from: [from] }] });
    expect(res.json()).toMatchObject({ learned: 0 });
  });

  it("adds nothing once the member holds the cap of learned notes in the thread", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    for (let n = 0; n < LEARNED_CAP; n++) {
      await db.insertInto("notes").values({ account_id: ana, scope: "thread", subject_id: trip, text: `learned ${n}`, kind: "noticed", origin: "learned" } as never).execute();
    }
    const from = await landed(ana, trip, "budget is 2000 euros");
    const res = await post({ jobId: await job(ana, trip), learned: [{ text: "Budget is 2,000 euros", from: [from] }] });
    expect(res.json()).toMatchObject({ learned: 0 });
  });

  it("refuses a fourth note at the schema", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    const from = await landed(ana, trip, "a b c d");
    const res = await post({ jobId: await job(ana, trip), learned: ["a", "b", "c", "d"].map((t) => ({ text: t, from: [from] })) });
    expect(res.statusCode).toBe(400);
  });

  it("sends no notification for a learned note", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread(ana, "Lisbon in October");
    await join(trip, sam);
    const from = await landed(ana, trip, "the ferry leaves at 9");
    await post({ jobId: await job(ana, trip), learned: [{ text: "The ferry leaves at 9", from: [from] }] });
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "shared.activity").execute()).toEqual([]);
  });
});

describe("AC-8 a pass keeps only its own member's notes true", () => {
  it("ignores another member's notes in a plan, and applies its own", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread(ana, "Lisbon in October");
    await join(trip, sam);
    const samsNote = await note(sam, trip, "Sam is booking the ferry");
    const anasOld = await note(ana, trip, "Staying in Baixa");

    const res = await post({ jobId: await job(ana, trip), supersede: [samsNote, anasOld] });

    expect(res.json()).toMatchObject({ superseded: 1 });
    const left = (await active(trip)).map((n) => n.id);
    expect(left).toContain(samsNote);
    expect(left).not.toContain(anasOld);
  });

  it("does not fold another member's note", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread(ana, "Lisbon in October");
    await join(trip, sam);
    const a = await note(sam, trip, "ferry at 9");
    const b = await note(sam, trip, "the ferry is at nine");
    const res = await post({ jobId: await job(ana, trip), add: [{ text: "Ferry at 9", foldedFrom: [a, b] }] });
    expect(res.json()).toMatchObject({ added: 0 });
  });
});

describe("AC-12 and AC-14 the default thread, and applying once", () => {
  it("proposes threads on the default thread and learns nothing there", async () => {
    const { me, loose } = await owner();
    const a = await row(me, loose, "Oak brackets");
    const b = await row(me, loose, "Wall plugs");
    const from = await landed(me, loose, "oak brackets");
    const res = await post({
      jobId: await job(me, loose, true),
      sent: [a, b],
      groups: [{ name: "Kitchen shelves", ids: [a, b] }],
      learned: [{ text: "Shelves are oak", from: [from] }],
    });
    expect(res.json()).toMatchObject({ proposals: 1, learned: 0 });
  });

  it("applies once however many times it is posted", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    const from = await landed(ana, trip, "the ferry leaves at 9");
    const id = await job(ana, trip);
    await post({ jobId: id, learned: [{ text: "The ferry leaves at 9", from: [from] }] });
    const again = await post({ jobId: id, learned: [{ text: "The ferry leaves at nine", from: [from] }] });
    expect(again.json()).toMatchObject({ learned: 0 });
    expect(await active(trip)).toHaveLength(1);
  });

  it("refuses a member who has left, and a job of another kind", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    const from = await landed(ana, trip, "ferry at 9");
    const id = await job(ana, trip);
    await db.updateTable("thread_members").set({ state: "left" }).where("account_id", "=", ana).execute();
    expect((await post({ jobId: id, learned: [{ text: "Ferry at 9", from: [from] }] })).json()).toMatchObject({ learned: 0 });
    await db.updateTable("jobs").set({ kind: "dump.answer" }).where("id", "=", id).execute();
    expect((await post({ jobId: id })).statusCode).toBe(404);
  });

  it("writes the ledger under the member as a nightly pass, and logs no words", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    const from = await landed(ana, trip, "the secret code is 4471");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    try {
      await post({
        jobId: await job(ana, trip),
        learned: [{ text: "The door code is 4471", from: [from] }],
        usage: [{ model: "claude-haiku-4-5", inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 5 }],
      });
    } finally {
      spy.mockRestore();
    }
    expect(logs.join("\n")).not.toContain("4471");
    const ledger = await db.selectFrom("llm_usage").select(["account_id", "job_kind"]).execute();
    expect(ledger).toEqual([{ account_id: ana, job_kind: "thread.nightly" }]);
  });
});

describe("AC-7 the daily run books one pass per thread and member", () => {
  async function daily(me: string) {
    await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
  }
  const booked = (me: string) =>
    db.selectFrom("jobs").select(["kind", "payload", "idempotency_key"]).where("account_id", "=", me).orderBy("kind").execute();

  it("books a pass for a thread the member dumped into today, and nothing retired", async () => {
    const ana = await account("Ana");
    const trip = await thread(ana, "Lisbon in October");
    const quiet = await thread(ana, "Old stuff");
    await landed(ana, trip, "ferry at 9");
    await note(ana, quiet, "nothing new");
    await db.updateTable("notes").set({ updated_at: sql`now() - interval '3 days'` } as never).where("subject_id", "=", quiet).execute();

    await daily(ana);

    const jobs = await booked(ana);
    expect(jobs.map((j) => j.kind)).toEqual(["thread.nightly"]);
    expect(jobs[0]!.payload).toMatchObject({ threadId: trip, propose: false });
    expect(jobs[0]!.idempotency_key).toMatch(new RegExp(`^thread.nightly:${trip}:${ana}:\\d{4}-\\d{2}-\\d{2}$`));
  });

  it("books each member of a shared thread their own pass, on their own activity", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const trip = await thread(ana, "Lisbon in October");
    await join(trip, sam);
    await landed(ana, trip, "ferry at 9");

    await daily(ana);
    await daily(sam);

    expect(await booked(ana)).toHaveLength(1);
    expect(await booked(sam)).toHaveLength(0);
  });

  it("books the default thread with proposals when its set has two", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "Oak brackets");
    await row(me, loose, "Wall plugs");
    await daily(me);
    const jobs = await booked(me);
    expect(jobs.map((j) => j.kind)).toEqual(["thread.nightly"]);
    expect(jobs[0]!.payload).toMatchObject({ threadId: loose, propose: true });
  });
});
