// Who is asking: the one rule every route reads the session through.

import { afterAll, describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { currentAccountId } from "../src/auth/current-account.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, signIn } from "./today-kit.js";

await migrate(() => {});

const made: string[] = [];
afterAll(async () => {
  if (made.length) await db.deleteFrom("accounts").where("id", "in", made).execute();
  await closeDb();
});

const requestWith = (headers: Record<string, string>) => ({ headers }) as unknown as FastifyRequest;

describe("currentAccountId", () => {
  it("is the signed-in account", async () => {
    const id = await account();
    made.push(id);
    expect(await currentAccountId(requestWith({ cookie: await signIn(id) }))).toBe(id);
  });

  it("is null with no session", async () => {
    expect(await currentAccountId(requestWith({}))).toBeNull();
  });
});
