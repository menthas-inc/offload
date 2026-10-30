// 048. What the triggers say, read off the channel itself.
//
// Each test listens on `offload_change` on a connection of its own, makes one
// write, and reads what arrived. The payload is the whole contract with the
// hub, and it must never carry anything but kinds and ids: a trigger that read
// a title would put it in Postgres's notify queue and statement log (OFF-1).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { account, join, note, row, thread, wipe } from "./labels-kit.js";
import { connectionRequest, message } from "./today-kit.js";

await migrate(() => {});

let listener: pg.Client;
let heard: string[] = [];

beforeAll(async () => {
  listener = new pg.Client({ connectionString: env.DATABASE_URL });
  listener.on("notification", (note) => {
    if (note.channel === "offload_change" && note.payload) heard.push(note.payload);
  });
  await listener.connect();
  await listener.query("listen offload_change");
});

afterAll(async () => {
  await listener.end();
  await closeDb();
});

beforeEach(async () => {
  await wipe();
  await settle();
  heard = [];
});

/** Notifications arrive after commit, on another connection. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

async function hear(write: () => Promise<unknown>): Promise<string[]> {
  // What the setup's own writes said is still arriving; let it land first.
  await settle();
  heard = [];
  await write();
  await settle();
  return [...new Set(heard)].sort();
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ONLY_IDS = new RegExp(`^[a-z]+(:${UUID}){1,2}$`);

describe("a person's own order (2026-10-29)", () => {
  it("says order with their account, and nothing else", async () => {
    const me = await account();
    expect(await hear(() => db.insertInto("thread_order").values({ account_id: me, sort: "mine", ids: [] }).execute())).toEqual([`order:${me}`]);
    expect(await hear(() => db.updateTable("thread_order").set({ sort: "newest" }).where("account_id", "=", me).execute())).toEqual([`order:${me}`]);
  });
});

describe("threads and what is in them", () => {
  it("a thread made, renamed and deleted says thread with its id", async () => {
    const me = await account();
    let id = "";
    expect(await hear(async () => (id = await thread(me)))).toContain(`thread:${id}`);
    expect(await hear(() => db.updateTable("threads").set({ name: "Lisbon" }).where("id", "=", id).execute())).toEqual([`thread:${id}`]);
    expect(await hear(() => db.updateTable("threads").set({ deleted_at: new Date() }).where("id", "=", id).execute())).toContain(`thread:${id}`);
  });

  it("a row says its thread, and a row moved says both", async () => {
    const me = await account();
    const a = await thread(me);
    const b = await thread(me);
    let id = "";
    expect(await hear(async () => (id = await row(me, a, "Pay the rent")))).toEqual([`thread:${a}`]);
    expect(await hear(() => db.updateTable("content").set({ thread_id: b }).where("id", "=", id).execute())).toEqual([`thread:${a}`, `thread:${b}`].sort());
    expect(await hear(() => db.deleteFrom("content").where("id", "=", id).execute())).toEqual([`thread:${b}`]);
  });

  it("twenty writes to one thread in one transaction are one payload", async () => {
    const me = await account();
    const a = await thread(me);
    heard = [];
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < 20; i++) {
        await trx.insertInto("content").values({ account_id: me, thread_id: a, type: "task", title: `t${i}`, updated_at: new Date() } as never).execute();
      }
    });
    await settle();
    // The hub's buffer is a set, so this is an optimisation, not a rule; it is
    // here to show the queue does not carry one payload per row.
    expect(heard.length).toBeLessThan(20);
    expect(new Set(heard)).toEqual(new Set([`thread:${a}`]));
  });

  it("a thread's note says its thread", async () => {
    const me = await account();
    const a = await thread(me);
    expect(await hear(() => note(me, a, "We take the night ferry"))).toEqual([`thread:${a}`]);
  });

  it("a memory says memories with its account, and forgetting one does too", async () => {
    const me = await account();
    const a = await thread(me);
    let id = "";
    expect(await hear(async () => (id = await note(me, a, "Meera's birthday is 14 March", "account")))).toEqual([`memories:${me}`]);
    expect(await hear(() => db.updateTable("notes").set({ deleted_at: new Date() } as never).where("id", "=", id).execute())).toEqual([`memories:${me}`]);
  });

  it("a memory says memories to the account it is about, even when somebody else wrote it", async () => {
    const me = await account();
    const author = await account("Meera");
    const said = await hear(() =>
      db
        .insertInto("notes")
        .values({ account_id: author, scope: "account", subject_id: me, text: "Likes the window seat", kind: "about", origin: "stated" } as never)
        .execute(),
    );
    expect(said).toEqual([`memories:${me}`]);
  });

  it("an embedding written to a memory says nothing: nobody can see it", async () => {
    const me = await account();
    const a = await thread(me);
    const id = await note(me, a, "Meera's birthday is 14 March", "account");
    expect(await hear(() => db.updateTable("notes").set({ embedded_at: new Date() } as never).where("id", "=", id).execute())).toEqual([]);
  });
});

describe("membership", () => {
  it("a member taken out says thread to the thread and removed to them alone", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    await join(a, them);
    const said = await hear(() =>
      db.updateTable("thread_members").set({ state: "removed" }).where("thread_id", "=", a).where("account_id", "=", them).execute(),
    );
    expect(said).toEqual([`removed:${a}:${them}`, `thread:${a}`].sort());
  });

  it("a thread deleted says removed to each member still in it, as leaving would", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    await join(a, them);
    const said = await hear(() => db.updateTable("threads").set({ deleted_at: new Date() }).where("id", "=", a).execute());
    expect(said).toEqual([`removed:${a}:${me}`, `removed:${a}:${them}`, `thread:${a}`].sort());
  });

  it("leaving says removed too", async () => {
    const me = await account();
    const a = await thread(me);
    const said = await hear(() => db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", a).execute());
    expect(said).toContain(`removed:${a}:${me}`);
  });

  it("an invitation says invitation to the invitee, and nothing about the thread to them", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    const said = await hear(() => db.insertInto("thread_members").values({ thread_id: a, account_id: them, state: "pending" }).execute());
    expect(said).toContain(`invitation:${them}`);
    expect(said.filter((one) => one.includes(them) && !one.startsWith("invitation:"))).toEqual([]);
  });

  it("an invitation answered says invitation to the invitee", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    await db.insertInto("thread_members").values({ thread_id: a, account_id: them, state: "pending" }).execute();
    const said = await hear(() =>
      db.updateTable("thread_members").set({ state: "accepted" }).where("thread_id", "=", a).where("account_id", "=", them).execute(),
    );
    expect(said).toEqual([`invitation:${them}`, `thread:${a}`].sort());
  });
});

describe("what is the account's own", () => {
  it("a dump appearing says conversation with its account", async () => {
    const me = await account();
    expect(await hear(() => message(me))).toEqual([`conversation:${me}`]);
  });

  it("a message changing state says nothing: its answer has its own stream", async () => {
    const me = await account();
    const { messageId } = await message(me);
    expect(await hear(() => db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute())).toEqual([]);
  });

  it("a connection request says people to both people", async () => {
    const me = await account();
    const them = await account("Meera");
    expect(await hear(() => connectionRequest(me, them))).toEqual([`people:${me}`, `people:${them}`].sort());
  });
});

describe("what travels", () => {
  it("is never anything but kinds and ids", async () => {
    const me = await account();
    const them = await account("Meera");
    const a = await thread(me);
    const all = await hear(async () => {
      await row(me, a, "Ana's ferry times, 09:40");
      await note(me, a, "Meera's birthday is 14 March", "account");
      await join(a, them);
      await db.updateTable("thread_members").set({ state: "removed" }).where("account_id", "=", them).execute();
      await message(me);
      await sql`select 1`.execute(db);
    });
    expect(all.length).toBeGreaterThan(3);
    for (const payload of all) expect(payload).toMatch(ONLY_IDS);
  });
});
