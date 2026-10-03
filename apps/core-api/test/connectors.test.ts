// 012 and 019: the routes Settings uses, and the checks they must not skip.
//
// SEC-2 / AC-4 / 019 AC-2, AC-3, AC-6. These are the cases nobody exercises by
// hand: another account's calendar, an old client's field, an un-tick that has
// to reach every thread, and a disconnect that has to leave nothing behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { superviseSyncs, scheduleFullSyncs, scheduleNextSync, syncNow } from "../src/connectors/sync.js";
import { worksInBackground } from "../src/accounts/active.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { grantsAcl } from "../src/connectors/google.js";

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
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("accounts").execute();
});

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function account(name = "Jo Alves"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      display_name: name,
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function connection(accountId: string, scope: string | null = null, withSecret = true): Promise<string> {
  const row = await db
    .insertInto("connector_connections")
    .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();
  // A stand-in, not a sealed value: nothing here opens it. Disconnect does,
  // so its test makes a connection with no secret row.
  if (!withSecret) return row.id;
  await db
    .insertInto("connector_secrets")
    .values({
      connection_id: row.id,
      access_token: Buffer.from("x"),
      refresh_token: null,
      access_expires_at: null,
      scope,
      wrapped_by: "test",
    })
    .execute();
  return row.id;
}

async function calendar(
  connectionId: string,
  over: { accessRole?: "owner" | "writer" | "reader"; selected?: boolean; primary?: boolean; summary?: string } = {}
): Promise<string> {
  const row = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connectionId,
      external_id: `cal-${uuidv7()}`,
      summary: over.summary ?? "Home",
      access_role: over.accessRole ?? "owner",
      is_primary: over.primary ?? false,
      selected: over.selected ?? false,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ name: "Home", created_by_account_id: accountId })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("thread_members")
    .values({ thread_id: row.id, account_id: accountId, state: "accepted" })
    .execute();
  return row.id;
}

const patch = (id: string, body: Record<string, unknown>, cookie?: string) =>
  app.inject({
    method: "PATCH",
    url: `/api/connectors/calendars/${id}`,
    payload: body,
    ...(cookie ? { headers: { cookie } } : {}),
  });

describe("SEC-2 a calendar belongs to one account", () => {
  it("refuses to touch one without a session", async () => {
    const owner = await account();
    const id = await calendar(await connection(owner));
    expect((await patch(id, { selected: false })).statusCode).toBe(401);
  });

  it("does not leak whether a calendar exists", async () => {
    // 401 before 404: an unauthenticated caller learns nothing about which ids
    // are real.
    const response = await patch(uuidv7(), { selected: false });
    expect(response.statusCode).toBe(401);
  });

  it("is 404 on another account's calendar", async () => {
    const owner = await account();
    const other = await account("Tom Reilly");
    const id = await calendar(await connection(owner));
    expect((await patch(id, { selected: true }, await signIn(other))).statusCode).toBe(404);
  });
});

