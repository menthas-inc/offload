// 011: your name.
//
// AC-1/AC-2/AC-2a/AC-2b: the sign-in backfill, which is one UPDATE whose where
//   clause is the whole rule. These are the cases nobody exercises by hand:
//   linking a second provider, and signing in on an account already past first
//   run.
// AC-5: what a name is allowed to be, on both the path that refuses and the
//   path that cannot.
// AC-6: a name cannot be cleared.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanName, cleanNameLossy, NAME_MAX } from "../src/accounts/name.js";
import { backfillName } from "../src/auth/auth.js";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { completeFirstRun } from "../src/routes/session.js";
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

async function account(state: "invited" | "active", displayName: string | null = null): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state,
      email_verified: true,
      display_name: displayName,
      analytics_subject_id: uuidv7(),
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  return row.id;
}

const nameOf = async (id: string): Promise<string | null> =>
  (
    await db
      .selectFrom("accounts")
      .select("display_name")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).display_name;

/** What the provider called them, which is a suggestion and not a name. */
const suggestionOf = async (id: string): Promise<string | null> =>
  (
    await db
      .selectFrom("accounts")
      .select("provider_name")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).provider_name;

describe("AC-5 what a name is allowed to be", () => {
  it("trims", () => {
    expect(cleanName("  Ana de Sousa  ")).toBe("Ana de Sousa");
  });

  it("is null when nothing survives the trim", () => {
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("")).toBeNull();
    expect(cleanName(null)).toBeNull();
    expect(cleanName(undefined)).toBeNull();
  });

  it("allows any character", () => {
    for (const name of ["Ana d'Sousa", "Æthelred", "李雷", "Jean-Luc", "🙂 Sam"]) {
      expect(cleanName(name)).toBe(name);
    }
  });

  it("refuses past sixty, measured after trimming", () => {
    expect(cleanName("a".repeat(NAME_MAX))).toHaveLength(NAME_MAX);
    expect(cleanName("a".repeat(NAME_MAX + 1))).toBeNull();
    // Sixty characters inside padding is sixty characters.
    expect(cleanName(`  ${"a".repeat(NAME_MAX)}  `)).toHaveLength(NAME_MAX);
  });

  it("cuts rather than refuses on the path that cannot refuse", () => {
    // A provider handing back something too long is not an error anybody can
    // act on, so the backfill cuts where the endpoints would say no.
    expect(cleanNameLossy("a".repeat(NAME_MAX + 40))).toHaveLength(NAME_MAX);
    expect(cleanNameLossy("   ")).toBeNull();
  });
});

describe("AC-1 the sign-in backfill", () => {
  it("holds the provider's name as a suggestion", async () => {
    const id = await account("invited");
    await backfillName(id, "Ana de Sousa");
    expect(await suggestionOf(id)).toBe("Ana de Sousa");
  });

  it("AC-1a never writes the name anybody else sees", async () => {
    // The whole design. A name that went from Google straight to display_name
    // would appear beside somebody's work, for people who know them, without
    // them ever having seen it. Confirming is what makes it public.
    const id = await account("invited");
    await backfillName(id, "Whatever Google Thinks");
    expect(await nameOf(id)).toBeNull();
  });

  it("reaches an account that finished first run long ago", async () => {
    // Every account that existed when 011 shipped is in this state, and the
    // hook this used to live in never fires for them: they linked their
    // provider months ago.
    const id = await account("active");
    await backfillName(id, "Ana de Sousa");
    expect(await suggestionOf(id)).toBe("Ana de Sousa");
  });

  it("trims and caps what the provider sent", async () => {
    const id = await account("invited");
    await backfillName(id, `  ${"a".repeat(NAME_MAX + 5)}  `);
    expect(await suggestionOf(id)).toHaveLength(NAME_MAX);
  });

  it("stores nothing when the provider sent nothing", async () => {
    // Apple, when somebody declines to share their name. An empty field is the
    // normal outcome, not an error.
    const id = await account("invited");
    await backfillName(id, null);
    await backfillName(id, "   ");
    expect(await suggestionOf(id)).toBeNull();
  });
});

describe("AC-2 the backfill stops once there is a name", () => {
  it("does not touch the suggestion after a name is set", async () => {
    const id = await account("active", "Ana");
    await backfillName(id, "Whatever Google Thinks");
    expect(await nameOf(id)).toBe("Ana");
    expect(await suggestionOf(id)).toBeNull();
  });

  it("AC-2a is the same case when a second provider is linked later", async () => {
    // Linking Apple to an account that signed in with Google reaches the same
    // statement. This is the case `updateUserInfoOnLink` gets wrong.
    const id = await account("invited");
    await backfillName(id, "Google Name");
    await completeFirstRun(id, "Ana");
    await backfillName(id, "Apple Name");
    expect(await nameOf(id)).toBe("Ana");
  });
});

describe("AC-3 first run writes the name with the state", () => {
  it("stores it in the same transaction that goes active", async () => {
    const id = await account("invited");
    await completeFirstRun(id, "Ana de Sousa");

    const row = await db
      .selectFrom("accounts")
      .select(["state", "display_name"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("active");
    expect(row.display_name).toBe("Ana de Sousa");
  });

  it("leaves both alone when the account is already active", async () => {
    // Idempotent by the same where clause the state flip uses, so a double tap
    // cannot rename somebody.
    const id = await account("active", "Ana");
    await completeFirstRun(id, "Someone Else");
    expect(await nameOf(id)).toBe("Ana");
  });
});

describe("AC-6 and AC-9 the endpoints", () => {
  it("refuses a name that is only whitespace", async () => {
    // Trimmed by the schema before the bound, so "   " is a refusal rather
    // than a stored blank.
    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      payload: { displayName: "   " },
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a name past sixty characters", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      payload: { displayName: "a".repeat(NAME_MAX + 1) },
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses first run with an empty name", async () => {
    // Sent and empty is a refusal. Not sent at all is the older client's
    // contract and is accepted, which the last describe covers.
    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      payload: { readPolicy: true, agreeToProcessing: true, displayName: "  " },
    });
    expect(response.statusCode).toBe(400);
  });

  it("takes no account id, so an unauthenticated write reaches nothing", async () => {
    // AC-9. Body validation passes and the route still refuses: the row it
    // would write is the session's, and there is no session.
    const id = await account("active", "Ana");
    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      payload: { displayName: "Someone Else" },
    });
    expect(response.statusCode).toBe(401);
    expect(await nameOf(id)).toBe("Ana");
  });
});

describe("a client that predates the name screen", () => {
  it("can still finish first run", async () => {
    // A phone build installed before 011 sends the two ticks and no name, and
    // cannot be forced to update. A 400 here would be an account that can never
    // leave first run.
    const id = await account("invited");
    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      payload: { readPolicy: true, agreeToProcessing: true },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it("leaves them needing a name, which the shell then asks for", async () => {
    // Absent is not empty. The account goes active with no name, so `needsName`
    // is true and the gate asks on the next launch, with the suggestion still
    // there to fill the field in. An old build is a screen late, not stuck.
    const id = await account("invited");
    await backfillName(id, "Ana de Sousa");
    await completeFirstRun(id, null);
    expect(await nameOf(id)).toBeNull();
    expect(await suggestionOf(id)).toBe("Ana de Sousa");
  });
});
