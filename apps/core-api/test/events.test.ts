// AC-10. The funnel is measurable server-side end to end, and every event it
// emits validates against its schema, carries no email address, and carries no
// field shaped like an account id.
//
// The last two are not stylistic. Analytics is the one place content can leak
// out of the system permanently: the outbox ships to R2 and stays there, so an
// address written once is an address in cold storage forever (OFF-1). And a
// real account id in an event defeats erasure for everyone, because
// crypto-shredding works by destroying the pseudonym mapping and an event that
// never used the pseudonym is unaffected by that (AC-10).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The 2020-12 build, because that is the dialect the schema files declare.
// Ajv's default export speaks draft-07 and refuses them by $schema.
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { emit, type EventName } from "../src/analytics.js";
import { promote } from "../src/admin/promote.js";
import { completeFirstRun } from "../src/routes/session.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const SCHEMAS = join(dirname(fileURLToPath(import.meta.url)), "../../../schemas/events");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const envelope = ajv.compile(JSON.parse(readFileSync(join(SCHEMAS, "envelope.schema.json"), "utf8")));

const FUNNEL: EventName[] = [
  "waitlist_joined",
  "invite_sent",
  "first_sign_in",
  "onboarding_completed",
];

// Compiled once each. Ajv registers a schema by its $id, so compiling the same
// file twice is an error rather than a cache hit.
const compiled = new Map<string, ReturnType<typeof ajv.compile>>();

function schemaFor(name: EventName) {
  const existing = compiled.get(name);
  if (existing) return existing;
  const validate = ajv.compile(JSON.parse(readFileSync(join(SCHEMAS, `${name}.v1.json`), "utf8")));
  compiled.set(name, validate);
  return validate;
}

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

async function written() {
  return db.selectFrom("analytics_events").selectAll().execute();
}

describe("AC-10 the four funnel events", () => {
  it("each has a schema file, so none of them is unversioned", () => {
    const files = readdirSync(SCHEMAS);
    for (const name of FUNNEL) expect(files).toContain(`${name}.v1.json`);
  });

  it("every schema is itself valid and refuses unknown properties", () => {
    for (const name of FUNNEL) {
      const schema = JSON.parse(readFileSync(join(SCHEMAS, `${name}.v1.json`), "utf8"));
      delete schema.$id;
      // additionalProperties: false is what makes the no-content rule
      // enforceable. Without it a schema passes anything a caller invents,
      // which is exactly how a title or a transcript gets in.
      expect(schema.additionalProperties).toBe(false);
      // $id stripped above so this compile does not claim the same key the
      // funnel validators register.
      expect(() => ajv.compile(schema)).not.toThrow();
    }
  });

  it("validates what promotion and first run actually emit", async () => {
    const promoted = await promote("ana@example.test");
    await db
      .updateTable("accounts")
      .set({ state: "invited" })
      .where("id", "=", promoted.accountId)
      .execute();
    await completeFirstRun(promoted.accountId);
    await emit({ name: "first_sign_in", subjectId: null });
    await emit({ name: "waitlist_joined", properties: { referred: false } });

    const events = await written();
    expect(events.map((event) => event.name).sort()).toEqual(
      ["first_sign_in", "invite_sent", "onboarding_completed", "waitlist_joined"]
    );

    for (const event of events) {
      const record = {
        name: event.name,
        version: event.version,
        occurred_at: event.occurred_at.toISOString(),
        anonymous_id: event.anonymous_id,
        subject_id: event.subject_id,
        session_id: event.session_id,
        source: event.source,
        platform: event.platform,
        properties: event.properties,
      };

      expect(envelope(record), JSON.stringify(envelope.errors)).toBe(true);

      const schema = schemaFor(event.name as EventName);
      expect(schema(event.properties), `${event.name}: ${JSON.stringify(schema.errors)}`).toBe(true);
    }
  });
});

describe("what an event may never contain", () => {
  const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

  it("carries no email address anywhere in its properties", async () => {
    const promoted = await promote("ana@example.test");
    await completeFirstRun(promoted.accountId);

    for (const event of await written()) {
      expect(JSON.stringify(event.properties)).not.toMatch(/@/);
    }
  });

  it("carries no field shaped like an account id", async () => {
    const promoted = await promote("ana@example.test");
    await completeFirstRun(promoted.accountId);

    for (const event of await written()) {
      // Not "does not equal this account's id": a uuid in properties at all is
      // the thing to catch, because the next person to add one will reach for
      // whichever id is in scope, and in these four events that is the account.
      expect(JSON.stringify(event.properties)).not.toMatch(UUID);
    }
  });

  it("attributes to the pseudonym, and the pseudonym is not an account id", async () => {
    const promoted = await promote("ana@example.test");
    const events = await written();

    const subjects = events.map((event) => event.subject_id);
    expect(subjects).not.toContain(promoted.accountId);
    expect(subjects.every(Boolean)).toBe(true);

    const accountIds = (await db.selectFrom("accounts").select("id").execute()).map((a) => a.id);
    for (const subject of subjects) expect(accountIds).not.toContain(subject);
  });

  it("is refused at the emit boundary when a caller passes content", async () => {
    // The runtime guard in analytics.ts, which is the backstop for anything
    // the schema check in CI does not see because it was never written down.
    await expect(
      emit({ name: "waitlist_joined", properties: { referred: true, note: "ana@example.test" } })
    ).rejects.toThrow(/OFF-1/);

    await expect(
      emit({ name: "waitlist_joined", properties: { referred: true, link: "https://example.test/x" } })
    ).rejects.toThrow(/OFF-1/);
  });
});
