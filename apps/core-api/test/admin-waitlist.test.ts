// 034 AC-9 and AC-10. The waitlist's three additions: invite by address, the
// stats row, and the weekly batch read from Limits.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { promote } from "../src/admin/promote.js";
import { clearSettingsCache } from "../src/settings.js";
import { activeAccount, auditEntries, staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipeAdmin);

/** The invite emails queued for anybody but the staff member, whose own
 *  promotion in the kit queued one too. */
const inviteJobs = (staffId: string) =>
  db.selectFrom("jobs").select(["account_id"]).where("kind", "=", "email.invited").where("account_id", "<>", staffId).execute();

describe("AC-9 invite by address", () => {
  const invite = (cookie: string, email: unknown) =>
    app.inject({ method: "POST", url: "/v1/admin/waitlist/invite-address", headers: { cookie }, payload: { email } });

  it("lets in an address that was waiting, with one invite email", async () => {
    const staff = await staffMember("support");
    const row = await db.insertInto("accounts").values({ email: "w1@example.test", state: "waitlist" }).returning("id").executeTakeFirstOrThrow();

    const res = await invite(staff.cookie, "  W1@Example.test ");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accountId: row.id, status: "invited" });
    expect(await inviteJobs(staff.id)).toEqual([{ account_id: row.id }]);
    expect(await auditEntries()).toMatchObject([{ kind: "invited", staff_account_id: staff.id, target_account_id: row.id }]);
  });

  it("lets in an address never seen, with one invite email", async () => {
    const staff = await staffMember("support");
    const res = await invite(staff.cookie, "new@example.test");
    expect(res.json().status).toBe("invited");
    const account = await db.selectFrom("accounts").select(["id", "state"]).where("email", "=", "new@example.test").executeTakeFirstOrThrow();
    expect(account.state).toBe("invited");
    expect(await inviteJobs(staff.id)).toEqual([{ account_id: account.id }]);
    expect(await auditEntries()).toHaveLength(1);
  });

  it("answers already in for an active address, and sends and records nothing", async () => {
    const staff = await staffMember("support");
    const id = await activeAccount("in@example.test");
    await db.deleteFrom("jobs").execute();
    const res = await invite(staff.cookie, "in@example.test");
    expect(res.json()).toEqual({ accountId: id, status: "already-in" });
    expect(await inviteJobs(staff.id)).toEqual([]);
    expect(await auditEntries()).toEqual([]);
  });

  it("refuses a malformed address before anything is written", async () => {
    const staff = await staffMember("support");
    const before = (await db.selectFrom("accounts").select("id").execute()).length;
    for (const bad of ["", "not an address", "a@b", "two@example.test, three@example.test", "x".repeat(400) + "@example.test", 7]) {
      expect((await invite(staff.cookie, bad)).statusCode, String(bad)).toBe(400);
    }
    expect((await db.selectFrom("accounts").select("id").execute()).length).toBe(before);
    expect(await auditEntries()).toEqual([]);
  });
});

describe("AC-10 the stats row and the batch", () => {
  it("matches the accounts table", async () => {
    const staff = await staffMember("support");
    await db
      .insertInto("accounts")
      .values([
        { email: "w1@example.test", state: "waitlist", created_at: new Date("2026-06-03T10:00:00Z") },
        { email: "w2@example.test", state: "waitlist" },
        { email: "gone@example.test", state: "waitlist", deleted_at: new Date() },
      ])
      .execute();
    await promote("i1@example.test");
    await promote("i2@example.test");
    await db.updateTable("accounts").set({ invite_email_sent_at: new Date() }).where("email", "=", "i1@example.test").execute();
    await db.updateTable("accounts").set({ invite_email_sent_at: new Date(Date.now() - 9 * 86_400_000) }).where("email", "=", "i2@example.test").execute();
    await activeAccount("in@example.test");

    const res = await app.inject({ method: "GET", url: "/v1/admin/waitlist/stats", headers: { cookie: staff.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      waiting: 2,
      oldestWaiting: "2026-06-03T10:00:00.000Z",
      invitedThisWeek: 1,
      // The staff member and the one who came in.
      signedUp: 2,
      invitedNotSignedUp: 2,
      batch: 25,
    });
  });

  it("invites the next N by the Limits value, and says what N was", async () => {
    const staff = await staffMember("support");
    await db.insertInto("app_settings").values({ key: "waitlist.batch", value: "2", updated_by_account_id: null }).execute();
    clearSettingsCache();
    await db
      .insertInto("accounts")
      .values([1, 2, 3].map((n) => ({ email: `w${n}@example.test`, state: "waitlist" as const, created_at: new Date(Date.UTC(2026, 5, n)) })))
      .execute();

    const res = await app.inject({ method: "POST", url: "/v1/admin/waitlist/invite-next", headers: { cookie: staff.cookie }, payload: {} });
    expect(res.json().batchSize).toBe(2);
    expect(res.json().results).toHaveLength(2);
    const still = await db.selectFrom("accounts").select("email").where("state", "=", "waitlist").execute();
    expect(still).toEqual([{ email: "w3@example.test" }]);

    const stats = await app.inject({ method: "GET", url: "/v1/admin/waitlist/stats", headers: { cookie: staff.cookie } });
    expect(stats.json().batch).toBe(2);
  });
});
