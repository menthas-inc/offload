// 034 AC-57, AC-58 and AC-59. The daily pull: each company's own bill for the
// month, where it has an interface and a key is set, and the fixed amounts an
// owner typed on Limits.
//
// No real puller exists yet: none is written against an interface nobody has
// called. Every pull here is a fake registered by the test, which is the
// whole of what can honestly be tested today: that a figure handed back is
// stored, that a pull that throws loses nothing, and that a pull is handed a
// date range and nothing else.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { JobError } from "../src/jobs/errors.js";
import { claim, fail } from "../src/jobs/queue.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { clearSettingsCache } from "../src/settings.js";
import { PULLERS, pullBilling, registerPuller, type Puller } from "../src/billing/pull.js";
import { startBillingJobs } from "../src/billing/jobs.js";
import { VENDORS } from "../src/billing/vendors.js";

// The repo's .env may hold the real key, and no test calls Railway.
delete process.env["RAILWAY_API_TOKEN"];

await migrate(() => {});

/** An environment variable no real puller reads, and a value that is nobody's. */
const NAME = "FAKE_BILLING_READER";
const MARK = "zzmark-billing-reader-zz";
const NOW = new Date("2026-10-03T09:30:00.000Z");

const undo: Array<() => void> = [];
function register(puller: Puller, name = NAME): void {
  undo.push(registerPuller(name, puller));
}

async function wipe(): Promise<void> {
  await db.deleteFrom("vendor_costs").execute();
  await db.deleteFrom("app_settings").where("key", "=", "costs.fixed").execute();
  await db.deleteFrom("jobs").where("kind", "=", "billing.pull").execute();
  clearSettingsCache();
}

beforeEach(async () => {
  await wipe();
  process.env[NAME] = MARK;
});
afterEach(() => {
  while (undo.length) undo.pop()!();
  delete process.env[NAME];
});
afterAll(async () => {
  await wipe();
  await closeDb();
});

const stored = () =>
  db
    .selectFrom("vendor_costs")
    .select([sql<string>`to_char(month, 'YYYY-MM')`.as("month"), "vendor", "source", "amount_micros", "final", "read_at"])
    .orderBy("vendor")
    .orderBy("month")
    .orderBy("source")
    .execute();

const figures = async () => (await stored()).map((row) => [row.vendor, row.month, row.source, row.amount_micros, row.final]);

