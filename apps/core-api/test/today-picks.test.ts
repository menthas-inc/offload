// 027 T1.7, T1.9: If you have time, and + Today. (AC-22, AC-23)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUtcDays, dayIn } from "@offload/widgets";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
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

async function picks(cookie: string, date = TODAY): Promise<string[]> {
  const response = await app.inject({ method: "GET", url: `/v1/today/day?date=${date}`, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return (response.json() as { picks: { title: string }[] }).picks.map((row) => row.title);
}

/** Oldest first means `created_at`; the rows are written seconds apart. */
async function aged(id: string, minutesAgo: number) {
  await db.updateTable("content").set({ created_at: new Date(Date.now() - minutesAgo * 60_000) } as never).where("id", "=", id).execute();
}

describe("027 the picks (AC-22)", () => {
  it("picks three open undated to-dos the person filed, oldest first, in threads with something due within seven days", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    const idle = await thread([me], "Idle");
    await task(me, flat, "Due soon", addUtcDays(TODAY, 7));
    await task(me, idle, "Due later", addUtcDays(TODAY, 8));
    await aged(await task(me, flat, "Oldest", null), 50);
    await aged(await task(me, flat, "Second", null), 40);
    await aged(await task(me, flat, "Third", null), 30);
    await aged(await task(me, flat, "Fourth", null), 20);
    await aged(await task(me, idle, "In an idle thread", null), 60);
    expect(await picks(await signIn(me))).toEqual(["Oldest", "Second", "Third"]);
  });

  it("never picks another member's row, a repeating one, a done one, an archived one or an event", async () => {
    const me = await account();
    const ana = await account();
    const flat = await thread([me, ana], "Flat");
    await task(me, flat, "Due today", TODAY);
    await task(ana, flat, "Ana's", null);
    await task(me, flat, "Repeats", addUtcDays(TODAY, -7), { rrule: "FREQ=WEEKLY" });
    await task(me, flat, "Done", null, { done_at: new Date() });
    await task(me, flat, "Archived", null, { archived_at: new Date() });
    await task(me, flat, "A link", null, { type: "link" });
    await task(me, flat, "Mine", null);
    expect(await picks(await signIn(me))).toEqual(["Mine"]);
  });

  it("are on today only", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Due today", TODAY);
    await task(me, flat, "Mine", null);
    expect(await picks(await signIn(me), addUtcDays(TODAY, 1))).toEqual([]);
  });
});

describe("027 + Today and its Undo (AC-23)", () => {
  it("gives the row today as a bare day and returns it", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Due today", TODAY);
    const id = await task(me, flat, "Fix the tap", null);
    const response = await app.inject({ method: "POST", url: `/v1/today/picks/${id}`, headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { id: string; dueAt: string }).id).toBe(id);
    const row = await db.selectFrom("content").select(["due_at", "attrs"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.due_at?.toISOString()).toBe(`${TODAY}T12:00:00.000Z`);
    expect((row.attrs as Record<string, unknown>)["all_day"]).toBe(true);
  });

  it("refuses another member's row, a dated row, a repeating row and a thread the person is not in, alike", async () => {
    const me = await account();
    const ana = await account();
    const shared = await thread([me, ana], "Flat");
    const theirs = await thread([ana], "Ana's");
    const ids = [
      await task(ana, shared, "Ana's row", null),
      await task(me, shared, "Dated", TODAY),
      await task(me, shared, "Repeats", addUtcDays(TODAY, -1), { rrule: "FREQ=DAILY" }),
      await task(ana, theirs, "Not in it", null),
      "00000000-0000-7000-8000-000000000000",
    ];
    expect((await app.inject({ method: "POST", url: "/v1/today/picks/not-an-id", headers: { cookie: await signIn(me) } })).statusCode).toBe(400);
    const cookie = await signIn(me);
    for (const id of ids) {
      const response = await app.inject({ method: "POST", url: `/v1/today/picks/${id}`, headers: { cookie } });
      expect(response.statusCode).toBe(404);
    }
    const untouched = await db.selectFrom("content").select("due_at").where("id", "=", ids[0]!).executeTakeFirstOrThrow();
    expect(untouched.due_at).toBeNull();
  });

  it("Undo clears the date and keeps the row out of the picks until tomorrow", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Due today", TODAY);
    const id = await task(me, flat, "Fix the tap", null);
    const cookie = await signIn(me);
    await app.inject({ method: "POST", url: `/v1/today/picks/${id}`, headers: { cookie } });
    const undo = await app.inject({ method: "DELETE", url: `/v1/today/picks/${id}`, headers: { cookie } });
    expect(undo.statusCode).toBe(200);
    const row = await db.selectFrom("content").select("due_at").where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.due_at).toBeNull();
    expect(await picks(cookie)).toEqual([]);
    const off = await db.selectFrom("today_put_offs").select(["card", "until"]).where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(off.card).toBe(`pick:${id}`);
    expect(off.until).not.toBeNull();
  });

  it("Undo answers a refusal as 400, never a 500", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Due today", TODAY);
    const id = await task(me, flat, "Fix the tap", null);
    const cookie = await signIn(me);
    await app.inject({ method: "POST", url: `/v1/today/picks/${id}`, headers: { cookie } });
    // A row that went onto a calendar since: its date lives there now.
    await db.updateTable("content").set({ source_ref: "cal:evt" } as never).where("id", "=", id).execute();
    const undo = await app.inject({ method: "DELETE", url: `/v1/today/picks/${id}`, headers: { cookie } });
    expect(undo.statusCode).toBe(400);
    expect(undo.json()).toEqual({ error: "on_calendar" });
  });

  it("Undo after somebody moved the date is 409 and leaves the date", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Due today", TODAY);
    const id = await task(me, flat, "Fix the tap", null);
    const cookie = await signIn(me);
    await app.inject({ method: "POST", url: `/v1/today/picks/${id}`, headers: { cookie } });
    const moved = new Date(`${addUtcDays(TODAY, 3)}T12:00:00Z`);
    await db.updateTable("content").set({ due_at: moved } as never).where("id", "=", id).execute();
    const undo = await app.inject({ method: "DELETE", url: `/v1/today/picks/${id}`, headers: { cookie } });
    expect(undo.statusCode).toBe(409);
    const row = await db.selectFrom("content").select("due_at").where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.due_at?.toISOString()).toBe(moved.toISOString());
  });
});
