// 027 T1.10 to T1.12: Needs you, and putting a card off. (AC-4, AC-5, AC-8 to AC-10, AC-12, AC-13)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { sweepPutOffs } from "../src/today/needs.js";
import { account, connection, connectionRequest, message, question, signIn, task, thread } from "./today-kit.js";

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
  await db.deleteFrom("accounts").execute();
  await db.deleteFrom("threads").execute();
});

interface Card { key: string; kind: string; [k: string]: unknown }

async function needs(cookie: string): Promise<Card[]> {
  const response = await app.inject({ method: "GET", url: "/v1/today/needs", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return (response.json() as { cards: Card[] }).cards;
}

async function putOff(cookie: string, card: string, forGood?: boolean) {
  return app.inject({ method: "POST", url: "/v1/today/put-off", headers: { cookie }, payload: forGood === undefined ? { card } : { card, forGood } });
}

async function connect(a: string, b: string) {
  await db.insertInto("connections").values({ account_a: a < b ? a : b, account_b: a < b ? b : a } as never).execute();
}

async function invite(from: string, to: string, threadId: string): Promise<string> {
  const row = await db
    .insertInto("thread_members")
    .values({ thread_id: threadId, account_id: to, invited_by: from, state: "pending", expires_at: new Date(Date.now() + 30 * 86400_000) } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** An account that has dumped something, so only the card under test shows. */
async function settled(over: Record<string, unknown> = {}): Promise<string> {
  const me = await account(over);
  await task(me, await thread([me], "Mine"), "Anything", null);
  await message(me, "mail");
  return me;
}

describe("027 account issues (AC-5)", () => {
  it("draws a card for a connection that needs signing in again, and not for an active one", async () => {
    const me = await settled();
    const broken = await connection(me, { state: "needs_reauth" });
    await connection(me);
    const cards = await needs(await signIn(me));
    expect(cards.map((c) => [c.kind, c.key])).toEqual([["calendar", `calendar:${broken}`]]);
    expect(cards[0]!["email"]).not.toBeNull();
  });

  it("names the address only when there is more than one connection", async () => {
    const me = await settled();
    await connection(me, { state: "needs_reauth" });
    expect((await needs(await signIn(me)))[0]!["email"]).toBeNull();
  });

  it("never draws a disconnected one", async () => {
    const me = await settled();
    await connection(me, { state: "revoked", deleted_at: new Date() });
    expect(await needs(await signIn(me))).toEqual([]);
  });
});

describe("027 people (AC-8, AC-13)", () => {
  it("draws requests and invitations for the account, oldest first within a kind, and never another's", async () => {
    const me = await settled();
    const ana = await account({ display_name: "Ana Duarte" });
    const sam = await account({ display_name: "Sam" });
    const other = await account();
    const first = await connectionRequest(sam, me);
    await db.updateTable("connection_requests").set({ created_at: new Date(Date.now() - 86400_000 * 2) } as never).where("id", "=", first).execute();
    const second = await connectionRequest(ana, me);
    await connectionRequest(ana, other);
    await connect(ana, me);
    const trip = await thread([ana], "Europe, October");
    const member = await invite(ana, me, trip);
    const cards = await needs(await signIn(me));
    expect(cards.map((c) => c.key)).toEqual([`request:${first}`, `request:${second}`, `invitation:${member}`]);
    // Only the count travels: the titles of a thread not yet joined have no reader on Today.
    expect(cards.find((c) => c.kind === "invitation")!["preview"]).toEqual({ count: 0 });
  });
});

describe("027 questions (AC-9)", () => {
  it("draws an open date question with its thread", async () => {
    const me = await settled();
    const trip = await thread([me], "Europe, October");
    const contentId = await task(me, trip, "Sintra train", null);
    const id = await question(me, { contentId });
    const [card] = await needs(await signIn(me));
    expect(card).toMatchObject({ key: `question:${id}`, kind: "question", threadId: trip, threadName: "Europe, October", fromEmail: false });
    expect((card!["question"] as { text: string; options: { label: string }[] }).options.map((o) => o.label)).toEqual(["Saturday", "Sunday", "Not that"]);
    expect(JSON.stringify(card)).not.toContain("2026-10-04");
  });

  it("leaves out questions that leave offload or start a turn, closed ones, and a stranger's words unless they came by email", async () => {
    const me = await settled();
    for (const field of ["person", "calendar", "country"]) await question(me, { field });
    await question(me, { state: "answered" });
    await question(me, { untrusted: true });
    const fromMail = await question(me, { untrusted: true, source: "mail" });
    const cards = await needs(await signIn(me));
    expect(cards.map((c) => [c.key, c["fromEmail"]])).toEqual([[`question:${fromMail}`, true]]);
  });

  it("never draws another account's question", async () => {
    const me = await settled();
    await question(await account());
    expect(await needs(await signIn(me))).toEqual([]);
  });
});

describe("027 the forwarding tip (AC-10)", () => {
  it("shows once the account has dumped something and has never had an email accepted", async () => {
    const me = await account({ email: "jo@hey.com" });
    const cookie = await signIn(me);
    expect(await needs(cookie)).toEqual([]);
    await task(me, await thread([me], "Mine"), "Anything", null);
    const [tip] = await needs(cookie);
    expect(tip).toMatchObject({ key: "tip:forwarding", kind: "tip", address: "over@to.offload.club", from: "jo@hey.com" });
    await message(me, "mail");
    expect(await needs(cookie)).toEqual([]);
  });

  it("is never shown to an Apple hidden email", async () => {
    const me = await account({ email: "x1y2@privaterelay.appleid.com" });
    await task(me, await thread([me], "Mine"), "Anything", null);
    expect(await needs(await signIn(me))).toEqual([]);
  });

  it("Got it is for good", async () => {
    const me = await account();
    await task(me, await thread([me], "Mine"), "Anything", null);
    const cookie = await signIn(me);
    expect((await putOff(cookie, "tip:forwarding", true)).statusCode).toBe(200);
    expect(await needs(cookie)).toEqual([]);
    const row = await db.selectFrom("today_put_offs").select("until").where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(row.until).toBeNull();
  });
});

describe("027 the layout's parts (AC-27, AC-28)", () => {
  it("does not draw a kind the layout has off", async () => {
    const me = await settled();
    await question(me);
    await connection(me, { state: "needs_reauth" });
    const layout = {
      version: 1,
      sections: [
        { kind: "needs_you", parts: [{ kind: "account", on: true }, { kind: "people", on: true }, { kind: "questions", on: false }, { kind: "tips", on: true }] },
        { kind: "day", on: true },
      ],
    };
    await db.updateTable("accounts").set({ today_layout: JSON.stringify(layout) } as never).where("id", "=", me).execute();
    expect((await needs(await signIn(me))).map((c) => c.kind)).toEqual(["calendar"]);
  });
});

describe("027 putting a card off (AC-12, AC-13)", () => {
  it("hides a live card until the start of tomorrow in the account's zone", async () => {
    const me = await settled();
    const id = await question(me);
    const cookie = await signIn(me);
    const response = await putOff(cookie, `question:${id}`);
    expect(response.statusCode).toBe(200);
    expect(await needs(cookie)).toEqual([]);
    const row = await db.selectFrom("today_put_offs").select("until").where("account_id", "=", me).executeTakeFirstOrThrow();
    const until = row.until as Date;
    expect(until.getTime()).toBeGreaterThan(Date.now());
    expect(until.getTime() - Date.now()).toBeLessThanOrEqual(25 * 3600_000);
    await db.updateTable("today_put_offs").set({ until: new Date(Date.now() - 1000) } as never).where("account_id", "=", me).execute();
    expect((await needs(cookie)).map((c) => c.key)).toEqual([`question:${id}`]);
  });

  it("answers another account's card, a missing one and a settled one alike, and writes nothing", async () => {
    const me = await settled();
    const other = await account();
    const theirs = await question(other);
    const answered = await question(me, { state: "answered" });
    const cookie = await signIn(me);
    for (const card of [`question:${theirs}`, `question:${answered}`, "question:00000000-0000-7000-8000-000000000000", `calendar:${await connection(other, { state: "needs_reauth" })}`]) {
      expect((await putOff(cookie, card)).statusCode).toBe(404);
    }
    expect(await db.selectFrom("today_put_offs").selectAll().execute()).toEqual([]);
  });

  it("refuses a malformed card and for good on a kind that has no for good", async () => {
    const me = await settled();
    const id = await question(me);
    const cookie = await signIn(me);
    expect((await putOff(cookie, "question:nope")).statusCode).toBe(400);
    expect((await putOff(cookie, "pick:x")).statusCode).toBe(400);
    expect((await putOff(cookie, "x".repeat(80))).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/today/put-off", headers: { cookie }, payload: { card: "tip:forwarding", extra: 1 } })).statusCode).toBe(400);
    expect((await putOff(cookie, `question:${id}`, true)).statusCode).toBe(400);
  });

  it("puts an invitation off for good, leaving it waiting on My threads", async () => {
    const me = await settled();
    const ana = await account();
    await connect(ana, me);
    const member = await invite(ana, me, await thread([ana], "Trip"));
    const cookie = await signIn(me);
    expect((await putOff(cookie, `invitation:${member}`, true)).statusCode).toBe(200);
    expect(await needs(cookie)).toEqual([]);
    const row = await db.selectFrom("thread_members").select("state").where("id", "=", member).executeTakeFirstOrThrow();
    expect(row.state).toBe("pending");
  });

  it("is not a GET", async () => {
    const me = await settled();
    const response = await app.inject({ method: "GET", url: "/v1/today/put-off?card=tip:forwarding", headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(404);
  });

  it("the sweep also removes a put-off for good whose card has gone", async () => {
    const me = await settled();
    const ana = await account();
    await connect(ana, me);
    const kept = await invite(ana, me, await thread([ana], "Kept"));
    const gone = await invite(ana, me, await thread([ana], "Gone"));
    await db
      .insertInto("today_put_offs")
      .values([
        { account_id: me, card: `invitation:${kept}`, until: null },
        { account_id: me, card: `invitation:${gone}`, until: null },
        { account_id: me, card: "tip:forwarding", until: null },
      ] as never)
      .execute();
    await db.updateTable("thread_members").set({ state: "declined" } as never).where("id", "=", gone).execute();
    await sweepPutOffs();
    const left = await db.selectFrom("today_put_offs").select("card").where("account_id", "=", me).orderBy("card").execute();
    expect(left.map((r) => r.card)).toEqual([`invitation:${kept}`, "tip:forwarding"]);
  });

  it("the sweep removes put-offs a day past their time and keeps the ones for good", async () => {
    const me = await settled();
    await db
      .insertInto("today_put_offs")
      .values([
        { account_id: me, card: "tip:forwarding", until: null },
        { account_id: me, card: "question:00000000-0000-7000-8000-000000000001", until: new Date(Date.now() - 2 * 86400_000) },
        { account_id: me, card: "question:00000000-0000-7000-8000-000000000002", until: new Date(Date.now() - 3600_000) },
      ] as never)
      .execute();
    await sweepPutOffs();
    const left = await db.selectFrom("today_put_offs").select("card").where("account_id", "=", me).orderBy("card").execute();
    expect(left.map((r) => r.card)).toEqual(["question:00000000-0000-7000-8000-000000000002", "tip:forwarding"]);
  });
});
