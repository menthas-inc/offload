// Promotion. The most consequential transaction in this spec, because a
// half-promoted account signs in successfully and then does not work.
//
// AC-2:  an admin promoting someone makes an account that can sign in, with
//         its account_keys row, its Miscellaneous thread and its membership, in
//         one transaction, and promoting twice is promoting once.
// AC-10: the event it emits carries the pseudonym, never the account id.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { promote } from "../src/admin/promote.js";
import { unwrap } from "../src/crypto/keys.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

async function waiting(email: string): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email, state: "waitlist" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  return row.id;
}

const account = (id: string) =>
  db
    .selectFrom("accounts")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

const count = async (table: "threads" | "thread_members" | "thread_keys" | "account_keys" | "jobs" | "analytics_events"): Promise<number> =>
  Number((await db.selectFrom(table).select(db.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);

describe("AC-2 promoting someone off the waitlist", () => {
  it("assembles the whole account in one go", async () => {
    const id = await waiting("ana@example.test");
    const result = await promote("ana@example.test");

    expect(result).toEqual({ status: "invited", accountId: id });

    const promoted = await account(id);
    expect(promoted.state).toBe("invited");
    expect(promoted.default_thread_id).not.toBeNull();

    const thread = await db
      .selectFrom("threads")
      .selectAll()
      .where("id", "=", promoted.default_thread_id!)
      .executeTakeFirstOrThrow();
    expect(thread.name).toBe("Miscellaneous");
    expect(thread.always_on).toBe(true);

    const membership = await db
      .selectFrom("thread_members")
      .selectAll()
      .where("thread_id", "=", thread.id)
      .executeTakeFirstOrThrow();
    expect(membership.account_id).toBe(id);
    // Accepted, not pending: nobody has to accept their own default thread.
    expect(membership.state).toBe("accepted");
  });

  it("matches the address case-insensitively", async () => {
    const id = await waiting("Mixed@Example.test");
    await expect(promote("mixed@example.TEST")).resolves.toEqual({
      status: "invited",
      accountId: id,
    });
  });

  it("creates an account for an address that never joined the waitlist", async () => {
    const result = await promote("direct@example.test");
    expect(result.status).toBe("invited");

    const created = await account(result.accountId);
    expect(created.state).toBe("invited");
    expect(created.default_thread_id).not.toBeNull();
  });

  it("queues exactly one invite email and emits one invite_sent", async () => {
    const id = await waiting("ana@example.test");
    await promote("ana@example.test");

    const jobs = await db.selectFrom("jobs").selectAll().execute();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe("email.invited");
    expect(jobs[0]?.idempotency_key).toBe(`email.invited:${id}`);

    const events = await db.selectFrom("analytics_events").selectAll().execute();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("invite_sent");
    // AC-10: the pseudonym, never the account id.
    expect(events[0]?.subject_id).toBe((await account(id)).analytics_subject_id);
    expect(events[0]?.subject_id).not.toBe(id);
  });
});

describe("the key layers it creates", () => {
  it("wraps the thread key under the account key, not under the root", async () => {
    const result = await promote("keys@example.test");

    const accountKeyRow = await db
      .selectFrom("account_keys")
      .selectAll()
      .where("account_id", "=", result.accountId)
      .executeTakeFirstOrThrow();
    expect(accountKeyRow.wrapped_by).toBe("db:v1");

    const accountKey = unwrap(Buffer.from(accountKeyRow.wrapped_dek));
    expect(accountKey).toHaveLength(32);

    const threadKeyRow = await db
      .selectFrom("thread_keys")
      .selectAll()
      .where("account_id", "=", result.accountId)
      .executeTakeFirstOrThrow();

    // Opens with the account key.
    expect(unwrap(Buffer.from(threadKeyRow.wrapped_tk), accountKey)).toHaveLength(32);
    // And not with the root, which is what "wrapped once per scope entitled to
    // open it" has to mean if leaving a thread is to revoke anything.
    expect(() => unwrap(Buffer.from(threadKeyRow.wrapped_tk))).toThrow();
  });
});

describe("AC-2 promoting twice", () => {
  it("is promoting once", async () => {
    await waiting("ana@example.test");
    const first = await promote("ana@example.test");
    const second = await promote("ana@example.test");

    expect(first.status).toBe("invited");
    expect(second).toEqual({ status: "already-in", accountId: first.accountId });

    expect(await count("threads")).toBe(1);
    expect(await count("thread_members")).toBe(1);
    expect(await count("thread_keys")).toBe(1);
    expect(await count("account_keys")).toBe(1);
    expect(await count("jobs")).toBe(1);
    expect(await count("analytics_events")).toBe(1);
  });

  // Three concurrent promotions, each generating an account key, each
  // contending for the same row lock. Slow by nature rather than by accident,
  // and it timed out once against vitest's 5 second default on a loaded
  // machine. A concurrency test that fails when the machine is busy is a test
  // that fails in CI and teaches people to re-run rather than to look.
  it("survives two admins clicking at the same moment", { timeout: 20_000 }, async () => {
    await waiting("race@example.test");
    const outcomes = await Promise.all([
      promote("race@example.test"),
      promote("race@example.test"),
      promote("race@example.test"),
    ]);

    expect(outcomes.filter((o) => o.status === "invited")).toHaveLength(1);
    expect(await count("threads")).toBe(1);
    expect(await count("jobs")).toBe(1);
    expect(await count("analytics_events")).toBe(1);
  });

  it("never replaces an existing account key", async () => {
    const result = await promote("stable@example.test");
    const before = await db
      .selectFrom("account_keys")
      .select(["wrapped_dek"])
      .where("account_id", "=", result.accountId)
      .executeTakeFirstOrThrow();

    // Force the account back to waitlist so a second promotion does real work
    // rather than returning early, which is the case where an overwrite would
    // actually be possible.
    await db
      .updateTable("accounts")
      .set({ state: "waitlist" })
      .where("id", "=", result.accountId)
      .execute();
    await promote("stable@example.test");

    const after = await db
      .selectFrom("account_keys")
      .select(["wrapped_dek"])
      .where("account_id", "=", result.accountId)
      .executeTakeFirstOrThrow();
    expect(Buffer.from(after.wrapped_dek)).toEqual(Buffer.from(before.wrapped_dek));
  });
});

describe("who is refused", () => {
  it("refuses a disabled account rather than quietly letting it back in", async () => {
    const id = await waiting("gone@example.test");
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();

    await expect(promote("gone@example.test")).resolves.toEqual({
      status: "refused",
      accountId: id,
      reason: "disabled",
    });
    expect(await count("threads")).toBe(0);
    expect(await count("jobs")).toBe(0);
  });
});
