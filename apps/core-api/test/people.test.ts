// 022. People: who may see whom, finding somebody, asking, answering, ending
// it, and the mark.
//
// AC-1  the lookup: exact, case-insensitive, one or none, and nothing for the
//       deleted, the disabled and the blocked.
// AC-2  a request carries nothing, dots the other side.
// AC-3  one open per pair, seven days between.
// AC-4  the found row's relation.
// AC-5  the hourly cap, the floor, the fifty.
// AC-6  to AC-10 accept, Not now, expiry, Withdraw, the dot.
// AC-11 to AC-13 the lists, the page, the one predicate.
// AC-15 Remove leaves memberships and keys.
// AC-16 Block writes an undelivered request; Unblock does not reconnect.
// AC-31 the mark: the kit's arithmetic, drawn once, unchanged by a rename.
// AC-33 events name the actor and nobody else.
// AC-34 the cascade.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { PNG } from "pngjs";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { relationOf, connected, visibleTo } from "../src/people/access.js";
import {
  LOOKUP_FLOOR_MS,
  LOOKUPS_PER_HOUR,
  REQUESTS_OUTSTANDING,
  accept,
  block,
  dismiss,
  lookup,
  people,
  person,
  remove,
  request,
  requestsWaiting,
  sweepPeople,
  unblock,
  withdraw,
} from "../src/people/people.js";
import { drawAvatar, prismOf, SIZE } from "../src/accounts/avatar.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({
      account_id: accountId,
      token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("connection_requests").execute();
  await db.deleteFrom("connections").execute();
  await db.deleteFrom("blocks").execute();
  await db.deleteFrom("people_lookups").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(
  name: string | null = "Ana Duarte",
  email = `${uuidv7()}@Example.com`,
): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email,
      state: "active",
      email_verified: true,
      display_name: name,
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function connect(a: string, b: string) {
  await db
    .insertInto("connections")
    .values(
      a < b ? { account_a: a, account_b: b } : { account_a: b, account_b: a },
    )
    .execute();
}

async function thread(
  accountId: string,
  name = "Lisbon trip",
): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({
      created_by_account_id: accountId,
      name,
      last_activity_at: new Date(),
      updated_at: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("thread_members")
    .values({ thread_id: row.id, account_id: accountId, state: "accepted" })
    .execute();
  return row.id;
}

async function join(
  accountId: string,
  threadId: string,
  state: "accepted" | "pending" = "accepted",
  invitedBy?: string,
) {
  await db
    .insertInto("thread_members")
    .values({
      thread_id: threadId,
      account_id: accountId,
      state,
      invited_by: invitedBy ?? null,
    })
    .execute();
}

describe("who may see whom (AC-13)", () => {
  it("names the relation, strongest first", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    expect(await relationOf(me, ana)).toBeNull();
    const t = await thread(me);
    await join(ana, t);
    expect(await relationOf(me, ana)).toBe("thread");
    await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: me })
      .execute();
    expect(await relationOf(me, ana)).toBe("asked_you");
    expect(await relationOf(ana, me)).toBe("you_asked");
    await connect(me, ana);
    expect(await relationOf(me, ana)).toBe("connected");
    await db
      .insertInto("blocks")
      .values({ blocker_account_id: me, blocked_account_id: ana })
      .execute();
    expect(await relationOf(me, ana)).toBe("blocked");
  });

  it("a block the other way hides what it ended and not what it left standing; nothing for a dead account or yourself", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    await connect(me, ana);
    await db
      .insertInto("blocks")
      .values({ blocker_account_id: ana, blocked_account_id: me })
      .execute();
    // The connection, and a request of theirs: ended, so unseen.
    expect(await relationOf(me, ana)).toBeNull();
    expect(await relationOf(ana, me)).toBe("blocked");
    await db.insertInto("connection_requests").values({ from_account_id: ana, to_account_id: me }).execute();
    expect(await relationOf(me, ana)).toBeNull();
    // The thread they still share, and the request written undelivered so
    // that nothing would tell: standing, so seen. A blank mark on a row the
    // screen draws would be the tell.
    const t = await thread(me);
    await join(ana, t);
    expect(await relationOf(me, ana)).toBe("thread");
    await db.insertInto("connection_requests").values({ from_account_id: me, to_account_id: ana, delivered: false }).execute();
    expect(await relationOf(me, ana)).toBe("you_asked");
    await db.insertInto("blocks").values({ blocker_account_id: me, blocked_account_id: ana }).execute();
    expect(await relationOf(me, ana)).toBe("blocked");
    await db.deleteFrom("blocks").execute();
    await db.deleteFrom("connection_requests").execute();
    await db.deleteFrom("thread_members").where("account_id", "=", ana).execute();
    expect(await relationOf(me, ana)).toBe("connected");
    await db
      .updateTable("accounts")
      .set({ state: "disabled" })
      .where("id", "=", ana)
      .execute();
    expect(await visibleTo(me, ana)).toBe(false);
    await db
      .updateTable("accounts")
      .set({ state: "active", deleted_at: new Date() })
      .where("id", "=", ana)
      .execute();
    expect(await visibleTo(me, ana)).toBe(false);
    expect(await relationOf(me, me)).toBeNull();
  });

  it("sees somebody a thread of yours is waiting on, one way", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const t = await thread(me);
    await join(ana, t, "pending", me);
    expect(await relationOf(me, ana)).toBe("waiting");
    expect(await relationOf(ana, me)).toBeNull();
    await db.updateTable("thread_members").set({ expires_at: new Date(Date.now() - 1000) }).where("account_id", "=", ana).execute();
    expect(await relationOf(me, ana)).toBeNull();
  });

  it("does not see somebody through an undelivered request", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    await db
      .insertInto("connection_requests")
      .values({ from_account_id: ana, to_account_id: me, delivered: false })
      .execute();
    expect(await relationOf(me, ana)).toBeNull();
    expect(await relationOf(ana, me)).toBe("you_asked");
  });
});

