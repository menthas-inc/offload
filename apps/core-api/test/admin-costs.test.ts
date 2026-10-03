// 034 AC-24 to AC-28. Costs: what the ledger says offload spent, read live.
//
// Money is `llm_usage.cost_micros` plus `lookups.cost_micros`. A row whose
// account has gone still counts in every total and never appears beside a
// person. Every figure here is seeded relative to today, in UTC, because the
// routes read the database's own clock.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { clearSettingsCache } from "../src/settings.js";
import { onPace } from "../src/routes/admin/costs.js";
import { uuidv7 } from "../src/uuid.js";
import { activeAccount, staffMember, wipeAdmin } from "./admin-kit.js";
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

const DAY = 86_400_000;
const now = () => new Date();
/** Midnight UTC, `n` days before today. */
const midnight = (n = 0) => {
  const at = now();
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - n));
};
/** Noon UTC, `n` days before today. Never today: noon may not have come. */
const noon = (n: number) => new Date(midnight(n).getTime() + DAY / 2);

interface Call {
  account: string | null;
  cost: number;
  at?: Date;
  job?: string;
  model?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const call = (row: Call) =>
  sql`
    insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros, latency_ms, created_at)
    values (${row.account}, ${row.job ?? "dump.answer"}, 'interactive', ${row.model ?? "claude-sonnet-5"}, ${row.input ?? 0}, ${row.output ?? 0},
            ${row.cacheRead ?? 0}, ${row.cacheWrite ?? 0}, ${row.cost}, 100, ${row.at ?? now()})`.execute(db);

const lookup = (row: { account: string | null; cost: number; kind?: "search" | "read"; at?: Date }) =>
  sql`
    insert into lookups (account_id, label, kind, outcome, cost_micros, created_at)
    values (${row.account}, 'other', ${row.kind ?? "search"}, 'used', ${row.cost}, ${row.at ?? now()})`.execute(db);

const get = async (cookie: string, path: string) => {
  const response = await app.inject({ method: "GET", url: `/v1/admin/costs${path}`, headers: { cookie } });
  expect(response.statusCode, path).toBe(200);
  return response;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("AC-24 the stats row", () => {
  it("matches the ledger for the month, with search fees and rows that have no account", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount();
    await activeAccount();
    // Waiting, so never signed in, so not one of the accounts spend is shared over.
    await db.insertInto("accounts").values({ email: "w@example.test", state: "waitlist" }).execute();
    // Let in and never signed in: People does not list them, so they are not
    // one of the accounts here either. One definition, in `accounts/active.ts`.
    await db.insertInto("accounts").values({ email: "never@example.test", state: "active" }).execute();
    const people = (await app.inject({ method: "GET", url: "/v1/admin/people/stats", headers: { cookie: owner.cookie } })).json();
    expect(people.accounts).toBe(3);

    const lastMonth = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth() - 1, 15, 12));
    const before = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth() - 2, 15, 12));
    await call({ account: a, cost: 4_000_000 });
    await call({ account: null, cost: 1_000_000, job: "thread.nightly" });
    await lookup({ account: a, cost: 500_000 });
    await call({ account: a, cost: 2_000_000, at: lastMonth });
    await lookup({ account: null, cost: 250_000, at: lastMonth });
    await call({ account: a, cost: 9_000_000, at: before });

