// 027 T1.15, OFF-1: Today's reads and writes put no words in a log line.
// (AC-32)

import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addUtcDays, dayIn } from "@offload/widgets";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, calendar, calendarEvent, connection, question, signIn, task, thread, ZONE } from "./today-kit.js";

await migrate(() => {});

const lines: string[] = [];
let app: App;
beforeAll(async () => {
  app = await buildApp({
    logStream: new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    }),
  });
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
const WORD = "Zanzibarquill";

describe("027 OFF-1 nothing a person wrote reaches a log line", () => {
  it("across the day, Needs you, put-off and open in your threads", async () => {
    const logged: string[] = [];
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
    }
    try {
      const me = await account({ display_name: `${WORD} Person`, email: `${WORD.toLowerCase()}@example.com` });
      const t = await thread([me], `${WORD} thread`);
      await task(me, t, `${WORD} due`, TODAY);
      const pick = await task(me, t, `${WORD} pick`, null);
      const cal = await calendar(await connection(me), { summary: `${WORD} calendar` });
      await calendarEvent(me, cal, `${WORD} event`, `${addUtcDays(TODAY, 1)}T10:00:00Z`, { link: `https://www.google.com/calendar/event?eid=${WORD}` });
      const q = await question(me, { contentId: pick, text: `${WORD} question?` });
      const cookie = await signIn(me);

      const calls = [
        app.inject({ method: "GET", url: `/v1/today/day?date=${TODAY}`, headers: { cookie } }),
        app.inject({ method: "GET", url: `/v1/today/day?date=${addUtcDays(TODAY, 1)}`, headers: { cookie } }),
        app.inject({ method: "GET", url: "/v1/today/needs", headers: { cookie } }),
        app.inject({ method: "POST", url: "/v1/today/put-off", headers: { cookie }, payload: { card: `question:${q}` } }),
        app.inject({ method: "POST", url: "/v1/today/put-off", headers: { cookie }, payload: { card: `${WORD}:x` } }),
        app.inject({ method: "GET", url: "/v1/today/threads", headers: { cookie } }),
        app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { todayLayout: { version: 1, sections: [{ kind: WORD, on: true }] } } }),
      ];
      for (const call of calls) expect((await call).statusCode).toBeLessThan(500);

      const everything = [...lines, ...logged].join("\n").toLowerCase();
      expect(everything).not.toContain(WORD.toLowerCase());
    } finally {
      vi.restoreAllMocks();
    }
  });
});
