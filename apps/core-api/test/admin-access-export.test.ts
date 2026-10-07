// Going-public 17c. Who has access, and what they did, as files an auditor
// can keep: the staff list and the audit log for a period, each a CSV. Owner
// only, like the two pages they come from, and each download is itself an
// audit entry. Nothing in either file that the panel does not already show.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { activeAccount, signIn, staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await wipeAdmin();
  await app.close();
  await closeDb();
});
beforeEach(wipeAdmin);

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const staffCsv = (cookie: string) => app.inject({ method: "POST", url: "/v1/admin/staff/export", headers: { cookie } });
const auditCsv = (cookie: string, period: { from?: string; to?: string } = {}) =>
  app.inject({ method: "POST", url: "/v1/admin/audit/export", headers: { cookie }, payload: period });

const lines = (payload: string) => payload.trimEnd().split("\r\n");

const STAFF_HEAD = "account_id,name,email,role,state,added_at,added_by_id,added_by_email,last_panel_opened_at,last_here_at";
const AUDIT_HEAD = "id,at,kind,staff_id,staff_name,staff_email,target_id,target_name,target_email,target_deleted,setting_key,old,new,job_id";

/** One entry, straight into the table, `ago` back from now. */
async function entry(seed: { staff: string; kind: string; target?: string | null; key?: string | null; old?: unknown; new?: unknown; ago?: string }): Promise<string> {
  const row = await sql<{ id: string }>`
    insert into staff_audit (staff_account_id, kind, target_account_id, setting_key, old_value, new_value, at)
    values (${seed.staff}, ${seed.kind}, ${seed.target ?? null}, ${seed.key ?? null},
            ${seed.old === undefined ? null : JSON.stringify(seed.old)}::jsonb,
            ${seed.new === undefined ? null : JSON.stringify(seed.new)}::jsonb,
            now() - ${seed.ago ?? "0 seconds"}::interval)
    returning id`.execute(db);
  await new Promise((resolve) => setTimeout(resolve, 2));
  return row.rows[0]!.id;
}

describe("who may download", () => {
  it("answers support as it answers on the pages: not found", async () => {
    const support = await staffMember("support");
    expect((await staffCsv(support.cookie)).statusCode).toBe(404);
    expect((await auditCsv(support.cookie)).statusCode).toBe(404);
  });

  it("answers somebody who is not staff not found", async () => {
    const cookie = await signIn(await activeAccount());
    expect((await staffCsv(cookie)).statusCode).toBe(404);
    expect((await auditCsv(cookie)).statusCode).toBe(404);
  });

  it("gives an owner both files", async () => {
    const owner = await staffMember("owner");
    for (const response of [await staffCsv(owner.cookie), await auditCsv(owner.cookie)]) {
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    }
  });
});

