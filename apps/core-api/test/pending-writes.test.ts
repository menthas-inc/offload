// 012: a write nobody has agreed to yet, and the round trip that broke it.
//
// AC-5/AC-9. These cover the two things a review found unexercised: that a
// pending payload survives jsonb, and that a turn which wrote to a calendar can
// find its own rows again to undo them.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reviveWrite } from "../src/connectors/tool-calls.js";
import { sourceRefFor } from "../src/connectors/events.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});
afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("connector_pending_writes").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("accounts").execute();
});

const STARTS = new Date("2026-10-06T09:00:00.000Z");
const ENDS = new Date("2026-10-06T10:00:00.000Z");

describe("AC-5 a proposal survives the database", () => {
  it("comes back with real dates on it", async () => {
    // **The bug this exists for.** A WriteAction carries Date objects, jsonb has
    // no such type, and reading the row back and casting it gave strings where
    // the write path calls .toISOString(). Every confirmed create, and every
    // edit that moved a time, threw at the moment somebody tapped confirm.
    const row = await db
      .insertInto("connector_pending_writes")
      .values({
        account_id: await account(),
        calendar_id: await calendar(),
        action: "create",
        scope: null,
        payload: JSON.stringify({
          action: "create",
          draft: { title: "Dinner with Ana", startsAt: STARTS, endsAt: ENDS, attendees: ["ana@example.com"] },
        }),
        expires_at: new Date(Date.now() + 3600_000),
      })
      .returning("payload")
      .executeTakeFirstOrThrow();

    const revived = reviveWrite(row.payload);
    expect(revived?.action).toBe("create");
    if (revived?.action !== "create") throw new Error("wrong action");
    expect(revived.draft.startsAt).toBeInstanceOf(Date);
    expect(revived.draft.startsAt.toISOString()).toBe(STARTS.toISOString());
    expect(revived.draft.endsAt.toISOString()).toBe(ENDS.toISOString());
    expect(revived.draft.attendees).toEqual(["ana@example.com"]);
  });

  it("revives an edit's times and keeps its scope", async () => {
    const revived = reviveWrite({
      action: "edit",
      sourceRef: "cal-1:evt1",
      scope: "following",
      patch: { title: "Standup", startsAt: STARTS.toISOString() },
    });
    if (revived?.action !== "edit") throw new Error("wrong action");
    expect(revived.scope).toBe("following");
    expect(revived.patch.startsAt).toBeInstanceOf(Date);
  });

  it("refuses a payload that is not one of ours", () => {
    // Checked rather than cast, which is what the old code did and what was
    // wrong about a type the database cannot store.
    expect(reviveWrite(null)).toBeNull();
    expect(reviveWrite("create")).toBeNull();
    expect(reviveWrite({ action: "create", draft: {} })).toBeNull();
    expect(reviveWrite({ action: "create", draft: { startsAt: "not a date", endsAt: "x" } })).toBeNull();
    expect(reviveWrite({ action: "edit" })).toBeNull();
    expect(reviveWrite({ action: "burn_it_down" })).toBeNull();
  });

  it("defaults an unknown scope to one occurrence", () => {
    // The smaller blast radius is the safe default everywhere else in this
    // feature, and a corrupt value must not silently mean "and all following".
    const revived = reviveWrite({ action: "delete", sourceRef: "cal-1:evt1", scope: "everything" });
    if (revived?.action !== "delete") throw new Error("wrong action");
    expect(revived.scope).toBe("one");
  });
});

describe("AC-17 a turn can find what it put on a calendar", () => {
  it("matches its rows by the calendar's own prefix", async () => {
    // `undoTurn` excludes source=calendar from its bulk soft delete and hands
    // those rows to the Google-first path, which finds them by source_ref.
    // Without a row that matches this shape, that path silently does nothing,
    // which is what it did before: `undoWrite` had no callers at all.
    const accountId = await account();
    const calendarId = await calendar(accountId, "cal-home");
    void calendarId;

    const threadId = await thread(accountId);
    const messageId = await message(accountId);
    const ref = sourceRefFor("cal-home", "evt-1");

    await db
      .insertInto("content")
      .values({
        account_id: accountId,
        thread_id: threadId,
        derived_from_message_id: messageId,
        type: "event",
        title: "Dinner with Ana",
        source: "calendar",
        source_ref: ref,
      })
      .execute();

    const found = await db
      .selectFrom("content")
      .innerJoin("messages", "messages.id", "content.derived_from_message_id")
      .select(["content.source_ref as sourceRef"])
      .where("content.account_id", "=", accountId)
      .where("content.source", "=", "calendar")
      .where("content.deleted_at", "is", null)
      .execute();

    expect(found).toHaveLength(1);
    expect(found[0]?.sourceRef).toBe(ref);
    expect(found[0]?.sourceRef?.split(":")[0]).toBe("cal-home");
  });
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function calendar(accountId?: string, externalId = `cal-${uuidv7()}`): Promise<string> {
  const owner = accountId ?? (await account());
  const connection = await db
    .insertInto("connector_connections")
    .values({ account_id: owner, provider: "google", external_account_email: `${uuidv7()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();
  const row = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connection.id,
      external_id: externalId,
      summary: "Home",
      access_role: "owner",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ name: "Home" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("thread_members")
    .values({ thread_id: row.id, account_id: accountId, state: "accepted" })
    .execute();
  return row.id;
}

async function message(accountId: string): Promise<string> {
  const conversation = await db
    .insertInto("conversations")
    .values({ account_id: accountId })
    .returning("id")
    .executeTakeFirstOrThrow();
  const row = await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id,
      account_id: accountId,
      role: "person",
      type: "text",
      text: "dinner with ana thursday",
      turn_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}
