// 042 D7: every read of a row, a note and a memory says whether offload will
// remind its author about it, to the author alone, so the bell and the switch
// draw from what the server decided and never tell another member about
// somebody else's reminders. (AC-20)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { account, label, memory, note, row, signIn, thread, wipe } from "./reminders-kit.js";

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

const SOON = "2027-11-12";

async function rowsOf(cookie: string, threadId: string): Promise<{ id: string; reminders: unknown }[]> {
  const response = await app.inject({ method: "GET", url: `/v1/threads/${threadId}/content`, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return (response.json() as { rows?: { id: string; reminders: unknown }[]; content?: { id: string; reminders: unknown }[] }).rows ??
    (response.json() as { content: { id: string; reminders: unknown }[] }).content;
}

describe("a row's reminders", () => {
  it("on, off or null to its author, and null to anybody else", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const party = await row(me, t, "Surprise party", { day: SOON });
    const stopped = await row(me, t, "Bins out", { day: SOON });
    const receipt = await row(me, t, "Receipt", { day: SOON });
    const unlabelled = await row(me, t, "Pay the rent", { day: SOON });
    const past = await row(me, t, "Old dentist", { day: "2020-01-01" });
    await label(me, { contentId: party }, { kind: "appointment", lead: "weeks" });
    await label(me, { contentId: stopped }, { kind: "day", lead: "none", stopped_at: new Date() });
    await label(me, { contentId: receipt }, { kind: "none", lead: "none" });
    await label(me, { contentId: past }, { kind: "appointment", lead: "none" });
    const mine = new Map((await rowsOf(await signIn(me), t)).map((r) => [r.id, r.reminders]));
    expect(mine.get(party)).toBe("on");
    expect(mine.get(stopped)).toBe("off");
    expect(mine.get(receipt)).toBeNull();
    expect(mine.get(unlabelled)).toBeNull();
    expect(mine.get(past)).toBeNull();
    const hers = new Map((await rowsOf(await signIn(ana), t)).map((r) => [r.id, r.reminders]));
    expect(hers.get(party)).toBeNull();
    expect(hers.get(stopped)).toBeNull();
  });
});

describe("a note's reminders", () => {
  it("to its author alone", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: SOON });
    await label(me, { noteId: trip }, { kind: "trip", lead: "weeks" });
    const notesOf = async (cookie: string) => {
      const response = await app.inject({ method: "GET", url: `/v1/threads/${t}`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      return (response.json() as { notes: { id: string; reminders: unknown }[] }).notes;
    };
    expect((await notesOf(await signIn(me))).find((n) => n.id === trip)?.reminders).toBe("on");
    expect((await notesOf(await signIn(ana))).find((n) => n.id === trip)?.reminders).toBeNull();
  });
});

describe("a memory's reminders", () => {
  it("on for a dated birthday, off once stopped, null for a memory with no date", async () => {
    const me = await account();
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const sam = await memory(me, "Sam's birthday is 1 July.");
    const home = await memory(me, "Home is in Toronto.", "things");
    await label(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "03-14" });
    await label(me, { noteId: sam }, { kind: "occasion", lead: "none", yearly_on: "07-01", stopped_at: new Date() });
    const response = await app.inject({ method: "GET", url: "/v1/memories", headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(200);
    const byId = new Map((response.json() as { memories: { id: string; reminders: unknown }[] }).memories.map((m) => [m.id, m.reminders]));
    expect(byId.get(meera)).toBe("on");
    expect(byId.get(sam)).toBe("off");
    expect(byId.get(home)).toBeNull();
  });
});