describe("who has access", () => {
  it("lists every staff member with their role, state, who added them and when they were last here", async () => {
    const owner = await staffMember("owner", "boss@example.test");
    await db.updateTable("accounts").set({ display_name: "Ada Boss" }).where("id", "=", owner.id).execute();

    // Sam was added through the panel, which records it in the same
    // transaction as the row: the same moment.
    const sam = await activeAccount("sam@example.test");
    await db.updateTable("accounts").set({ display_name: "=Sam, Okoro" }).where("id", "=", sam).execute();
    await db.transaction().execute(async (tx) => {
      await tx.insertInto("staff").values({ account_id: sam, role: "support" }).execute();
      await sql`insert into staff_audit (staff_account_id, kind, target_account_id, new_value) values (${owner.id}, 'staff.added', ${sam}, '"support"'::jsonb)`.execute(tx);
    });
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", sam).execute();
    await entry({ staff: sam, kind: "panel.opened", ago: "3 days" });

    const response = await staffCsv(owner.cookie);
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="offload-staff-${today()}.csv"`);
    const [head, ...rows] = lines(response.payload);
    expect(head).toBe(STAFF_HEAD);
    expect(rows).toHaveLength(2);

    const staff = await db.selectFrom("staff").select(["account_id", "created_at"]).execute();
    const added = (id: string) => staff.find((row) => row.account_id === id)!.created_at.toISOString();
    const opened = await db.selectFrom("staff_audit").select(["staff_account_id", "at", "kind"]).execute();
    const at = (id: string, kind: string) => opened.find((row) => row.staff_account_id === id && row.kind === kind)!.at.toISOString();

    // The owner was made by the seed, so nobody is recorded as adding them.
    // Their export is their newest entry, and the panel was never opened by
    // them in this test.
    const ownerExport = at(owner.id, "staff.exported");
    expect(rows[0]).toBe(`${owner.id},Ada Boss,boss@example.test,owner,active,${added(owner.id)},,,,${ownerExport}`);
    // A name that starts like a formula is made text, and a comma is quoted.
    expect(rows[1]).toBe(
      `${sam},"'=Sam, Okoro",sam@example.test,support,disabled,${added(sam)},${owner.id},boss@example.test,${at(sam, "panel.opened")},${at(sam, "panel.opened")}`
    );
  });

  it("does not credit an addition from an earlier time on staff to the one in force", async () => {
    const owner = await staffMember("owner");
    const sam = await activeAccount("sam@example.test");
    await entry({ staff: owner.id, kind: "staff.added", target: sam, new: "support", ago: "40 days" });
    await entry({ staff: owner.id, kind: "staff.removed", target: sam, old: "support", ago: "30 days" });
    await db.insertInto("staff").values({ account_id: sam, role: "owner" }).execute();

    const row = lines((await staffCsv(owner.cookie)).payload).find((line) => line.startsWith(sam))!;
    expect(row.split(",").slice(6, 8)).toEqual(["", ""]);
  });

  it("holds the same people the Staff page lists, and leaves a deleted account out as the page does", async () => {
    const owner = await staffMember("owner");
    const gone = await staffMember("support");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", gone.id).execute();
    await staffMember("support");

    const page = (await app.inject({ method: "GET", url: "/v1/admin/staff", headers: { cookie: owner.cookie } })).json() as { staff: Array<{ id: string }> };
    const ids = lines((await staffCsv(owner.cookie)).payload)
      .slice(1)
      .map((line) => line.split(",")[0]);
    expect(ids).toEqual(page.staff.map((member) => member.id));
    expect(ids).not.toContain(gone.id);
  });

  it("is recorded as staff.exported by whoever downloaded it", async () => {
    const owner = await staffMember("owner");
    await staffCsv(owner.cookie);
    const rows = await db.selectFrom("staff_audit").select(["kind", "staff_account_id", "target_account_id", "new_value"]).execute();
    expect(rows).toEqual([{ kind: "staff.exported", staff_account_id: owner.id, target_account_id: null, new_value: null }]);
  });
});

describe("the audit log", () => {
  it("has a column for everything the Audit page shows of an entry, and the same values the page reads", async () => {
    const owner = await staffMember("owner", "boss@example.test");
    await db.updateTable("accounts").set({ display_name: "Ada Boss" }).where("id", "=", owner.id).execute();
    const person = await activeAccount("jo@example.test");
    await db.updateTable("accounts").set({ display_name: "Jo Alves" }).where("id", "=", person).execute();
    const deleted = await activeAccount("gone@example.test");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", deleted).execute();

    const disabled = await entry({ staff: owner.id, kind: "disabled", target: person });
    const setting = await entry({ staff: owner.id, kind: "setting.changed", key: "cap.turns", old: 100, new: 50 });
    const role = await entry({ staff: owner.id, kind: "staff.role_changed", target: deleted, old: "support", new: "owner" });

    const response = await auditCsv(owner.cookie);
    const [head, ...rows] = lines(response.payload);
    expect(head).toBe(AUDIT_HEAD);

    const page = (await app.inject({ method: "GET", url: "/v1/admin/audit", headers: { cookie: owner.cookie } })).json() as { rows: Array<{ id: string; at: string }> };
    const at = (id: string) => page.rows.find((row) => row.id === id)!.at;

    // Newest first, as the page lists them: the export's own entry, then the three.
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatch(new RegExp(`^[0-9a-f-]{36},[^,]+,audit\\.exported,${owner.id},Ada Boss,boss@example\\.test,,,,,,,${daysAgo(90)}/${today()},$`));
    expect(rows[1]).toBe(`${role},${at(role)},staff.role_changed,${owner.id},Ada Boss,boss@example.test,${deleted},,,true,,support,owner,`);
    expect(rows[2]).toBe(`${setting},${at(setting)},setting.changed,${owner.id},Ada Boss,boss@example.test,,,,,cap.turns,100,50,`);
    expect(rows[3]).toBe(`${disabled},${at(disabled)},disabled,${owner.id},Ada Boss,boss@example.test,${person},Jo Alves,jo@example.test,false,,,,`);

    // A deleted account's address and name are not in the file: the page
    // reads it as its id, and so does this.
    expect(response.payload).not.toContain("gone@example.test");
  });

  it("names a staff member who has gone by their id alone", async () => {
    const owner = await staffMember("owner");
    const left = await activeAccount("left@example.test");
    await entry({ staff: left, kind: "invited", target: owner.id });
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", left).execute();

    const row = lines((await auditCsv(owner.cookie)).payload).find((line) => line.includes(",invited,"))!;
    expect(row.split(",").slice(3, 6)).toEqual([left, "", ""]);
    expect(row).not.toContain("left@example.test");
  });

  it("covers the last 90 days unless asked for another period", async () => {
    const owner = await staffMember("owner");
    const recent = await entry({ staff: owner.id, kind: "job.retried", ago: "80 days" });
    const old = await entry({ staff: owner.id, kind: "job.dismissed", ago: "100 days" });

    const response = await auditCsv(owner.cookie);
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="offload-audit-${daysAgo(90)}-to-${today()}.csv"`);
    expect(response.payload).toContain(recent);
    expect(response.payload).not.toContain(old);
  });

  it("takes a period by UTC day, both ends included", async () => {
    const owner = await staffMember("owner");
    const before = await entry({ staff: owner.id, kind: "enabled", ago: "12 days" });
    const first = await entry({ staff: owner.id, kind: "disabled", ago: "10 days" });
    const last = await entry({ staff: owner.id, kind: "resent", ago: "5 days" });
    const after = await entry({ staff: owner.id, kind: "invited", ago: "3 days" });

    const response = await auditCsv(owner.cookie, { from: daysAgo(10), to: daysAgo(5) });
    expect(response.statusCode).toBe(200);
    const ids = lines(response.payload)
      .slice(1)
      .map((line) => line.split(",")[0]);
    expect(ids).toEqual([last, first]);
    expect(ids).not.toContain(before);
    expect(ids).not.toContain(after);
  });

  it("refuses a period that ends before it starts, and records nothing", async () => {
    const owner = await staffMember("owner");
    const response = await auditCsv(owner.cookie, { from: daysAgo(5), to: daysAgo(10) });
    expect(response.statusCode).toBe(400);
    expect(await db.selectFrom("staff_audit").selectAll().execute()).toEqual([]);
  });

  it("is recorded as audit.exported, with the period it covered", async () => {
    const owner = await staffMember("owner");
    await auditCsv(owner.cookie, { from: daysAgo(30), to: daysAgo(1) });
    const rows = await db.selectFrom("staff_audit").select(["kind", "staff_account_id", "new_value"]).execute();
    expect(rows).toEqual([{ kind: "audit.exported", staff_account_id: owner.id, new_value: `${daysAgo(30)}/${daysAgo(1)}` }]);
  });

  it("writes a log larger than one read holds, every row once", async () => {
    const owner = await staffMember("owner");
    await sql`
      insert into staff_audit (staff_account_id, kind, at)
      select ${owner.id}, 'job.retried', now() - (n || ' minutes')::interval from generate_series(1, 2345) as n`.execute(db);

    const ids = lines((await auditCsv(owner.cookie)).payload)
      .slice(1)
      .map((line) => line.split(",")[0]);
    // Every seeded row, and the export's own.
    expect(ids).toHaveLength(2346);
    expect(new Set(ids).size).toBe(2346);
  });
});
