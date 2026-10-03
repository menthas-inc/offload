// 034 AC-53 and AC-54, the read side. The audit log as the panel lists it:
// newest first, by cursor, filtered by staff member, kind and person, with
// names joined at read time because the stored row holds none.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { activeAccount, adminRoutesOf, staffMember, wipeAdmin } from "./admin-kit.js";

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

interface Seed {
  staff: string;
  kind: string;
  target?: string | null;
  key?: string | null;
  old?: unknown;
  new?: unknown;
  job?: string | null;
  /** How long ago, as a Postgres interval. */
  ago?: string;
}

/** One entry, written straight to the table. The id is the database's own,
 *  so entries seeded in order list in order. */
async function entry(seed: Seed): Promise<string> {
  const row = await sql<{ id: string }>`
    insert into staff_audit (staff_account_id, kind, target_account_id, setting_key, old_value, new_value, job_id, at)
    values (${seed.staff}, ${seed.kind}, ${seed.target ?? null}, ${seed.key ?? null},
            ${seed.old === undefined ? null : JSON.stringify(seed.old)}::jsonb,
            ${seed.new === undefined ? null : JSON.stringify(seed.new)}::jsonb,
            ${seed.job ?? null}, now() - ${seed.ago ?? "0 seconds"}::interval)
    returning id`.execute(db);
  // UUIDv7 orders by the millisecond, so the next entry is a later one.
  await new Promise((resolve) => setTimeout(resolve, 2));
  return row.rows[0]!.id;
}

type Row = Record<string, unknown>;
const rowsOf = (res: { json: () => unknown }) => (res.json() as { rows: Row[] }).rows;

describe("the list", () => {
  it("returns every entry newest first, with who and on whom joined from accounts", async () => {
    const owner = await staffMember("owner", "boss@example.test");
    await db.updateTable("accounts").set({ display_name: "Ada Boss" }).where("id", "=", owner.id).execute();
    const person = await activeAccount("jo@example.test");
    await db.updateTable("accounts").set({ display_name: "Jo Alves" }).where("id", "=", person).execute();
    const job = uuidv7();

    const first = await entry({ staff: owner.id, kind: "disabled", target: person });
    const second = await entry({ staff: owner.id, kind: "setting.changed", key: "cap.turns", old: 100, new: 50 });
    const third = await entry({ staff: owner.id, kind: "job.retried", target: person, job });

    const res = await get(owner.cookie, "/v1/admin/audit");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: Row[]; nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
    expect(body.rows.map((row) => row["id"])).toEqual([third, second, first]);

    const who = { id: owner.id, name: "Ada Boss", email: "boss@example.test" };
    const whom = { id: person, name: "Jo Alves", email: "jo@example.test", deleted: false };
    expect(body.rows[0]).toMatchObject({ kind: "job.retried", staff: who, target: whom, settingKey: null, old: null, new: null, jobId: job });
    expect(body.rows[1]).toMatchObject({ kind: "setting.changed", staff: who, target: null, settingKey: "cap.turns", old: 100, new: 50, jobId: null });
    expect(body.rows[2]).toMatchObject({ kind: "disabled", staff: who, target: whom });
    expect(Object.keys(body.rows[0]!).sort()).toEqual(["at", "id", "jobId", "kind", "new", "old", "settingKey", "staff", "target"]);
    expect(Math.abs(Date.now() - new Date(body.rows[0]!["at"] as string).getTime())).toBeLessThan(60_000);
  });

  it("names a deleted account by id only, as the person and as the staff member", async () => {
    const owner = await staffMember("owner");
    const goneStaff = uuidv7();
    const gonePerson = uuidv7();
    await entry({ staff: goneStaff, kind: "deleted", target: gonePerson });
    // A waitlist removal leaves a tombstone row with its address on it. It is
    // gone all the same, and reads as gone.
    const removed = await activeAccount("typo@example.test");
    await db.updateTable("accounts").set({ deleted_at: new Date() }).where("id", "=", removed).execute();
    await entry({ staff: owner.id, kind: "waitlist.removed", target: removed });

    const res = await get(owner.cookie, "/v1/admin/audit");
    const rows = rowsOf(res);
    expect(rows[1]).toMatchObject({ staff: { id: goneStaff }, target: { id: gonePerson, deleted: true } });
    expect(Object.keys(rows[1]!["staff"] as object)).toEqual(["id"]);
    expect(Object.keys(rows[1]!["target"] as object).sort()).toEqual(["deleted", "id"]);
    expect(rows[0]!["target"]).toEqual({ id: removed, deleted: true });
    expect(res.payload).not.toContain("typo@example.test");
  });

  it("goes back 30 days unless asked for more", async () => {
    const owner = await staffMember("owner");
    const old = await entry({ staff: owner.id, kind: "invited", ago: "40 days" });
    const recent = await entry({ staff: owner.id, kind: "invited", ago: "29 days" });

    expect(rowsOf(await get(owner.cookie, "/v1/admin/audit")).map((row) => row["id"])).toEqual([recent]);
    const from = new Date(Date.now() - 60 * 86_400_000).toISOString();
    expect(rowsOf(await get(owner.cookie, `/v1/admin/audit?from=${encodeURIComponent(from)}`)).map((row) => row["id"])).toEqual([recent, old]);
    expect((await get(owner.cookie, "/v1/admin/audit?from=yesterday")).statusCode).toBe(400);
  });

  it("pages 50 at a time by cursor, with no entry twice and none missed", async () => {
    const owner = await staffMember("owner");
    const ids: string[] = [];
    for (let n = 0; n < 120; n += 1) ids.push(uuidv7());
    ids.sort();
    await sql`
      insert into staff_audit (id, staff_account_id, kind)
      select id::uuid, ${owner.id}, 'invited' from unnest(${sql.val(ids)}::text[]) as id`.execute(db);

    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const res = await get(owner.cookie, `/v1/admin/audit${cursor ? `?cursor=${cursor}` : ""}`);
      const body = res.json() as { rows: Row[]; nextCursor: string | null };
      sizes.push(body.rows.length);
      seen.push(...body.rows.map((row) => row["id"] as string));
      cursor = body.nextCursor;
    } while (cursor);

    expect(sizes).toEqual([50, 50, 20]);
    expect(seen).toEqual([...ids].reverse());
  });
});

