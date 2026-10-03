// 034 section A. People: the list, its stats row, and the three things a row
// does (AC-11, AC-12, AC-13, AC-17, AC-21).
//
// Delete is not here. It is built with account destruction and wired in after.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { decideLink } from "../src/auth/gate.js";
import { worksInBackground } from "../src/accounts/active.js";
import { activeAccount, neverSignedIn, auditEntries, signIn, staffMember, wipeAdmin } from "./admin-kit.js";
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

/** Somebody who was let in and has signed in, which is who People lists. */
async function person(email: string, name: string | null = null, provider: "apple" | "google" | null = "google"): Promise<string> {
  const id = await activeAccount(email);
  await db.updateTable("accounts").set({ first_signed_in_at: new Date(), display_name: name }).where("id", "=", id).execute();
  if (provider) {
    await sql`insert into account_identities (account_id, provider, subject) values (${id}, ${provider}, ${`sub-${id}`})`.execute(db);
  }
  return id;
}

/** Staff who have signed in, so they are on the list too. */
async function staff(role: "support" | "owner", email?: string) {
  const member = await staffMember(role, email);
  await db.updateTable("accounts").set({ first_signed_in_at: new Date() }).where("id", "=", member.id).execute();
  return member;
}

const spend = (accountId: string, micros: number, ago = "1 hour") =>
  sql`insert into llm_usage (account_id, job_kind, category, model, cost_micros, created_at)
      values (${accountId}, 'dump.answer', 'interactive', 'claude-sonnet-5', ${micros}, now() - ${ago}::interval)`.execute(db);

const get = (cookie: string, url: string) => app.inject({ method: "GET", url: `/v1/admin${url}`, headers: { cookie } });
const post = (cookie: string, url: string) => app.inject({ method: "POST", url: `/v1/admin${url}`, headers: { cookie } });

type ListRow = { id: string; name: string | null; email: string; state: string; can: { disable: boolean; enable: boolean } } & Record<string, unknown>;
const rowsOf = (res: { json: () => { rows: ListRow[] } }) => res.json().rows;

