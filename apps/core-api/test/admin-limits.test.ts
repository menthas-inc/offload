// 034, section D. The Limits page's API: what the platform has spent against
// its cap, what has been refused, and the save as the page uses it (AC-29,
// AC-33, AC-34, AC-35).
//
// The registry and the caps themselves are held by `settings.test.ts` and
// `budget.test.ts`. This file is the routes: what an owner's page reads and
// what a save answers.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { clearSettingsCache } from "../src/settings.js";
import { OverBudget, clearPlatformSpent, recordHit, requireBudget } from "../src/budget.js";
import { activeAccount, auditEntries, staffMember, wipeAdmin } from "./admin-kit.js";

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

const get = (cookie: string, url: string) => app.inject({ method: "GET", url: `/v1/admin${url}`, headers: { cookie } });
const save = (cookie: string, changes: Record<string, unknown>, expected: Record<string, unknown>) =>
  app.inject({ method: "PATCH", url: "/v1/admin/settings", headers: { cookie }, payload: { changes, expected } });

type Setting = { key: string; value: unknown; default: unknown; malformed: boolean; min: number | null; max: number | null };
const settingOf = (body: { settings: Setting[] }, key: string) => body.settings.find((row) => row.key === key)!;

async function spend(accountId: string | null, micros: number, ago = "1 hour"): Promise<void> {
  await sql`
    insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cost_micros, latency_ms, created_at)
    values (${accountId}, 'dump.answer', 'interactive', 'claude-sonnet-5', 10, 10, ${micros}, 100, now() - ${ago}::interval)`.execute(db);
}

/** A refusal written straight to the table, at a moment the test chooses. */
async function hit(accountId: string, cap: string, scope: "account" | "platform", daysAgo: number, count = 1, lastAt = `now() - interval '${daysAgo} days'`): Promise<void> {
  await sql`
    insert into limit_hits (account_id, cap, scope, day, count, last_at)
    values (${accountId}, ${cap}, ${scope}, ((now() at time zone 'UTC')::date - ${daysAgo}::int), ${count}, ${sql.raw(lastAt)})`.execute(db);
}

describe("GET /limits/now", () => {
  it("says what the platform spent in the last 24 hours, with the cap off", async () => {
    const owner = await staffMember("owner");
    const person = await activeAccount();
    await spend(person, 1_200_000);
    await spend(null, 300_000);
    await spend(person, 9_000_000, "25 hours");
    await sql`insert into lookups (account_id, label, kind, outcome, cost_micros) values (${person}, 'search', 'search', 'used', 10000)`.execute(db);
    clearPlatformSpent();

    const res = await get(owner.cookie, "/limits/now");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ spentMicros: 1_510_000, capMicros: null, reached: false });
  });

  it("says the cap and that it is reached once the spend meets it", async () => {
    const owner = await staffMember("owner");
    await spend(await activeAccount(), 2_000_000);
    clearPlatformSpent();
    expect((await save(owner.cookie, { "platform.spend_micros": 5_000_000 }, { "platform.spend_micros": null })).statusCode).toBe(200);
    expect((await get(owner.cookie, "/limits/now")).json()).toEqual({ spentMicros: 2_000_000, capMicros: 5_000_000, reached: false });

    await save(owner.cookie, { "platform.spend_micros": 2_000_000 }, { "platform.spend_micros": 5_000_000 });
    expect((await get(owner.cookie, "/limits/now")).json()).toEqual({ spentMicros: 2_000_000, capMicros: 2_000_000, reached: true });
  });

  it("is the owner's alone", async () => {
    const support = await staffMember("support");
    expect((await get(support.cookie, "/limits/now")).statusCode).toBe(404);
    expect((await get(support.cookie, "/limits/hits")).statusCode).toBe(404);
  });
});

