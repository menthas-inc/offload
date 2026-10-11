// 042 E2: the two sends name what offload reminds about. The today and
// tomorrow parts gain on-the-day and evening-before reminders, Coming up
// names month outs and week outs, each switch holds back only its own rows,
// and only the author is ever reminded. (AC-13, AC-16, AC-17, OFF-3)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { runDigest } from "../src/notifications/digest.js";
import { MemoryPush, push } from "../src/notifications/push.js";
import { account, label, memory, note, row, thread, token, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const memoryPush = push() as MemoryPush;

beforeEach(async () => {
  await wipe();
  memoryPush.sent.length = 0;
});

const DAY = "2026-11-02"; // Monday; Lisbon is UTC+0
const MORNING = new Date(`${DAY}T08:00:00Z`);
const EVENING = new Date(`${DAY}T19:00:00Z`);
const LONG_AGO = new Date("2026-06-01T00:00:00Z");

async function labelled(accountId: string, thing: { contentId?: string; noteId?: string }, over: Record<string, unknown>) {
  return label(accountId, thing, { labelled_at: LONG_AGO, date_set_at: LONG_AGO, ...over });
}

/** A morning with every part: an asked row, an on-the-day reminder, a trip a
 *  week out and a birthday a month out. */
async function morning(me: string) {
  const t = await thread([me]);
  await row(me, t, "Pay the rent", { day: DAY }, { is_reminder: true });
  const form = await row(me, t, "Submit the form", { day: DAY });
  await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
  const trip = await note(me, t, "We're in Lisbon from the 9th", { day: "2026-11-09" });
  await labelled(me, { noteId: trip }, { kind: "trip", lead: "weeks", name: "Lisbon" });
  const meera = await memory(me, "Meera's birthday is 30 November.");
  await labelled(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "11-30", name: "Meera's birthday" });
  return { t, form, trip, meera };
}

const activity = (me: string) =>
  db.selectFrom("activity").select(["kind", "sent", "reason", "title", "body"]).where("account_id", "=", me).execute();

describe("the morning send", () => {
  it("names what is due, the day's reminders, and what is coming, in one notification", async () => {
    const me = await account();
    await token(me);
    await morning(me);
    expect(await runDigest(me, "morning", DAY, MORNING, MORNING)).toBe("sent");
    expect(memoryPush.sent).toHaveLength(1);
    expect(memoryPush.sent[0]).toMatchObject({
      title: "Two today, two coming up",
      body: "Pay the rent, and Submit the form. Coming up: Lisbon on 9 November, and Meera's birthday on 30 November.",
      channelId: "due_today",
      data: { kind: "digest", send: "morning" },
    });
    expect(await activity(me)).toEqual([
      expect.objectContaining({ kind: "digest", sent: true, title: "Two today, two coming up" }),
    ]);
  });

  it("with Due today off, still names the reminders and records nothing for the rows it held back", async () => {
    const me = await account({ notify_due_today: false });
    await token(me);
    await morning(me);
    expect(await runDigest(me, "morning", DAY, MORNING, MORNING)).toBe("sent");
    expect(memoryPush.sent[0]).toMatchObject({
      title: "One today, two coming up",
      body: "Submit the form. Coming up: Lisbon on 9 November, and Meera's birthday on 30 November.",
    });
    expect((await activity(me)).filter((one) => !one.sent)).toEqual([]);
  });

  it("with Reminders off, is 024's send and nothing more", async () => {
    const me = await account({ notify_reminders: false });
    await token(me);
    await morning(me);
    await runDigest(me, "morning", DAY, MORNING, MORNING);
    expect(memoryPush.sent[0]).toMatchObject({ title: "One today", body: "Pay the rent." });
  });

  it("with both off, sends nothing, and records only what 024 held back", async () => {
    const me = await account({ notify_reminders: false, notify_due_today: false });
    await token(me);
    await morning(me);
    expect(await runDigest(me, "morning", DAY, MORNING, MORNING)).toBe("skipped_setting");
    expect(memoryPush.sent).toEqual([]);
    expect(await activity(me)).toEqual([expect.objectContaining({ sent: false, reason: "setting", body: "Pay the rent." })]);
  });

  it("names a row once when 024 already names it", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const rent = await row(me, t, "Pay the rent", { day: DAY }, { is_reminder: true });
    await labelled(me, { contentId: rent }, { kind: "deadline", lead: "days" });
    await runDigest(me, "morning", DAY, MORNING, MORNING);
    expect(memoryPush.sent[0]).toMatchObject({ title: "One today", body: "Pay the rent." });
  });

  it("sends with Coming up alone, and nothing on a quiet morning", async () => {
    const me = await account();
    await token(me);
    const meera = await memory(me, "Meera's birthday is 30 November.");
    await labelled(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "11-30", name: "Meera's birthday" });
    expect(await runDigest(me, "morning", DAY, MORNING, MORNING)).toBe("sent");
    expect(memoryPush.sent[0]).toMatchObject({ title: "One coming up", body: "Meera's birthday on 30 November.", channelId: "due_today" });
    memoryPush.sent.length = 0;
    expect(await runDigest(me, "morning", "2026-11-03", new Date("2026-11-03T08:00:00Z"), new Date("2026-11-03T08:00:00Z"))).toBe("empty");
  });
});

