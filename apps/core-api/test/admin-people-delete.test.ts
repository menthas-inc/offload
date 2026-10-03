// 034 section G. Delete: owner only, a 24 hour hold, and a cancel
// (AC-14, AC-17, AC-23, AC-48). What destruction does to every table is 035's
// test (`account-delete.test.ts`); this one is the hold around it.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { activeAccount, auditEntries, signIn, staffMember, wipeAdmin } from "./admin-kit.js";
import { wipeMarked } from "./admin-off1-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await wipeMarked();
  await wipeAdmin();
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await wipeMarked();
  await wipeAdmin();
});

const post = (cookie: string, url: string, payload?: Record<string, unknown>) =>
  app.inject({ method: "POST", url: `/v1/admin${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
const get = (cookie: string, url: string) => app.inject({ method: "GET", url: `/v1/admin${url}`, headers: { cookie } });

const accountOf = (id: string) =>
  db.selectFrom("accounts").select(["state", "delete_after", "delete_requested_by", "disabled_at"]).where("id", "=", id).executeTakeFirst();
const jobsOf = (kind: string) => db.selectFrom("jobs").select(["payload", "run_after", "account_id"]).where("kind", "=", kind).execute();
const run = (accountId: string) => handlers["account.delete"]!({ accountId }, { mailer: null as never }, null);

describe("marking an account for deletion (AC-14)", () => {
  it("is not there for support, for the mark or the cancel", async () => {
    const support = await staffMember("support");
    const ana = await activeAccount("ana@example.test");
    expect((await post(support.cookie, `/people/${ana}/delete`, { email: "ana@example.test" })).statusCode).toBe(404);
    expect((await post(support.cookie, `/people/${ana}/delete/cancel`)).statusCode).toBe(404);
    expect((await accountOf(ana))?.delete_after).toBeNull();
  });

  it("is refused when the address typed is not theirs, and changes nothing", async () => {
    const owner = await staffMember("owner");
    const ana = await activeAccount("ana@example.test");
    const res = await post(owner.cookie, `/people/${ana}/delete`, { email: "anna@example.test" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "refused", reason: "email" });
    expect(await accountOf(ana)).toMatchObject({ state: "active", delete_after: null });
    expect(await auditEntries()).toEqual([]);
  });

  it("locks the account, marks it a day out, books the job, tells the owners, and destroys nothing", async () => {
    const owner = await staffMember("owner");
    const ana = await activeAccount("ana@example.test");
    await signIn(ana);
    const res = await post(owner.cookie, `/people/${ana}/delete`, { email: " Ana@Example.test " });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; deleteAfter: string };
    expect(body.status).toBe("scheduled");

    const account = (await accountOf(ana))!;
    expect(account.state).toBe("disabled");
    expect(account.disabled_at).not.toBeNull();
    expect(account.delete_requested_by).toBe(owner.id);
    expect(account.delete_after!.toISOString()).toBe(body.deleteAfter);
    const hours = (account.delete_after!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    expect(await db.selectFrom("sessions").select("id").where("account_id", "=", ana).execute()).toEqual([]);

    const [job] = await jobsOf("account.delete");
    // The id and nothing else, and not the job's own account: a job that
    // names one goes with it, and this one has to outlive the row to finish.
    expect(job).toMatchObject({ payload: { accountId: ana }, account_id: null });
    expect(job!.run_after.getTime()).toBe(account.delete_after!.getTime());
    expect((await jobsOf("email.alert")).map((j) => j.payload)).toEqual([
      expect.objectContaining({ alert: "deletion.scheduled", actorAccountId: owner.id, targetAccountId: ana }),
    ]);
    expect((await auditEntries()).map((e) => [e.kind, e.staff_account_id, e.target_account_id])).toEqual([["deletion.scheduled", owner.id, ana]]);

    // Twice is once.
    expect((await post(owner.cookie, `/people/${ana}/delete`, { email: "ana@example.test" })).statusCode).toBe(200);
    expect(await auditEntries()).toHaveLength(1);
    expect(await jobsOf("account.delete")).toHaveLength(1);
  });

  it("refuses an owner deleting themselves (AC-17)", async () => {
    const owner = await staffMember("owner", "owner@example.test");
    await staffMember("owner");
    const res = await post(owner.cookie, `/people/${owner.id}/delete`, { email: "owner@example.test" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "refused", reason: "self" });
    expect((await accountOf(owner.id))?.delete_after).toBeNull();
  });

  it("says on the list and on the page when it goes, and who may cancel", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support");
    const ana = await activeAccount("ana@example.test");
    const before = (await get(owner.cookie, `/people/${ana}`)).json() as { can: Record<string, boolean>; deleteAfter: string | null };
    expect(before.can).toMatchObject({ delete: true, cancelDelete: false });
    expect(before.deleteAfter).toBeNull();
    expect(((await get(support.cookie, `/people/${ana}`)).json() as { can: Record<string, boolean> }).can).toMatchObject({ delete: false, cancelDelete: false });
    expect(((await get(owner.cookie, `/people/${owner.id}`)).json() as { can: Record<string, boolean> }).can.delete).toBe(false);

    const { deleteAfter } = (await post(owner.cookie, `/people/${ana}/delete`, { email: "ana@example.test" })).json() as { deleteAfter: string };
    const after = (await get(owner.cookie, `/people/${ana}`)).json() as { can: Record<string, boolean>; deleteAfter: string | null };
    expect(after.can).toMatchObject({ delete: false, cancelDelete: true, enable: false });
    expect(after.deleteAfter).toBe(deleteAfter);
    const row = ((await get(owner.cookie, "/people")).json() as { rows: { id: string; deleteAfter: string | null; can: Record<string, boolean> }[] }).rows.find((r) => r.id === ana)!;
    expect(row.deleteAfter).toBe(deleteAfter);
    expect(row.can).toMatchObject({ delete: false, cancelDelete: true });
  });
});

describe("cancelling (AC-14, AC-48)", () => {
  it("clears the mark, leaves the account disabled and whole, and tells the owners", async () => {
    const owner = await staffMember("owner");
    const ana = await activeAccount("ana@example.test");
    await post(owner.cookie, `/people/${ana}/delete`, { email: "ana@example.test" });
    const res = await post(owner.cookie, `/people/${ana}/delete/cancel`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "cancelled" });
    expect(await accountOf(ana)).toMatchObject({ state: "disabled", delete_after: null, delete_requested_by: null });
    expect((await auditEntries()).map((e) => e.kind)).toEqual(["deletion.scheduled", "deletion.cancelled"]);
    expect((await jobsOf("email.alert")).map((j) => (j.payload as { alert: string }).alert)).toEqual(["deletion.scheduled", "deletion.cancelled"]);

    // The job booked for the old mark finds none and leaves the account alone.
    await db.updateTable("jobs").set({ run_after: sql`now()` }).where("kind", "=", "account.delete").execute();
    await run(ana);
    expect(await accountOf(ana)).toMatchObject({ state: "disabled" });
    // And it can be enabled again, which a marked account cannot.
    expect((await post(owner.cookie, `/people/${ana}/enable`)).statusCode).toBe(200);
  });

  it("is refused for an account nobody marked", async () => {
    const owner = await staffMember("owner");
    const ana = await activeAccount("ana@example.test");
    const res = await post(owner.cookie, `/people/${ana}/delete/cancel`);
    expect(res.statusCode).toBe(409);
    expect(await auditEntries()).toEqual([]);
  });
});

describe("the day after (AC-14, AC-23)", () => {
  it("destroys nothing before the mark is due", async () => {
    const owner = await staffMember("owner");
    const ana = await activeAccount("ana@example.test");
    await post(owner.cookie, `/people/${ana}/delete`, { email: "ana@example.test" });
    await run(ana);
    expect(await accountOf(ana)).toMatchObject({ state: "disabled" });
  });

  it("destroys the account once it is, records it, and leaves a page that says when", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support");
    const ana = await activeAccount("ana@example.test");
    await post(owner.cookie, `/people/${ana}/delete`, { email: "ana@example.test" });
    await db.updateTable("accounts").set({ delete_after: sql`now() - interval '1 minute'` }).where("id", "=", ana).execute();
    await run(ana);

    expect(await accountOf(ana)).toBeUndefined();
    const entries = await auditEntries();
    expect(entries.map((e) => [e.kind, e.staff_account_id, e.target_account_id])).toEqual([
      ["deletion.scheduled", owner.id, ana],
      ["deleted", owner.id, ana],
    ]);
    // Again is nothing: the retry of a job that already did it.
    await run(ana);
    expect(await auditEntries()).toHaveLength(2);

    for (const cookie of [owner.cookie, support.cookie]) {
      const page = await get(cookie, `/people/${ana}`);
      expect(page.statusCode).toBe(410);
      const body = page.json() as { error: string; deletedAt: string };
      expect(Object.keys(body).sort()).toEqual(["deletedAt", "error"]);
      expect(body.error).toBe("deleted");
      expect(Date.now() - new Date(body.deletedAt).getTime()).toBeLessThan(60_000);
    }
    // Somebody who was never here is still only not found.
    expect((await get(owner.cookie, "/people/01a10303-0000-7000-8000-000000000000")).statusCode).toBe(404);
  });
});
