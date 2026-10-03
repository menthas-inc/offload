// 037. Thread icons: who picks, and the one write that changes them.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { account, as, createSuggestion, dump, join, owner, proposal, row, signIn, thread, tool, wipe } from "./loose-kit.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

const mark = (id: string) => db.selectFrom("threads").select(["name", "icon", "hue", "icon_set_by"]).where("id", "=", id).executeTakeFirstOrThrow();

async function created(accountId: string, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { jobId } = await dump(accountId);
  const response = await tool(app, { tool: "create_thread", jobId, toolCallId: `c-${name}`, name, ...extra });
  expect(response.json()).toMatchObject({ ok: true });
  return response.json().threadId;
}

describe("on create", () => {
  it("takes the icon the model names (AC-2)", async () => {
    const { me } = await owner();
    expect(await mark(await created(me, "Lisbon", { icon: "plane" }))).toMatchObject({ icon: "plane", icon_set_by: "offload" });
  });

  it("falls to the word list when the model names none, or one that is not in the list (AC-2)", async () => {
    const { me } = await owner();
    expect((await mark(await created(me, "Dentist"))).icon).toBe("stethoscope");
    expect((await mark(await created(me, "Gift ideas", { icon: "present-box" }))).icon).toBe("gift");
    expect((await mark(await created(me, "Misc", { icon: "../../etc" }))).icon).toBe("lasso");
    // The agent sends an argument the model left out as null.
    expect((await mark(await created(me, "Gym", { icon: null }))).icon).toBe("dumbbell");
  });

  it("gives each new thread the hue its creator uses least, the default not counted (AC-4)", async () => {
    const { me, loose } = await owner();
    await db.updateTable("threads").set({ hue: 1 }).where("id", "=", loose).execute();
    const hues = [];
    for (let index = 0; index < 11; index++) hues.push((await mark(await created(me, `t${index}`))).hue);
    expect(hues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1]);
  });

  it("stops counting a deleted thread's hue (AC-4)", async () => {
    const { me } = await owner();
    const first = await created(me, "one");
    await created(me, "two");
    await db.updateTable("threads").set({ deleted_at: new Date() }).where("id", "=", first).execute();
    expect((await mark(await created(me, "three"))).hue).toBe(1);
  });

  it("picks for a thread a person makes from a proposal (AC-1)", async () => {
    const { me, loose } = await owner();
    const p = await proposal(me, "Kitchen shelf");
    const a = await row(me, loose, "brackets");
    await createSuggestion(me, { contentId: a }, p);
    const response = await as(app, await signIn(me)).post(`/v1/proposals/${p}/create`, { name: "Kitchen shelf", contentIds: [a], noteIds: [] });
    expect(response.statusCode).toBe(200);
    expect(response.json().thread).toMatchObject({ name: "Kitchen shelf", icon: "hammer", hue: 1 });
  });
});

