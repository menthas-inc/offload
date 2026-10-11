// The suite migrates once, before any test file is loaded. A test file's
// imports run before its own top-level `await migrate()`, and importing the
// app builds Better Auth, which checks the database against its model as it
// initialises and keeps the answer. On a database nothing had migrated yet,
// the first file to build the app answered every session read with a 500,
// "Database schema mismatch", the same failure server.ts guards against at
// boot (2026-09-22). Seen on a fresh test database on 2026-10-10.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the suite's global setup", () => {
  it("is wired, and migrates before any file imports the app", () => {
    expect(config.test?.globalSetup).toEqual(["./test/global-setup.ts"]);
    const setup = read("./global-setup.ts");
    expect(setup).toMatch(/await migrate\(/);
    expect(setup).not.toMatch(/from "\.\.\/src\/app\.js"/);
  });
});
