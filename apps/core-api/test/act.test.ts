// 024 C5: the two verbs a one-task digest carries. (AC-6)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

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
  await db.deleteFrom("accounts").execute();
  await db.deleteFrom("threads").execute();
});

async function account(zone: string | null = "Europe/Lisbon"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), display_name: "Ana", time_zone: zone } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string): Promise<string> {
  const row = await db.insertInto("threads").values({ name: "Flat admin" } as never).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" } as never).execute();
  return row.id;
}

async function task(accountId: string, threadId: string, over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, title: "Pay the rent", type: "task", due_at: new Date("2026-09-25T12:00:00Z"), attrs: { all_day: true }, ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

function act(cookie: string | null, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/v1/notifications/act",
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    payload,
  });
}

describe("024 AC-6 Done and Tomorrow", () => {
  it("Done ticks the row and writes its own Activity row, quiet", async () => {
    const me = await account();
    const id = await task(me, await thread(me));
    const response = await act(await signIn(me), { action: "done", contentId: id });
    expect(response.statusCode).toBe(200);
    expect((await db.selectFrom("content").select("done_at").where("id", "=", id).executeTakeFirstOrThrow()).done_at).not.toBeNull();
    const rows = await db.selectFrom("activity").select(["kind", "title", "body", "sent", "content_id"]).where("account_id", "=", me).execute();
    expect(rows).toEqual([{ kind: "acted", title: "Pay the rent ticked from the notification", body: null, sent: true, content_id: id }]);
  });

  it("Tomorrow moves a day by one and a timed row by one day at the same wall time in the account's zone", async () => {
    const me = await account("Europe/Lisbon");
    const th = await thread(me);
    const day = await task(me, th);
    const timed = await task(me, th, { title: "Dentist", type: "event", occurs_at: new Date("2026-10-24T08:30:00Z"), due_at: null, attrs: { all_day: false } });
    const cookie = await signIn(me);
    expect((await act(cookie, { action: "tomorrow", contentId: day })).statusCode).toBe(200);
    expect((await db.selectFrom("content").select("due_at").where("id", "=", day).executeTakeFirstOrThrow()).due_at?.toISOString()).toBe("2026-09-26T12:00:00.000Z");
    // Across Lisbon's clock change on 25 October: 9:30 on the 24th is 08:30Z,
    // and 9:30 on the 25th, once the clocks have gone back, is 09:30Z.
    expect((await act(cookie, { action: "tomorrow", contentId: timed })).statusCode).toBe(200);
    expect((await db.selectFrom("content").select("occurs_at").where("id", "=", timed).executeTakeFirstOrThrow()).occurs_at?.toISOString()).toBe("2026-10-25T09:30:00.000Z");
    expect((await db.selectFrom("activity").select("title").where("account_id", "=", me).execute()).map((row) => row.title).sort()).toEqual([
      "Dentist moved to tomorrow from the notification",
      "Pay the rent moved to tomorrow from the notification",
    ]);
  });

  it("Tomorrow moves an event's end with its start, so the span is never turned round", async () => {
    const me = await account("Europe/Lisbon");
    const th = await thread(me);
    const span = await task(me, th, {
      title: "Drinks",
      type: "event",
      occurs_at: new Date("2026-09-25T17:00:00Z"),
      occurs_end_at: new Date("2026-09-25T19:00:00Z"),
      due_at: null,
      attrs: { all_day: false },
    });
    const response = await act(await signIn(me), { action: "tomorrow", contentId: span });
    expect(response.statusCode).toBe(200);
    const row = await db.selectFrom("content").select(["occurs_at", "occurs_end_at"]).where("id", "=", span).executeTakeFirstOrThrow();
    expect(row.occurs_at?.toISOString()).toBe("2026-09-26T17:00:00.000Z");
    expect(row.occurs_end_at?.toISOString()).toBe("2026-09-26T19:00:00.000Z");
  });

  it("refuses Tomorrow on a row that is on a calendar, and answers 404 outside the membership, 401 without a session", async () => {
    const me = await account();
    const th = await thread(me);
    const onCalendar = await task(me, th, { source_ref: { provider: "google", eventId: "e1" }, type: "event", occurs_at: new Date("2026-09-25T08:00:00Z"), due_at: null });
    const cookie = await signIn(me);
    expect((await act(cookie, { action: "tomorrow", contentId: onCalendar })).statusCode).toBe(409);
    const stranger = await account();
    expect((await act(await signIn(stranger), { action: "done", contentId: onCalendar })).statusCode).toBe(404);
    expect((await act(null, { action: "done", contentId: onCalendar })).statusCode).toBe(401);
    expect((await db.selectFrom("activity").selectAll().execute())).toEqual([]);
  });
});