describe("the lookup (AC-1, AC-4, AC-5)", () => {
  it("matches one address exactly and case-insensitively, and shows it as stored", async () => {
    const me = await account("Jo Martins");
    const priya = await account("Priya Raman", "Priya.Raman@gmail.com");
    const found = await lookup(me, "PRIYA.RAMAN@GMAIL.COM");
    expect(found).toMatchObject({
      accountId: priya,
      displayName: "Priya Raman",
      initials: "PR",
      email: "Priya.Raman@gmail.com",
      relation: "none",
    });
    expect(await lookup(me, "priya.raman@gmail.co")).toBeNull();
    expect(await lookup(me, "priya")).toBeNull();
  });

  it("returns nothing for the deleted, the disabled and the blocked either way", async () => {
    const me = await account("Jo Martins");
    const gone = await account("Gone", "gone@example.com");
    await db
      .updateTable("accounts")
      .set({ deleted_at: new Date() })
      .where("id", "=", gone)
      .execute();
    expect(await lookup(me, "gone@example.com")).toBeNull();
    const off = await account("Off", "off@example.com");
    await db
      .updateTable("accounts")
      .set({ state: "disabled" })
      .where("id", "=", off)
      .execute();
    expect(await lookup(me, "off@example.com")).toBeNull();
    const ana = await account("Ana Duarte", "ana@example.com");
    await db
      .insertInto("blocks")
      .values({ blocker_account_id: ana, blocked_account_id: me })
      .execute();
    expect(await lookup(me, "ana@example.com")).toBeNull();
    await db.deleteFrom("blocks").execute();
    await db
      .insertInto("blocks")
      .values({ blocker_account_id: me, blocked_account_id: ana })
      .execute();
    expect(await lookup(me, "ana@example.com")).toBeNull();
  });

  it("says what the person already is to you", async () => {
    const me = await account("Jo Martins", "jo@example.com");
    const ana = await account("Ana Duarte", "ana@example.com");
    const tom = await account("Tom Reilly", "tom@example.com");
    const sam = await account("Sam Ibekwe", "sam@example.com");
    expect((await lookup(me, "jo@example.com"))?.relation).toBe("you");
    await connect(me, ana);
    expect((await lookup(me, "ana@example.com"))?.relation).toBe("connected");
    const asked = await request(me, tom);
    expect(asked.ok).toBe(true);
    expect(await lookup(me, "tom@example.com")).toMatchObject({
      relation: "you_asked",
      requestId: asked.ok ? asked.requestId : "",
    });
    const theirs = await request(sam, me);
    expect(await lookup(me, "sam@example.com")).toMatchObject({
      relation: "asked_you",
      requestId: theirs.ok ? theirs.requestId : "",
    });
  });

  it("refuses past thirty an hour, counting the refused ones", async () => {
    const me = await account("Jo Martins");
    for (let i = 0; i < LOOKUPS_PER_HOUR; i++)
      expect(await lookup(me, `nobody${i}@example.com`)).toBeNull();
    await expect(lookup(me, "one-more@example.com")).rejects.toThrow();
    await db
      .updateTable("people_lookups")
      .set({ looked_up_at: sql`now() - interval '2 hours'` })
      .execute();
    expect(await lookup(me, "nobody@example.com")).toBeNull();
  });

  it("answers a hit and a miss no faster than the floor, over the route", async () => {
    const me = await account("Jo Martins");
    await account("Ana Duarte", "ana@example.com");
    const cookie = await signIn(me);
    for (const email of ["ana@example.com", "nobody@example.com"]) {
      const started = Date.now();
      const response = await app.inject({
        method: "GET",
        url: `/v1/people/lookup?email=${email}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(Date.now() - started).toBeGreaterThanOrEqual(LOOKUP_FLOOR_MS - 5);
    }
    const bad = await app.inject({
      method: "GET",
      url: "/v1/people/lookup?email=not-an-address",
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("takes the address in a body, so it never travels in a request path", async () => {
    const me = await account("Jo Martins");
    await account("Ana Duarte", "ana@example.com");
    const cookie = await signIn(me);
    const response = await app.inject({
      method: "POST",
      url: "/v1/people/lookup",
      headers: { cookie, "content-type": "application/json" },
      payload: { email: "Ana@Example.com" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().found).toMatchObject({ email: "ana@example.com", relation: "none" });
    const bad = await app.inject({
      method: "POST",
      url: "/v1/people/lookup",
      headers: { cookie, "content-type": "application/json" },
      payload: { email: "not-an-address" },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("asking (AC-2, AC-3, AC-5)", () => {
  it("writes a request carrying nothing, and the other side gets the dot", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const result = await request(me, ana);
    expect(result.ok).toBe(true);
    const row = await db
      .selectFrom("connection_requests")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(Object.keys(row).sort()).toEqual(
      [
        "accepted_at",
        "created_at",
        "delivered",
        "dismissed_at",
        "expires_at",
        "from_account_id",
        "id",
        "to_account_id",
        "withdrawn_at",
      ].sort(),
    );
    expect(await requestsWaiting(ana)).toBe(1);
    expect(await requestsWaiting(me)).toBe(0);
    expect((await people(me)).pending.map((p) => p.accountId)).toEqual([ana]);
  });

  it("refuses yourself, a connection, a second while one is open, and one the other way", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const tom = await account("Tom Reilly");
    expect(await request(me, me)).toMatchObject({
      ok: false,
      error: "yourself",
    });
    await connect(me, ana);
    expect(await request(me, ana)).toMatchObject({
      ok: false,
      error: "connected",
    });
    const first = await request(me, tom);
    expect(await request(me, tom)).toMatchObject({
      ok: false,
      error: "pending",
      requestId: first.ok ? first.requestId : "",
    });
    expect(await request(tom, me)).toMatchObject({
      ok: false,
      error: "asked_you",
      requestId: first.ok ? first.requestId : "",
    });
  });

  it("allows a new request only seven days after the last, withdrawn or expired", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const first = await request(me, ana);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await withdraw(me, first.requestId)).toBe(true);
    expect(await request(me, ana)).toMatchObject({
      ok: false,
      error: "too_soon",
    });
    await db
      .updateTable("connection_requests")
      .set({ created_at: sql`now() - interval '8 days'` })
      .execute();
    const second = await request(me, ana);
    expect(second.ok).toBe(true);
    // Expiry: the sweep withdraws it, then it is the same as a withdrawn one.
    await db
      .updateTable("connection_requests")
      .set({
        created_at: sql`now() - interval '31 days'`,
        expires_at: sql`now() - interval '1 day'`,
      })
      .where("id", "=", second.ok ? second.requestId : "")
      .execute();
    expect(await requestsWaiting(ana)).toBe(0);
    await sweepPeople();
    const rows = await db
      .selectFrom("connection_requests")
      .select(["withdrawn_at"])
      .execute();
    expect(rows.every((r) => r.withdrawn_at !== null)).toBe(true);
    expect((await request(me, ana)).ok).toBe(true);
  });

  it("caps outstanding requests at fifty", async () => {
    const me = await account("Jo Martins");
    for (let i = 0; i < REQUESTS_OUTSTANDING; i++) {
      const other = await account(`Person ${i}`);
      expect((await request(me, other)).ok).toBe(true);
    }
    const one = await account("One More");
    expect(await request(me, one)).toMatchObject({
      ok: false,
      error: "too_many",
    });
  });

  it("purges the record of who asked whom seven days after it ends", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const r = await request(me, ana);
    if (!r.ok) throw new Error("no request");
    await withdraw(me, r.requestId);
    await db
      .updateTable("connection_requests")
      .set({
        created_at: sql`now() - interval '9 days'`,
        withdrawn_at: sql`now() - interval '8 days'`,
      })
      .execute();
    await sweepPeople();
    expect(
      await db.selectFrom("connection_requests").select("id").execute(),
    ).toHaveLength(0);
  });
});

describe("answering (AC-6 to AC-10)", () => {
  it("accept connects both at once and clears the card, the dot and the reverse request", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const r = await request(ana, me);
    if (!r.ok) throw new Error("no request");
    // Ana's request to me and, racing it, one from me to Ana that slipped in
    // before hers was delivered: accepting hers makes mine moot.
    await db
      .insertInto("connection_requests")
      .values({ from_account_id: me, to_account_id: ana })
      .execute();
    expect(await accept(me, r.requestId)).toBe(true);
    expect(await connected(me, ana)).toBe(true);
    expect(await requestsWaiting(me)).toBe(0);
    expect((await people(ana)).pending).toHaveLength(0);
    expect((await people(me)).connections.map((c) => c.accountId)).toEqual([
      ana,
    ]);
    expect((await people(ana)).connections.map((c) => c.accountId)).toEqual([
      me,
    ]);
    // Answered once: the same id again is not found.
    expect(await accept(me, r.requestId)).toBe(false);
  });

  it("Not now takes the card and the dot and leaves the row for the asker", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const r = await request(ana, me);
    if (!r.ok) throw new Error("no request");
    expect(await dismiss(me, r.requestId)).toBe(true);
    expect(await requestsWaiting(me)).toBe(0);
    expect((await people(me)).requestsForYou).toHaveLength(0);
    expect((await people(ana)).pending.map((p) => p.id)).toEqual([r.requestId]);
    expect(await relationOf(me, ana)).toBe("asked_you");
    // Ana cannot accept or dismiss her own, and I cannot withdraw hers.
    expect(await dismiss(ana, r.requestId)).toBe(false);
    expect(await accept(ana, r.requestId)).toBe(false);
    expect(await withdraw(me, r.requestId)).toBe(false);
  });

  it("Withdraw removes the other side's card and dot", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const r = await request(me, ana);
    if (!r.ok) throw new Error("no request");
    expect(await requestsWaiting(ana)).toBe(1);
    expect(await withdraw(me, r.requestId)).toBe(true);
    expect(await requestsWaiting(ana)).toBe(0);
    expect((await people(ana)).requestsForYou).toHaveLength(0);
    expect(await relationOf(ana, me)).toBeNull();
  });
});

describe("the lists and the page (AC-11, AC-12, AC-14)", () => {
  it("lists connections with the shared threads, own requests, and blocked people", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const tom = await account("Tom Reilly");
    const nils = await account("Nils");
    const priya = await account("Priya Raman");
    const zed = await account(null);
    await connect(me, ana);
    await connect(me, tom);
    await connect(me, nils);
    const lisbon = await thread(me, "Lisbon trip");
    await join(ana, lisbon);
    await join(tom, lisbon);
    const berlin = await thread(me, "Berlin, March");
    await join(ana, berlin);
    const wedding = await thread(me, "Sam's wedding");
    await join(ana, wedding);
    await request(me, priya);
    await db
      .insertInto("blocks")
      .values({ blocker_account_id: me, blocked_account_id: zed })
      .execute();

    const page = await people(me);
    expect(page.count).toBe(3);
    const anaRow = page.connections.find((c) => c.accountId === ana)!;
    expect(anaRow.threadCount).toBe(3);
    expect(anaRow.threads).toHaveLength(2);
    expect(page.connections.find((c) => c.accountId === nils)!.threads).toEqual(
      [],
    );
    expect(page.pending.map((p) => p.accountId)).toEqual([priya]);
    expect(page.blocked).toEqual([
      { accountId: zed, displayName: null, initials: "?" },
    ]);

    const anaPage = await person(me, ana);
    expect(anaPage).toMatchObject({
      accountId: ana,
      relation: "connected",
      requestId: null,
    });
    expect(anaPage!.shared.map((s) => s.name)).toHaveLength(3);
    expect(await person(me, priya)).toMatchObject({ relation: "you_asked" });
    expect((await person(me, priya))!.requestId).not.toBeNull();
    expect(await person(me, zed)).toMatchObject({
      relation: "blocked",
      initials: "?",
    });
    const stranger = await account("Stranger");
    expect(await person(me, stranger)).toBeNull();
    expect(await person(me, uuidv7())).toBeNull();
  });

  it("answers the same 404 for a stranger and for nobody, over the route", async () => {
    const me = await account("Jo Martins");
    const stranger = await account("Stranger");
    const cookie = await signIn(me);
    const a = await app.inject({
      method: "GET",
      url: `/v1/people/${stranger}`,
      headers: { cookie },
    });
    const b = await app.inject({
      method: "GET",
      url: `/v1/people/${uuidv7()}`,
      headers: { cookie },
    });
    expect([a.statusCode, b.statusCode]).toEqual([404, 404]);
    expect(a.body).toEqual(b.body);
  });
});

describe("ending it (AC-15, AC-16)", () => {
  it("Remove deletes the pair, withdraws requests and waiting shares either way, and leaves memberships and keys", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    await connect(me, ana);
    const lisbon = await thread(me);
    await join(ana, lisbon);
    await db
      .insertInto("thread_keys")
      .values({
        thread_id: lisbon,
        account_id: me,
        wrapped_tk: Buffer.from("x"),
      })
      .execute();
    await db
      .insertInto("thread_keys")
      .values({
        thread_id: lisbon,
        account_id: ana,
        wrapped_tk: Buffer.from("y"),
      })
      .execute();
    const berlin = await thread(ana, "Berlin");
    await join(me, berlin, "pending", ana);
    const shelf = await thread(me, "Bookshelf");
    await join(ana, shelf, "pending", me);

    expect(await remove(me, ana)).toBe(true);
    expect(await connected(me, ana)).toBe(false);
    expect(
      await db
        .selectFrom("thread_members")
        .select("state")
        .where("thread_id", "=", lisbon)
        .execute(),
    ).toEqual([{ state: "accepted" }, { state: "accepted" }]);
    expect(
      await db
        .selectFrom("thread_keys")
        .select("account_id")
        .where("thread_id", "=", lisbon)
        .execute(),
    ).toHaveLength(2);
    const waiting = await db
      .selectFrom("thread_members")
      .select(["thread_id", "state"])
      .where("thread_id", "in", [berlin, shelf])
      .where("account_id", "in", [me, ana])
      .execute();
    expect(waiting.map((w) => w.state).sort()).toEqual([
      "accepted",
      "accepted",
      "expired",
      "expired",
    ]);
    // Still visible through the thread, and no more.
    expect(await relationOf(me, ana)).toBe("thread");
    expect(await remove(me, ana)).toBe(false);
  });

  it("Block writes a later request undelivered, and Unblock does not reconnect", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    await connect(me, ana);
    expect(await block(me, ana)).toBe(true);
    expect(await connected(me, ana)).toBe(false);
    expect(await relationOf(me, ana)).toBe("blocked");
    expect(await relationOf(ana, me)).toBeNull();

    const r = await request(ana, me);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Identical on Ana's side: a Pending row with a date, the seven-day rule,
    // one open per pair.
    expect((await people(ana)).pending.map((p) => p.id)).toEqual([r.requestId]);
    expect(await request(ana, me)).toMatchObject({
      ok: false,
      error: "pending",
    });
    // Nothing on mine.
    expect(await requestsWaiting(me)).toBe(0);
    expect((await people(me)).requestsForYou).toHaveLength(0);
    expect(await accept(me, r.requestId)).toBe(false);

    expect(await unblock(me, ana)).toBe(true);
    expect(await connected(me, ana)).toBe(false);
    expect(await relationOf(me, ana)).toBeNull();
    // Blocking a stranger is not a thing: not found.
    const stranger = await account("Stranger");
    expect(await block(me, stranger)).toBe(false);
  });

  it("a blocked person brought in by a third member is still a member", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const tom = await account("Tom Reilly");
    await connect(me, ana);
    expect(await block(me, ana)).toBe(true);
    const lisbon = await thread(me);
    await join(tom, lisbon);
    await join(ana, lisbon);
    expect(await relationOf(me, ana)).toBe("blocked");
    // And she sees me as what I am to her in that thread, a member, so the
    // face on its head is a face and not the tell.
    expect(await relationOf(ana, me)).toBe("thread");
    const rows = await db
      .selectFrom("thread_members")
      .select("state")
      .where("thread_id", "=", lisbon)
      .execute();
    expect(rows).toHaveLength(3);
  });
});

describe("the mark (AC-13, AC-31)", () => {
  it("is the design system's own arithmetic, run against the kit's code", async () => {
    // The seed, the hue and the facet angle are read from Avatar.jsx and
    // evaluated, so the port cannot drift from the file it ports.
    const kit = readFileSync(
      new URL(
        "../../../.claude/skills/offload-design/components/core/Avatar.jsx",
        import.meta.url,
      ),
      "utf8",
    );
    const fnv = kit.match(/function fnv1a\(s\)\{.*?\}return h>>>0\}/)?.[0];
    const consts = kit.match(/const HUES=\d+, FACETS=\d+;/)?.[0];
    const start = kit.indexOf('const seed=fnv1a(uid||name||"");');
    const end =
      kit.indexOf("const deg=step*(360/FACETS);") +
      "const deg=step*(360/FACETS);".length;
    expect(fnv && consts && start > 0 && end > start).toBeTruthy();
    const body = kit.slice(start, end).replace("const seed", "let seed");
    const kitPrism = new Function(
      "uid",
      `const name=""; ${consts} ${fnv} ${body} return { hue, angle: deg };`,
    ) as (uid: string) => { hue: number; angle: number };
    for (let i = 0; i < 12; i++) {
      const id = uuidv7();
      expect(prismOf(id)).toEqual(kitPrism(id));
    }
    expect(prismOf("ana")).toEqual({ hue: 270, angle: 45 });
  });

  it("stays within the two numbers not to relax, on every hue", () => {
    // Every pixel between L 0.42 and 0.52 keeps white above 4.5:1; the lowest
    // relative luminance a stop can have is at L 0.42, and a pixel darker
    // than the darkest stop is one the gradient could not have produced.
    const luminance = (r: number, g: number, b: number) => {
      const lin = (v: number) =>
        v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      return (
        0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
      );
    };
    for (let i = 0; i < 12; i++) {
      const png = PNG.sync.read(drawAvatar(`hue-${i}`));
      expect([png.width, png.height]).toEqual([SIZE, SIZE]);
      let worst = 21;
      for (let p = 0; p < png.data.length; p += 4 * 37) {
        const contrast =
          (1 + 0.05) /
          (luminance(png.data[p]!, png.data[p + 1]!, png.data[p + 2]!) + 0.05);
        worst = Math.min(worst, contrast);
      }
      expect(worst).toBeGreaterThan(4.5);
    }
  });

  it("is drawn once, served the same to the person and to whoever may see them, and not to anyone else", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const stranger = await account("Stranger");
    await connect(me, ana);
    const mine = await signIn(me);
    const first = await app.inject({
      method: "GET",
      url: `/v1/avatars/${ana}.png`,
      headers: { cookie: mine, "sec-fetch-dest": "image" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.headers["cache-control"]).toContain("immutable");
    // 2026-10-11. A phone keeps its own copy, which it forgets at sign-out;
    // its HTTP stack is told to keep none, since nothing on the phone can
    // clear that one.
    const phone = await app.inject({
      method: "GET",
      url: `/v1/avatars/${ana}.png`,
      headers: { cookie: mine },
    });
    expect(phone.statusCode).toBe(200);
    expect(phone.headers["cache-control"]).toBe("private, no-store");
    for (const reply of [first, phone]) expect(String(reply.headers["vary"]).toLowerCase()).toContain("sec-fetch-dest");
    const stored = await db
      .selectFrom("accounts")
      .select("avatar_png")
      .where("id", "=", ana)
      .executeTakeFirstOrThrow();
    expect(Buffer.from(stored.avatar_png!).equals(first.rawPayload)).toBe(true);
    // A rename changes nothing in the bytes.
    await db
      .updateTable("accounts")
      .set({ display_name: "Ana de Sousa" })
      .where("id", "=", ana)
      .execute();
    const again = await app.inject({
      method: "GET",
      url: `/v1/avatars/${ana}.png`,
      headers: { cookie: mine },
    });
    expect(again.rawPayload.equals(first.rawPayload)).toBe(true);
    // Their own, and a stranger's: one 404 for the unseen and the unknown.
    const own = await app.inject({
      method: "GET",
      url: `/v1/avatars/${me}.png`,
      headers: { cookie: mine },
    });
    expect(own.statusCode).toBe(200);
    const theirs = await app.inject({
      method: "GET",
      url: `/v1/avatars/${ana}.png`,
      headers: { cookie: await signIn(stranger) },
    });
    const nobody = await app.inject({
      method: "GET",
      url: `/v1/avatars/${uuidv7()}.png`,
      headers: { cookie: mine },
    });
    expect([theirs.statusCode, nobody.statusCode]).toEqual([404, 404]);
    expect(theirs.body).toEqual(nobody.body);
  });
});

describe("what leaves, and what goes with an account (AC-33, AC-34)", () => {
  it("emits the actor's pseudonym and nothing about the other person", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const cookie = await signIn(me);
    const asked = await app.inject({
      method: "POST",
      url: "/v1/people/requests",
      payload: { accountId: ana },
      headers: { cookie },
    });
    expect(asked.statusCode).toBe(200);
    const events = await db
      .selectFrom("analytics_events")
      .selectAll()
      .execute();
    expect(events.map((e) => e.name)).toEqual(["connection_requested"]);
    const text = JSON.stringify(events);
    expect(text).not.toContain(ana);
    expect(text).not.toContain("Ana");
    expect(text).not.toContain("@");
  });

  it("takes connections, requests, blocks, waiting shares and the mark with the account row", async () => {
    const me = await account("Jo Martins");
    const ana = await account("Ana Duarte");
    const tom = await account("Tom Reilly");
    await connect(me, ana);
    await request(me, tom);
    await request(ana, me);
    await block(me, tom);
    const lisbon = await thread(ana);
    await join(me, lisbon, "pending", ana);
    await db
      .updateTable("accounts")
      .set({ avatar_png: drawAvatar(me) })
      .where("id", "=", me)
      .execute();
    await db.deleteFrom("accounts").where("id", "=", me).execute();
    expect(
      await db.selectFrom("connections").select("account_a").execute(),
    ).toHaveLength(0);
    expect(
      await db.selectFrom("connection_requests").select("id").execute(),
    ).toHaveLength(0);
    expect(
      await db.selectFrom("blocks").select("blocker_account_id").execute(),
    ).toHaveLength(0);
    expect(
      await db
        .selectFrom("thread_members")
        .select("id")
        .where("thread_id", "=", lisbon)
        .execute(),
    ).toHaveLength(1);
  });
});
