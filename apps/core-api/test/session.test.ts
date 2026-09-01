// First run's ending, and the address a refusal carries back.
//
// AC-12: completing (or skipping) first run is a server-side write, and the
//        client cannot claim it happened.
// AC-17: the event that write emits is attributed to the pseudonym, never to
//        the account id.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { completeFirstRun } from "../src/routes/session.js";
import { seal, unseal } from "../src/auth/attempt.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

async function invited(subjectId: string | null = uuidv7()): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "invited",
      email_verified: true,
      analytics_subject_id: subjectId,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  return row.id;
}

const stateOf = async (id: string): Promise<string> =>
  (
    await db.selectFrom("accounts").select("state").where("id", "=", id).executeTakeFirstOrThrow()
  ).state;

const events = async (): Promise<Array<{ name: string; subject_id: string | null }>> =>
  db.selectFrom("analytics_events").select(["name", "subject_id"]).execute();

describe("AC-12 finishing first run", () => {
  it("flips invited to active", async () => {
    const id = await invited();
    await completeFirstRun(id);
    expect(await stateOf(id)).toBe("active");
  });

  it("emits onboarding_completed against the pseudonym, not the account id", async () => {
    const subject = uuidv7();
    const id = await invited(subject);
    await completeFirstRun(id);

    const written = await events();
    expect(written).toEqual([{ name: "onboarding_completed", subject_id: subject }]);
    expect(written[0]?.subject_id).not.toBe(id);
  });

  it("is idempotent: a second call changes nothing and emits nothing", async () => {
    const id = await invited();
    await completeFirstRun(id);
    await completeFirstRun(id);

    expect(await stateOf(id)).toBe("active");
    expect(await events()).toHaveLength(1);
  });

  it("does not resurrect an account that is not invited", async () => {
    const id = await invited();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();

    await completeFirstRun(id);
    expect(await stateOf(id)).toBe("disabled");
    expect(await events()).toHaveLength(0);
  });
});

describe("the refused address a no-invite screen shows", () => {
  const now = 1_700_000_000_000;

  it("round trips", () => {
    expect(unseal(seal("ana@example.com", now), now + 1000)).toBe("ana@example.com");
  });

  it("refuses a tampered address", () => {
    const sealed = seal("ana@example.com", now);
    const [, expiresAt, mac] = sealed.split(".");
    const forged = `${Buffer.from("admin@example.com").toString("base64url")}.${expiresAt}.${mac}`;
    expect(unseal(forged, now)).toBeNull();
  });

  it("refuses a tampered expiry", () => {
    const [encoded, , mac] = seal("ana@example.com", now).split(".");
    expect(unseal(`${encoded}.${now + 999_999_999}.${mac}`, now)).toBeNull();
  });

  it("expires", () => {
    expect(unseal(seal("ana@example.com", now), now + 11 * 60 * 1000)).toBeNull();
  });

  it("refuses malformed input rather than throwing", () => {
    for (const value of ["", "a", "a.b", "a.b.c.d"]) expect(unseal(value, now)).toBeNull();
  });
});