describe("019 AC-3 approving and taking it back", () => {
  it("enqueues a sync the moment it is ticked", async () => {
    const owner = await account();
    const id = await calendar(await connection(owner));
    const before = await queued();
    expect((await patch(id, { selected: true }, await signIn(owner))).statusCode).toBe(200);
    expect(await queued()).toBe(before + 1);
  });

  it("un-ticking removes the pick from every thread and drops the copy, in one write", async () => {
    // Re-ticking later restores none of it: a pick that survived an un-tick
    // would re-widen every thread that had it, silently.
    const owner = await account();
    const other = await account("Tom Reilly");
    const n = await connection(owner);
    const id = await calendar(n, { selected: true });
    const mine = await thread(owner);
    const shared = await thread(other);
    await db.insertInto("thread_members").values({ thread_id: shared, account_id: owner, state: "accepted" }).execute();
    await db
      .insertInto("thread_calendars")
      .values([
        { thread_id: mine, calendar_id: id, account_id: owner },
        { thread_id: shared, calendar_id: id, account_id: owner },
      ])
      .execute();
    await db
      .insertInto("connector_events")
      .values({ account_id: owner, calendar_id: id, source_ref: "cal:evt", title: "Dentist", occurs_at: new Date() })
      .execute();

    expect((await patch(id, { selected: false }, await signIn(owner))).statusCode).toBe(200);
    expect(await db.selectFrom("thread_calendars").select("thread_id").where("calendar_id", "=", id).execute()).toEqual([]);
    expect(await db.selectFrom("connector_events").select("id").where("calendar_id", "=", id).execute()).toEqual([]);

    expect((await patch(id, { selected: true }, await signIn(owner))).statusCode).toBe(200);
    expect(await db.selectFrom("thread_calendars").select("thread_id").where("calendar_id", "=", id).execute()).toEqual([]);
  });

  it("ignores the fields an older client still sends", async () => {
    // `threadId` and `isShared` stopped meaning anything. Stripped, not refused.
    const owner = await account();
    const id = await calendar(await connection(owner));
    const response = await patch(id, { selected: true, threadId: uuidv7(), isShared: false }, await signIn(owner));
    expect(response.statusCode).toBe(200);
  });
});

describe("019 AC-2 what Settings reads", () => {
  it("names the primary calendar by the person, carries no participant count, and says which grant lacks the scope", async () => {
    const owner = await account("Jo Alves");
    const n = await connection(owner, "https://www.googleapis.com/auth/calendar.events");
    await calendar(n, { primary: true, summary: `${uuidv7()}@g.com`, selected: true });
    await calendar(n, { accessRole: "reader", summary: "Holidays" });
    await db.updateTable("connector_calendars").set({ participants: 3 }).where("connection_id", "=", n).execute();

    const response = await app.inject({
      method: "GET",
      url: "/api/connectors/calendars",
      headers: { cookie: await signIn(owner) },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      askFirst: boolean;
      connections: Array<{ needsScope: boolean; calendars: Array<Record<string, unknown>> }>;
    };
    expect(body.askFirst).toBe(false);
    expect(body.connections[0]!.needsScope).toBe(true);
    const [primary, holidays] = body.connections[0]!.calendars;
    expect(primary!["name"]).toBe("Jo Alves");
    expect(primary!["primary"]).toBe(true);
    expect(holidays!["name"]).toBe("Holidays");
    expect(holidays!["sharedWithYou"]).toBe(true);
    expect(holidays!["writable"]).toBe(false);
    expect(JSON.stringify(body)).not.toContain("participants");
  });

  it("reads the scope off the stored grant, not the connection's age", () => {
    expect(grantsAcl("https://www.googleapis.com/auth/calendar.events")).toBe(false);
    expect(
      grantsAcl("https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.acls.readonly")
    ).toBe(true);
    expect(grantsAcl(null)).toBe(false);
  });
});

describe("019 AC-5 the ask-first switch", () => {
  it("is the account's, read and set through /api/me", async () => {
    const owner = await account();
    const cookie = await signIn(owner);
    const before = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect((before.json() as { calendarAskFirst: boolean }).calendarAskFirst).toBe(false);
    const set = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { calendarAskFirst: true },
    });
    expect(set.statusCode).toBe(200);
    const after = await db.selectFrom("accounts").select("calendar_ask_first").where("id", "=", owner).executeTakeFirstOrThrow();
    expect(after.calendar_ask_first).toBe(true);
  });
});

