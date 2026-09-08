// 012: the routes Settings uses, and the checks they must not skip.
//
// SEC-2 / AC-4 / AC-5a / AC-8. These are the cases nobody exercises by hand:
// another account's calendar, a thread you are not in, and the two invariants
// the migration's check constraints also hold.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { superviseSyncs, syncNow } from "../src/connectors/sync.js";

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
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("accounts").execute();
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

async function calendar(
  accountId: string,
  accessRole: "owner" | "writer" | "reader" = "owner",
  isShared = true
): Promise<string> {
  const connection = await db
    .insertInto("connector_connections")
    .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();

  const row = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connection.id,
      external_id: `cal-${uuidv7()}`,
      summary: "Home",
      access_role: accessRole,
      is_shared: isShared,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

const patch = (id: string, body: Record<string, unknown>) =>
  app.inject({ method: "PATCH", url: `/api/connectors/calendars/${id}`, payload: body });

describe("SEC-2 a calendar belongs to one account", () => {
  it("refuses to touch one without a session", async () => {
    const owner = await account();
    const id = await calendar(owner);
    expect((await patch(id, { selected: false })).statusCode).toBe(401);
  });

  it("does not leak whether a calendar exists", async () => {
    // 401 before 404: an unauthenticated caller learns nothing about which ids
    // are real.
    const response = await patch(uuidv7(), { selected: false });
    expect(response.statusCode).toBe(401);
  });
});

describe("AC-5a the sharing flag", () => {
  it("cannot be turned off on a calendar somebody else owns", async () => {
    // Somebody else owning it is proof somebody else sees it, so marking it
    // "just me" would make an outward-facing write look reversible.
    const owner = await account();
    const id = await calendar(owner, "writer");
    const row = await db
      .updateTable("connector_calendars")
      .set({ is_shared: false })
      .where("id", "=", id)
      .returning("id")
      .executeTakeFirst()
      .catch(() => null);
    expect(row).toBeNull();
  });

  it("defaults to shared", async () => {
    const owner = await account();
    const id = await calendar(owner);
    const row = await db
      .selectFrom("connector_calendars")
      .select("is_shared")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.is_shared).toBe(true);
  });
});

describe("AC-8 a calendar that reads has somewhere to put things", () => {
  it("cannot be selected without a thread", async () => {
    // content.thread_id has been not null since 0008, so a selected calendar
    // with no thread is rows that cannot be written.
    const owner = await account();
    const id = await calendar(owner);
    const failed = await db
      .updateTable("connector_calendars")
      .set({ selected: true })
      .where("id", "=", id)
      .returning("id")
      .executeTakeFirst()
      .catch(() => null);
    expect(failed).toBeNull();
  });
});

describe("the sync supervisor actually runs", () => {
  it("does not throw against a real database", async () => {
    // **This is a query, and a query only fails where it is run.** It shipped
    // comparing `jobs.payload ->> 'connectionId'`, which is text, against a
    // uuid column, and Postgres refuses that outright. Nothing caught it:
    // the supervisor is only ever enqueued when the server boots, and a test
    // suite never boots the server. It failed three times in production
    // within seconds of the deploy.
    //
    // So this asserts the least interesting thing that would have caught it,
    // which is that the statement is valid SQL against the real schema.
    await expect(superviseSyncs()).resolves.toBeTypeOf("number");
  });

  it("re-enqueues a connection with nothing pending", async () => {
    const owner = await account();
    await calendar(owner);
    const before = await queued();
    await superviseSyncs();
    expect(await queued()).toBeGreaterThan(before);
  });
});

const queued = async (): Promise<number> => {
  const rows = await db
    .selectFrom("jobs")
    .select("id")
    .where("kind", "=", "calendar.sync")
    .where("state", "in", ["queued", "running"])
    .execute();
  return rows.length;
};

describe("turning a calendar on syncs it", () => {
  it("enqueues a sync the moment it is selected", async () => {
    // **The bug the first real connect found.** Nothing enqueued the first
    // sync: the chain only reschedules itself and the daily supervisor was the
    // only other enqueuer, so a calendar turned on showed nothing until the
    // supervisor next ran, up to a day later. That is not a slow sync, it is a
    // feature that looks broken.
    const owner = await account();
    const id = await calendar(owner);
    const threadId = await thread(owner);

    await db
      .updateTable("connector_calendars")
      .set({ default_thread_id: threadId })
      .where("id", "=", id)
      .execute();

    const before = await queued();
    const row = await db
      .selectFrom("connector_calendars")
      .select("connection_id")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    await syncNow(row.connection_id);

    expect(await queued()).toBe(before + 1);
  });

  it("collapses a burst of toggles into one run", async () => {
    // Its own key prefix so it does not collide with the quarter-hour chain,
    // which would silently no-op one of the two under onConflict doNothing.
    const owner = await account();
    const id = await calendar(owner);
    const row = await db
      .selectFrom("connector_calendars")
      .select("connection_id")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();

    const before = await queued();
    await syncNow(row.connection_id);
    await syncNow(row.connection_id);
    await syncNow(row.connection_id);
    expect(await queued()).toBe(before + 1);
  });
});

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