async function fixed(map: Record<string, number>): Promise<void> {
  const value = JSON.stringify(map);
  await db
    .insertInto("app_settings")
    .values({ key: "costs.fixed", value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
    .execute();
  clearSettingsCache();
}

describe("the pullers", () => {
  it("are only the ones written against a recorded answer: Railway", () => {
    expect(PULLERS.map((one) => one.puller.vendor)).toEqual(["railway"]);
  });

  it("name companies the table knows", () => {
    const slugs = VENDORS.map((vendor) => vendor.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // The fixed-cost map only takes a slug of this shape (settings.ts).
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(slugs).toEqual(expect.arrayContaining(["anthropic", "assemblyai", "voyage", "google-maps", "google-workspace", "resend", "expo", "railway", "cloudflare", "apple-developer", "google-play"]));
  });
});

describe("AC-57 a pull", () => {
  it("stores what the company answered, as billed, with when it was read", async () => {
    register({
      vendor: "anthropic",
      pull: async () => [
        { month: "2026-09", micros: 41_250_000, final: true },
        { month: "2026-10", micros: 3_100_000, final: false },
      ],
    });
    const before = Date.now();
    await pullBilling(NOW);
    expect(await figures()).toEqual([
      ["anthropic", "2026-09", "billed", 41_250_000, true],
      ["anthropic", "2026-10", "billed", 3_100_000, false],
    ]);
    for (const row of await stored()) expect(row.read_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("replaces a month's figure on the next read, so not final becomes final", async () => {
    let answer = [{ month: "2026-10", micros: 3_100_000, final: false }];
    register({ vendor: "anthropic", pull: async () => answer });
    await pullBilling(NOW);
    answer = [{ month: "2026-10", micros: 9_900_000, final: true }];
    await pullBilling(new Date("2026-11-02T09:30:00.000Z"));
    expect(await figures()).toEqual([["anthropic", "2026-10", "billed", 9_900_000, true]]);
  });

  it("does not run a puller whose key is not set", async () => {
    let called = 0;
    register({ vendor: "railway", pull: async () => ((called += 1), [{ month: "2026-10", micros: 1, final: false }]) }, "FAKE_READER_NOBODY_SET");
    await pullBilling(NOW);
    expect(called).toBe(0);
    expect(await figures()).toEqual([]);
  });

  it("keeps the last figure and its read time when a pull throws, and fails as vendor_error", async () => {
    let broken = false;
    register({
      vendor: "anthropic",
      pull: async () => {
        if (broken) throw new Error(`401 for ${MARK}`);
        return [{ month: "2026-10", micros: 3_100_000, final: false }];
      },
    });
    let other = 0;
    register({ vendor: "railway", pull: async () => ((other += 1), [{ month: "2026-10", micros: 7_000_000, final: false }]) });
    await pullBilling(NOW);
    const first = (await stored()).find((row) => row.vendor === "anthropic")!;

    broken = true;
    const error = await pullBilling(new Date("2026-10-04T09:30:00.000Z")).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JobError);
    expect((error as JobError).code).toBe("vendor_error");
    // The message names the company and carries nothing the pull said.
    expect((error as JobError).message).toContain("anthropic");
    expect((error as JobError).message).not.toContain(MARK);

    const after = (await stored()).find((row) => row.vendor === "anthropic")!;
    expect(after.amount_micros).toBe(3_100_000);
    expect(after.read_at.getTime()).toBe(first.read_at.getTime());
    // One company failing does not stop the next.
    expect(other).toBe(2);
  });

  it("refuses an answer that is not a month and a whole amount, and keeps the last figure", async () => {
    let answer: Array<{ month: string; micros: number; final: boolean }> = [{ month: "2026-10", micros: 3_100_000, final: false }];
    register({ vendor: "anthropic", pull: async () => answer });
    await pullBilling(NOW);
    for (const bad of [{ month: "October", micros: 1, final: false }, { month: "2026-10", micros: 1.5, final: false }, { month: "2026-10", micros: -1, final: false }]) {
      answer = [bad];
      await expect(pullBilling(NOW)).rejects.toBeInstanceOf(JobError);
    }
    expect(await figures()).toEqual([["anthropic", "2026-10", "billed", 3_100_000, false]]);
  });
});

describe("AC-59 what a pull is handed", () => {
  it("is a date range and nothing else: last month's first day to now", async () => {
    const seen: unknown[][] = [];
    register({
      vendor: "anthropic",
      pull: async (...args: unknown[]) => {
        seen.push(args);
        return [];
      },
    } as Puller);
    await pullBilling(NOW);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(2);
    expect(seen[0]![0]).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(seen[0]![1]).toEqual(NOW);
  });
});

describe("AC-58 fixed amounts", () => {
  it("are written for the month the job runs in, with nothing registered", async () => {
    await fixed({ resend: 20_000_000, expo: 99_000_000 });
    await pullBilling(NOW);
    expect(await figures()).toEqual([
      ["expo", "2026-10", "fixed", 99_000_000, false],
      ["resend", "2026-10", "fixed", 20_000_000, false],
    ]);
  });

  it("apply from the month they were set in, never backwards", async () => {
    await fixed({ resend: 20_000_000 });
    await pullBilling(new Date("2026-09-28T09:30:00.000Z"));
    await fixed({ resend: 35_000_000 });
    await pullBilling(NOW);
    await pullBilling(new Date("2026-10-04T09:30:00.000Z"));
    expect(await figures()).toEqual([
      ["resend", "2026-09", "fixed", 20_000_000, false],
      ["resend", "2026-10", "fixed", 35_000_000, false],
    ]);
  });

  it("stop from the month an amount was taken away, and the months before keep theirs", async () => {
    await fixed({ resend: 20_000_000 });
    await pullBilling(new Date("2026-09-28T09:30:00.000Z"));
    await pullBilling(NOW);
    await fixed({});
    await pullBilling(new Date("2026-10-04T09:30:00.000Z"));
    expect(await figures()).toEqual([["resend", "2026-09", "fixed", 20_000_000, false]]);
  });

  it("are still written when a pull fails", async () => {
    await fixed({ resend: 20_000_000 });
    register({
      vendor: "anthropic",
      pull: async () => {
        throw new Error("down");
      },
    });
    await expect(pullBilling(NOW)).rejects.toBeInstanceOf(JobError);
    expect(await figures()).toEqual([["resend", "2026-10", "fixed", 20_000_000, false]]);
  });
});

describe("billing.pull, the job", () => {
  const run = () => handlers["billing.pull"]!({}, { mailer: new MemoryMailer() }, null);
  const queued = () => db.selectFrom("jobs").select(["idempotency_key", "state", "error_code", "last_error"]).where("kind", "=", "billing.pull").orderBy("run_after").execute();

  it("is started at boot for today, once however often it is called", async () => {
    await startBillingJobs();
    await startBillingJobs();
    const today = new Date().toISOString().slice(0, 10);
    expect((await queued()).map((job) => job.idempotency_key)).toEqual([`billing.pull:${today}`]);
  });

  it("books tomorrow's run before it does the work, so a failure does not end the chain", async () => {
    register({
      vendor: "anthropic",
      pull: async () => {
        throw new Error("down");
      },
    });
    await expect(run()).rejects.toBeInstanceOf(JobError);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await queued()).map((job) => job.idempotency_key)).toEqual([`billing.pull:${tomorrow}`]);
  });

  it("records a failed pull on its row as vendor_error, with nothing the pull said kept", async () => {
    register({
      vendor: "anthropic",
      pull: async () => {
        throw new Error(`401 for ${MARK}`);
      },
    });
    await startBillingJobs();
    const job = (await claim("test-billing", ["billing.pull"]))!;
    expect(job).toBeDefined();
    const error = await run().catch((caught: unknown) => caught);
    await fail(job, error);
    const row = (await queued()).find((one) => one.error_code !== null)!;
    expect(row.error_code).toBe("vendor_error");
    expect(row.last_error).not.toContain(MARK);
  });
});
