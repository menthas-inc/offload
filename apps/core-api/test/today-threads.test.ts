// Today, open in your threads (design 2026-10-07): a page per thread holding
// open to-dos with no date, and Not in a thread last. It replaces If you have
// time, so the day carries no picks any more.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUtcDays, dayIn } from "@offload/widgets";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { OPEN_PAGES, OPEN_ROWS } from "../src/today/threads.js";
import { account, signIn, task, thread, ZONE } from "./today-kit.js";

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

const TODAY = dayIn(new Date(), ZONE);

interface Page {
  threadId: string;
  name: string | null;
  icon: string | null;
  people: { initials: string }[];
  todos: { id: string; title: string; createdAt: string }[];
  count: number;
  loose: { inMind: number; holds: Record<string, number> } | null;
}

async function open(cookie: string): Promise<{ pages: Page[]; count: number }> {
  const response = await app.inject({ method: "GET", url: "/v1/today/threads", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json() as { pages: Page[]; count: number };
}

const shape = (pages: Page[]) => pages.map((page) => [page.name, page.todos.map((row) => row.title), page.count]);

/** Oldest first means `created_at`; the rows are written milliseconds apart. */
async function aged(id: string, minutesAgo: number) {
  await db.updateTable("content").set({ created_at: new Date(Date.now() - minutesAgo * 60_000) } as never).where("id", "=", id).execute();
}

async function looseThread(accountId: string): Promise<string> {
  const id = await thread([accountId], "Miscellaneous");
  await db.updateTable("accounts").set({ default_thread_id: id } as never).where("id", "=", accountId).execute();
  return id;
}

describe("open in your threads: the pages", () => {
  it("draws a page per thread with open undated to-dos, in My threads' order, four rows each in the thread page's order", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    const trip = await thread([me], "Europe, October");
    const dated = await thread([me], "Only dated");
    // My threads orders by last activity, newest first: Flat moved last.
    await db.updateTable("threads").set({ last_activity_at: new Date(Date.now() - 60_000) } as never).where("id", "=", flat).execute();
    await db.updateTable("threads").set({ last_activity_at: new Date(Date.now() - 3_600_000) } as never).where("id", "=", trip).execute();
    await aged(await task(me, flat, "Fix the tap", null), 30);
    // The thread page's To do: by priority, then newest first.
    const sintra = await task(me, trip, "Book the Sintra train", null);
    await aged(sintra, 90);
    for (const [title, ago] of [["Viva Viagem cards", 80], ["Orsay tickets", 70], ["Adapters", 60], ["Hotel in Paris", 50]] as const) {
      await aged(await task(me, trip, title, null), ago);
    }
    await db.updateTable("content").set({ priority: 3 } as never).where("id", "=", sintra).execute();
    await task(me, trip, "Dated", TODAY);
    await task(me, dated, "Has a day", addUtcDays(TODAY, 3));

    const read = await open(await signIn(me));
    expect(shape(read.pages)).toEqual([
      ["Flat", ["Fix the tap"], 1],
      ["Europe, October", ["Book the Sintra train", "Hotel in Paris", "Adapters", "Orsay tickets"], 5],
    ]);
    expect(read.count).toBe(6);
    expect(read.pages[1]!.threadId).toBe(trip);
    expect(read.pages[1]!.loose).toBeNull();
  });

  it("leaves out done, archived and deleted rows, what is not a to-do, and threads the person is not in", async () => {
    const me = await account();
    const ana = await account({ display_name: "Ana Duarte" });
    const flat = await thread([me], "Flat");
    const hers = await thread([ana], "Hers");
    await task(me, flat, "Done", null, { done_at: new Date() });
    await task(me, flat, "Archived", null, { archived_at: new Date() });
    await task(me, flat, "Deleted", null, { deleted_at: new Date() });
    await task(me, flat, "A link", null, { type: "link" });
    await task(ana, hers, "Not mine to see", null);
    expect((await open(await signIn(me))).pages).toEqual([]);
  });

  it("takes another member's to-do in a shared thread, and names the people sharing it", async () => {
    const me = await account({ display_name: "Jo Moss" });
    const ana = await account({ display_name: "Ana Duarte" });
    const tom = await account({ display_name: "Tom Reis" });
    const trip = await thread([me, ana, tom], "Europe, October");
    await task(ana, trip, "Find a hotel in Paris", null);
    const [page] = (await open(await signIn(me))).pages;
    expect(page!.todos.map((row) => row.title)).toEqual(["Find a hotel in Paris"]);
    expect(page!.people.map((one) => one.initials)).toEqual(["AD", "TR"]);
  });

  it(`stops at ${OPEN_PAGES} thread pages and counts only what they hold`, async () => {
    const me = await account();
    for (let n = 0; n < OPEN_PAGES + 2; n++) {
      const t = await thread([me], `Thread ${n}`);
      // Thread 0 moved last, so it comes first as it does on My threads.
      await db.updateTable("threads").set({ last_activity_at: new Date(Date.now() - n * 60_000) } as never).where("id", "=", t).execute();
      await aged(await task(me, t, `To-do ${n}`, null), 100 - n);
    }
    const read = await open(await signIn(me));
    expect(read.pages).toHaveLength(OPEN_PAGES);
    expect(read.pages[0]!.name).toBe("Thread 0");
    expect(read.count).toBe(OPEN_PAGES);
    expect(OPEN_ROWS).toBe(4);
  });
});

describe("open in your threads: Not in a thread", () => {
  it("comes last whatever its age, with what offload has in mind and what else it holds", async () => {
    const me = await account();
    const loose = await looseThread(me);
    const flat = await thread([me], "Flat");
    await aged(await task(me, flat, "Fix the tap", null), 10);
    const passport = await task(me, loose, "Renew passport", null);
    await aged(passport, 500);
    await aged(await task(me, loose, "Call the landlord", null), 400);
    await task(me, loose, "A link", null, { type: "link" });
    await task(me, loose, "Another link", null, { type: "link" });
    await task(me, loose, "Dated loose", TODAY);
    await db.insertInto("suggestions").values({ account_id: me, content_id: passport, kind: "move", thread_id: flat } as never).execute();

    const read = await open(await signIn(me));
    expect(shape(read.pages)).toEqual([
      ["Flat", ["Fix the tap"], 1],
      // In the thread page's order: newest first.
      [null, ["Call the landlord", "Renew passport"], 2],
    ]);
    expect(read.pages[1]!.threadId).toBe(loose);
    expect(read.pages[1]!.loose).toEqual({ inMind: 1, holds: { link: 2 } });
  });

  it(`comes after a full ${OPEN_PAGES} thread pages, which do not count it`, async () => {
    const me = await account();
    const loose = await looseThread(me);
    await aged(await task(me, loose, "Renew passport", null), 500);
    for (let n = 0; n < OPEN_PAGES + 1; n++) await task(me, await thread([me], `Thread ${n}`), `To-do ${n}`, null);
    const read = await open(await signIn(me));
    expect(read.pages).toHaveLength(OPEN_PAGES + 1);
    expect(read.pages.at(-1)!.name).toBeNull();
  });

  it("is absent when it holds no undated to-do", async () => {
    const me = await account();
    const loose = await looseThread(me);
    await task(me, loose, "A link", null, { type: "link" });
    await task(me, loose, "Dated loose", TODAY);
    expect((await open(await signIn(me))).pages).toEqual([]);
  });
});

describe("open in your threads: the layout and the wire", () => {
  it("builds nothing when the layout has it off", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Fix the tap", null);
    const cookie = await signIn(me);
    const off = {
      version: 1,
      sections: [
        { kind: "needs_you", parts: ["account", "people", "questions", "tips"].map((kind) => ({ kind, on: true })) },
        { kind: "day", on: true },
        { kind: "open_threads", on: false },
      ],
    };
    expect((await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { todayLayout: off } })).statusCode).toBe(200);
    expect(await open(cookie)).toEqual({ pages: [], count: 0 });
  });

  it("is 401 without a session", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/today/threads" })).statusCode).toBe(401);
  });

  it("the day carries no picks any more, and + Today is gone", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Due soon", addUtcDays(TODAY, 2));
    const id = await task(me, flat, "Undated", null);
    const cookie = await signIn(me);
    const day = await app.inject({ method: "GET", url: `/v1/today/day?date=${TODAY}`, headers: { cookie } });
    expect((day.json() as { picks: unknown[] }).picks).toEqual([]);
    expect((await app.inject({ method: "POST", url: `/v1/today/picks/${id}`, headers: { cookie } })).statusCode).toBe(404);
  });
});
