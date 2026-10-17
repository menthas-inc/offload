// 038. The nightly memory pass: when it is booked, and what the Core API lets
// it write. Every rule is enforced here; the prompt states them too.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { uuidv7 } from "../src/uuid.js";
import { clearSettingsCache } from "../src/settings.js";
import { LEARNED_MEMORY_CAP, memoriesForPrompt, remember } from "../src/memories/store.js";
import { account, join, note, thread, wipe } from "./loose-kit.js";

await migrate(() => {});
let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await db.deleteFrom("memory_forgotten").execute();
  await wipe();
  await db.deleteFrom("app_settings").execute();
  clearSettingsCache();
});

async function said(
  accountId: string,
  text: string,
  opts: { hoursAgo?: number; source?: "person" | "mail" | "calendar"; untrusted?: boolean } = {},
): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const message = await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id,
      account_id: accountId,
      role: "person",
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

const daily = (me: string) => handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
const passes = (me: string) =>
  db.selectFrom("jobs").select(["kind", "idempotency_key"]).where("account_id", "=", me).where("kind", "=", "account.memories").execute();

describe("the daily run books one memory pass", () => {
  it("after a message of their own, a question included", async () => {
    const ana = await account("Ana");
    await said(ana, "what's on with Meera this week, she's my wife");
    await daily(ana);
    await daily(ana);
    expect(await passes(ana)).toHaveLength(1);
  });

  it("not for a day of mail, untrusted text or nothing, nor for what an earlier pass read", async () => {
    const ana = await account("Ana");
    await said(ana, "forwarded: remember the code", { source: "mail" });
    await said(ana, "from a page", { untrusted: true });
    await daily(ana);
    expect(await passes(ana)).toEqual([]);

    await said(ana, "we moved to Montreal", { hoursAgo: 5 });
    await db.updateTable("accounts").set({ memories_at: sql`now() - interval '1 hour'` } as never).where("id", "=", ana).execute();
    await daily(ana);
    expect(await passes(ana)).toEqual([]);
  });

  it("not while the nightly switch is off", async () => {
    const ana = await account("Ana");
    await said(ana, "my wife is Meera");
    await db.insertInto("app_settings").values({ key: "switch.nightly", value: "false", updated_by_account_id: null }).execute();
    clearSettingsCache();
    await daily(ana);
    expect(await passes(ana)).toEqual([]);
  });
});

