// 034 AC-48 (the enqueue half), AC-50 and AC-51. Staff: who may open the
// panel, added, switched and removed by an owner.
//
// Every guard is the route's, asked for directly here, because a page that
// does not draw a button refuses nothing.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { activeAccount, auditEntries, signIn, staffMember, wipeAdmin } from "./admin-kit.js";

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

const get = (cookie: string, url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const add = (cookie: string, payload: unknown) =>
  app.inject({ method: "POST", url: "/v1/admin/staff", headers: { cookie }, payload: payload as Record<string, unknown> });
const setRole = (cookie: string, id: string, role: unknown) =>
  app.inject({ method: "PATCH", url: `/v1/admin/staff/${id}`, headers: { cookie }, payload: { role } });
const remove = (cookie: string, id: string) => app.inject({ method: "DELETE", url: `/v1/admin/staff/${id}`, headers: { cookie } });

/** One way to sign in. Tokens are not what this is about, so none is set. */
const identity = (accountId: string, provider: "apple" | "google") =>
  sql`insert into account_identities (account_id, provider, subject) values (${accountId}, ${provider}, ${uuidv7()})`.execute(db);

const staffRows = () => db.selectFrom("staff").select(["account_id", "role"]).orderBy("account_id").execute();
const owners = async () => (await staffRows()).filter((row) => row.role === "owner").length;

/** The staff-action alerts queued, as the contract writes them. */
const alerts = async () =>
  (await db.selectFrom("jobs").select(["payload", "priority", "state", "account_id"]).where("kind", "=", "email.alert").orderBy("id").execute()).map((job) => ({
    ...job,
    payload: job.payload as Record<string, unknown>,
  }));

describe("the list", () => {
  it("returns each staff member with their role, when they were added and when they were last here", async () => {
    const owner = await staffMember("owner", "boss@example.test");
    const support = await staffMember("support", "help@example.test");
    await db.updateTable("accounts").set({ display_name: "Sam Okoro" }).where("id", "=", support.id).execute();
    // Last here is the newest audit entry by that person: there is no
    // last-seen column, because a stamp on a read would be a read that writes.
    await sql`insert into staff_audit (staff_account_id, kind, at) values (${support.id}, 'invited', now() - interval '3 days')`.execute(db);
    await sql`insert into staff_audit (staff_account_id, kind, at) values (${support.id}, 'resent', '2026-09-30T10:00:00Z')`.execute(db);
    await sql`insert into staff_audit (staff_account_id, kind, at) values (${support.id}, 'invited', '2026-09-01T10:00:00Z')`.execute(db);

    const res = await get(owner.cookie, "/v1/admin/staff");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { owners: number; staff: Array<Record<string, unknown>> };
    expect(body.owners).toBe(1);
    expect(body.staff).toHaveLength(2);

    const me = body.staff.find((row) => row["id"] === owner.id)!;
    expect(me).toMatchObject({ id: owner.id, name: null, email: "boss@example.test", role: "owner", you: true, lastHere: null });
    expect(Object.keys(me).sort()).toEqual(["added", "email", "id", "lastHere", "name", "role", "you"]);
    expect(new Date(me["added"] as string).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const other = body.staff.find((row) => row["id"] === support.id)!;
    expect(other).toMatchObject({ name: "Sam Okoro", email: "help@example.test", role: "support", you: false });
    expect(Date.now() - new Date(other["lastHere"] as string).getTime()).toBeLessThan(4 * 86_400_000);
    expect(Date.now() - new Date(other["lastHere"] as string).getTime()).toBeGreaterThan(2 * 86_400_000);
  });

  it("writes nothing", async () => {
    const owner = await staffMember("owner");
    await get(owner.cookie, "/v1/admin/staff");
    expect(await auditEntries()).toEqual([]);
  });
});

describe("AC-50 add, switch and remove, each on the person's next request", () => {
  it("opens the panel to somebody added, widens it with the role, and closes it when they are removed", async () => {
    const owner = await staffMember("owner");
    const id = await activeAccount("new@example.test");
    await identity(id, "google");
    const cookie = await signIn(id);
    expect((await get(cookie, "/v1/admin/me")).statusCode).toBe(404);

    const added = await add(owner.cookie, { email: "  New@Example.test ", role: "support" });
    expect(added.statusCode).toBe(200);
    expect(added.json()).toEqual({ id });
    expect((await get(cookie, "/v1/admin/me")).json()).toMatchObject({ role: "support" });
    expect((await get(cookie, "/v1/admin/staff")).statusCode).toBe(404);

    const switched = await setRole(owner.cookie, id, "owner");
    expect(switched.statusCode).toBe(200);
    expect((await get(cookie, "/v1/admin/staff")).statusCode).toBe(200);

    const removed = await remove(owner.cookie, id);
    expect(removed.statusCode).toBe(200);
    expect((await get(cookie, "/v1/admin/me")).statusCode).toBe(404);

    // Their own offload account is untouched: still active, still signed in.
    const account = await db.selectFrom("accounts").select(["state", "deleted_at"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(account).toEqual({ state: "active", deleted_at: null });
    expect(await db.selectFrom("sessions").select("id").where("account_id", "=", id).execute()).toHaveLength(1);
  });

  it("records each write, by id, with the role before and after", async () => {
    const owner = await staffMember("owner");
    const id = await activeAccount("new@example.test");
    await add(owner.cookie, { email: "new@example.test", role: "support" });
    await setRole(owner.cookie, id, "owner");
    await remove(owner.cookie, id);

    expect(await auditEntries()).toEqual([
      { kind: "staff.added", staff_account_id: owner.id, target_account_id: id, setting_key: null, old_value: null, new_value: "support", job_id: null },
      { kind: "staff.role_changed", staff_account_id: owner.id, target_account_id: id, setting_key: null, old_value: "support", new_value: "owner", job_id: null },
      { kind: "staff.removed", staff_account_id: owner.id, target_account_id: id, setting_key: null, old_value: "owner", new_value: null, job_id: null },
    ]);
    const all = JSON.stringify(await db.selectFrom("staff_audit").selectAll().execute());
    expect(all).not.toContain("@");
  });

  it("records nothing for a role that was already that role", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support");
    const res = await setRole(owner.cookie, support.id, "support");
    expect(res.statusCode).toBe(200);
    expect(await auditEntries()).toEqual([]);
    expect(await alerts()).toEqual([]);
  });

  it("answers 404 for somebody who is not staff", async () => {
    const owner = await staffMember("owner");
    const stranger = await activeAccount();
    expect((await setRole(owner.cookie, stranger, "owner")).statusCode).toBe(404);
    expect((await remove(owner.cookie, stranger)).statusCode).toBe(404);
    expect(await auditEntries()).toEqual([]);
  });
});

describe("AC-48 each staff write queues one alert for the owners", () => {
  it("queues it with who did it and to whom, by id, at interactive priority", async () => {
    const owner = await staffMember("owner");
    const id = await activeAccount("new@example.test");
    await db.deleteFrom("jobs").execute();

    await add(owner.cookie, { email: "new@example.test", role: "support" });
    await setRole(owner.cookie, id, "owner");
    await setRole(owner.cookie, id, "support");
    await remove(owner.cookie, id);

    const queued = await alerts();
    // Each carries the id of its own write, which is what the fan-out is keyed
    // on: two changes of one kind in one minute are two emails.
    const write = expect.stringMatching(/^[0-9a-f-]{36}$/);
    expect(queued.map((job) => job.payload)).toEqual([
      { alert: "staff.added", actorAccountId: owner.id, targetAccountId: id, id: write },
      { alert: "staff.role_changed", actorAccountId: owner.id, targetAccountId: id, id: write },
      { alert: "staff.role_changed", actorAccountId: owner.id, targetAccountId: id, id: write },
      { alert: "staff.removed", actorAccountId: owner.id, targetAccountId: id, id: write },
    ]);
    expect(new Set(queued.map((job) => job.payload["id"])).size).toBe(4);
    for (const job of queued) expect(job).toMatchObject({ priority: 10, state: "queued" });
    expect(JSON.stringify(queued)).not.toContain("@");
  });

  it("queues none for a write that was refused", async () => {
    const owner = await staffMember("owner");
    await db.deleteFrom("jobs").execute();
    await add(owner.cookie, { email: "nobody@example.test", role: "support" });
    await setRole(owner.cookie, owner.id, "support");
    await remove(owner.cookie, owner.id);
    expect(await alerts()).toEqual([]);
    expect(await auditEntries()).toEqual([]);
  });
});

describe("AC-51 who may be added", () => {
  it("refuses an address with no account, one still waiting, one invited, one disabled and one removed", async () => {
    const owner = await staffMember("owner");
    await db.insertInto("accounts").values({ email: "waiting@example.test", state: "waitlist" }).execute();
    await db.insertInto("accounts").values({ email: "invited@example.test", state: "invited" }).execute();
    const disabled = await activeAccount("disabled@example.test");
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", disabled).execute();
    const gone = await activeAccount("gone@example.test");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", gone).execute();

    for (const email of ["nobody@example.test", "waiting@example.test", "invited@example.test", "disabled@example.test", "gone@example.test"]) {
      const res = await add(owner.cookie, { email, role: "support" });
      expect(res.statusCode, email).toBe(409);
      expect(res.json(), email).toEqual({ error: "no_account" });
    }
    expect(await staffRows()).toEqual([{ account_id: owner.id, role: "owner" }]);
    expect(await auditEntries()).toEqual([]);
  });

  it("refuses something that is not an address, and a role that does not exist", async () => {
    const owner = await staffMember("owner");
    await activeAccount("new@example.test");
    expect((await add(owner.cookie, { email: "not an address", role: "support" })).statusCode).toBe(400);
    expect((await add(owner.cookie, { email: "new@example.test", role: "admin" })).statusCode).toBe(400);
    expect((await setRole(owner.cookie, owner.id, "admin")).statusCode).toBe(400);
    expect(await staffRows()).toHaveLength(1);
  });

  it("refuses an account that signs in two ways, in the route", async () => {
    const owner = await staffMember("owner");
    const id = await activeAccount("both@example.test");
    await identity(id, "apple");
    await identity(id, "google");

    const res = await add(owner.cookie, { email: "both@example.test", role: "support" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "two_sign_ins" });
    expect(await staffRows()).toHaveLength(1);
    expect(await auditEntries()).toEqual([]);
  });

  it("and in the database, for an insert that never went through the route", async () => {
    const id = await activeAccount("both@example.test");
    await identity(id, "apple");
    await identity(id, "google");
    await expect(db.insertInto("staff").values({ account_id: id, role: "support" }).execute()).rejects.toThrow(/more than one identity/);
    expect(await staffRows()).toEqual([]);
  });

  it("refuses somebody who is already staff", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support", "help@example.test");
    const res = await add(owner.cookie, { email: "help@example.test", role: "owner" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "already_staff" });
    expect((await staffRows()).find((row) => row.account_id === support.id)?.role).toBe("support");
    expect(await auditEntries()).toEqual([]);
  });
});

describe("AC-51 yourself, and the last owner", () => {
  it("refuses changing or removing yourself, with another owner there or not", async () => {
    const owner = await staffMember("owner");
    for (const others of [0, 1]) {
      if (others) await staffMember("owner");
      const demote = await setRole(owner.cookie, owner.id, "support");
      expect(demote.statusCode).toBe(409);
      expect(demote.json()).toEqual({ error: "self" });
      const leave = await remove(owner.cookie, owner.id);
      expect(leave.statusCode).toBe(409);
      expect(leave.json()).toEqual({ error: "self" });
    }
    expect((await staffRows()).find((row) => row.account_id === owner.id)?.role).toBe("owner");
    expect(await auditEntries()).toEqual([]);
  });

  // The last owner is only ever reached by a race: you cannot act on
  // yourself, so whoever is acting is an owner who stays. Two owners acting on
  // each other at once is the race, and the lock on the owner rows is what
  // decides it.
  for (const [what, act] of [
    ["demoting", (cookie: string, id: string) => setRole(cookie, id, "support")],
    ["removing", (cookie: string, id: string) => remove(cookie, id)],
  ] as const) {
    it(`leaves an owner when two owners are ${what} each other at once`, async () => {
      for (let round = 0; round < 8; round += 1) {
        await wipeAdmin();
        const a = await staffMember("owner");
        const b = await staffMember("owner");

        const answers = await Promise.all([act(a.cookie, b.id), act(b.cookie, a.id)]);
        const codes = answers.map((answer) => answer.statusCode).sort();

        expect(await owners(), `round ${round}`).toBe(1);
        expect(codes[0], `round ${round}`).toBe(200);
        // The loser is told it would have left nobody, or, when the winner
        // had finished before the loser's request was even looked at, finds
        // the owner pages gone.
        const lost = answers.find((answer) => answer.statusCode !== 200)!;
        expect([404, 409], `round ${round}`).toContain(lost.statusCode);
        if (lost.statusCode === 409) expect(lost.json()).toEqual({ error: "last_owner" });
        expect(await auditEntries(), `round ${round}`).toHaveLength(1);
        expect(await alerts(), `round ${round}`).toHaveLength(1);
      }
    });
  }
});
