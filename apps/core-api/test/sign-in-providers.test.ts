// 031. Which providers an account signs in with, so My account can say where
// its email came from (AC-4).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { account, as, signIn, wipe } from "./labels-kit.js";

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
  await db.deleteFrom("account_identities").execute();
  await wipe();
});

async function linked(accountId: string, provider: "apple" | "google") {
  await db
    .insertInto("account_identities")
    .values({ account_id: accountId, provider, subject: uuidv7(), email: null, access_token: null } as never)
    .execute();
}

const providers = async (accountId: string) =>
  (await as(app, await signIn(accountId)).get("/api/me")).json().signInProviders;

describe("/api/me names the sign-in providers (AC-4)", () => {
  it("is the one provider an account has", async () => {
    const jo = await account();
    await linked(jo, "google");
    expect(await providers(jo)).toEqual(["google"]);

    const sam = await account("Sam Ibekwe");
    await linked(sam, "apple");
    expect(await providers(sam)).toEqual(["apple"]);
  });

  it("is both, Apple first, whichever was linked first", async () => {
    const jo = await account();
    await linked(jo, "google");
    await linked(jo, "apple");
    expect(await providers(jo)).toEqual(["apple", "google"]);
  });

  it("is empty for an account with no identity, rather than a guess", async () => {
    expect(await providers(await account())).toEqual([]);
  });
});