describe("AC-11 the list", () => {
  it("returns every account that has signed in, with the columns the page draws", async () => {
    const support = await staff("support", "staff@example.test");
    const ana = await person("ana@example.test", "Ana Duarte", "apple");
    await neverSignedIn("never@example.test");
    await db.insertInto("accounts").values({ email: "waiting@example.test", state: "waitlist" }).execute();
    const gone = await person("gone@example.test");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", gone).execute();
    await spend(ana, 4_200);
    await sql`insert into lookups (account_id, label, kind, outcome, cost_micros) values (${ana}, 'search', 'search', 'used', 10000)`.execute(db);
    await spend(ana, 999_000, "40 days");
    await signIn(ana);

    const res = await get(support.cookie, "/people");
    expect(res.statusCode).toBe(200);
    const rows = rowsOf(res);
    expect(rows.map((row) => row.email).sort()).toEqual(["ana@example.test", "staff@example.test"]);
    const row = rows.find((one) => one.id === ana)!;
    expect(Object.keys(row).sort()).toEqual(["can", "email", "id", "joined", "lastActive", "name", "providers", "spendMicros", "state", "threads"]);
    expect(row).toMatchObject({
      name: "Ana Duarte",
      email: "ana@example.test",
      providers: ["apple"],
      // The default thread promotion made.
      threads: 1,
      spendMicros: 14_200,
      state: "active",
      can: { disable: true, enable: false },
    });
    expect(Date.parse(String(row["joined"]))).not.toBeNaN();
    expect(Date.parse(String(row["lastActive"]))).toBeGreaterThan(Date.now() - 60_000);
    expect(res.json().nextCursor).toBeNull();
    expect(res.json().capped).toBe(false);
  });

  it("pages by cursor, newest first, with no row twice", async () => {
    const support = await staff("support");
    const ids = [];
    for (const n of [1, 2, 3, 4]) {
      ids.push(await person(`p${n}@example.test`));
      // Ids order to the millisecond, and the page order is theirs.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const first = await get(support.cookie, "/people?limit=2");
    expect(rowsOf(first).map((row) => row.id)).toEqual([ids[3], ids[2]]);
    const cursor = first.json().nextCursor as string;
    expect(cursor).toBeTruthy();
    const second = await get(support.cookie, `/people?limit=2&cursor=${cursor}`);
    expect(rowsOf(second).map((row) => row.id)).toEqual([ids[1], ids[0]]);
    const third = await get(support.cookie, `/people?limit=2&cursor=${second.json().nextCursor}`);
    expect(rowsOf(third).map((row) => row.id)).toEqual([support.id]);
    expect(third.json().nextCursor).toBeNull();
  });

  it("searches name and address, and a wildcard is only a character", async () => {
    const support = await staff("support", "staff@example.test");
    const ana = await person("ana@duarte.test", "Ana Duarte");
    const tom = await person("tom@reilly.test", "Tom Reilly");

    expect(rowsOf(await get(support.cookie, "/people?q=DUARTE")).map((row) => row.id)).toEqual([ana]);
    expect(rowsOf(await get(support.cookie, "/people?q=reilly.te")).map((row) => row.id)).toEqual([tom]);
    expect(rowsOf(await get(support.cookie, "/people?q=tom%20r")).map((row) => row.id)).toEqual([tom]);
    expect(rowsOf(await get(support.cookie, "/people?q=%25")).map((row) => row.id)).toEqual([]);
    expect(rowsOf(await get(support.cookie, "/people?q=_")).map((row) => row.id)).toEqual([]);
  });

  it("filters by state", async () => {
    const support = await staff("support", "staff@example.test");
    const ana = await person("ana@example.test");
    const kit = await person("kit@example.test");
    await db.updateTable("accounts").set({ state: "disabled", disabled_at: new Date() }).where("id", "=", kit).execute();

    expect(rowsOf(await get(support.cookie, "/people?state=disabled")).map((row) => row.id)).toEqual([kit]);
    expect(rowsOf(await get(support.cookie, "/people?state=active")).map((row) => row.id).sort()).toEqual([ana, support.id].sort());
    expect(rowsOf(await get(support.cookie, "/people")).length).toBe(3);
    expect(rowsOf(await get(support.cookie, "/people?state=disabled"))[0]!.can).toEqual({ disable: false, enable: true });
  });

  it("sorts by spend and by last active, without a cursor", async () => {
    const support = await staff("support");
    const a = await person("a@example.test");
    const b = await person("b@example.test");
    const c = await person("c@example.test");
    await spend(a, 100);
    await spend(b, 900);
    await spend(c, 500);
    await sql`insert into jobs (kind, account_id, run_after, created_at) values ('dump.answer', ${a}, now(), now() + interval '2 minutes')`.execute(db);
    await sql`insert into jobs (kind, account_id, run_after, created_at) values ('dump.answer', ${c}, now(), now() + interval '1 minute')`.execute(db);

    const bySpend = await get(support.cookie, "/people?sort=spend&limit=2");
    expect(rowsOf(bySpend).map((row) => row.id).slice(0, 3)).toEqual([b, c, a]);
    expect(bySpend.json().nextCursor).toBeNull();
    expect(bySpend.json().capped).toBe(false);

    const byActive = await get(support.cookie, "/people?sort=active");
    expect(rowsOf(byActive).map((row) => row.id).slice(0, 2)).toEqual([a, c]);
    expect(byActive.json().nextCursor).toBeNull();
  });

  it("returns the top 200 by spend and says it is capped", async () => {
    const support = await staff("support");
    await db
      .insertInto("accounts")
      .values(Array.from({ length: 201 }, (_unused, n) => ({ email: `bulk${n}@example.test`, state: "active" as const, first_signed_in_at: new Date() })))
      .execute();
    const res = await get(support.cookie, "/people?sort=spend");
    expect(rowsOf(res)).toHaveLength(200);
    expect(res.json().capped).toBe(true);
    expect(res.json().nextCursor).toBeNull();
  });

  it("counts accounts, who used it this week, the disabled, and the average spend", async () => {
    const support = await staff("support");
    const ana = await person("ana@example.test");
    const kit = await person("kit@example.test");
    const old = await person("old@example.test");
    await neverSignedIn("never@example.test");
    await db.updateTable("accounts").set({ state: "disabled", disabled_at: new Date() }).where("id", "=", kit).execute();
    await db.deleteFrom("jobs").execute();
    await db.deleteFrom("sessions").where("account_id", "<>", support.id).execute();
    await sql`insert into jobs (kind, account_id, run_after) values ('dump.answer', ${ana}, now())`.execute(db);
    await sql`insert into jobs (kind, account_id, run_after, created_at) values ('dump.answer', ${old}, now(), now() - interval '9 days')`.execute(db);
    await spend(ana, 3_000_000);
    await spend(kit, 1_000_000);
    await spend(old, 5_000_000, "40 days");

    const res = await get(support.cookie, "/people/stats");
    expect(res.statusCode).toBe(200);
    // Four accounts: three people and the staff member, whose session is live.
    expect(res.json()).toEqual({ accounts: 4, activeThisWeek: 2, disabled: 1, averageSpendMicros: 1_000_000 });
  });
});

describe("AC-12 disable", () => {
  it("ends every session, locks the account and stops background work, in one audited write", async () => {
    const support = await staff("support");
    const ana = await person("ana@example.test");
    await signIn(ana);
    await signIn(ana);
    const thread = await db.selectFrom("thread_members").select(["id", "state"]).where("account_id", "=", ana).executeTakeFirstOrThrow();

    const res = await post(support.cookie, `/people/${ana}/disable`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "disabled" });

    const account = await db.selectFrom("accounts").select(["state", "disabled_at"]).where("id", "=", ana).executeTakeFirstOrThrow();
    expect(account.state).toBe("disabled");
    expect(account.disabled_at).toBeInstanceOf(Date);
    expect(await db.selectFrom("sessions").select("id").where("account_id", "=", ana).execute()).toEqual([]);
    // A new sign-in is refused at the gate, as an uninvited one is.
    expect(await decideLink(ana)).toMatchObject({ allow: false, reason: "disabled" });
    expect(await worksInBackground(ana)).toBe(false);
    // Nothing is deleted: their membership reads the same.
    expect(await db.selectFrom("thread_members").select(["id", "state"]).where("account_id", "=", ana).executeTakeFirstOrThrow()).toEqual(thread);
    expect(await auditEntries()).toMatchObject([{ kind: "disabled", staff_account_id: support.id, target_account_id: ana }]);

    // Twice is once.
    expect((await post(support.cookie, `/people/${ana}/disable`)).json()).toEqual({ status: "disabled" });
    expect(await auditEntries()).toHaveLength(1);
  });

  it("answers 404 for an account that is not on People", async () => {
    const support = await staff("support");
    const never = await neverSignedIn("never@example.test");
    expect((await post(support.cookie, `/people/${never}/disable`)).statusCode).toBe(404);
    expect((await post(support.cookie, "/people/018f0000-0000-7000-8000-000000000000/disable")).statusCode).toBe(404);
    expect(await auditEntries()).toEqual([]);
    expect((await db.selectFrom("accounts").select("state").where("id", "=", never).executeTakeFirstOrThrow()).state).toBe("active");
  });
});

