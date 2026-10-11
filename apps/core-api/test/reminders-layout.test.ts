// 042 E7: Today's fourth section, Reminders, under Your day and above Open in
// your threads by default; and phones that know Open in your threads but not
// Reminders never receive a layout naming it. (AC-26, AC-27)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { DEFAULT_LAYOUT, remindersOn, resolveLayout } from "../src/today/layout.js";
import { account, signIn, wipe } from "./reminders-kit.js";

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

const kinds = (value: { sections: { kind: string }[] }) => value.sections.map((one) => one.kind);

describe("the fourth section", () => {
  it("sits under Your day and above Open in your threads, on", () => {
    expect(kinds(DEFAULT_LAYOUT)).toEqual(["needs_you", "day", "reminders", "open_threads"]);
    expect(remindersOn(DEFAULT_LAYOUT)).toBe(true);
  });

  it("lands straight after Your day in a layout saved before it, wherever Your day was moved", () => {
    const saved = {
      version: 1,
      sections: [
        { kind: "open_threads", on: true },
        { kind: "day", on: false },
        { kind: "needs_you", parts: ["account", "people", "questions", "tips"].map((kind) => ({ kind, on: true })) },
      ],
    };
    expect(kinds(resolveLayout(saved))).toEqual(["open_threads", "day", "reminders", "needs_you"]);
  });

  it("can be moved and switched off", () => {
    const moved = resolveLayout({
      version: 1,
      sections: [
        { kind: "reminders", on: false },
        { kind: "needs_you", parts: ["account", "people", "questions", "tips"].map((kind) => ({ kind, on: true })) },
        { kind: "day", on: true },
        { kind: "open_threads", on: true },
      ],
    });
    expect(kinds(moved)[0]).toBe("reminders");
    expect(remindersOn(moved)).toBe(false);
  });
});

describe("what each build reads", () => {
  it("the oldest builds see neither new kind, V2 builds no Reminders, V3 everything", async () => {
    const cookie = await signIn(await account());
    const me = (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json();
    expect(kinds(me.todayLayout)).toEqual(["needs_you", "day"]);
    expect(kinds(me.todayLayoutV2)).toEqual(["needs_you", "day", "open_threads"]);
    expect(kinds(me.todayLayoutV3)).toEqual(["needs_you", "day", "reminders", "open_threads"]);
  });

  it("a layout a V2 build writes back keeps Reminders, at its default place", async () => {
    const cookie = await signIn(await account());
    const moved = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: {
        todayLayout: {
          version: 1,
          sections: [
            { kind: "open_threads", on: true },
            { kind: "needs_you", parts: ["account", "people", "questions", "tips"].map((kind) => ({ kind, on: true })) },
            { kind: "day", on: true },
          ],
        },
      },
    });
    expect(moved.statusCode).toBe(200);
    expect(kinds(moved.json().todayLayoutV3)).toEqual(["open_threads", "needs_you", "day", "reminders"]);
  });
});
