// First run's ending, and the address a refusal carries back.
//
// AC-7:  first run shows once per person, and completing it flips `invited`
//         to `active`. The write is server-side and the client cannot claim it
//         happened.
// AC-7a: it also records the two consents, in the same transaction, and the
//         endpoint refuses to run at all without both of them.
// AC-10: the event that write emits is attributed to the pseudonym, never to
//         the account id.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { completeFirstRun, CONSENT_VERSION } from "../src/routes/session.js";
import { seal, unseal } from "../src/auth/attempt.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
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

describe("AC-7 finishing first run", () => {
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

const consentOf = async (id: string) =>
  db
    .selectFrom("accounts")
    .select(["consent_version", "consented_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

describe("AC-7a the consent that ends first run", () => {
  it("records the version and the moment, in the same write as the flip", async () => {
    const id = await invited();
    await completeFirstRun(id);

    const consent = await consentOf(id);
    expect(consent.consent_version).toBe(CONSENT_VERSION);
    expect(consent.consented_at).toBeInstanceOf(Date);
    expect(await stateOf(id)).toBe("active");
  });

  it("records nothing when the flip does not happen", async () => {
    const id = await invited();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();

    await completeFirstRun(id);

    // The point of one update rather than two: there is no ordering in which an
    // account ends up consented without being active, or active without having
    // consented.
    const consent = await consentOf(id);
    expect(consent.consent_version).toBeNull();
    expect(consent.consented_at).toBeNull();
  });

  // Body validation runs before the handler, so these are 400 and not 401 even
  // with no session at all. That is the shape we want: a client that does not
  // know about the ticks cannot complete first run whoever it is signed in as.
  it.each([
    ["no body at all", undefined],
    ["neither tick", {}],
    ["only the policy tick", { readPolicy: true }],
    ["only the processing tick", { agreeToProcessing: true }],
    ["a tick that is false", { readPolicy: true, agreeToProcessing: false }],
  ])("refuses completion with %s", async (_label, payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      ...(payload === undefined ? {} : { payload }),
    });
    expect(response.statusCode).toBe(400);
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
