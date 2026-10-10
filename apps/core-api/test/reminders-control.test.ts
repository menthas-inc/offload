// 042 D6: the author's Remind me. Only the author can stop a thing's
// reminders; stopping a row somebody asked about also turns the flag off;
// nothing turns the flag on; and Undo puts both back. (AC-19, OFF-3, OFF-6)

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

const stoppedOf = async (column: "content_id" | "note_id", id: string) =>
  (await db.selectFrom("reminder_labels").select("stopped_at").where(column, "=", id).executeTakeFirst())?.stopped_at ?? null;

describe("a row's Remind me, through the sheet's one save", () => {
  it("the author stops it, and the flag goes off with it; Undo puts both back", async () => {
    const me = await account();
    const t = await thread([me]);
    const call = await row(me, t, "Call mum", { day: "2027-11-12" }, { is_reminder: true });
    await label(me, { contentId: call }, { kind: "day", lead: "none" });
    const cookie = await signIn(me);
    const off = await app.inject({ method: "PATCH", url: `/v1/content/${call}`, headers: { cookie }, payload: { reminders: "off" } });
    expect(off.statusCode).toBe(200);
    expect(off.json().previous).toMatchObject({ isReminder: true, reminders: "on" });
    expect(await stoppedOf("content_id", call)).not.toBeNull();
    expect((await db.selectFrom("content").select("is_reminder").where("id", "=", call).executeTakeFirstOrThrow()).is_reminder).toBe(false);
    const undo = await app.inject({ method: "PATCH", url: `/v1/content/${call}`, headers: { cookie }, payload: { reminders: "on", isReminder: true } });
    expect(undo.statusCode).toBe(200);
    expect(await stoppedOf("content_id", call)).toBeNull();
    expect((await db.selectFrom("content").select("is_reminder").where("id", "=", call).executeTakeFirstOrThrow()).is_reminder).toBe(true);
  });

  it("another member cannot stop the author's, and the response teaches nothing", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const party = await row(me, t, "Surprise party", { day: "2027-11-12" });
    await label(me, { contentId: party }, { kind: "appointment", lead: "weeks" });
    const response = await app.inject({ method: "PATCH", url: `/v1/content/${party}`, headers: { cookie: await signIn(ana) }, payload: { reminders: "off" } });
    expect(response.statusCode).toBe(404);
    expect(await stoppedOf("content_id", party)).toBeNull();
  });

  it("a stop on a row nobody has labelled yet is kept for when one is", async () => {
    const me = await account();
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" });
    await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie: await signIn(me) }, payload: { reminders: "off" } });
    expect(await stoppedOf("content_id", rent)).not.toBeNull();
  });
});

describe("a note's and a memory's Remind me", () => {
  it("the author stops a note's and puts it back", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2027-11-12" });
    const cookie = await signIn(me);
    const off = await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie }, payload: { of: "note", id: trip, on: false } });
    expect(off.statusCode).toBe(200);
    expect(await stoppedOf("note_id", trip)).not.toBeNull();
    await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie }, payload: { of: "note", id: trip, on: true } });
    expect(await stoppedOf("note_id", trip)).toBeNull();
  });

  it("nobody else may, for a note or a memory", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2027-11-12" });
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const cookie = await signIn(ana);
    expect((await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie }, payload: { of: "note", id: trip, on: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie }, payload: { of: "memory", id: meera, on: false } })).statusCode).toBe(404);
    expect(await stoppedOf("note_id", trip)).toBeNull();
    expect(await stoppedOf("note_id", meera)).toBeNull();
  });

  it("the author stops a memory's", async () => {
    const me = await account();
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const response = await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie: await signIn(me) }, payload: { of: "memory", id: meera, on: false } });
    expect(response.statusCode).toBe(200);
    expect(await stoppedOf("note_id", meera)).not.toBeNull();
  });

  it("a thread note is not a memory, and a memory is not a thread note", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2027-11-12" });
    const meera = await memory(me, "Meera's birthday is 14 March.");
    const cookie = await signIn(me);
    expect((await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie }, payload: { of: "memory", id: trip, on: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/v1/reminders", headers: { cookie }, payload: { of: "note", id: meera, on: false } })).statusCode).toBe(404);
  });
});

describe("Undo sends back what it was given", () => {
  it("a null Remind me in the snapshot leaves the switch alone, for anybody", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const rent = await row(me, t, "Pay the rent", { day: "2027-11-12" });
    for (const who of [me, ana]) {
      const cookie = await signIn(who);
      const edit = await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie }, payload: { title: "Pay the rent now" } });
      expect(edit.json().previous.reminders).toBeNull();
      const undo = await app.inject({ method: "PATCH", url: `/v1/content/${rent}`, headers: { cookie }, payload: edit.json().previous });
      expect(undo.statusCode, who === me ? "author" : "member").toBe(200);
    }
    expect(await stoppedOf("content_id", rent)).toBeNull();
  });
});