    const body = (await get(owner.cookie, "/summary")).json();
    const day = now().getUTCDate();
    const days = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth() + 1, 0)).getUTCDate();
    expect(body).toEqual({
      monthStart: new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1)).toISOString(),
      monthMicros: 5_500_000,
      lastMonthMicros: 2_250_000,
      accounts: 3,
      perAccountMicros: 1_833_333,
      tooEarly: day <= 2,
      onPaceMicros: day <= 2 ? null : Math.round((5_500_000 / day) * days),
      budgetMicros: null,
      platformCapMicros: null,
    });
  });

  it("carries the monthly budget and the platform cap once an owner has set them", async () => {
    const owner = await staffMember("owner");
    await db
      .insertInto("app_settings")
      .values([
        { key: "budget.month_micros", value: "250000000", updated_by_account_id: null },
        { key: "platform.spend_micros", value: "40000000", updated_by_account_id: null },
      ])
      .execute();
    clearSettingsCache();
    const body = (await get(owner.cookie, "/summary")).json();
    expect(body.budgetMicros).toBe(250_000_000);
    expect(body.platformCapMicros).toBe(40_000_000);
    expect(body.monthMicros).toBe(0);
  });

  it("says too early in the first two days of a month, and a pace after", () => {
    expect(onPace(3_000_000, 1, 30)).toEqual({ tooEarly: true, onPaceMicros: null });
    expect(onPace(3_000_000, 2, 30)).toEqual({ tooEarly: true, onPaceMicros: null });
    expect(onPace(3_000_000, 3, 30)).toEqual({ tooEarly: false, onPaceMicros: 30_000_000 });
    expect(onPace(0, 20, 31)).toEqual({ tooEarly: false, onPaceMicros: 0 });
  });

  it("is refused to support", async () => {
    const support = await staffMember("support");
    const response = await app.inject({ method: "GET", url: "/v1/admin/costs/summary", headers: { cookie: support.cookie } });
    expect(response.statusCode).toBe(404);
  });
});

describe("daily spend", () => {
  it("returns one point per UTC day, zero on a day with nothing, and marks a day the platform cap was reached", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount();
    await call({ account: a, cost: 300 });
    await lookup({ account: null, cost: 50 });
    await call({ account: a, cost: 1_000, at: noon(2) });
    await call({ account: a, cost: 7_000, at: noon(40) });
    await sql`insert into limit_hits (account_id, cap, scope, day) values (${a}, 'platform.spend_micros', 'platform', ${noon(2)}::date)`.execute(db);
    // The person's own cap is not the platform's.
    await sql`insert into limit_hits (account_id, cap, scope, day) values (${a}, 'cap.turns', 'account', ${noon(5)}::date)`.execute(db);

    const body = (await get(owner.cookie, "/daily?range=30d")).json();
    expect(body.unit).toBe("day");
    expect(body.points).toHaveLength(30);
    expect(body.points[0].at).toBe(midnight(29).toISOString());
    expect(body.points[29]).toEqual({ at: midnight().toISOString(), micros: 350, calls: 2, capReached: false });
    expect(body.points[27]).toEqual({ at: midnight(2).toISOString(), micros: 1_000, calls: 1, capReached: true });
    expect(body.points[24]).toEqual({ at: midnight(5).toISOString(), micros: 0, calls: 0, capReached: false });
    expect(body.totalMicros).toBe(1_350);
    expect(body.totalCalls).toBe(3);

    const wide = (await get(owner.cookie, "/daily?range=90d")).json();
    expect(wide.points).toHaveLength(90);
    expect(wide.totalMicros).toBe(8_350);
    expect(wide.points[49]).toMatchObject({ at: midnight(40).toISOString(), micros: 7_000 });
  });

  it("returns hourly points for 24 hours, and 30 days for a range it was not given", async () => {
    const owner = await staffMember("owner");
    await call({ account: null, cost: 42 });
    const body = (await get(owner.cookie, "/daily?range=24h")).json();
    expect(body.unit).toBe("hour");
    expect(body.points).toHaveLength(24);
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    // The hour may have turned between the insert and the read.
    expect(sum(body.points.slice(22).map((point: { micros: number }) => point.micros))).toBe(42);
    expect(new Date(body.points[23].at).getTime()).toBeGreaterThanOrEqual(hour.getTime());

    expect((await get(owner.cookie, "/daily")).json().points).toHaveLength(30);
    const bad = await app.inject({ method: "GET", url: "/v1/admin/costs/daily?range=1y", headers: { cookie: owner.cookie } });
    expect(bad.statusCode).toBe(400);
  });
});