describe("the filters", () => {
  it("narrows by staff member, by kind, and by both", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support");
    const a = await entry({ staff: owner.id, kind: "invited" });
    const b = await entry({ staff: support.id, kind: "invited" });
    const c = await entry({ staff: support.id, kind: "disabled" });

    const ids = async (query: string) => rowsOf(await get(owner.cookie, `/v1/admin/audit?${query}`)).map((row) => row["id"]);
    expect(await ids(`staff=${support.id}`)).toEqual([c, b]);
    expect(await ids("kind=invited")).toEqual([b, a]);
    expect(await ids(`staff=${support.id}&kind=invited`)).toEqual([b]);
    expect(await ids(`staff=${uuidv7()}`)).toEqual([]);
    // An empty filter is no filter, which is what a cleared control sends.
    expect(await ids("staff=&kind=&person=")).toEqual([c, b, a]);
    expect((await get(owner.cookie, "/v1/admin/audit?kind=made_up")).statusCode).toBe(400);
  });

  it("narrows by person, given an id or an address, and finds nothing for an address nobody has", async () => {
    const owner = await staffMember("owner");
    const jo = await activeAccount("jo@example.test");
    const al = await activeAccount("al@example.test");
    const one = await entry({ staff: owner.id, kind: "disabled", target: jo });
    await entry({ staff: owner.id, kind: "disabled", target: al });
    const two = await entry({ staff: owner.id, kind: "enabled", target: jo });

    const ask = (person: string) => get(owner.cookie, `/v1/admin/audit?person=${encodeURIComponent(person)}`);
    expect(rowsOf(await ask(jo)).map((row) => row["id"])).toEqual([two, one]);
    expect(rowsOf(await ask("  Jo@Example.test ")).map((row) => row["id"])).toEqual([two, one]);

    const nobody = await ask("nobody@example.test");
    expect(nobody.statusCode).toBe(200);
    expect(nobody.json()).toEqual({ rows: [], nextCursor: null });
    const nonsense = await ask("not an address");
    expect(nonsense.statusCode).toBe(200);
    expect(nonsense.json()).toEqual({ rows: [], nextCursor: null });
  });

  it("offers the staff members and the kinds the log holds", async () => {
    const owner = await staffMember("owner", "boss@example.test");
    const gone = uuidv7();
    await entry({ staff: owner.id, kind: "invited" });
    await entry({ staff: owner.id, kind: "disabled" });
    await entry({ staff: gone, kind: "invited" });

    const res = await get(owner.cookie, "/v1/admin/audit/facets");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { staff: Row[]; kinds: string[] };
    expect(body.kinds).toEqual(["disabled", "invited"]);
    expect(body.staff).toHaveLength(2);
    expect(body.staff).toContainEqual({ id: owner.id, name: null, email: "boss@example.test" });
    expect(body.staff).toContainEqual({ id: gone });
  });
});

describe("AC-54 the log is read only", () => {
  it("registers nothing under audit but reads", () => {
    const routes = adminRoutesOf(app).filter((route) => route.url.startsWith("/v1/admin/audit"));
    expect(routes.map((route) => `${route.method} ${route.url}`).sort()).toEqual(["GET /v1/admin/audit", "GET /v1/admin/audit/facets"]);
  });

  it("answers 404 to every write, and the log is as it was", async () => {
    const owner = await staffMember("owner");
    const id = await entry({ staff: owner.id, kind: "invited" });
    for (const method of ["POST", "PATCH", "DELETE"] as const) {
      for (const url of ["/v1/admin/audit", `/v1/admin/audit/${id}`, "/v1/admin/audit/facets"]) {
        const res = await app.inject({ method, url, headers: { cookie: owner.cookie }, ...(method === "DELETE" ? {} : { payload: { kind: "enabled" } }) });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
    }
    expect(await db.selectFrom("staff_audit").select(["id", "kind"]).execute()).toEqual([{ id, kind: "invited" }]);
  });

  it("writes nothing when read", async () => {
    const owner = await staffMember("owner");
    await get(owner.cookie, "/v1/admin/audit");
    await get(owner.cookie, "/v1/admin/audit/facets");
    expect(await db.selectFrom("staff_audit").select("id").execute()).toEqual([]);
  });
});