describe("the evening send", () => {
  it("names tomorrow's evening-before reminders with their hour, after 024's rows", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const dentist = await row(me, t, "Dentist", { at: new Date("2026-11-03T15:00:00Z") }, { type: "event" });
    await labelled(me, { contentId: dentist }, { kind: "appointment", lead: "none" });
    expect(await runDigest(me, "evening", DAY, EVENING, EVENING)).toBe("sent");
    expect(memoryPush.sent[0]).toMatchObject({ title: "One tomorrow", body: "Dentist at 15:00.", channelId: "coming_tomorrow" });
  });
});

describe("only the author, only what may be reminded", () => {
  it("never another member's thing, a held one, a stopped one, or one in a thread they left", async () => {
    const me = await account();
    const ana = await account();
    await token(me);
    const shared = await thread([me, ana]);
    const left = await thread([me]);
    const hers = await row(ana, shared, "Ana's form", { day: DAY });
    await labelled(ana, { contentId: hers }, { kind: "deadline", lead: "days" });
    const held = await row(me, shared, "Held form", { day: DAY });
    await labelled(me, { contentId: held }, { kind: "deadline", lead: "days", held_at: new Date() });
    const stopped = await row(me, shared, "Stopped form", { day: DAY });
    await labelled(me, { contentId: stopped }, { kind: "deadline", lead: "days", stopped_at: new Date() });
    const gone = await row(me, left, "Gone form", { day: DAY });
    await labelled(me, { contentId: gone }, { kind: "deadline", lead: "days" });
    await db.updateTable("thread_members").set({ state: "left" } as never).where("thread_id", "=", left).execute();
    expect(await runDigest(me, "morning", DAY, MORNING, MORNING)).toBe("empty");
    expect(memoryPush.sent).toEqual([]);
  });
});

describe("the body", () => {
  it("is cut at 240 at a word, what is due first", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    for (let n = 0; n < 4; n += 1) {
      const id = await row(me, t, `A long reminder title number ${n} ${"x".repeat(60)}`, { day: DAY });
      await labelled(me, { contentId: id }, { kind: "deadline", lead: "days" });
    }
    await runDigest(me, "morning", DAY, MORNING, MORNING);
    const body = memoryPush.sent[0]!.body as string;
    expect(body.length).toBeLessThanOrEqual(240);
    expect(body.startsWith("A long reminder title number")).toBe(true);
    expect(body.endsWith(".")).toBe(true);
  });
});