describe("AC-25 where it goes", () => {
  it("sums to the range's total by job, by model and by vendor", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount();
    await call({ account: a, cost: 4_000 });
    await call({ account: a, cost: 600, model: "claude-haiku-5", at: noon(3) });
    await call({ account: null, cost: 2_000, job: "thread.nightly", at: noon(1) });
    await call({ account: a, cost: 900, model: "assemblyai" });
    await call({ account: a, cost: 70, job: "mystery.kind" });
    await lookup({ account: a, cost: 500 });
    await lookup({ account: null, cost: 30, kind: "read", at: noon(4) });
    // Outside the range.
    await call({ account: a, cost: 1_000_000, at: noon(45) });

    const total = (await get(owner.cookie, "/daily?range=30d")).json();
    expect(total.totalMicros).toBe(8_100);
    expect(total.totalCalls).toBe(7);

    for (const dim of ["job", "model", "vendor"]) {
      const body = (await get(owner.cookie, `/by?dim=${dim}&range=30d`)).json();
      const recorded = body.rows.filter((row: { recorded: boolean }) => row.recorded);
      expect(body.totalMicros, dim).toBe(8_100);
      expect(body.totalCalls, dim).toBe(7);
      expect(sum(recorded.map((row: { micros: number }) => row.micros)), dim).toBe(8_100);
      expect(sum(recorded.map((row: { calls: number }) => row.calls)), dim).toBe(7);
    }

    const byJob = (await get(owner.cookie, "/by?dim=job&range=30d")).json();
    expect(byJob.rows).toEqual([
      { key: "dump.answer", name: "Filing and answering", recorded: true, micros: 5_500, calls: 3 },
      { key: "thread.nightly", name: "Nightly pass", recorded: true, micros: 2_000, calls: 1 },
      { key: "lookup.search", name: "Web search", recorded: true, micros: 500, calls: 1 },
      // A kind the panel has no name for shows its kind.
      { key: "mystery.kind", name: "mystery.kind", recorded: true, micros: 70, calls: 1 },
      { key: "lookup.read", name: "Reading links", recorded: true, micros: 30, calls: 1 },
    ]);

    const byModel = (await get(owner.cookie, "/by?dim=model&range=30d")).json();
    expect(byModel.rows.map((row: { key: string; micros: number }) => [row.key, row.micros])).toEqual([
      ["claude-sonnet-5", 6_070],
      ["assemblyai", 900],
      ["claude-haiku-5", 600],
      ["lookup.search", 500],
      ["lookup.read", 30],
    ]);

    // By job is what the page asks for when it is not told.
    expect((await get(owner.cookie, "/by?range=30d")).json().dim).toBe("job");
  });

  it("derives the vendor, and says not recorded for one the ledger never hears from", async () => {
    const owner = await staffMember("owner");
    await call({ account: null, cost: 4_000 });
    await call({ account: null, cost: 900, model: "assemblyai" });
    await lookup({ account: null, cost: 500 });

    const body = (await get(owner.cookie, "/by?dim=vendor&range=7d")).json();
    expect(body.rows).toEqual([
      { key: "model", name: "The model", recorded: true, micros: 4_000, calls: 1 },
      { key: "transcription", name: "Transcription", recorded: true, micros: 900, calls: 1 },
      { key: "search", name: "Web search", recorded: true, micros: 500, calls: 1 },
      // Recorded, and nothing in the range: a real zero.
      { key: "reads", name: "Reading links", recorded: true, micros: 0, calls: 0 },
      // Never a zero: nothing writes a ledger row for these.
      { key: "embeddings", name: "Embeddings", recorded: false, micros: null, calls: null },
      { key: "maps", name: "Maps", recorded: false, micros: null, calls: null },
    ]);
  });
});