describe("PATCH /v1/threads/:id", () => {
  it("writes name, icon and hue in one request and says what was there (AC-7)", async () => {
    const me = await account();
    const t = await thread(me, "Europe, October");
    const response = await as(app, await signIn(me)).patch(`/v1/threads/${t}`, { name: "Europe", icon: "plane", hue: 4 });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      thread: { id: t, name: "Europe", icon: "plane", hue: 4, iconSetBy: "person" },
      previous: { name: "Europe, October", icon: "lasso", hue: 1, iconSetBy: "offload" },
    });
    expect(await mark(t)).toEqual({ name: "Europe", icon: "plane", hue: 4, icon_set_by: "person" });
  });

  it("Undo puts back all of it, including whose pick it was (AC-7)", async () => {
    const me = await account();
    const t = await thread(me, "Europe, October");
    const cookie = await signIn(me);
    const { previous } = (await as(app, cookie).patch(`/v1/threads/${t}`, { name: "Europe", icon: "plane", hue: 4 })).json();
    expect((await as(app, cookie).patch(`/v1/threads/${t}`, previous)).statusCode).toBe(200);
    expect(await mark(t)).toEqual({ name: "Europe, October", icon: "lasso", hue: 1, icon_set_by: "offload" });
  });

  it("a rename while the pick is offload's picks again on a match, and never moves the hue (AC-5)", async () => {
    const me = await account();
    const t = await thread(me, "Europe, October");
    await db.updateTable("threads").set({ hue: 7 }).where("id", "=", t).execute();
    const response = await as(app, await signIn(me)).patch(`/v1/threads/${t}`, { name: "Dentist" });
    expect(response.json().thread).toEqual({ id: t, name: "Dentist", icon: "stethoscope", hue: 7, iconSetBy: "offload" });
  });

  it("a rename with no match keeps the icon it has (AC-5)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    await db.updateTable("threads").set({ icon: "plane" }).where("id", "=", t).execute();
    await as(app, await signIn(me)).patch(`/v1/threads/${t}`, { name: "Lisbon 2027" });
    expect(await mark(t)).toMatchObject({ icon: "plane", icon_set_by: "offload" });
  });

  it("a rename never touches a person's pick, by a person or by the model (AC-5)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    const cookie = await signIn(me);
    await as(app, cookie).patch(`/v1/threads/${t}`, { icon: "wine" });
    await as(app, cookie).patch(`/v1/threads/${t}`, { name: "Dentist" });
    expect(await mark(t)).toMatchObject({ icon: "wine", icon_set_by: "person" });
    const { jobId } = await dump(me);
    await tool(app, { tool: "rename_thread", jobId, toolCallId: "r1", threadId: t, name: "Gym" });
    expect(await mark(t)).toMatchObject({ name: "Gym", icon: "wine", icon_set_by: "person" });
  });

  it("the model's rename picks again while the pick is offload's (AC-5)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    const { jobId } = await dump(me);
    await tool(app, { tool: "rename_thread", jobId, toolCallId: "r1", threadId: t, name: "Gym" });
    expect(await mark(t)).toMatchObject({ name: "Gym", icon: "dumbbell", icon_set_by: "offload" });
  });

  it("a changed icon or hue is the person's pick; the same ones sent back are not (AC-6)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    const cookie = await signIn(me);
    await as(app, cookie).patch(`/v1/threads/${t}`, { name: "Lisbon", icon: "lasso", hue: 1 });
    expect((await mark(t)).icon_set_by).toBe("offload");
    await as(app, cookie).patch(`/v1/threads/${t}`, { hue: 3 });
    expect(await mark(t)).toMatchObject({ icon: "lasso", hue: 3, icon_set_by: "person" });
  });

  it("does not hand a person's pick back to offload unless the pick itself moves (AC-6)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    const cookie = await signIn(me);
    await as(app, cookie).patch(`/v1/threads/${t}`, { icon: "wine" });
    // The same icon and hue with the flag flipped changes nothing anybody can
    // see, so it changes nothing.
    expect((await as(app, cookie).patch(`/v1/threads/${t}`, { icon: "wine", hue: 1, iconSetBy: "offload" })).statusCode).toBe(200);
    expect(await mark(t)).toMatchObject({ icon: "wine", icon_set_by: "person" });
  });

  it("is anybody's in the thread, and nobody else's (AC-8)", async () => {
    const me = await account();
    const them = await account("Sam Ibekwe");
    const stranger = await account("Kit Lowe");
    const t = await thread(me, "Lisbon");
    await join(t, them);
    expect((await as(app, await signIn(them)).patch(`/v1/threads/${t}`, { icon: "wine" })).statusCode).toBe(200);
    expect((await as(app, await signIn(stranger)).patch(`/v1/threads/${t}`, { icon: "cat" })).statusCode).toBe(404);
    expect((await mark(t)).icon).toBe("wine");
  });

  it("refuses an icon outside the list, a hue outside one to ten, and nothing at all (AC-8)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    const cookie = await signIn(me);
    for (const body of [{ icon: "../../etc" }, { icon: "globe-2" }, { hue: 0 }, { hue: 11 }, { hue: 2.5 }, {}, { name: "" }, { iconSetBy: "model" }, { iconSetBy: "offload" }, { name: "x", iconSetBy: "offload" }]) {
      expect({ body, status: (await as(app, cookie).patch(`/v1/threads/${t}`, body)).statusCode }).toEqual({ body, status: 400 });
    }
    expect(await mark(t)).toEqual({ name: "Lisbon", icon: "lasso", hue: 1, icon_set_by: "offload" });
  });
});
