// 037. Every read that names a thread for a person carries its icon and hue,
// from the thread as it is now (AC-9).
//
// The first test is the mechanical one: this repo has shipped a field present
// on one seam and absent on the next more than once, and Fastify drops what a
// response schema was not told about without a word.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join as path } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { buildApp, type App } from "../src/app.js";
import { as, join, moveSuggestion, owner, row, signIn, thread, account, wipe } from "./loose-kit.js";

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path(dir, name);
    return statSync(full).isDirectory() ? sources(full) : full.endsWith(".ts") ? [full] : [];
  });
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("the schemas", () => {
  it("carry an icon and a hue wherever they carry a thread's name for a person", () => {
    const short: string[] = [];
    for (const file of sources(new URL("../src", import.meta.url).pathname)) {
      const text = readFileSync(file, "utf8");
      const names = count(text, "threadName: z.string().nullable()");
      // What the model reads back from a tool is not drawn.
      if (names === 0 || file.endsWith("routes/tools.ts")) continue;
      if (count(text, "threadIcon: z.string().nullable()") !== names || count(text, "threadHue: z.number().nullable()") !== names) short.push(file);
    }
    expect(short).toEqual([]);
  });

  it("name no thread as a bare id and name any more", () => {
    const bare = sources(new URL("../src/routes", import.meta.url).pathname).filter((file) => {
      const text = readFileSync(file, "utf8");
      return /thread: z\.object\(\{ id: z\.string\(\), name: z\.string\(\) \}\)/.test(text) || (file.endsWith("dumps.ts") && text.includes("z.array(z.object({ id: z.string(), name: z.string() }))"));
    });
    expect(bare).toEqual([]);
  });
});

describe("the reads", () => {
  async function marked(me: string, name = "Lisbon trip") {
    const t = await thread(me, name);
    await db.updateTable("threads").set({ icon: "plane", hue: 6 }).where("id", "=", t).execute();
    return t;
  }

  it("My threads and the thread itself", async () => {
    const { me } = await owner();
    const t = await marked(me);
    const cookie = await signIn(me);
    const list = (await as(app, cookie).get("/v1/threads")).json();
    expect(list.groups.flatMap((group: { threads: unknown[] }) => group.threads)).toEqual([
      // `icon` stays lasso on this one read: a phone build from before 037
      // draws it straight from here and has no glyph for anything else.
      expect.objectContaining({ id: t, icon: "lasso", threadIcon: "plane", threadHue: 6 }),
    ]);
    expect((await as(app, cookie).get(`/v1/threads/${t}`)).json()).toMatchObject({ icon: "plane", hue: 6, iconSetBy: "offload" });
  });

  it("a row's own page, and nothing for a row that is not in a thread", async () => {
    const { me, loose } = await owner();
    const t = await marked(me);
    const cookie = await signIn(me);
    const filed = await row(me, t, "book flights");
    const stray = await row(me, loose, "a stray");
    expect((await as(app, cookie).get(`/v1/content/${filed}`)).json()).toMatchObject({ threadName: "Lisbon trip", threadIcon: "plane", threadHue: 6 });
    expect((await as(app, cookie).get(`/v1/content/${stray}`)).json()).toMatchObject({ threadName: null, threadIcon: null, threadHue: null });
  });

  it("Today's rows", async () => {
    const { me } = await owner();
    const t = await marked(me);
    await row(me, t, "book flights", { due_at: new Date() });
    const day = (await as(app, await signIn(me)).get("/v1/today")).json();
    const rows = [...day.overdue, ...day.today, ...day.tomorrow];
    expect(rows).toEqual([expect.objectContaining({ threadName: "Lisbon trip", threadIcon: "plane", threadHue: 6 })]);
  });

  it("a Move to suggestion, and the thread it names once accepted", async () => {
    const { me, loose } = await owner();
    const t = await marked(me);
    const stray = await row(me, loose, "a stray");
    const s = await moveSuggestion(me, { contentId: stray }, t);
    const cookie = await signIn(me);
    const page = (await as(app, cookie).get("/v1/loose")).json();
    expect(JSON.stringify(page)).toContain(`"thread":{"id":"${t}","name":"Lisbon trip","icon":"plane","hue":6}`);
    expect((await as(app, cookie).post(`/v1/suggestions/${s}/accept`)).json()).toEqual({ thread: { id: t, name: "Lisbon trip", icon: "plane", hue: 6 } });
  });

  it("a person's shared threads", async () => {
    const { me } = await owner();
    const them = await account("Sam Ibekwe");
    const t = await marked(me);
    await join(t, them);
    const page = (await as(app, await signIn(me)).get(`/v1/people/${them}`)).json();
    expect(page.shared).toEqual([expect.objectContaining({ id: t, icon: "plane", hue: 6 })]);
  });
});
