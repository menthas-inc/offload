// 028 T1.5, AC-3, AC-27, AC-28. No surface that names a thread names the
// default one: a Today row, event and question card, a turn's footer, an
// answer's result, the content detail, and a forwarded email's Activity line.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dayIn } from "@offload/widgets";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { foundFor } from "../src/search/found.js";
import { mailLandedLine } from "../src/mail-in/activity.js";
import { threadsFor, threadsForAll } from "../src/routes/dumps.js";
import { account, offloadEvent, question, signIn, task, thread, ZONE } from "./today-kit.js";
import { dump } from "./labels-kit.js";

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
  await db.deleteFrom("message_content").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

const TODAY = dayIn(new Date(), ZONE);

async function withDefault(): Promise<{ me: string; loose: string; lisbon: string }> {
  const me = await account();
  const loose = await thread([me], "Miscellaneous");
  const lisbon = await thread([me], "Lisbon trip");
  await db.updateTable("accounts").set({ default_thread_id: loose }).where("id", "=", me).execute();
  return { me, loose, lisbon };
}

describe("Today (AC-3)", () => {
  it("names a thread for a row in it and nothing for a loose row", async () => {
    const { me, loose, lisbon } = await withDefault();
    await task(me, loose, "Renew passport", TODAY);
    await task(me, lisbon, "Book the flat", TODAY);
    await offloadEvent(me, loose, "Drinks with Priya", `${TODAY}T18:00:00Z`);
    const day = (await app.inject({ method: "GET", url: `/v1/today/day?date=${TODAY}`, headers: { cookie: await signIn(me) } })).json() as {
      rest: { title: string; threadId: string; threadName: string | null }[];
      events: { title: string; threadName: string | null }[];
    };
    const names = Object.fromEntries(day.rest.map((r) => [r.title, r.threadName]));
    expect(names).toEqual({ "Renew passport": null, "Book the flat": "Lisbon trip" });
    expect(day.rest.find((r) => r.title === "Renew passport")!.threadId).toBe(loose);
    expect(day.events.find((e) => e.title === "Drinks with Priya")!.threadName).toBeNull();
  });

  it("names nothing on a question card about a loose row", async () => {
    const { me, loose } = await withDefault();
    const row = await task(me, loose, "Dentist", null);
    await question(me, { field: "date", contentId: row });
    const needs = (await app.inject({ method: "GET", url: "/v1/today/needs", headers: { cookie: await signIn(me) } })).json() as {
      cards: { kind: string; threadName: string | null }[];
    };
    const card = needs.cards.find((c) => c.kind === "question");
    expect(card).toBeDefined();
    expect(card!.threadName).toBeNull();
  });
});

describe("an answer's results (AC-3)", () => {
  it("carry no name for the default thread", async () => {
    const { me, loose, lisbon } = await withDefault();
    const { messageId } = await dump(me);
    const a = await task(me, loose, "Passport number is in the drawer", null);
    const b = await task(me, lisbon, "Flat on Rua da Rosa", null);
    await db.insertInto("message_content").values([
      { message_id: messageId, content_id: a, ord: 0, truncated: false },
      { message_id: messageId, content_id: b, ord: 1, truncated: false },
    ] as never).execute();
    const results = (await foundFor([messageId], me)).get(messageId)!;
    const byThread = Object.fromEntries(results.map((r) => [r.threadId, r.threadName]));
    expect(byThread).toEqual({ [loose]: null, [lisbon]: "Lisbon trip" });
    expect(results.find((r) => r.threadId === loose)!.rows[0]!.threadName).toBeNull();
  });
});

describe("a turn's footer (AC-27)", () => {
  it("draws no pill for what landed loose, and still says the default thread changed", async () => {
    const { me, loose, lisbon } = await withDefault();
    const { messageId } = await dump(me);
    await task(me, loose, "Renew passport", null, { derived_from_message_id: messageId });
    const onlyLoose = await threadsFor(messageId, me);
    expect(onlyLoose.landed).toEqual([]);
    expect(onlyLoose.changed).toEqual([loose]);
    // Done still shows: the turn filed something, it just has no pill.
    expect(onlyLoose.filed).toBe(true);
    expect((await threadsForAll([messageId], me)).get(messageId)).toEqual([]);

    await task(me, lisbon, "Book the flat", null, { derived_from_message_id: messageId });
    const both = await threadsFor(messageId, me);
    expect(both.landed).toEqual([{ id: lisbon, name: "Lisbon trip" }]);
    expect((await threadsForAll([messageId], me)).get(messageId)).toEqual([{ id: lisbon, name: "Lisbon trip" }]);
  });
});

describe("the conversation's tail (AC-27)", () => {
  it("says a loose-only turn filed something, with no pill", async () => {
    const { me, loose } = await withDefault();
    const { messageId } = await dump(me);
    await db.updateTable("messages").set({ state: "answered" }).where("id", "=", messageId).execute();
    await task(me, loose, "Renew passport", null, { derived_from_message_id: messageId });
    const response = await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie: await signIn(me) } });
    const tail = response.json() as { messages: { id: string; threads: unknown[]; filed: boolean }[] };
    const message = tail.messages.find((m) => m.id === messageId)!;
    expect(message.threads).toEqual([]);
    expect(message.filed).toBe(true);
  });
});

describe("the content detail (AC-3)", () => {
  it("names no thread for a loose row", async () => {
    const { me, loose } = await withDefault();
    const row = await task(me, loose, "Renew passport", null);
    const detail = (await app.inject({ method: "GET", url: `/v1/content/${row}`, headers: { cookie: await signIn(me) } })).json() as {
      threadId: string;
      threadName: string | null;
    };
    expect(detail.threadId).toBe(loose);
    expect(detail.threadName).toBeNull();
  });
});

describe("a forwarded email's Activity line (AC-28)", () => {
  it("has no in clause for something filed only loose, and names a real thread", () => {
    expect(mailLandedLine([{ title: "Boarding pass", thread_id: "d", threadName: null }])).toBe("Boarding pass");
    expect(mailLandedLine([{ title: "Boarding pass", thread_id: "l", threadName: "Lisbon trip" }])).toBe("Boarding pass, in Lisbon trip");
    expect(mailLandedLine([
      { title: "A", thread_id: "d", threadName: null },
      { title: "B", thread_id: "d", threadName: null },
    ])).toBe("Two from an email");
    expect(mailLandedLine([
      { title: "A", thread_id: "l", threadName: "Lisbon trip" },
      { title: "B", thread_id: "l", threadName: "Lisbon trip" },
    ])).toBe("Two into Lisbon trip, from an email");
  });
});
