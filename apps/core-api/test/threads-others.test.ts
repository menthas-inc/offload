// 2026-10-07. My threads says who else is in each thread, so a shared one's
// row offers Leave, naming who it stays with, where a thread only you are in
// offers Delete.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { account, as, join, signIn, thread, wipe } from "./labels-kit.js";

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

describe("who else is in a thread, on My threads", () => {
  it("names the other accepted members, and nobody on a thread of your own", async () => {
    const me = await account("Ana Duarte");
    const sam = await account("Sam Reed");
    const gone = await account("Jo Left");
    const shared = await thread(me, "Flat admin");
    await join(shared, sam);
    await join(shared, gone, "left");
    const mine = await thread(me, "Dentist");
    const list = (await as(app, await signIn(me)).get("/v1/threads")).json();
    const rows = list.groups.flatMap((group: { threads: { id: string; others: string[] }[] }) => group.threads);
    expect(rows.find((row: { id: string }) => row.id === shared).others).toEqual(["Sam Reed"]);
    expect(rows.find((row: { id: string }) => row.id === mine).others).toEqual([]);
  });
});
