// What a send emits validates against its schema in schemas/events: a refused
// reminder of its own, and a calendar morning with no phone to reach. Both
// went out off-schema until the 2026-10-17 sweep.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { runDigest } from "../src/notifications/digest.js";
import { runOwn, scheduleOwn } from "../src/notifications/own.js";
import { MemoryPush, PushFailed, push } from "../src/notifications/push.js";
import { calendar, calendarEvent, connection } from "./today-kit.js";
import { account, label, row, thread, token, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const memoryPush = push() as MemoryPush;

beforeEach(async () => {
  await wipe();
  memoryPush.sent.length = 0;
});

const ajv = new Ajv2020({ allErrors: true, strict: false });
const schema = (name: string) => ajv.compile(JSON.parse(readFileSync(new URL(`../../../schemas/events/${name}.v1.json`, import.meta.url), "utf8")));

async function emitted(name: string) {
  const validate = schema(name);
  const rows = await db.selectFrom("analytics_events").select("properties").where("name", "=", name).execute();
  expect(rows).not.toHaveLength(0);
  for (const { properties } of rows) expect(validate(properties), JSON.stringify(validate.errors)).toBe(true);
}

describe("emitted events match their schemas", () => {
  it("a reminder of its own the push service refuses", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const id = await row(me, t, "Standup", { at: new Date("2026-11-02T15:00:00Z") }, { type: "event" });
    const LONG_AGO = new Date("2026-06-01T00:00:00Z");
    await label(me, { contentId: id }, { kind: "meeting", lead: "none", labelled_at: LONG_AGO, date_set_at: LONG_AGO });
    await scheduleOwn(new Date("2026-11-02T14:10:00Z"));
    const job = await db.selectFrom("jobs").select("payload").where("kind", "=", "reminder.own").executeTakeFirstOrThrow();
    const send = memoryPush.send;
    memoryPush.send = async (messages) => messages.map((message) => ({ token: message.to, ok: false as const, code: "MessageTooBig" }));
    try {
      await expect(runOwn(me, job.payload as Record<string, unknown>, new Date("2026-11-02T14:45:00Z"))).rejects.toBeInstanceOf(PushFailed);
    } finally {
      memoryPush.send = send;
    }
    await emitted("notification_failed");
  });

  it("a calendar morning with no phone to send to", async () => {
    const me = await account();
    await calendarEvent(me, await calendar(await connection(me)), "Standup", "2026-11-02T09:00:00Z");
    expect(await runDigest(me, "morning", "2026-11-02", new Date("2026-11-02T08:00:00Z"), new Date("2026-11-02T08:00:10Z"))).toBe("skipped_permission");
    await emitted("digest_skipped");
  });
});