describe("AC-35 GET /limits/hits", () => {
  it("lists each refusal by cap, person and day with its count and whose cap it was", async () => {
    const owner = await staffMember("owner");
    const jo = await activeAccount("jo@example.test");
    await db.updateTable("accounts").set({ display_name: "Jo Alves" }).where("id", "=", jo).execute();
    await recordHit(jo, "cap.turns", "account");
    await recordHit(jo, "cap.turns", "account");
    await recordHit(jo, "platform.spend_micros", "platform");

    const res = await get(owner.cookie, "/limits/hits");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    expect(body.rows.map((row) => ({ ...row, lastAt: typeof row["lastAt"] }))).toEqual([
      { cap: "platform.spend_micros", scope: "platform", day: today, count: 1, lastAt: "string", account: { id: jo, name: "Jo Alves", email: "jo@example.test" } },
      { cap: "cap.turns", scope: "account", day: today, count: 2, lastAt: "string", account: { id: jo, name: "Jo Alves", email: "jo@example.test" } },
    ]);
    expect(Number.isNaN(Date.parse(String(body.rows[0]!["lastAt"])))).toBe(false);
  });

  it("is newest day first, then the latest refusal, and goes back 30 days and no further", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount("a@example.test");
    const b = await activeAccount("b@example.test");
    await hit(a, "cap.photos", "account", 3);
    await hit(b, "cap.turns", "account", 0, 4, "now() - interval '2 hours'");
    await hit(a, "cap.turns", "account", 0, 1, "now() - interval '1 hour'");
    await hit(a, "cap.voice_notes", "account", 30);
    await hit(a, "cap.mail_day", "account", 31);

    const body = (await get(owner.cookie, "/limits/hits")).json() as { rows: Array<{ cap: string; account: { email: string }; count: number }> };
    expect(body.rows.map((row) => [row.account.email, row.cap, row.count])).toEqual([
      ["a@example.test", "cap.turns", 1],
      ["b@example.test", "cap.turns", 4],
      ["a@example.test", "cap.photos", 1],
      ["a@example.test", "cap.voice_notes", 1],
    ]);
  });

  it("pages 50 at a time by a cursor that neither skips nor repeats a row, even when every row has the same moment", async () => {
    const owner = await staffMember("owner");
    // One statement, so one timestamp to the microsecond for all 120: the
    // case a cursor through a JavaScript Date gets wrong.
    const ids: string[] = [];
    for (let n = 0; n < 60; n += 1) ids.push(await activeAccount());
    await sql`
      insert into limit_hits (account_id, cap, scope, day, last_at)
      select id, cap, 'account', (now() at time zone 'UTC')::date, now()
        from accounts, unnest(array['cap.turns', 'cap.photos']) as cap
       where id = any(${ids}::uuid[])`.execute(db);

    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const res = await get(owner.cookie, `/limits/hits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { rows: Array<{ cap: string; account: { id: string } }>; nextCursor: string | null };
      sizes.push(body.rows.length);
      seen.push(...body.rows.map((row) => `${row.account.id} ${row.cap}`));
      cursor = body.nextCursor;
    } while (cursor);

    expect(sizes).toEqual([50, 50, 20]);
    expect(new Set(seen).size).toBe(120);
  });

  it("keeps microseconds in the cursor, so two refusals a few apart stay in order across a page", async () => {
    const owner = await staffMember("owner");
    const ids: string[] = [];
    for (let n = 0; n < 51; n += 1) ids.push(await activeAccount());
    // Each a microsecond after the last: all inside one millisecond.
    for (const [n, id] of ids.entries()) {
      await sql`
        insert into limit_hits (account_id, cap, scope, day, count, last_at)
        values (${id}, 'cap.turns', 'account', (now() at time zone 'UTC')::date, ${n + 1},
                date_trunc('milliseconds', now()) + ${n} * interval '1 microsecond')`.execute(db);
    }
    const first = (await get(owner.cookie, "/limits/hits")).json() as { rows: Array<{ count: number }>; nextCursor: string };
    expect(first.rows.map((row) => row.count)).toEqual(Array.from({ length: 50 }, (_unused, n) => 51 - n));
    const second = (await get(owner.cookie, `/limits/hits?cursor=${encodeURIComponent(first.nextCursor)}`)).json() as { rows: Array<{ count: number }>; nextCursor: string | null };
    expect(second.rows.map((row) => row.count)).toEqual([1]);
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a cursor it did not write, without reading anything with it", async () => {
    const owner = await staffMember("owner");
    for (const bad of ["x", Buffer.from("1.2.3").toString("base64url"), Buffer.from("1.2.not-a-uuid.cap.turns.account").toString("base64url"), Buffer.from("1; drop table limit_hits.2.x.y.z").toString("base64url")]) {
      expect((await get(owner.cookie, `/limits/hits?cursor=${encodeURIComponent(bad)}`)).statusCode, bad).toBe(400);
    }
  });

  it("answers with no rows when nothing has been refused", async () => {
    const owner = await staffMember("owner");
    expect((await get(owner.cookie, "/limits/hits")).json()).toEqual({ rows: [], nextCursor: null });
  });
});

describe("the save, as the page makes it", () => {
  it("AC-29 a cap saved here is the cap the next turn is checked against, with no deploy", async () => {
    const owner = await staffMember("owner");
    const person = await activeAccount();
    await sql`insert into jobs (kind, account_id, payload, state, run_after) values ('dump.answer', ${person}, '{}'::jsonb, 'done', now())`.execute(db);
    await expect(requireBudget(person)).resolves.toBeUndefined();

    expect((await save(owner.cookie, { "cap.turns": 1 }, { "cap.turns": 100 })).statusCode).toBe(200);
    await expect(requireBudget(person)).rejects.toBeInstanceOf(OverBudget);
    const hits = (await get(owner.cookie, "/limits/hits")).json() as { rows: Array<{ cap: string; scope: string; account: { id: string } }> };
    expect(hits.rows).toMatchObject([{ cap: "cap.turns", scope: "account", account: { id: person } }]);
  });

  it("AC-33 names the key and the bounds on a value outside them, and saves none of the save", async () => {
    const owner = await staffMember("owner");
    const res = await save(owner.cookie, { "cap.photos": 50, "cap.turns": 0 }, { "cap.photos": 200, "cap.turns": 100 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "out_of_bounds", key: "cap.turns", min: 1, max: 10_000 });
    const unknown = await save(owner.cookie, { "cap.everything": 1 }, { "cap.everything": 0 });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ error: "unknown_key", key: "cap.everything" });
    expect(settingOf((await get(owner.cookie, "/settings")).json(), "cap.photos").value).toBe(200);
    expect(await auditEntries()).toEqual([]);
  });

  it("AC-33 zero is not off: the platform cap takes null, and refuses 0", async () => {
    const owner = await staffMember("owner");
    expect((await save(owner.cookie, { "platform.spend_micros": 0 }, { "platform.spend_micros": null })).statusCode).toBe(400);
    expect((await save(owner.cookie, { "platform.spend_micros": 3_000_000 }, { "platform.spend_micros": null })).statusCode).toBe(200);
    const off = await save(owner.cookie, { "platform.spend_micros": null }, { "platform.spend_micros": 3_000_000 });
    expect(off.statusCode).toBe(200);
    expect(settingOf(off.json(), "platform.spend_micros").value).toBeNull();
  });

  it("AC-33 marks a stored value of the wrong shape and reads it as the default, and a reset stores the default", async () => {
    const owner = await staffMember("owner");
    await db.insertInto("app_settings").values({ key: "cap.turns", value: JSON.stringify("lots"), updated_by_account_id: null }).execute();
    clearSettingsCache();
    const read = settingOf((await get(owner.cookie, "/settings")).json(), "cap.turns");
    expect(read).toMatchObject({ value: 100, default: 100, malformed: true });

    await save(owner.cookie, { "cap.photos": 50 }, { "cap.photos": 200 });
    const reset = await save(owner.cookie, { "cap.photos": 200 }, { "cap.photos": 50 });
    expect(settingOf(reset.json(), "cap.photos")).toMatchObject({ value: 200, default: 200, malformed: false });
  });

  it("AC-34 refuses a save made against values somebody has since changed, changes nothing, and answers with what is there now", async () => {
    const first = await staffMember("owner");
    const second = await staffMember("owner");
    expect((await save(first.cookie, { "cap.turns": 60 }, { "cap.turns": 100 })).statusCode).toBe(200);

    const late = await save(second.cookie, { "cap.turns": 80, "cap.photos": 10 }, { "cap.turns": 100, "cap.photos": 200 });
    expect(late.statusCode).toBe(409);
    const body = late.json() as { error: string; key: string; settings: Setting[] };
    expect(body).toMatchObject({ error: "conflict", key: "cap.turns" });
    expect(settingOf(body, "cap.turns").value).toBe(60);
    expect(settingOf(body, "cap.photos").value).toBe(200);
    expect((await auditEntries()).map((entry) => entry.setting_key)).toEqual(["cap.turns"]);
  });
});
