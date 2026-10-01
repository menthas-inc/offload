// 028, the daily pass, server side. T1.18 booking it; T1.19 what its answer
// may write; T1.17 the sweep.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { uuidv7 } from "../src/uuid.js";
import { PROPOSAL_CANDIDATES, proposalCandidates } from "../src/loose/propose.js";
import { createSuggestion, moveSuggestion, note, owner, proposal, row, thread, wipe } from "./loose-kit.js";

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

const tick = () => new Promise((resolve) => setTimeout(resolve, 3));

async function daily(me: string) {
  await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
}
const booked = (me: string) =>
  db.selectFrom("jobs").select(["kind", "payload"]).where("account_id", "=", me).where("kind", "=", "loose.propose").execute();

async function job(accountId: string): Promise<string> {
  const inserted = await db
    .insertInto("jobs")
    .values({
      kind: "loose.propose",
      account_id: accountId,
      payload: JSON.stringify({}),
      priority: 1,
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

const proposed = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/loose-proposals",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

describe("the candidates (T1.18, AC-19, OFF-8)", () => {
  it("are the newest loose things with no suggestion, never dismissed, and no untrusted note", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const kept = await row(me, loose, "Kept");
    await tick();
    const suggested = await row(me, loose, "Suggested");
    await moveSuggestion(me, { contentId: suggested }, home);
    await row(me, loose, "Dismissed", { suggest_dismissed_at: new Date() });
    const fromMail = await note(me, loose, "From an email");
    await db.updateTable("notes").set({ derived_from_untrusted: true }).where("id", "=", fromMail).execute();
    await tick();
    const plain = await note(me, loose, "Ana's shoe size is 38");
    await row(me, home, "In a thread");
    const candidates = await proposalCandidates(me);
    expect(candidates.map((c) => c.id)).toEqual([plain, kept]);
    expect(candidates.map((c) => c.kind)).toEqual(["note", "content"]);
  });

  it("leave out content a forwarded email or a connected app put there (SEC-1)", async () => {
    const { me, loose } = await owner();
    const kept = await row(me, loose, "Typed by them");
    await row(me, loose, "From Gmail", { source: "gmail" });
    const mail = await db
      .insertInto("conversations").values({ account_id: me }).returning("id").executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({ conversation_id: mail.id, account_id: me, role: "person", type: "text", turn_id: uuidv7(), text: "fwd", state: "answered", source: "mail" } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    await row(me, loose, "From a forwarded email", { derived_from_message_id: message.id });
    expect((await proposalCandidates(me)).map((c) => c.id)).toEqual([kept]);
  });

  it("stop at the bound however many there are", async () => {
    const { me, loose } = await owner();
    for (let i = 0; i < PROPOSAL_CANDIDATES + 5; i += 1) await row(me, loose, `Row ${i}`);
    expect(await proposalCandidates(me)).toHaveLength(PROPOSAL_CANDIDATES);
  });
});

describe("booking the pass (T1.18, AC-19)", () => {
  it("books once the set has two, and not again until it changes", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "Oak brackets");
    await daily(me);
    expect(await booked(me)).toHaveLength(0);

    await row(me, loose, "Wall plugs");
    await daily(me);
    expect(await booked(me)).toHaveLength(1);

    await db.deleteFrom("jobs").execute();
    const id = await job(me);
    expect((await proposed({ jobId: id, sent: [], groups: [] })).statusCode).toBe(200);
    await db.deleteFrom("jobs").execute();
    await daily(me);
    expect(await booked(me)).toHaveLength(0);

    await row(me, loose, "Photo of the alcove");
    await daily(me);
    expect(await booked(me)).toHaveLength(1);
  });

  it("books nothing with the switch off", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "A");
    await row(me, loose, "B");
    vi.stubEnv("LOOSE_PROPOSALS", "off");
    try {
      await daily(me);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await booked(me)).toHaveLength(0);
  });
});