describe("019 disconnect leaves nothing behind", () => {
  it("deletes the calendars, the copy and the picks", async () => {
    const owner = await account();
    const n = await connection(owner, null, false);
    const id = await calendar(n, { selected: true });
    const t = await thread(owner);
    await db.insertInto("thread_calendars").values({ thread_id: t, calendar_id: id, account_id: owner }).execute();
    await db
      .insertInto("connector_events")
      .values({ account_id: owner, calendar_id: id, source_ref: "cal:evt", title: "Dentist", occurs_at: new Date() })
      .execute();

    const response = await app.inject({
      method: "POST",
      url: `/api/connectors/${n}/disconnect`,
      headers: { cookie: await signIn(owner) },
    });
    expect(response.statusCode).toBe(200);
    expect(await db.selectFrom("connector_calendars").select("id").where("connection_id", "=", n).execute()).toEqual([]);
    expect(await db.selectFrom("connector_events").select("id").where("account_id", "=", owner).execute()).toEqual([]);
    expect(await db.selectFrom("thread_calendars").select("thread_id").where("account_id", "=", owner).execute()).toEqual([]);
    const gone = await db.selectFrom("connector_connections").select("deleted_at").where("id", "=", n).executeTakeFirstOrThrow();
    expect(gone.deleted_at).not.toBeNull();
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
    await expect(superviseSyncs()).resolves.toBeTypeOf("number");
  });

  it("re-enqueues a connection with nothing pending", async () => {
    const owner = await account();
    await calendar(await connection(owner));
    const before = await queued();
    await superviseSyncs();
    expect(await queued()).toBeGreaterThan(before);
  });

  it("schedules one full pass per active connection, once a day", async () => {
    // 019. 012 specified the nightly pass and never enqueued it.
    const owner = await account();
    await connection(owner);
    await connection(owner);
    const before = await queued();
    expect(await scheduleFullSyncs()).toBe(2);
    expect(await queued()).toBe(before + 2);
    await scheduleFullSyncs();
    expect(await queued()).toBe(before + 2);
  });
});

// 034 AC-12. One rule for every scheduled job: an account that is disabled or
// marked for deletion gets no work in the background.
describe("a disabled account's calendar is left alone", () => {
  const off = async (owner: string, patch: Record<string, unknown>) =>
    db.updateTable("accounts").set(patch as never).where("id", "=", owner).execute();

  it("says whether an account gets scheduled work", async () => {
    const owner = await account();
    expect(await worksInBackground(owner)).toBe(true);
    await off(owner, { state: "disabled" });
    expect(await worksInBackground(owner)).toBe(false);
    await off(owner, { state: "active", deleted_at: new Date() });
    expect(await worksInBackground(owner)).toBe(false);
    await off(owner, { deleted_at: null, delete_after: new Date(Date.now() + 86_400_000) });
    expect(await worksInBackground(owner)).toBe(false);
    await off(owner, { delete_after: null });
    expect(await worksInBackground(owner)).toBe(true);
    expect(await worksInBackground(uuidv7())).toBe(false);
  });

  for (const [name, patch] of [
    ["disabled", { state: "disabled" }],
    ["marked for deletion", { delete_after: new Date(Date.now() + 86_400_000) }],
  ] as const) {
    it(`books no sync, no full pass and no next tick while ${name}`, async () => {
      const owner = await account();
      const n = await connection(owner);
      await calendar(n);
      await off(owner, patch);

      expect(await superviseSyncs()).toBe(0);
      expect(await scheduleFullSyncs()).toBe(0);
      await scheduleNextSync(n);
      expect(await queued()).toBe(0);

      // A tick that was already queued when they were disabled does nothing
      // and books no successor, so the chain stops with it.
      await handlers["calendar.sync"]!({ connectionId: n }, { mailer: new MemoryMailer() }, null);
      expect(await queued()).toBe(0);
    });
  }

  it("picks the chain up again once they are enabled", async () => {
    const owner = await account();
    const n = await connection(owner);
    await calendar(n);
    await off(owner, { state: "disabled" });
    await superviseSyncs();
    await off(owner, { state: "active" });
    expect(await superviseSyncs()).toBe(1);
    expect(await queued()).toBe(1);
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
  it("collapses a burst of toggles into one run", async () => {
    // Its own key prefix so it does not collide with the quarter-hour chain,
    // which would silently no-op one of the two under onConflict doNothing.
    const owner = await account();
    const n = await connection(owner);
    const before = await queued();
    await syncNow(n);
    await syncNow(n);
    await syncNow(n);
    expect(await queued()).toBe(before + 1);
  });
});
