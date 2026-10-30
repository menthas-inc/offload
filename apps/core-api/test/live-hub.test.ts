// 048. Who hears what: the hub against the real database and the real channel.
//
// A connection here is a fake that records what it was sent; the stream
// itself is tested over a socket in `changes.test.ts`. What matters in this
// file is the routing, because it is the only thing standing between a write
// in somebody's thread and an account that is not in it (OFF-3, SEC-2).

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { sql } from "kysely";
import type { Changes } from "@offload/widgets";
import { db, closeDb } from "../src/db.js";
import { ensureListening, stopListening } from "../src/dumps/answers.js";
import { migrate } from "../src/migrate.js";
import { attach, buffered, flush, openCount, stopHub } from "../src/live/hub.js";
import { account, join, row, thread, wipe } from "./labels-kit.js";
import { message } from "./today-kit.js";

await migrate(() => {});

afterAll(async () => {
  stopHub();
  await stopListening();
  await closeDb();
});

const detachers: (() => void)[] = [];

beforeEach(async () => {
  for (const detach of detachers.splice(0)) detach();
  await wipe();
  await settle();
  await flush();
});

const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

/** A connection that records what it was sent. */
async function watching(accountId: string) {
  const sent: Changes[] = [];
  let closed = false;
  const detach = await attach(accountId, { send: (changes) => sent.push(changes), close: () => (closed = true) });
  detachers.push(detach);
  return { sent, closed: () => closed, detach };
}

/** Let the writes' notifications arrive, then flush as the tick would. */
async function tick() {
  await settle();
  await flush();
}

describe("a thread's change", () => {
  it("reaches its accepted members and nobody else, a pending invitee included", async () => {
    const me = await account();
    const member = await account("Meera");
    const invitee = await account("Kofi");
    const stranger = await account("Ines");
    const a = await thread(me);
    await join(a, member);
    await db.insertInto("thread_members").values({ thread_id: a, account_id: invitee, state: "pending" }).execute();
    await tick();

    const mine = await watching(me);
    const theirs = await watching(member);
    const invited = await watching(invitee);
    const outside = await watching(stranger);

    await row(me, a, "Pay the rent");
    await tick();

    for (const one of [mine, theirs]) expect(one.sent).toEqual([{ kinds: ["thread"], threads: [a] }]);
    expect(invited.sent).toEqual([]);
    expect(outside.sent).toEqual([]);
  });

  it("is one event for twenty writes in one transaction", async () => {
    const me = await account();
    const a = await thread(me);
    await tick();
    const mine = await watching(me);
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < 20; i++) {
        await trx.insertInto("content").values({ account_id: me, thread_id: a, type: "task", title: `t${i}`, updated_at: new Date() } as never).execute();
      }
    });
    await tick();
    expect(mine.sent).toEqual([{ kinds: ["thread"], threads: [a] }]);
  });
});

describe("being taken out", () => {
  it("is said once to the person taken out, and nothing about the thread after", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    await join(a, them);
    await tick();
    const theirs = await watching(them);

    await db.updateTable("thread_members").set({ state: "removed" }).where("thread_id", "=", a).where("account_id", "=", them).execute();
    await tick();
    expect(theirs.sent).toEqual([{ kinds: ["removed"], removed: [a] }]);

    await row(me, a, "Pay the rent");
    await tick();
    expect(theirs.sent).toHaveLength(1);
  });
});

describe("what is the account's own", () => {
  it("a dump reaches only its own account", async () => {
    const me = await account();
    const them = await account("Meera");
    const mine = await watching(me);
    const theirs = await watching(them);
    await message(me);
    await tick();
    expect(mine.sent).toEqual([{ kinds: ["conversation"] }]);
    expect(theirs.sent).toEqual([]);
  });

  it("an order made on one device reaches only its own account (2026-10-29)", async () => {
    const me = await account();
    const them = await account("Meera");
    const mine = await watching(me);
    const theirs = await watching(them);
    await db.insertInto("thread_order").values({ account_id: me, sort: "mine", ids: [] }).execute();
    await tick();
    expect(mine.sent).toEqual([{ kinds: ["order"] }]);
    expect(theirs.sent).toEqual([]);
  });

  it("says nothing to an account with nothing open", async () => {
    const me = await account();
    await message(me);
    await tick();
    expect(openCount()).toBe(0);
  });
});

