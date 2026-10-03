// 034 AC-52 and AC-53. Every staff write leaves one audit entry, in the same
// transaction as the write, naming accounts by id and never by address.
//
// Groundwork's half: the waitlist's writes, which existed before the log did,
// and the settings save. Each section adds its own beside its routes.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { promote } from "../src/admin/promote.js";
import { auditEntries, staffMember, wipeAdmin } from "./admin-kit.js";

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

async function waiting(email: string): Promise<string> {
  const row = await db.insertInto("accounts").values({ email, state: "waitlist" }).returning("id").executeTakeFirstOrThrow();
  return row.id;
}

const post = (cookie: string, url: string, payload?: unknown) =>
  app.inject({ method: "POST", url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });

describe("the waitlist's writes", () => {
  it("records an invite, and nothing for one that changed nothing", async () => {
    const staff = await staffMember("support");
    const id = await waiting("w1@example.test");

    await post(staff.cookie, `/v1/admin/waitlist/${id}/invite`);
    expect(await auditEntries()).toMatchObject([{ kind: "invited", staff_account_id: staff.id, target_account_id: id }]);

    // Inviting twice is inviting once: no second email and no second entry.
    const again = await post(staff.cookie, `/v1/admin/waitlist/${id}/invite`);
    expect(again.json().status).toBe("already-in");
    expect(await auditEntries()).toHaveLength(1);
  });

  it("records one entry per person a batch let in", async () => {
    const staff = await staffMember("support");
    const a = await waiting("w1@example.test");
    const b = await waiting("w2@example.test");
    await promote("already@example.test");
    const already = (await db.selectFrom("accounts").select("id").where("email", "=", "already@example.test").executeTakeFirstOrThrow()).id;

    await post(staff.cookie, "/v1/admin/waitlist/invite", { ids: [a, b, already] });
    const entries = await auditEntries();
    expect(entries.map((e) => e.kind)).toEqual(["invited", "invited"]);
    expect(entries.map((e) => e.target_account_id).sort()).toEqual([a, b].sort());
  });

  it("records the weekly batch the same way", async () => {
    const staff = await staffMember("owner");
    const a = await waiting("w1@example.test");
    await post(staff.cookie, "/v1/admin/waitlist/invite-next", {});
    expect(await auditEntries()).toMatchObject([{ kind: "invited", staff_account_id: staff.id, target_account_id: a }]);
  });

  it("records a resend, and nothing when there was nothing to resend", async () => {
    const staff = await staffMember("support");
    const invited = (await promote("i1@example.test")).accountId;
    const still = await waiting("w1@example.test");

    await post(staff.cookie, `/v1/admin/waitlist/${invited}/resend`);
    await post(staff.cookie, `/v1/admin/waitlist/${still}/resend`);
    expect(await auditEntries()).toMatchObject([{ kind: "resent", staff_account_id: staff.id, target_account_id: invited }]);
  });

  it("records a removal, one row or many, and only for who was removed", async () => {
    const staff = await staffMember("support");
    const a = await waiting("w1@example.test");
    const b = await waiting("w2@example.test");
    const invited = (await promote("i1@example.test")).accountId;

    await app.inject({ method: "DELETE", url: `/v1/admin/waitlist/${a}`, headers: { cookie: staff.cookie } });
    await app.inject({ method: "DELETE", url: `/v1/admin/waitlist/${invited}`, headers: { cookie: staff.cookie } });
    await post(staff.cookie, "/v1/admin/waitlist/remove", { ids: [b, invited] });

    const entries = await auditEntries();
    expect(entries.map((e) => e.kind)).toEqual(["waitlist.removed", "waitlist.removed"]);
    expect(entries.map((e) => e.target_account_id).sort()).toEqual([a, b].sort());
  });
});

