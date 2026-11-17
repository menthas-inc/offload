// 052 T1.9. A reply's reads and a pill's tap log ids, kinds, counts and
// outcomes only: never a title, a name, a domain or a place (OFF-1).

import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { account, as, dump, signIn, thread, tool, wipe } from "./labels-kit.js";

const lines: string[] = [];
let app: App;
await migrate(() => {});
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
  lines.length = 0;
  await wipe();
});

describe("what leaves in the logs", () => {
  it("a pill tap and the conversation read carry no words of the person's", async () => {
    const me = await account("Meera Das");
    const health = await thread(me, "Orthodontics clinic");
    const d = await dump(me, "Orthodontist appointment in two days at 3");
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await tool(app, { tool: "add_content", jobId: d.jobId, toolCallId: "c1", threadId: health, type: "event", title: "Orthodontist appointment", occursAt: `${at}T15:00` });
    await db.updateTable("conversations").set({ last_message_at: new Date() }).where("id", "=", d.conversationId).execute();
    const cookie = await signIn(me);
    lines.length = 0;
    expect((await as(app, cookie).post(`/v1/turns/${d.turnId}/pills`, { kind: "remind" })).statusCode).toBe(200);
    await as(app, cookie).get("/v1/conversations/current");
    const logged = lines.join("\n");
    expect(logged).toContain('"kind":"remind"');
    for (const word of ["Orthodontist", "Orthodontics", "Meera"]) expect(logged).not.toContain(word);
  });
});