describe("AC-26 trends", () => {
  it("returns one point per UTC day for every series, zero on a day with nothing", async () => {
    const owner = await staffMember("owner");
    await call({ account: null, cost: 4_000, input: 1_200, output: 80, cacheRead: 900, cacheWrite: 30 });
    await call({ account: null, cost: 1_000, input: 100, output: 10, at: noon(3) });
    await call({ account: null, cost: 2_000, job: "thread.nightly", model: "claude-haiku-5", input: 500, output: 60, at: noon(3) });
    await lookup({ account: null, cost: 10, at: noon(3) });

    const body = (await get(owner.cookie, "/trends?dim=job&range=7d")).json();
    expect(body.unit).toBe("day");
    expect(body.dim).toBe("job");
    expect(body.series.map((series: { key: string; name: string }) => [series.key, series.name])).toEqual([
      ["dump.answer", "Filing and answering"],
      ["thread.nightly", "Nightly pass"],
      ["lookup.search", "Web search"],
    ]);
    for (const series of [body.total, ...body.series]) {
      expect(series.points, series.key).toHaveLength(7);
      expect(series.points[0].at).toBe(midnight(6).toISOString());
      expect(series.points[1]).toEqual({ at: midnight(5).toISOString(), micros: 0, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    }
    expect(body.total.points[3]).toEqual({ at: midnight(3).toISOString(), micros: 3_010, calls: 3, input: 600, output: 70, cacheRead: 0, cacheWrite: 0 });
    expect(body.total.points[6]).toEqual({ at: midnight().toISOString(), micros: 4_000, calls: 1, input: 1_200, output: 80, cacheRead: 900, cacheWrite: 30 });
    expect(body.series[0].points[3]).toMatchObject({ micros: 1_000, calls: 1, input: 100, output: 10 });
    expect(body.series[1].points[3]).toMatchObject({ micros: 2_000, calls: 1, input: 500, output: 60 });
    expect(body.series[1].points[6]).toMatchObject({ micros: 0, calls: 0 });

    const byModel = (await get(owner.cookie, "/trends?dim=model&range=7d")).json();
    expect(byModel.series.map((series: { key: string }) => series.key)).toEqual(["claude-sonnet-5", "claude-haiku-5", "lookup.search"]);
    expect(byModel.series[1].points[3]).toMatchObject({ micros: 2_000, input: 500 });

    const hourly = (await get(owner.cookie, "/trends?dim=job&range=24h")).json();
    expect(hourly.unit).toBe("hour");
    expect(hourly.total.points).toHaveLength(24);
  });

  it("keeps the few that cost most, and still has a total with nothing in the ledger", async () => {
    const owner = await staffMember("owner");
    const empty = (await get(owner.cookie, "/trends?dim=job&range=7d")).json();
    expect(empty.series).toEqual([]);
    expect(empty.total.points).toHaveLength(7);

    for (const [index, job] of ["a", "b", "c", "d", "e", "f"].entries()) await call({ account: null, cost: 100 - index, job });
    const body = (await get(owner.cookie, "/trends?dim=job&range=7d")).json();
    expect(body.series.map((series: { key: string }) => series.key)).toEqual(["a", "b", "c", "d"]);
    expect(body.total.points[6].micros).toBe(585);
  });
});

describe("usage", () => {
  it("counts accounts active, turns, photos, voice notes and mail in per day", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount();
    const b = await activeAccount();
    const turn = (account: string, at: Date) =>
      sql`insert into jobs (kind, account_id, payload, state, run_after, created_at) values ('dump.answer', ${account}, '{}'::jsonb, 'done', ${at}, ${at})`.execute(db);
    await turn(a, noon(1));
    await turn(a, noon(1));
    await turn(b, noon(1));
    await turn(b, noon(3));
    // Another kind of job is not a turn.
    await sql`insert into jobs (kind, account_id, payload, state, run_after, created_at) values ('thread.nightly', ${a}, '{}'::jsonb, 'done', ${noon(1)}, ${noon(1)})`.execute(db);
    // Past the thirty days jobs are kept, who was active comes from the ledger.
    await call({ account: a, cost: 1, at: noon(50) });
    await call({ account: a, cost: 1, at: noon(50) });
    await call({ account: b, cost: 1, at: noon(50) });
    await call({ account: null, cost: 1, at: noon(50) });
    await call({ account: b, cost: 1, job: "thread.nightly", at: noon(51) });

    const blob = (kind: "image" | "audio", at: Date) =>
      kind === "image"
        ? sql`insert into blobs (account_id, client_key, content_type, byte_size, width, height, sha256, created_at)
              values (${a}, ${uuidv7()}, 'image/jpeg', 10, 4, 4, ${Buffer.alloc(32)}, ${at})`.execute(db)
        : sql`insert into blobs (account_id, client_key, content_type, byte_size, kind, duration_ms, sha256, created_at)
              values (${a}, ${uuidv7()}, 'audio/mp4', 10, 'audio', 4000, ${Buffer.alloc(32)}, ${at})`.execute(db);
    await blob("image", noon(1));
    await blob("image", noon(1));
    await blob("audio", noon(1));
    const conversation = (
      await sql<{ id: string }>`insert into conversations (account_id, title) values (${a}, 'x') returning id`.execute(db)
    ).rows[0]!.id;
    const message = (source: string, at: Date) =>
      sql`insert into messages (conversation_id, account_id, role, type, turn_id, text, state, source, created_at)
          values (${conversation}, ${a}, 'person', 'text', ${uuidv7()}, 'x', 'seen', ${source}, ${at})`.execute(db);
    await message("mail", noon(1));
    await message("mail", noon(1));
    await message("mail", noon(1));
    await message("person", noon(1));

    const body = (await get(owner.cookie, "/usage?range=7d")).json();
    expect(body.unit).toBe("day");
    expect(body.points).toHaveLength(7);
    expect(body.points[5]).toEqual({ at: midnight(1).toISOString(), accounts: 2, turns: 3, photos: 2, voiceNotes: 1, mailIn: 3 });
    expect(body.points[3]).toEqual({ at: midnight(3).toISOString(), accounts: 1, turns: 1, photos: 0, voiceNotes: 0, mailIn: 0 });
    expect(body.points[4]).toEqual({ at: midnight(2).toISOString(), accounts: 0, turns: 0, photos: 0, voiceNotes: 0, mailIn: 0 });
    // Inside the thirty days, nothing is missing.
    expect(body.turnsFrom).toBeNull();

    const wide = (await get(owner.cookie, "/usage?range=90d")).json();
    expect(wide.points).toHaveLength(90);
    expect(wide.points[39]).toMatchObject({ at: midnight(50).toISOString(), accounts: 2, turns: 0 });
    expect(wide.points[38]).toMatchObject({ at: midnight(51).toISOString(), accounts: 0 });
    expect(wide.points[88]).toMatchObject({ accounts: 2, turns: 3 });
    expect(wide.turnsFrom).toBe(midnight(29).toISOString());
  });
});

describe("AC-27 heaviest accounts", () => {
  it("orders accounts by spend in the range, and leaves out a row with nobody attached", async () => {
    const owner = await staffMember("owner");
    const a = await activeAccount("a@example.test");
    const b = await activeAccount("b@example.test");
    const c = await activeAccount("c@example.test");
    await db.updateTable("accounts").set({ display_name: "Bea Lindqvist" }).where("id", "=", b).execute();
    await call({ account: a, cost: 300 });
    await call({ account: b, cost: 200, at: noon(2) });
    await lookup({ account: b, cost: 250 });
    await call({ account: c, cost: 100 });
    // The most of all, by nobody.
    await call({ account: null, cost: 99_000 });
    // The most of all, outside the range.
    await call({ account: c, cost: 50_000, at: noon(20) });

    const body = (await get(owner.cookie, "/heaviest?range=7d")).json();
    expect(body.rows).toEqual([
      { id: b, name: "Bea Lindqvist", email: "b@example.test", micros: 450 },
      { id: a, name: null, email: "a@example.test", micros: 300 },
      { id: c, name: null, email: "c@example.test", micros: 100 },
    ]);
    expect((await get(owner.cookie, "/heaviest?range=30d")).json().rows[0]).toMatchObject({ id: c, micros: 50_100 });
  });

  it("stops at twenty", async () => {
    const owner = await staffMember("owner");
    for (let n = 0; n < 22; n += 1) await call({ account: await activeAccount(), cost: 100 + n });
    const body = (await get(owner.cookie, "/heaviest?range=7d")).json();
    expect(body.rows).toHaveLength(20);
    expect(body.rows[0].micros).toBe(121);
  });
});
