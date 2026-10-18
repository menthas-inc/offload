// 034 AC-40 and AC-41. Every failed job carries an error code from a closed
// set, and the Core API's runner takes back a lock its owner abandoned.
//
// The code is what the admin panel shows. `last_error` is free text, scrubbed
// but still free, and no admin route reads it.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { claim, enqueue, fail, STALE_AFTER_SECONDS } from "../src/jobs/queue.js";
import { ERROR_CODES, JobError } from "../src/jobs/errors.js";
import { JobRunner } from "../src/jobs/runner.js";
import { ResendMailer, type Mailer } from "../src/mail/mailer.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
});

const job = (id: string) =>
  db.selectFrom("jobs").select(["state", "error_code", "last_error", "attempts", "locked_by"]).where("id", "=", id).executeTakeFirstOrThrow();

async function claimed(kind = "content.purge", maxAttempts = 2) {
  await enqueue({ kind: kind as never, payload: {}, maxAttempts });
  const taken = await claim("test", [kind]);
  if (!taken) throw new Error("nothing claimed");
  return taken;
}

describe("AC-41 a failed job's code", () => {
  it("is the closed set both runners write", () => {
    // The worker's strings (apps/agent) and the Core API's own.
    expect([...ERROR_CODES].sort()).toEqual(
      [
        "stale",
        "nightly_error",
        "nightly_unparseable",
        "memory_error",
        "memory_unparseable",
        "link_place_error",
        "forget_error",
        "embed_error",
        "embed_unavailable",
        "undeliverable",
        "invalid_output",
        "model_error",
        "transcription_failed",
        "timeout",
        "no_handler",
        "mail_failed",
        "vendor_error",
        "handler_error",
      ].sort()
    );
  });

  it("holds every reason the worker writes", () => {
    // Read from the source, so a reason added there and not here fails now
    // rather than as a code Health cannot place. The first string literal of
    // each release call, and every `error_code = '...'` in its SQL.
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../agent/src/offload_agent");
    const written = new Set<string>();
    for (const name of readdirSync(dir).filter((one) => one.endsWith(".py"))) {
      const text = readFileSync(join(dir, name), "utf8");
      for (const match of text.matchAll(/\b(?:release_for_retry|retry_or_die|_give_up_or_retry)\(([^")]*)"([a-z_]+)"/g)) written.add(match[2]!);
      for (const match of text.matchAll(/error_code\s*=\s*'([a-z_]+)'/g)) written.add(match[1]!);
    }
    // The search finds something, or it proves nothing.
    expect(written.size).toBeGreaterThanOrEqual(10);
    expect([...written].filter((code) => !(ERROR_CODES as readonly string[]).includes(code))).toEqual([]);
  });

  it("is handler_error for anything a handler threw, beside the scrubbed text", async () => {
    const taken = await claimed();
    await fail(taken, new Error("could not reach jo@example.test"));
    expect(await job(taken.id)).toMatchObject({ state: "queued", error_code: "handler_error", last_error: "Error: could not reach [email]" });
  });

  it("is the code a JobError carries, on a retry and when it dies", async () => {
    const taken = await claimed("content.purge", 1);
    await fail(taken, new JobError("vendor_error", "the provider said no"));
    expect(await job(taken.id)).toMatchObject({ state: "dead", error_code: "vendor_error" });
  });

  it("is mail_failed when the mail company refuses a send", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("no", { status: 422 })) as typeof fetch;
    try {
      const refused = await new ResendMailer("key", "offload <hello@example.test>")
        .send({ to: "jo@example.test", subject: "s", slots: { headline: "h", body: "b", footer: "f" } })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(JobError);
      expect((refused as JobError).code).toBe("mail_failed");
      // Status only, as before: the body quotes the recipient.
      expect((refused as Error).message).toBe("Resend rejected the send with status 422");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("is written by the runner for a handler that throws", async () => {
    await db.deleteFrom("accounts").execute();
    await enqueue({ kind: "email.invited", payload: {}, maxAttempts: 1 });
    const mailer: Mailer = { send: async () => undefined };
    await new JobRunner({ mailer }).tick();
    const [row] = await db.selectFrom("jobs").select(["state", "error_code"]).where("kind", "=", "email.invited").execute();
    expect(row).toEqual({ state: "dead", error_code: "handler_error" });
  });
});

describe("AC-40 a lock its owner abandoned", () => {
  const abandon = (id: string, seconds: number) =>
    db
      .updateTable("jobs")
      .set({ locked_at: sql`now() - make_interval(secs => ${seconds})` })
      .where("id", "=", id)
      .execute();

  it("waits the same fifteen minutes the worker does", () => {
    expect(STALE_AFTER_SECONDS).toBe(900);
  });

  it("is claimed again once it is stale, while the job has attempts left", async () => {
    const first = await claimed("content.purge", 2);
    expect(await claim("other", ["content.purge"])).toBeUndefined();

    await abandon(first.id, STALE_AFTER_SECONDS - 60);
    expect(await claim("other", ["content.purge"])).toBeUndefined();

    await abandon(first.id, STALE_AFTER_SECONDS + 60);
    const again = await claim("other", ["content.purge"]);
    expect(again).toMatchObject({ id: first.id, attempts: 2 });
    expect(await job(first.id)).toMatchObject({ state: "running", locked_by: "other" });
  });

  it("is marked dead with stale once it has none, and is not handed out", async () => {
    const only = await claimed("content.purge", 1);
    await abandon(only.id, STALE_AFTER_SECONDS + 60);
    expect(await claim("other", ["content.purge"])).toBeUndefined();
    expect(await job(only.id)).toMatchObject({ state: "dead", error_code: "stale", last_error: "stale", locked_by: null });
  });

  it("leaves the worker's kinds to the worker", async () => {
    await enqueue({ kind: "dump.answer", payload: {}, maxAttempts: 1 });
    const theirs = await claim("agent", ["dump.answer"]);
    await abandon(theirs!.id, STALE_AFTER_SECONDS + 60);
    expect(await claim("api", ["content.purge"])).toBeUndefined();
    expect(await job(theirs!.id)).toMatchObject({ state: "running", error_code: null });
  });
});
