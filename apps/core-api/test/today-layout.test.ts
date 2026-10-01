// 027 T1.1, T1.3, T1.4: the layout, and the schema Today adds. (AC-12, AC-19, AC-27, AC-28)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { DEFAULT_LAYOUT, resolveLayout, todayLayout } from "../src/today/layout.js";
import { account, calendar, calendarEvent, connection, signIn } from "./today-kit.js";

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
});

const parts = (on: [boolean, boolean, boolean, boolean]) => [
  { kind: "account", on: on[0] },
  { kind: "people", on: on[1] },
  { kind: "questions", on: on[2] },
  { kind: "tips", on: on[3] },
];
const layout = (over: Partial<{ order: "needs" | "day"; parts: [boolean, boolean, boolean, boolean]; day: boolean }> = {}) => {
  const needs = { kind: "needs_you", parts: parts(over.parts ?? [true, true, true, true]) };
  const day = { kind: "day", on: over.day ?? true };
  return { version: 1, sections: over.order === "day" ? [day, needs] : [needs, day] };
};

describe("027 the layout document (AC-28)", () => {
  it("defaults to Needs you with every kind on, then the day", () => {
    expect(DEFAULT_LAYOUT).toEqual(layout());
    expect(resolveLayout(null)).toEqual(layout());
  });

  it("gives a stored layout that does not name a kind that kind at its default place", () => {
    expect(resolveLayout({ version: 1, sections: [{ kind: "day", on: false }] })).toEqual({
      version: 1,
      sections: [{ kind: "needs_you", parts: parts([true, true, true, true]) }, { kind: "day", on: false }],
    });
  });

  it("resolves something that no longer parses to the defaults", () => {
    expect(resolveLayout({ version: 9 })).toEqual(layout());
    expect(resolveLayout("nonsense")).toEqual(layout());
  });

  it("refuses an unknown kind, a repeated kind, a missing part, extra keys and everything off", () => {
    const bad: unknown[] = [
      { version: 1, sections: [{ kind: "moved", on: true }] },
      { version: 1, sections: [{ kind: "day", on: true }, { kind: "day", on: true }] },
      { version: 1, sections: [{ kind: "needs_you", parts: parts([true, true, true, true]).slice(0, 3) }, { kind: "day", on: true }] },
      { version: 1, sections: [{ kind: "needs_you", parts: [...parts([true, true, true, true]).slice(0, 3), { kind: "account", on: true }] }, { kind: "day", on: true }] },
      { ...layout(), extra: true },
      layout({ parts: [false, false, false, false], day: false }),
      { version: 2, sections: layout().sections },
    ];
    for (const value of bad) expect(todayLayout.safeParse(value).success, JSON.stringify(value)).toBe(false);
    expect(todayLayout.safeParse(layout({ order: "day", parts: [true, false, false, false], day: false })).success).toBe(true);
  });
});

describe("027 the layout on /api/me (AC-27)", () => {
  it("reads the resolved layout and stores only what parsed, last write winning", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const read = async () => ((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json() as { todayLayout: unknown }).todayLayout;
    expect(await read()).toEqual(layout());

    const first = await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { todayLayout: layout({ order: "day" }) } });
    expect(first.statusCode).toBe(200);
    await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { todayLayout: layout({ parts: [true, false, true, true] }) } });
    expect(await read()).toEqual(layout({ parts: [true, false, true, true] }));

    const refused = await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { todayLayout: { ...layout(), extra: 1 } } });
    expect(refused.statusCode).toBe(400);
    const stored = await db.selectFrom("accounts").select("today_layout").where("id", "=", me).executeTakeFirstOrThrow();
    expect(stored.today_layout).toEqual(layout({ parts: [true, false, true, true] }));
  });
});

describe("027 the schema (AC-12, AC-19)", () => {
  it("refuses a put-off card outside the closed shape and drops put-offs with the account", async () => {
    const me = await account();
    await expect(db.insertInto("today_put_offs").values({ account_id: me, card: "anything", until: null } as never).execute()).rejects.toThrow();
    await db.insertInto("today_put_offs").values({ account_id: me, card: "tip:forwarding", until: null } as never).execute();
    await db.deleteFrom("accounts").where("id", "=", me).execute();
    expect(await db.selectFrom("today_put_offs").selectAll().execute()).toEqual([]);
  });

  it("refuses an event link that is not https on a Google host", async () => {
    const me = await account();
    const cal = await calendar(await connection(me));
    for (const link of ["http://www.google.com/calendar/event?eid=x", "javascript:alert(1)", "https://evil.example/calendar/", "https://www.google.com.evil.example/calendar/"]) {
      await expect(calendarEvent(me, cal, "x", "2026-10-02T10:00:00Z", { link })).rejects.toThrow();
    }
    await calendarEvent(me, cal, "ok", "2026-10-02T10:00:00Z", { link: "https://www.google.com/calendar/event?eid=x" });
    await calendarEvent(me, cal, "ok too", "2026-10-02T11:00:00Z", { link: "https://calendar.google.com/calendar/event?eid=y" });
  });
});