describe("AC-13 enable", () => {
  it("puts the account back, and books a sync for each calendar connection that is live", async () => {
    const support = await staff("support");
    const ana = await person("ana@example.test");
    const live = await sql<{ id: string }>`
      insert into connector_connections (account_id, provider, external_account_email) values (${ana}, 'google', 'ana@example.test') returning id`.execute(db);
    await post(support.cookie, `/people/${ana}/disable`);
    await db.deleteFrom("jobs").execute();

    const res = await post(support.cookie, `/people/${ana}/enable`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "active" });
    const account = await db.selectFrom("accounts").select(["state", "disabled_at"]).where("id", "=", ana).executeTakeFirstOrThrow();
    expect(account).toEqual({ state: "active", disabled_at: null });
    expect(await decideLink(ana)).toMatchObject({ allow: true });
    expect(await worksInBackground(ana)).toBe(true);
    expect((await auditEntries()).map((entry) => entry.kind)).toEqual(["disabled", "enabled"]);

    const jobs = await db.selectFrom("jobs").select(["kind", "payload"]).where("kind", "=", "calendar.sync").execute();
    expect(jobs).toEqual([{ kind: "calendar.sync", payload: { connectionId: live.rows[0]!.id } }]);

    // Twice is once.
    await post(support.cookie, `/people/${ana}/enable`);
    expect(await auditEntries()).toHaveLength(2);
  });

  it("leaves an account marked for deletion locked", async () => {
    const owner = await staff("owner");
    const ana = await person("ana@example.test");
    await db
      .updateTable("accounts")
      .set({ state: "disabled", disabled_at: new Date(), delete_after: new Date(Date.now() + 86_400_000) })
      .where("id", "=", ana)
      .execute();
    const res = await post(owner.cookie, `/people/${ana}/enable`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "refused", reason: "deleting" });
    expect((await db.selectFrom("accounts").select("state").where("id", "=", ana).executeTakeFirstOrThrow()).state).toBe("disabled");
    const row = rowsOf(await get(owner.cookie, "/people?state=disabled"))[0]!;
    expect(row.can).toEqual({ disable: false, enable: false });
  });
});

