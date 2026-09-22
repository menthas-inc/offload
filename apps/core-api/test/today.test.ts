// 024 E1: Today, the agenda read. (AC-22)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { addUtcDays, dayIn } from "@offload/widgets";
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

const ZONE = "Europe/Lisbon";
const TODAY = dayIn(new Date(), ZONE);

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), display_name: "Ana", time_zone: ZONE } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(members: string[], name: string): Promise<string> {
  const row = await db.insertInto("threads").values({ name } as never).returning("id").executeTakeFirstOrThrow();
  for (const member of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: member, state: "accepted" } as never).execute();
  }
  return row.id;
}

async function dated(accountId: string, threadId: string, title: string, day: string, over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, title, type: "task", due_at: new Date(`${day}T12:00:00Z`), attrs: { all_day: true }, ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

interface Today {
  overdue: { id: string; title: string; threadName: string; dueAt: string | null; rrule: string | null }[];
  today: { id: string; title: string; threadName: string }[];
  tomorrow: { id: string; title: string; threadName: string }[];
  overdueMore: number;
  everDumped: boolean;
}

describe("024 AC-22 the three groups", () => {
  it("draws every dated row across the account's threads, reminder or not, with its thread's name, and no note", async () => {
    const me = await account();
    const flat = await thread([me], "Flat admin");
    const other = await account();
    const trip = await thread([me, other], "Lisbon trip");
    await dated(me, flat, "Pay the rent", TODAY);
    await dated(other, trip, "Ferry times", addUtcDays(TODAY, 1), { is_reminder: true });
    await dated(me, flat, "Call the clinic", addUtcDays(TODAY, -3));
    await dated(me, flat, "Ancient", addUtcDays(TODAY, -31));
    await dated(me, flat, "Later", addUtcDays(TODAY, 2));
    await dated(me, flat, "Done", TODAY, { done_at: new Date() });
    await dated(me, flat, "Gone", TODAY, { deleted_at: new Date() });
    await db.insertInto("notes").values({ subject_id: flat, scope: "thread", text: "A sentence", author_account_id: me, occurs_at: new Date(`${TODAY}T12:00:00Z`) } as never).execute().catch(() => undefined);
    const stranger = await thread([other], "Not mine");
    await dated(other, stranger, "Theirs", TODAY);

    const response = await app.inject({ method: "GET", url: "/v1/today", headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Today;
    expect(body.today.map((row) => [row.title, row.threadName])).toEqual([["Pay the rent", "Flat admin"]]);
    expect(body.tomorrow.map((row) => [row.title, row.threadName])).toEqual([["Ferry times", "Lisbon trip"]]);
    expect(body.overdue.map((row) => row.title)).toEqual(["Call the clinic"]);
    expect(body.overdueMore).toBe(0);
    expect(body.everDumped).toBe(true);
    const fresh = await account();
    expect(((await app.inject({ method: "GET", url: "/v1/today", headers: { cookie: await signIn(fresh) } })).json() as Today).everDumped).toBe(false);
    expect((await app.inject({ method: "GET", url: "/v1/today" })).statusCode).toBe(401);
  });

  it("places a repeating row once, in the first group its rule lands in, and never in Overdue", async () => {
    const me = await account();
    const flat = await thread([me], "Flat admin");
    // Every day since a week ago: lands today and tomorrow, and is not overdue.
    await dated(me, flat, "Take the pills", addUtcDays(TODAY, -7), { rrule: "FREQ=DAILY" });
    // Weekly from tomorrow: tomorrow only.
    await dated(me, flat, "Yoga", addUtcDays(TODAY, 1), { rrule: "FREQ=WEEKLY" });
    const body = (await app.inject({ method: "GET", url: "/v1/today", headers: { cookie: await signIn(me) } })).json() as Today;
    expect(body.overdue).toEqual([]);
    expect(body.today.map((row) => row.title)).toEqual(["Take the pills"]);
    expect(body.tomorrow.map((row) => row.title)).toEqual(["Yoga"]);
  });

  it("caps Overdue at a hundred, newest first, and says how many more there are", async () => {
    const me = await account();
    const flat = await thread([me], "Flat admin");
    for (let i = 1; i <= 105; i += 1) await dated(me, flat, `Late ${i}`, addUtcDays(TODAY, -(1 + (i % 29))));
    const body = (await app.inject({ method: "GET", url: "/v1/today", headers: { cookie: await signIn(me) } })).json() as Today;
    expect(body.overdue).toHaveLength(100);
    expect(body.overdueMore).toBe(5);
    const days = body.overdue.map((row) => row.dueAt ?? "");
    expect([...days].sort().reverse()).toEqual(days);
  });
});
