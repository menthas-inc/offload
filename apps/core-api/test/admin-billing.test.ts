// 034 AC-56 to AC-59. What offload really costs: one row per company a
// month, each saying where its number came from, a total per month, and the
// month in progress marked not final.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { clearSettingsCache } from "../src/settings.js";
import { JobError } from "../src/jobs/errors.js";
import { pullBilling, registerPuller } from "../src/billing/pull.js";
import { VENDORS } from "../src/billing/vendors.js";
import { adminRoutesOf, auditEntries, fill, staffMember, wipeAdmin } from "./admin-kit.js";

// The repo's .env may hold the real key, and no test calls Railway.
delete process.env["RAILWAY_API_TOKEN"];

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

const month = (back = 0): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 7);
};
/** A moment inside a month, clear of both its edges. */
const inside = (back: number): string => `${month(back)}-01T12:00:00.000Z`;

interface Row {
  vendor: string;
  name: string;
  source: "billed" | "metered" | "fixed";
  micros: number;
  metered?: number;
  difference?: number;
  readAt?: string;
  final: boolean;
  recorded: boolean;
}
interface Month {
  month: string;
  final: boolean;
  total: number;
  rows: Row[];
}

async function read(cookie: string, query = ""): Promise<Month[]> {
  const res = await app.inject({ method: "GET", url: `/v1/admin/billing${query}`, headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res.json().months as Month[];
}

const rowOf = (months: Month[], at: string, slug: string): Row => months.find((one) => one.month === at)!.rows.find((row) => row.vendor === slug)!;

async function model(accountId: string, name: string, micros: number, at: string): Promise<void> {
  await sql`
    insert into llm_usage (account_id, job_kind, category, model, cost_micros, created_at)
    values (${accountId}, 'dump.answer', 'interactive', ${name}, ${micros}, ${at})`.execute(db);
}

async function lookup(accountId: string, kind: "search" | "read", micros: number, at: string): Promise<void> {
  await sql`
    insert into lookups (account_id, label, kind, outcome, cost_micros, created_at)
    values (${accountId}, ${kind}, ${kind}, 'used', ${micros}, ${at})`.execute(db);
}

async function cost(vendor: string, at: string, source: "billed" | "fixed", micros: number, final: boolean, readAt = "2026-10-01T06:00:00.000Z"): Promise<void> {
  await sql`
    insert into vendor_costs (vendor, month, source, amount_micros, final, read_at)
    values (${vendor}, ${`${at}-01`}, ${source}, ${micros}, ${final}, ${readAt})`.execute(db);
}

async function fixed(map: Record<string, number>): Promise<void> {
  await db.insertInto("app_settings").values({ key: "costs.fixed", value: JSON.stringify(map) }).execute();
  clearSettingsCache();
}

describe("AC-56 the table", () => {
  it("has twelve months, oldest first, one row per company in each, and only the last is not final", async () => {
    const owner = await staffMember("owner");
    const months = await read(owner.cookie);
    expect(months.map((one) => one.month)).toEqual(Array.from({ length: 12 }, (_, index) => month(11 - index)));
    expect(months.map((one) => one.final)).toEqual([...Array.from({ length: 11 }, () => true), false]);
    for (const one of months) {
      expect(one.rows.map((row) => row.vendor)).toEqual(VENDORS.map((vendor) => vendor.slug));
      expect(one.rows.map((row) => row.name)).toEqual(VENDORS.map((vendor) => vendor.name));
    }
    expect((await read(owner.cookie, "?months=3")).map((one) => one.month)).toEqual([month(2), month(1), month(0)]);
  });

  it("lists a company with nothing recorded and no amount as metered and not recorded", async () => {
    const owner = await staffMember("owner");
    const months = await read(owner.cookie, "?months=1");
    expect(months[0]!.total).toBe(0);
    for (const row of months[0]!.rows) {
      expect(row).toEqual({ vendor: row.vendor, name: row.name, source: "metered", micros: 0, final: false, recorded: false });
    }
  });

  it("meters from the ledger by UTC month: the model with its searches and reads, and transcription apart", async () => {
    const owner = await staffMember("owner");
    await model(owner.id, "claude-sonnet-5", 4_000_000, inside(0));
    await model(owner.id, "claude-haiku-4-5", 500_000, inside(0));
    await model(owner.id, "assemblyai", 250_000, inside(0));
    await lookup(owner.id, "search", 30_000, inside(0));
    await lookup(owner.id, "read", 20_000, inside(0));
    await model(owner.id, "claude-sonnet-5", 9_000_000, inside(1));
    // The last second of a month is that month's, by UTC.
    await model(owner.id, "assemblyai", 70_000, `${new Date(Date.parse(`${month(0)}-01T00:00:00.000Z`) - 1000).toISOString()}`);

    const months = await read(owner.cookie, "?months=2");
    expect(rowOf(months, month(0), "anthropic")).toEqual({ vendor: "anthropic", name: "Anthropic", source: "metered", micros: 4_550_000, final: false, recorded: true });
    expect(rowOf(months, month(0), "assemblyai")).toMatchObject({ source: "metered", micros: 250_000, recorded: true });
    expect(rowOf(months, month(1), "anthropic")).toMatchObject({ source: "metered", micros: 9_000_000, final: true, recorded: true });
    expect(rowOf(months, month(1), "assemblyai")).toMatchObject({ micros: 70_000, recorded: true });
    expect(months.map((one) => one.total)).toEqual([9_070_000, 4_800_000]);
  });

  it("totals a month as the sum of its rows, whatever their source", async () => {
    const owner = await staffMember("owner");
    await model(owner.id, "assemblyai", 250_000, inside(1));
    await cost("anthropic", month(1), "billed", 41_250_000, true);
    await cost("resend", month(1), "fixed", 20_000_000, false);
    const [last] = await read(owner.cookie, "?months=2");
    expect(last!.total).toBe(61_500_000);
    expect(last!.total).toBe(last!.rows.reduce((sum, row) => sum + row.micros, 0));
  });
});

describe("AC-57 and AC-58 billed beside metered", () => {
  it("shows the bill, the ledger's figure, the difference and when the bill was read", async () => {
    const owner = await staffMember("owner");
    await model(owner.id, "claude-sonnet-5", 40_000_000, inside(1));
    await cost("anthropic", month(1), "billed", 41_250_000, true, "2026-10-02T06:00:00.000Z");
    const months = await read(owner.cookie, "?months=2");
    expect(rowOf(months, month(1), "anthropic")).toEqual({
      vendor: "anthropic",
      name: "Anthropic",
      source: "billed",
      micros: 41_250_000,
      metered: 40_000_000,
      difference: 1_250_000,
      readAt: "2026-10-02T06:00:00.000Z",
      final: true,
      recorded: true,
    });
  });

  it("shows a bill with no ledger figure alone, and a bill the company has not closed as not final", async () => {
    const owner = await staffMember("owner");
    await cost("railway", month(1), "billed", 12_000_000, false);
    await cost("railway", month(0), "billed", 1_000_000, true);
    const months = await read(owner.cookie, "?months=2");
    const last = rowOf(months, month(1), "railway");
    expect(last).toMatchObject({ source: "billed", micros: 12_000_000, final: false, recorded: true });
    expect(last.metered).toBeUndefined();
    expect(last.difference).toBeUndefined();
    // The month in progress is never final, whatever the company said.
    expect(rowOf(months, month(0), "railway").final).toBe(false);
  });

  it("is what a pull stored, and stays when the next pull fails", async () => {
    const owner = await staffMember("owner");
    process.env["FAKE_BILLING_READER"] = "set";
    let broken = false;
    const undo = registerPuller("FAKE_BILLING_READER", {
      vendor: "anthropic",
      pull: async () => {
        if (broken) throw new Error("down");
        return [{ month: month(0), micros: 3_100_000, final: false }];
      },
    });
    try {
      await pullBilling();
      const first = rowOf(await read(owner.cookie, "?months=1"), month(0), "anthropic");
      expect(first).toMatchObject({ source: "billed", micros: 3_100_000 });
      broken = true;
      await expect(pullBilling()).rejects.toBeInstanceOf(JobError);
      expect(rowOf(await read(owner.cookie, "?months=1"), month(0), "anthropic")).toEqual(first);
    } finally {
      undo();
      delete process.env["FAKE_BILLING_READER"];
    }
  });
});

describe("AC-58 fixed amounts", () => {
  it("are this month's as Limits has them now, and each earlier month's as it was charged", async () => {
    const owner = await staffMember("owner");
    await fixed({ resend: 35_000_000 });
    await cost("resend", month(1), "fixed", 20_000_000, false);
    // Stale: the daily job has not run since the amount changed.
    await cost("resend", month(0), "fixed", 20_000_000, false);
    const months = await read(owner.cookie, "?months=3");
    expect(rowOf(months, month(0), "resend")).toMatchObject({ source: "fixed", micros: 35_000_000, final: false, recorded: true });
    expect(rowOf(months, month(1), "resend")).toMatchObject({ source: "fixed", micros: 20_000_000, final: true, recorded: true });
    // Never backwards: a month before it was set has nothing.
    expect(rowOf(months, month(2), "resend")).toMatchObject({ source: "metered", micros: 0, recorded: false });
  });

  it("list a company the table does not know under its slug", async () => {
    const owner = await staffMember("owner");
    await fixed({ "status-page": 9_000_000 });
    const [now] = await read(owner.cookie, "?months=1");
    expect(now!.rows.at(-1)).toMatchObject({ vendor: "status-page", name: "status-page", source: "fixed", micros: 9_000_000 });
  });
});

describe("the route", () => {
  it("is the owner's: support is told there is nothing there", async () => {
    const support = await staffMember("support");
    const res = await app.inject({ method: "GET", url: "/v1/admin/billing", headers: { cookie: support.cookie } });
    expect(res.statusCode).toBe(404);
  });

  it("refuses a range it does not offer", async () => {
    const owner = await staffMember("owner");
    for (const query of ["?months=0", "?months=37", "?months=abc"]) {
      const res = await app.inject({ method: "GET", url: `/v1/admin/billing${query}`, headers: { cookie: owner.cookie } });
      expect(res.statusCode, query).toBe(400);
    }
  });

  it("writes nothing: no audit entry, no row", async () => {
    const owner = await staffMember("owner");
    await fixed({ resend: 35_000_000 });
    await read(owner.cookie);
    expect(await auditEntries()).toEqual([]);
    expect(await db.selectFrom("vendor_costs").select("vendor").execute()).toEqual([]);
  });
});

describe("AC-59 a billing key", () => {
  const NAMES = ["ANTHROPIC_ADMIN_KEY", "RAILWAY_API_TOKEN", "CLOUDFLARE_BILLING_TOKEN", "FAKE_BILLING_READER"];
  const MARK = "zzmark-billing-reader-zz";
  const before = new Map(NAMES.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    for (const name of NAMES) process.env[name] = `${MARK}-${name.toLowerCase()}`;
  });
  afterEach(() => {
    for (const name of NAMES) {
      const was = before.get(name);
      if (was === undefined) delete process.env[name];
      else process.env[name] = was;
    }
  });

  it("is in no admin response, after a pull that worked and one that threw it back", async () => {
    const owner = await staffMember("owner");
    await fixed({ resend: 35_000_000 });
    const undo = [
      registerPuller("ANTHROPIC_ADMIN_KEY", { vendor: "anthropic", pull: async () => [{ month: month(0), micros: 3_100_000, final: false }] }),
      registerPuller("FAKE_BILLING_READER", {
        vendor: "railway",
        pull: async () => {
          throw new Error(`401 Unauthorized: ${process.env["FAKE_BILLING_READER"]}`);
        },
      }),
    ];
    try {
      const error = await pullBilling().catch((caught: unknown) => caught);
      expect(String((error as Error).message)).not.toContain(MARK);
    } finally {
      for (const one of undo) one();
    }

    const reads = adminRoutesOf(app).filter((route) => route.method === "GET");
    expect(reads.map((route) => route.url)).toContain("/v1/admin/billing");
    for (const route of reads) {
      for (const query of ["", "?months=12", "?range=90d"]) {
        const url = `${fill(route.url, { id: owner.id })}${query}`;
        const res = await app.inject({ method: "GET", url, headers: { cookie: owner.cookie } });
        expect(res.statusCode, url).toBeLessThan(500);
        expect(res.payload, url).not.toContain(MARK);
        expect(JSON.stringify(res.headers), url).not.toContain(MARK);
      }
    }
    // The pull did land, so the walk read a billed row and not an empty table.
    expect(rowOf(await read(owner.cookie, "?months=1"), month(0), "anthropic").source).toBe("billed");
  });
});
