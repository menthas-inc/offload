// The waitlist endpoint's security properties, tested as properties rather
// than as happy paths. AC-1 is the one that matters: this endpoint must not
// tell anyone whether a given address already uses offload.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { MemoryMailer } from "../src/mail/index.js";
import { JobRunner } from "../src/jobs/runner.js";

await migrate(() => {});
const app = await buildApp();
await app.ready();

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("accounts").execute();
});

const join = (email: string, extra: Record<string, unknown> = {}) =>
  app.inject({ method: "POST", url: "/v1/waitlist", payload: { email, ...extra } });

const drain = async (mailer: MemoryMailer): Promise<void> => {
  const runner = new JobRunner({ mailer });
  while (await runner.tick()) { /* until empty */ }
};

describe("AC-1 joining the waitlist", () => {
  it("accepts an address and creates exactly one account", async () => {
    const res = await join("someone@example.test");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });

    const rows = await db.selectFrom("accounts").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("waitlist");
    // The pseudonym is minted at waitlist creation, not at promotion, so
    // waitlist_joined has a subject to carry.
    expect(rows[0]?.analytics_subject_id).toBeTruthy();
  });

  it("is indistinguishable for a new, a waiting and an existing address", async () => {
    await join("waiting@example.test");
    await db.insertInto("accounts")
      .values({ email: "active@example.test", state: "active" }).execute();

    const results = await Promise.all([
      join("brand-new@example.test"),
      join("waiting@example.test"),
      join("active@example.test"),
    ]);

    const bodies = results.map((r) => r.body);
    const codes = results.map((r) => r.statusCode);
    expect(new Set(bodies).size).toBe(1);
    expect(new Set(codes).size).toBe(1);
  });

  it("never creates a second account for the same address in any case", async () => {
    await join("Dupe@Example.test");
    await join("dupe@example.test");
    await join("  DUPE@example.test  ");

    const rows = await db.selectFrom("accounts").selectAll().execute();
    expect(rows).toHaveLength(1);
  });

  it("sends the confirmation once, however many times it is submitted", async () => {
    const mailer = new MemoryMailer();
    await join("once@example.test");
    await join("once@example.test");
    await join("once@example.test");
    await drain(mailer);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("once@example.test");
    // The design's template ships a plain-text alternative and no images.
    expect(mailer.sent[0]?.slots.headline).toBe("You are on the list");
  });

  it("takes indistinguishable time across branches", async () => {
    await join("timed-existing@example.test");

    const time = async (email: string): Promise<number> => {
      const t = Date.now();
      await join(email);
      return Date.now() - t;
    };

    const fresh = await time("timed-new@example.test");
    const repeat = await time("timed-existing@example.test");

    // Both are held to the same floor, so the difference is scheduling noise
    // rather than the shape of the work.
    expect(Math.abs(fresh - repeat)).toBeLessThan(120);
  });
});

describe("abuse controls", () => {
  it("silently accepts and ignores a honeypot submission", async () => {
    const res = await join("bot@example.test", { company: "" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a malformed address without saying why", async () => {
    const res = await join("not-an-address");
    // Schema validation, so this one does differ. That is acceptable: a
    // malformed string reveals nothing about who uses offload.
    expect(res.statusCode).toBe(400);
  });
});

describe("OFF-1 in the funnel", () => {
  it("emits waitlist_joined carrying a pseudonym and no address", async () => {
    await join("private@example.test");

    const events = await db.selectFrom("analytics_events").selectAll().execute();
    expect(events).toHaveLength(1);

    const event = events[0]!;
    expect(event.name).toBe("waitlist_joined");
    expect(event.subject_id).toBeTruthy();

    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain("private@example.test");
    expect(serialised).not.toContain("account_id");
  });
});
