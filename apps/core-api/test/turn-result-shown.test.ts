// 052 T1.8. What an answer showed beside its words: one day or a span of at
// most 62 days, bounded at the internal boundary and kept on offload's reply.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { account, dump, wipe } from "./labels-kit.js";

let app: App;
await migrate(() => {});
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

const result = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/turn-result", headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` }, payload });

describe("shown", () => {
  it("keeps a span on offload's reply", async () => {
    const me = await account();
    const d = await dump(me, "what's on this week?");
    const res = await result({ outcome: "answered", jobId: d.jobId, replyText: "Three this week.", shown: { span: { from: "2026-11-16", to: "2026-11-22" } }, usage: [] });
    expect(res.statusCode).toBe(200);
    const reply = await db.selectFrom("messages").select("shown").where("turn_id", "=", d.turnId).where("role", "=", "offload").executeTakeFirstOrThrow();
    expect(reply.shown).toEqual({ span: { from: "2026-11-16", to: "2026-11-22" } });
  });

  it("keeps one day", async () => {
    const me = await account();
    const d = await dump(me, "when do the clocks go forward?");
    await result({ outcome: "answered", jobId: d.jobId, replyText: "Sunday 28 March, at 1am.", shown: { on: "2027-03-28" }, usage: [] });
    const reply = await db.selectFrom("messages").select("shown").where("turn_id", "=", d.turnId).where("role", "=", "offload").executeTakeFirstOrThrow();
    expect(reply.shown).toEqual({ on: "2027-03-28" });
  });

  it("refuses a span over 62 days, an end before its start, and a date that is not one", async () => {
    const me = await account();
    for (const shown of [
      { span: { from: "2026-01-01", to: "2026-06-01" } },
      { span: { from: "2026-11-22", to: "2026-11-16" } },
      { on: "2026-13-40" },
      { on: "tomorrow" },
    ]) {
      const d = await dump(me, "what's on?");
      const res = await result({ outcome: "answered", jobId: d.jobId, replyText: "x", shown, usage: [] });
      expect(res.statusCode, JSON.stringify(shown)).toBe(400);
    }
  });
});
