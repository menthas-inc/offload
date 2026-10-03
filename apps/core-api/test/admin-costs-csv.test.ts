// 034 AC-28. The Costs export: the daily figures by job and model, with no
// account in the file and no cell a spreadsheet would run as a formula.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { csvCell } from "../src/routes/admin/costs.js";
import { activeAccount, staffMember, wipeAdmin } from "./admin-kit.js";
import { MARK, leaks, seedMarked, wipeMarked } from "./admin-off1-kit.js";

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

const DAY = 86_400_000;
const midnight = (n = 0) => {
  const at = new Date();
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - n));
};
const noon = (n: number) => new Date(midnight(n).getTime() + DAY / 2);
const dayOf = (n = 0) => midnight(n).toISOString().slice(0, 10);

const call = (account: string | null, cost: number, at: Date, job = "dump.answer", model = "claude-sonnet-5", tokens = [0, 0, 0, 0]) =>
  sql`
    insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros, latency_ms, created_at)
    values (${account}, ${job}, 'interactive', ${model}, ${tokens[0]}, ${tokens[1]}, ${tokens[2]}, ${tokens[3]}, ${cost}, 100, ${at})`.execute(db);

const exported = (cookie: string, range = "30d") => app.inject({ method: "GET", url: `/v1/admin/costs/export.csv?range=${range}`, headers: { cookie } });

describe("AC-28 the CSV", () => {
  it("has one row per day, job and model, and sums to the page's total", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount("heavy@example.test");
    await db.updateTable("accounts").set({ display_name: "Owen Pryce" }).where("id", "=", a).execute();
    await call(a, 4_200, new Date(), "dump.answer", "claude-sonnet-5", [1_200, 80, 900, 30]);
    await call(null, 800, new Date(), "dump.answer", "claude-sonnet-5", [300, 20, 0, 0]);
    await call(a, 150, new Date(), "dump.answer", "claude-haiku-5", [10, 5, 0, 0]);
    await call(a, 2_000_000, noon(2), "thread.nightly", "claude-haiku-5", [500, 60, 0, 0]);
    await sql`insert into lookups (account_id, label, kind, outcome, cost_micros, created_at) values (${a}, 'other', 'search', 'used', 10000, ${noon(2)})`.execute(db);
    await call(a, 77, noon(45));

    const response = await exported(owner.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="offload-costs-30d.csv"');

    const lines = response.payload.trimEnd().split("\r\n");
    expect(lines).toEqual([
      "day,job,model,calls,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd",
      `${dayOf(2)},lookup.search,,1,0,0,0,0,0.010000`,
      `${dayOf(2)},thread.nightly,claude-haiku-5,1,500,60,0,0,2.000000`,
      `${dayOf()},dump.answer,claude-haiku-5,1,10,5,0,0,0.000150`,
      `${dayOf()},dump.answer,claude-sonnet-5,2,1500,100,900,30,0.005000`,
    ]);

    const page = await app.inject({ method: "GET", url: "/v1/admin/costs/daily?range=30d", headers: { cookie: owner.cookie } });
    const total = lines.slice(1).reduce((micros, line) => micros + Math.round(Number(line.split(",")[8]) * 1_000_000), 0);
    expect(total).toBe(page.json().totalMicros);
    expect(total).toBe(2_015_150);

    // Nobody is in the file.
    expect(response.payload).not.toContain(a);
    expect(response.payload).not.toContain("heavy@example.test");
    expect(response.payload).not.toContain("Owen Pryce");
    expect(response.payload).not.toContain("account");
  });

  it("is a header and nothing else when the range is empty", async () => {
    const owner = await staffMember("owner");
    const response = await exported(owner.cookie, "7d");
    expect(response.payload).toBe("day,job,model,calls,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd\r\n");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="offload-costs-7d.csv"');
  });

  it("escapes a cell a spreadsheet would run, and quotes one that would break a row", async () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
    expect(csvCell("dump.answer")).toBe("dump.answer");
    expect(csvCell(12)).toBe("12");

    const owner = await staffMember("owner");
    await call(null, 1, new Date(), "=HYPERLINK(1)", "@model");
    await call(null, 1, new Date(), "+job", "-model");
    const lines = (await exported(owner.cookie)).payload.trimEnd().split("\r\n").slice(1);
    expect(lines.map((line) => line.split(",").slice(1, 3))).toEqual([
      ["'+job", "'-model"],
      ["'=HYPERLINK(1)", "'@model"],
    ]);
  });

  it("carries no content and no credential for an account that has both", async () => {
    const marked = await seedMarked();
    const owner = await staffMember("owner");
    const response = await exported(owner.cookie, "90d");
    expect(response.payload).toContain("dump.answer");
    expect(leaks(response.payload, marked)).toEqual([]);
    expect(response.payload).not.toContain(MARK);
    expect(response.payload).not.toContain(marked.accountId);
  });

  it("is refused to support, and to a range it does not know", async () => {
    const support = await staffMember("support");
    expect((await exported(support.cookie)).statusCode).toBe(404);
    const owner = await staffMember("owner");
    expect((await exported(owner.cookie, "1y")).statusCode).toBe(400);
  });
});