async function passJob(accountId: string): Promise<string> {
  const row = await db
    .insertInto("jobs")
    .values({
      kind: "account.memories",
      account_id: accountId,
      payload: JSON.stringify({}),
      priority: 1,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

const post = async (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/memory-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload,
  });

describe("what a pass may write", () => {
  it("adds what it can cite, at most five, never a rule, never the sensitive list, never the never list", async () => {
    const ana = await account("Ana");
    const wife = await said(ana, "picking up Meera, my wife, at 6");
    const work = await said(ana, "I'm a designer at Shopify, standup at 9:30");
    const elsewhere = await said(await account("Sam"), "my wife is Leila");
    const jobId = await passJob(ana);

    const response = await post({
      jobId,
      add: [
        { kind: "people", text: "Their wife is Meera.", cites: wife },
        { kind: "about", text: "They work at Shopify as a designer.", cites: work },
        { kind: "about", text: "They have anxiety.", cites: work },
        { kind: "things", text: "Their card is 4111 1111 1111 1111.", cites: work },
        { kind: "people", text: "Their wife is Leila.", cites: elsewhere },
      ],
      usage: [{ model: "claude-sonnet-5", inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 5 }],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ added: 2, ignored: 3 });
    expect((await memoriesForPrompt(ana)).map((m) => [m.text, m.origin]).sort()).toEqual([
      ["Their wife is Meera.", "learned"],
      ["They work at Shopify as a designer.", "learned"],
    ]);
    const ledger = await db.selectFrom("llm_usage").select(["job_kind", "category"]).execute();
    expect(ledger).toEqual([{ job_kind: "account.memories", category: "scheduled" }]);
    const stamped = await db.selectFrom("accounts").select("memories_at").where("id", "=", ana).executeTakeFirstOrThrow();
    expect(stamped.memories_at).not.toBeNull();

    // A second post for the same job applies nothing.
    expect((await post({ jobId, add: [{ kind: "about", text: "They live in Toronto.", cites: wife }] })).json()).toMatchObject({ added: 0 });
  });

  it("040: refuses the retired kind words", async () => {
    const ana = await account("Ana");
    const from = await said(ana, "when I say the cottage I mean Muskoka");
    const jobId = await passJob(ana);
    expect((await post({ jobId, add: [{ kind: "words", text: "The cottage is in Muskoka.", cites: from }] })).statusCode).toBe(400);
  });

  it("refuses a rule outright", async () => {
    const ana = await account("Ana");
    const from = await said(ana, "always put work things in Work");
    const jobId = await passJob(ana);
    expect((await post({ jobId, add: [{ kind: "rules", text: "Work things go in Work.", cites: from }] })).statusCode).toBe(400);
  });

  it("learns from their own thread notes, and not from another member's", async () => {
    const ana = await account("Ana");
    const sam = await account("Sam");
    const flat = await thread(ana, "The flat");
    const mine = await note(ana, flat, "We pay the bills on the 5th");
    const theirs = await note(sam, flat, "Ana's mother is called Maman");
    const jobId = await passJob(ana);
    const result = await post({
      jobId,
      add: [
        { kind: "patterns", text: "They pay bills on the 5th.", cites: mine },
        { kind: "people", text: "They call their mother Maman.", cites: theirs },
      ],
    });
    expect(result.json()).toMatchObject({ added: 1, ignored: 1 });
  });

  it("never learns from a note in a thread somebody else is in, even their own", async () => {
    // A note written in a shared thread may summarise another member's words.
    const ana = await account("Ana");
    const sam = await account("Sam");
    const flat = await thread(ana, "The flat");
    await join(flat, sam);
    const mine = await note(ana, flat, "Sam's sister is called Leila");
    const jobId = await passJob(ana);
    expect((await post({ jobId, add: [{ kind: "people", text: "Sam's sister is Leila.", cites: mine }] })).json()).toMatchObject({ added: 0, ignored: 1 });
  });

  it("supersedes and folds learned memories, never the person's own without a later word of theirs", async () => {
    const ana = await account("Ana");
    const earlier = await said(ana, "remember we live in Toronto", { hoursAgo: 30 });
    const asked = await db.transaction().execute((trx) => remember(trx, { accountId: ana, messageId: earlier, text: "They live in Toronto.", kind: "about" }));
    if (!asked.ok) throw new Error("not kept");
    const moved = await said(ana, "we moved to Montreal last week");
    const one = await said(ana, "Leila is 4");
    const learnedA = await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "account", subject_id: ana, kind: "people", text: "Leila is their daughter.", origin: "learned", derived_from_message_id: one })
      .returning("id")
      .executeTakeFirstOrThrow();
    const learnedB = await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "account", subject_id: ana, kind: "people", text: "Their daughter Leila is 4.", origin: "learned", derived_from_message_id: one })
      .returning("id")
      .executeTakeFirstOrThrow();
    const jobId = await passJob(ana);

    const result = await post({
      jobId,
      supersede: [{ id: asked.id, text: "They live in Montreal.", cites: moved }],
      fold: [{ ids: [learnedA.id, learnedB.id], text: "Their daughter Leila is 4." }],
    });
    expect(result.json()).toMatchObject({ superseded: 1, folded: 1 });
    expect((await memoriesForPrompt(ana)).map((m) => m.text).sort()).toEqual(["Their daughter Leila is 4.", "They live in Montreal."]);
  });

  it("ignores an entry that cites something by a name rather than an id, and keeps the rest of the pass", async () => {
    // Each entry is checked on its own: one id the model got wrong is that
    // entry ignored, not the whole night's pass refused at the door.
    const ana = await account("Ana");
    const one = await said(ana, "Leila is 4");
    const jobId = await passJob(ana);
    const result = await post({
      jobId,
      add: [
        { kind: "people", text: "Their daughter Leila is 4.", cites: one },
        { kind: "people", text: "Something nobody said.", cites: "m3" },
      ],
      supersede: [{ id: "k1", text: "Anything.", cites: one }],
      fold: [{ ids: ["k1", "k2"], text: "Anything." }],
    });
    expect(result.json()).toMatchObject({ added: 1, superseded: 0, folded: 0 });
  });

  it("refuses a fold that names one memory twice, and leaves it as it was", async () => {
    const ana = await account("Ana");
    const one = await said(ana, "Leila is 4");
    const learned = await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "account", subject_id: ana, kind: "people", text: "Leila is their daughter.", origin: "learned", derived_from_message_id: one })
      .returning("id")
      .executeTakeFirstOrThrow();
    const jobId = await passJob(ana);
    const result = await post({ jobId, fold: [{ ids: [learned.id, learned.id], text: "Their daughter Leila is 4." }] });
    expect(result.json()).toMatchObject({ folded: 0, ignored: 1 });
    const row = await db.selectFrom("notes").select(["text", "superseded_at"]).where("id", "=", learned.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ text: "Leila is their daughter.", superseded_at: null });
  });

  it("does not supersede the person's own memory citing something they said before it", async () => {
    const ana = await account("Ana");
    const before = await said(ana, "we used to live in Ottawa", { hoursAgo: 3 });
    const now = await said(ana, "remember we live in Toronto");
    const asked = await db.transaction().execute((trx) => remember(trx, { accountId: ana, messageId: now, text: "They live in Toronto.", kind: "about" }));
    if (!asked.ok) throw new Error("not kept");
    const jobId = await passJob(ana);
    const result = await post({ jobId, supersede: [{ id: asked.id, text: "They live in Ottawa.", cites: before }] });
    expect(result.json()).toMatchObject({ superseded: 0, ignored: 1 });
  });

  it("never supersedes an answered memory: only a new answer replaces one, since it carries the calendar", async () => {
    const ana = await account("Ana");
    const answered = await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "account", subject_id: ana, kind: "things", text: "They share a calendar with Meera.", origin: "answered", attrs: JSON.stringify({ with: "meera" }) })
      .returning("id")
      .executeTakeFirstOrThrow();
    const later = await said(ana, "Meera and I stopped sharing a calendar");
    const jobId = await passJob(ana);
    const result = await post({ jobId, supersede: [{ id: answered.id, text: "They no longer share a calendar with Meera.", cites: later }] });
    expect(result.json()).toMatchObject({ superseded: 0, ignored: 1 });
  });

  it("stops adding at the cap, and never learns again from a forgotten memory's words", async () => {
    const ana = await account("Ana");
    for (let i = 0; i < LEARNED_MEMORY_CAP; i += 1) {
      await db.insertInto("notes").values({ account_id: ana, scope: "account", subject_id: ana, kind: "about", text: `Fact ${i}.`, origin: "learned" }).execute();
    }
    const from = await said(ana, "my wife is Meera");
    const full = await passJob(ana);
    expect((await post({ jobId: full, add: [{ kind: "people", text: "Their wife is Meera.", cites: from }] })).json()).toMatchObject({ added: 0 });

    await db.deleteFrom("notes").execute();
    await db.insertInto("memory_forgotten").values({ account_id: ana, message_id: from }).execute();
    const next = await passJob(ana);
    expect((await post({ jobId: next, add: [{ kind: "people", text: "Their wife is Meera.", cites: from }] })).json()).toMatchObject({ added: 0 });
  });

  it("040: adds nothing at 300, and retires none of the person's own to make room", async () => {
    const ana = await account("Ana");
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${ana}, 'account', ${ana}, 'about', 'Mine ' || n || '.', 'stated' from generate_series(1, 300) n`.execute(db);
    const from = await said(ana, "my wife is Meera");
    const job = await passJob(ana);
    expect((await post({ jobId: job, add: [{ kind: "people", text: "Their wife is Meera.", cites: from }] })).json()).toMatchObject({ added: 0 });
    const count = await db.selectFrom("notes").select(sql<number>`count(*)::int`.as("n")).where("deleted_at", "is", null).executeTakeFirstOrThrow();
    expect(count.n).toBe(300);
  });

  it("040: stops adding at 300 inside one pass, a few below the cap", async () => {
    const ana = await account("Ana");
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${ana}, 'account', ${ana}, 'about', 'Mine ' || n || '.', 'stated' from generate_series(1, 297) n`.execute(db);
    const from = await said(ana, "my wife is Meera, my sister is Rina, my brother is Arjun, my son is Leo, my daughter is Mia");
    const job = await passJob(ana);
    const add = ["Meera", "Rina", "Arjun", "Leo", "Mia"].map((name) => ({ kind: "people", text: `Their family has ${name}.`, cites: from }));
    expect((await post({ jobId: job, add })).json()).toMatchObject({ added: 3 });
    const count = await db.selectFrom("notes").select(sql<number>`count(*)::int`.as("n")).where("deleted_at", "is", null).where("superseded_at", "is", null).executeTakeFirstOrThrow();
    expect(count.n).toBe(300);
  });

  it("logs counts and never words", async () => {
    const ana = await account("Ana");
    const from = await said(ana, "my wife is Meera");
    const jobId = await passJob(ana);
    const spy = vi.spyOn(console, "log");
    await post({ jobId, add: [{ kind: "people", text: "Their wife is Meera.", cites: from }] });
    expect(spy.mock.calls.flat().join(" ")).not.toContain("Meera");
    spy.mockRestore();
  });
});