describe("when the hub cannot tell who", () => {
  it("sends everybody all, with no ids, if the membership read fails", async () => {
    const me = await account();
    const a = await thread(me);
    await tick();
    const mine = await watching(me);
    await row(me, a, "Pay the rent");
    await settle();
    await flush(async () => {
      throw new Error("read failed");
    });
    expect(mine.sent).toEqual([{ kinds: ["all"] }]);
  });

  it("still tells a removed member, and an account its own kinds, when the membership read fails", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    await join(a, them);
    await tick();
    const theirs = await watching(them);
    await db.updateTable("thread_members").set({ state: "removed" }).where("thread_id", "=", a).where("account_id", "=", them).execute();
    await message(them);
    await settle();
    await flush(async () => {
      throw new Error("read failed");
    });
    expect(theirs.sent).toContainEqual({ kinds: ["all"] });
    expect(theirs.sent).toContainEqual({ kinds: ["conversation", "removed"], removed: [a] });
  });

  it("listens again after its connection drops, and says all when it does", async () => {
    const me = await account();
    const a = await thread(me);
    await tick();
    const mine = await watching(me);

    await sql`
      select pg_terminate_backend(pid) from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid()
         and query ilike 'listen offload_change%'`.execute(db);

    // The hub's own clock notices and relistens; give it a few ticks.
    await settle(2500);
    expect(mine.sent).toContainEqual({ kinds: ["all"] });

    mine.sent.length = 0;
    await row(me, a, "Pay the rent");
    await settle(1200);
    expect(mine.sent).toContainEqual({ kinds: ["thread"], threads: [a] });
  });
});

describe("under load", () => {
  it("runs one flush at a time: a tick while a slow read is out reads nothing", async () => {
    const me = await account();
    const a = await thread(me);
    await tick();
    await watching(me);
    await row(me, a, "Pay the rent");
    await settle();
    let reads = 0;
    const slow = async () => {
      reads += 1;
      await settle(700);
      return [];
    };
    const first = flush(slow);
    // The buffer fills again while the first read is out.
    await row(me, a, "Pick up the keys");
    await settle();
    await flush(slow);
    expect(reads).toBe(1);
    await first;
  });

  it("closes a connection whose second listen failed, rather than leaking it", async () => {
    await stopListening();
    const ended = vi.spyOn(pg.Client.prototype, "end");
    const real = pg.Client.prototype.query;
    const failing = vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: unknown[]) {
      if (args[0] === "listen offload_change") return Promise.reject(new Error("statement timeout")) as never;
      return (real as (...a: unknown[]) => unknown).apply(this, args) as never;
    });
    await expect(ensureListening()).rejects.toThrow("statement timeout");
    expect(ended).toHaveBeenCalled();
    failing.mockRestore();
    ended.mockRestore();
    await ensureListening();
  });
});

describe("with nobody watching", () => {
  it("holds nothing once the last connection goes, so a quiet night is not one wide read in the morning", async () => {
    const me = await account();
    const a = await thread(me);
    const one = await watching(me);
    one.detach();
    await row(me, a, "Pay the rent");
    await message(me);
    await settle();
    expect(buffered()).toBe(0);
  });
});

describe("the cap", () => {
  it("closes an account's oldest connection when a fifth opens", async () => {
    const me = await account();
    const first = await watching(me);
    for (let i = 0; i < 4; i++) await watching(me);
    expect(first.closed()).toBe(true);
    expect(openCount(me)).toBe(4);
  });
});