describe("AC-21 sign out everywhere", () => {
  it("ends every session and leaves the account active", async () => {
    const support = await staff("support");
    const ana = await person("ana@example.test");
    await signIn(ana);
    await signIn(ana);

    const res = await post(support.cookie, `/people/${ana}/sign-out`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "signed-out", sessions: 2 });
    expect(await db.selectFrom("sessions").select("id").where("account_id", "=", ana).execute()).toEqual([]);
    expect((await db.selectFrom("accounts").select("state").where("id", "=", ana).executeTakeFirstOrThrow()).state).toBe("active");
    expect(await auditEntries()).toMatchObject([{ kind: "signed_out", staff_account_id: support.id, target_account_id: ana }]);
  });

  // Ending an owner's sessions is throwing them out of the panel, which is
  // not support's to do to staff, as disabling is not.
  it("refuses support signing out staff, lets an owner, and lets anybody sign themselves out", async () => {
    const support = await staff("support");
    const other = await staff("support");
    const owner = await staff("owner");

    for (const target of [other, owner]) {
      const res = await post(support.cookie, `/people/${target.id}/sign-out`);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: "refused", reason: "staff" });
      expect(await db.selectFrom("sessions").select("id").where("account_id", "=", target.id).execute()).toHaveLength(1);
    }
    expect(await auditEntries()).toEqual([]);

    // An owner may, staff or not.
    const byOwner = await post(owner.cookie, `/people/${other.id}/sign-out`);
    expect(byOwner.statusCode).toBe(200);
    expect(await db.selectFrom("sessions").select("id").where("account_id", "=", other.id).execute()).toEqual([]);

    // Yourself, always: it is your own session to end.
    const self = await post(support.cookie, `/people/${support.id}/sign-out`);
    expect(self.statusCode).toBe(200);
    expect(self.json()).toEqual({ status: "signed-out", sessions: 1 });
    expect((await auditEntries()).map((entry) => [entry.kind, entry.staff_account_id, entry.target_account_id])).toEqual([
      ["signed_out", owner.id, other.id],
      ["signed_out", support.id, support.id],
    ]);
  });
});

describe("AC-17 the guards, in the route", () => {
  it("refuses support disabling or enabling staff, and does not draw either", async () => {
    const support = await staff("support");
    const other = await staff("support");
    const owner = await staff("owner");

    for (const target of [other.id, owner.id]) {
      const res = await post(support.cookie, `/people/${target}/disable`);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: "refused", reason: "staff" });
    }
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", other.id).execute();
    expect((await post(support.cookie, `/people/${other.id}/enable`)).json()).toEqual({ error: "refused", reason: "staff" });
    expect(await auditEntries()).toEqual([]);

    for (const row of rowsOf(await get(support.cookie, "/people"))) {
      expect(row.can, row.email).toEqual({ disable: false, enable: false });
    }
    // An owner may.
    expect(rowsOf(await get(owner.cookie, "/people")).find((row) => row.id === support.id)!.can.disable).toBe(true);
    expect((await post(owner.cookie, `/people/${support.id}/disable`)).statusCode).toBe(200);
  });

  it("refuses anybody disabling themselves", async () => {
    for (const role of ["support", "owner"] as const) {
      const me = await staff(role);
      const res = await post(me.cookie, `/people/${me.id}/disable`);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: "refused", reason: "self" });
      expect(rowsOf(await get(me.cookie, "/people")).find((row) => row.id === me.id)!.can.disable).toBe(false);
    }
    expect(await auditEntries()).toEqual([]);
  });

  it("never leaves the panel with no owner, even when two owners disable each other at once", async () => {
    const a = await staff("owner");
    const b = await staff("owner");
    const answers = await Promise.all([post(a.cookie, `/people/${b.id}/disable`), post(b.cookie, `/people/${a.id}/disable`)]);
    const owners = await db
      .selectFrom("staff")
      .innerJoin("accounts", "accounts.id", "staff.account_id")
      .select("accounts.id")
      .where("staff.role", "=", "owner")
      .where("accounts.state", "=", "active")
      .execute();
    expect(owners).toHaveLength(1);
    expect(answers.map((res) => res.statusCode).sort()).not.toEqual([200, 200]);
    expect(await auditEntries()).toHaveLength(1);
  });
});
