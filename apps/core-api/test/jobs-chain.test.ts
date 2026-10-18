// The job chains keep running, and a job's outcome is the true one.
//
// An hourly chain survives a worker clock a little behind the database's; a
// re-armed revocation pass is one row an hour however often it is re-armed;
// shutdown waits for the job in flight; and an email the mail company refused
// is sent again rather than recorded as done.
//
// Every assertion reads rows this file created, by key, id or account: the
// database is shared with every other test file.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { enqueue, PRIORITY, scheduleHourly } from "../src/jobs/queue.js";
import { handlers } from "../src/jobs/handlers.js";
import { JobError } from "../src/jobs/errors.js";
import { JobRunner } from "../src/jobs/runner.js";
import { MemoryMailer, type Mailer } from "../src/mail/mailer.js";
import { uuidv7 } from "../src/uuid.js";
import { seal } from "../src/connectors/vault.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const keyed = (key: string) => db.selectFrom("jobs").select(["run_after", "state"]).where("idempotency_key", "=", key).execute();

describe("an hourly chain", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await db.deleteFrom("jobs").where("idempotency_key", "in", ["digest.schedule:2031-01-01T11", "digest.schedule:2031-01-01T12"]).execute();
  });

  it("takes the hour from the database's clock, the one that claimed the row", async () => {
    // Node's clock is wrong by years here; a clock a few milliseconds behind
    // the database's is the same mistake, smaller, and it ended the chain.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-01-01T10:59:59.997Z"));
    const now = (await sql<{ now: Date }>`select now() as now`.execute(db)).rows[0]!.now;
    const next = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 3_600_000);
    const key = `digest.schedule:${next.toISOString().slice(0, 13)}`;
    try {
      await scheduleHourly("digest.schedule");
      expect(await keyed(key)).toHaveLength(1);
      expect(await keyed("digest.schedule:2031-01-01T11")).toEqual([]);
    } finally {
      await db.deleteFrom("jobs").where("idempotency_key", "=", key).execute();
    }
  });

  it("books the next hour from a chain started in the last minute of an hour", async () => {
    // A boot at 10:59:30 runs this hour's row at once; 11:00 is still to come.
    await scheduleHourly("digest.schedule", new Date("2031-01-01T10:59:30.000Z"));
    const rows = await keyed("digest.schedule:2031-01-01T11");
    expect(rows.map((row) => row.run_after.toISOString())).toEqual(["2031-01-01T11:00:00.000Z"]);
  });

  it("books the next hour on time", async () => {
    await scheduleHourly("digest.schedule", new Date("2031-01-01T11:00:00.000Z"));
    const rows = await keyed("digest.schedule:2031-01-01T12");
    expect(rows.map((row) => row.run_after.toISOString())).toEqual(["2031-01-01T12:00:00.000Z"]);
  });
});

describe("the revocation pass", () => {
  const bad = uuidv7();
  afterEach(async () => {
    await db.deleteFrom("pending_revocations").where("id", "=", bad).execute();
  });

  it("re-armed twice in one hour leaves one queued row", async () => {
    // Google answers 503, so the row waits. One that does not open is marked
    // and waits for nobody (S27), so this one opens.
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await db.insertInto("pending_revocations").values({ id: bad, provider: "google", sealed_token: seal("t", bad, "refresh_token") }).execute();
    const before = new Set((await db.selectFrom("jobs").select("id").where("kind", "=", "connector.revoke").execute()).map((row) => row.id));
    const next = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 3_600_000);
    const key = `connector.revoke:${next.toISOString().slice(0, 13)}`;
    await db.deleteFrom("jobs").where("idempotency_key", "=", key).execute();
    try {
      await handlers["connector.revoke"]!({}, { mailer: new MemoryMailer() }, null);
      await handlers["connector.revoke"]!({}, { mailer: new MemoryMailer() }, null);
      const after = await db.selectFrom("jobs").select("id").where("kind", "=", "connector.revoke").where("state", "=", "queued").execute();
      expect(after.filter((row) => !before.has(row.id))).toHaveLength(1);
    } finally {
      await db.deleteFrom("jobs").where("idempotency_key", "=", key).execute();
    }
  });
});

async function account(state: "invited" | "waitlist"): Promise<string> {
  const row = await db.insertInto("accounts").values({ email: `${uuidv7()}@example.test`, state }).returning("id").executeTakeFirstOrThrow();
  return row.id;
}

const jobOf = (accountId: string) =>
  db.selectFrom("jobs").select(["state", "error_code"]).where("account_id", "=", accountId).executeTakeFirstOrThrow();

describe("shutdown", () => {
  let accountId = "";
  afterEach(async () => {
    await db.deleteFrom("jobs").where("account_id", "=", accountId).execute();
    await db.deleteFrom("accounts").where("id", "=", accountId).execute();
  });

  it("waits for the job in flight, which ends done", async () => {
    accountId = await account("invited");
    await enqueue({ kind: "email.invited", accountId, payload: {}, priority: PRIORITY.interactive });
    let release = (): void => {};
    let started = (): void => {};
    const sending = new Promise<void>((resolve) => (started = resolve));
    const mailer: Mailer = {
      send: () => {
        started();
        return new Promise<void>((resolve) => (release = resolve));
      },
    };
    const runner = new JobRunner({ mailer });
    runner.start();
    await sending;

    let stopped = false;
    const stopping = runner.stop().then(() => (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped).toBe(false);

    release();
    await stopping;
    expect(await jobOf(accountId)).toEqual({ state: "done", error_code: null });
  });
});

describe("an email the mail company refused", () => {
  let accountId = "";
  afterEach(async () => {
    await db.deleteFrom("jobs").where("account_id", "=", accountId).execute();
    await db.deleteFrom("accounts").where("id", "=", accountId).execute();
  });

  const refusing: Mailer = {
    send: async () => {
      throw new JobError("mail_failed", "Resend rejected the send with status 422");
    },
  };

  for (const [kind, state, column] of [
    ["email.invited", "invited", "invite_email_sent_at"],
    ["email.waitlist_joined", "waitlist", "waitlist_email_sent_at"],
  ] as const) {
    it(`${kind} gives the claim back, so the job is retried and sends`, async () => {
      accountId = await account(state);
      await enqueue({ kind, accountId, payload: {}, priority: PRIORITY.interactive, maxAttempts: 2 });
      expect(await new JobRunner({ mailer: refusing }).tick()).toBe(true);
      expect(await jobOf(accountId)).toEqual({ state: "queued", error_code: "mail_failed" });
      const stamp = await db.selectFrom("accounts").select(column).where("id", "=", accountId).executeTakeFirstOrThrow();
      expect(stamp[column]).toBeNull();

      const mailer = new MemoryMailer();
      await handlers[kind]!({}, { mailer }, accountId);
      expect(mailer.sent).toHaveLength(1);
    });
  }

  it("keeps the claim when the outcome is unclear, so nothing is sent twice", async () => {
    accountId = await account("invited");
    const lost: Mailer = {
      send: async () => {
        throw new TypeError("fetch failed");
      },
    };
    await expect(handlers["email.invited"]!({}, { mailer: lost }, accountId)).rejects.toThrow();
    const stamp = await db.selectFrom("accounts").select("invite_email_sent_at").where("id", "=", accountId).executeTakeFirstOrThrow();
    expect(stamp.invite_email_sent_at).not.toBeNull();
  });
});