describe("the settings save", () => {
  const save = (cookie: string, changes: Record<string, unknown>, expected: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: "/v1/admin/settings", headers: { cookie }, payload: { changes, expected } });

  it("returns every setting with its bounds, to an owner", async () => {
    const owner = await staffMember("owner");
    const res = await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: owner.cookie } });
    expect(res.statusCode).toBe(200);
    const rows = res.json().settings as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(17);
    expect(rows.find((row) => row["key"] === "cap.turns")).toEqual({
      key: "cap.turns",
      kind: "int",
      value: 100,
      default: 100,
      min: 1,
      max: 10_000,
      nullable: false,
      malformed: false,
      updatedAt: null,
    });
  });

  it("records one entry per setting changed, with old and new", async () => {
    const owner = await staffMember("owner");
    const res = await save(owner.cookie, { "cap.turns": 50, "waitlist.batch": 10, "cap.photos": 200 }, { "cap.turns": 100, "waitlist.batch": 25, "cap.photos": 200 });
    expect(res.statusCode).toBe(200);
    expect((res.json().settings as Array<{ key: string; value: unknown }>).find((row) => row.key === "cap.turns")?.value).toBe(50);

    const entries = (await auditEntries()).sort((x, y) => String(x.setting_key).localeCompare(String(y.setting_key)));
    expect(entries).toEqual([
      { kind: "setting.changed", staff_account_id: owner.id, target_account_id: null, setting_key: "cap.turns", old_value: 100, new_value: 50, job_id: null },
      { kind: "setting.changed", staff_account_id: owner.id, target_account_id: null, setting_key: "waitlist.batch", old_value: 25, new_value: 10, job_id: null },
    ]);
  });

  it("takes effect on this instance at once", async () => {
    const owner = await staffMember("owner");
    await save(owner.cookie, { "cap.turns": 50 }, { "cap.turns": 100 });
    const res = await app.inject({ method: "GET", url: "/v1/admin/settings", headers: { cookie: owner.cookie } });
    expect((res.json().settings as Array<{ key: string; value: unknown }>).find((row) => row.key === "cap.turns")?.value).toBe(50);
  });

  it("refuses an unknown setting, and a value outside its bounds with the bounds named, and records nothing", async () => {
    const owner = await staffMember("owner");
    const unknown = await save(owner.cookie, { "cap.everything": 1 }, { "cap.everything": 0 });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ error: "unknown_key", key: "cap.everything", min: null, max: null });

    const out = await save(owner.cookie, { "cap.turns": 0, "cap.photos": 10 }, { "cap.turns": 100, "cap.photos": 200 });
    expect(out.statusCode).toBe(400);
    expect(out.json()).toEqual({ error: "out_of_bounds", key: "cap.turns", min: 1, max: 10_000 });
    expect(await auditEntries()).toEqual([]);
    expect(await db.selectFrom("app_settings").select("key").execute()).toEqual([]);
  });

  it("refuses a save against values another owner has since changed, shows the current ones and overwrites nothing", async () => {
    const first = await staffMember("owner");
    const second = await staffMember("owner");
    await save(first.cookie, { "cap.turns": 60 }, { "cap.turns": 100 });

    const res = await save(second.cookie, { "cap.turns": 50 }, { "cap.turns": 100 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "conflict", key: "cap.turns" });
    expect((res.json().settings as Array<{ key: string; value: unknown }>).find((row) => row.key === "cap.turns")?.value).toBe(60);
    expect(await auditEntries()).toHaveLength(1);
  });
});

describe("AC-53 what an entry holds", () => {
  it("names accounts by id and carries no address", async () => {
    const staff = await staffMember("owner", "boss@example.test");
    const id = await waiting("w1@example.test");
    await post(staff.cookie, `/v1/admin/waitlist/${id}/invite`);
    await post(staff.cookie, "/v1/admin/waitlist/invite-address", { email: "direct@example.test" });
    const all = JSON.stringify(await db.selectFrom("staff_audit").selectAll().execute());
    expect(all).not.toContain("@");
    expect(all).not.toContain("example.test");
  });
});