describe("what the pass may write (T1.19, AC-19, AC-35)", () => {
  it("writes a proposal and a Create on each of its things", async () => {
    const { me, loose } = await owner();
    const a = await row(me, loose, "Oak brackets");
    const b = await row(me, loose, "Wall plugs");
    const n = await note(me, loose, "Alcove is 92cm wide");
    const id = await job(me);
    const response = await proposed({
      jobId: id,
      sent: [a, b, n],
      groups: [{ name: "Kitchen shelves", ids: [a, b, n] }],
      usage: [{ model: "claude-haiku-4-5", inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, costMicros: 200, latencyMs: 900 }],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ proposals: 1 });
    const [p] = await db.selectFrom("thread_proposals").select(["id", "name"]).where("account_id", "=", me).execute();
    expect(p!.name).toBe("Kitchen shelves");
    const made = await db.selectFrom("suggestions").select(["content_id", "note_id", "kind"]).where("proposal_id", "=", p!.id).execute();
    expect(made).toHaveLength(3);
    const usage = await db.selectFrom("llm_usage").select(["job_kind", "category"]).where("account_id", "=", me).execute();
    expect(usage).toEqual([{ job_kind: "loose.propose", category: "scheduled" }]);
    const state = await db.selectFrom("jobs").select("state").where("id", "=", id).executeTakeFirstOrThrow();
    expect(state.state).toBe("done");
  });

  it("drops what it was not sent, what is no longer a candidate, a single, eleven, a bad name and every group past three", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) ids.push(await row(me, loose, `Row ${i}`));
    const notSent = await row(me, loose, "Not sent");
    const taken = ids[0]!;
    await moveSuggestion(me, { contentId: taken }, home);
    const elsewhere = await row(me, home, "Elsewhere");
    const id = await job(me);
    const response = await proposed({
      jobId: id,
      sent: [...ids, elsewhere],
      groups: [
        { name: "Has a stranger", ids: [ids[1], notSent] },
        { name: "Was taken", ids: [taken, ids[2]] },
        { name: "Not loose", ids: [elsewhere, ids[3]] },
        { name: "Eleven", ids: ids.slice(4, 15) },
        { name: "Bad\nname", ids: [ids[15], ids[16]] },
        { name: "First good", ids: [ids[17], ids[18]] },
        { name: "Second good", ids: [ids[19], ids[4]] },
        { name: "Third good", ids: [ids[5], ids[6]] },
        { name: "Fourth good", ids: [ids[7], ids[8]] },
      ],
    });
    expect(response.statusCode).toBe(200);
    const names = (await db.selectFrom("thread_proposals").select("name").where("account_id", "=", me).orderBy("created_at").execute()).map((p) => p.name);
    expect(names.sort()).toEqual(["First good", "Second good", "Third good"]);
    expect(await db.selectFrom("suggestions").select("id").where("content_id", "=", notSent).execute()).toEqual([]);
  });

  it("writes once for a job, however many times its answer is posted", async () => {
    const { me, loose } = await owner();
    const a = await row(me, loose, "Oak brackets");
    const b = await row(me, loose, "Wall plugs");
    const c = await row(me, loose, "Shelf paint");
    const d = await row(me, loose, "Spirit level");
    const id = await job(me);
    expect((await proposed({ jobId: id, sent: [a, b], groups: [{ name: "Kitchen shelves", ids: [a, b] }] })).json()).toEqual({ proposals: 1 });
    expect((await proposed({ jobId: id, sent: [c, d], groups: [{ name: "Again", ids: [c, d] }] })).json()).toEqual({ proposals: 0 });
    expect((await db.selectFrom("thread_proposals").select("name").execute()).map((p) => p.name)).toEqual(["Kitchen shelves"]);
  });

  it("uses the account from the job, refuses without the token, and logs no words", async () => {
    const { me, loose } = await owner();
    const { me: them, loose: theirs } = await owner("Sam Ibekwe");
    const a = await row(them, theirs, "Their brackets");
    const b = await row(them, theirs, "Their plugs");
    await row(me, loose, "Mine");
    const id = await job(me);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    try {
      await proposed({ jobId: id, sent: [a, b], groups: [{ name: "Shelving secrets", ids: [a, b] }] });
    } finally {
      spy.mockRestore();
    }
    expect(await db.selectFrom("thread_proposals").select("id").execute()).toEqual([]);
    expect(logs.join("\n")).not.toContain("Shelving secrets");
    expect(logs.join("\n")).not.toContain("Their brackets");
    const unsigned = await app.inject({ method: "POST", url: "/internal/v1/loose-proposals", payload: { jobId: id, sent: [], groups: [] } });
    expect(unsigned.statusCode).toBe(401);
  });
});

describe("the sweep (T1.17)", () => {
  it("removes spent proposals and accepted suggestions past the window, and nothing else", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const spent = await proposal(me, "Spent");
    const live = await proposal(me, "Live");
    const a = await row(me, loose, "A");
    const b = await row(me, loose, "B");
    await createSuggestion(me, { contentId: a }, live);
    await createSuggestion(me, { contentId: b }, live);
    await db.updateTable("thread_proposals").set({ spent_at: sql`now() - interval '2 days'` }).where("id", "=", spent).execute();
    const moved = await row(me, home, "Moved");
    const accepted = await moveSuggestion(me, { contentId: moved }, home);
    await db.updateTable("suggestions").set({ accepted_at: sql`now() - interval '2 days'` }).where("id", "=", accepted).execute();
    await daily(me);
    expect((await db.selectFrom("thread_proposals").select("name").execute()).map((p) => p.name)).toEqual(["Live"]);
    expect(await db.selectFrom("suggestions").select("id").where("id", "=", accepted).execute()).toEqual([]);
    expect(await db.selectFrom("suggestions").select("id").where("proposal_id", "=", live).execute()).toHaveLength(2);
  });
});
