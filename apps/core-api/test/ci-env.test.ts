// Does CI have the variables the app refuses to start without?
//
// This file exists because CI was red for a day and a half and nobody noticed.
// `INTERNAL_SERVICE_TOKEN` became required when the worker's one write endpoint
// landed, `.env` had it locally so every developer machine was fine, and the
// workflow did not. Every run since died on the first step that loads the
// environment, `db:migrate`, before a single test ran. Fifteen consecutive red
// runs, all with the same one-line cause.
//
// It is the repo's own lesson in a new costume: **a test that passes only in
// your shell is not passing.** The environment is the one thing tests cannot
// check about themselves, because a run that cannot start has no test to fail.
// So this compares the schema to the workflow as text, which is the only place
// both facts are visible at once.
//
// Required means no `.default()` and no `.optional()`. Adding either to a
// variable takes it off this list automatically, which is the point: the test
// should not need editing when the schema changes, only when the workflow
// falls behind it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");

/** The names the schema will not start without.
 *
 *  Read from the source rather than from the parsed schema: `envSchema` is
 *  built at import time from a live `process.env`, so importing it here to ask
 *  what it wants would need the very variables this test is checking for. */
function requiredKeys(): string[] {
  const source = readFileSync(join(ROOT, "apps/core-api/src/env.ts"), "utf8");
  const block = source.slice(source.indexOf("z.object({"), source.indexOf("\n});"));
  const keys: string[] = [];
  for (const line of block.split("\n")) {
    const match = /^\s{2}([A-Z][A-Z0-9_]*):\s*z\.(.+)$/.exec(line);
    if (!match) continue;
    const [, name, rule] = match;
    if (rule!.includes(".optional()") || rule!.includes(".default(")) continue;
    keys.push(name!);
  }
  return keys;
}

/** The names the workflow sets on the job. */
function workflowKeys(): string[] {
  const yaml = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  return [...yaml.matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*\S/gm)].map((match) => match[1]!);
}

describe("CI has what the app needs to start", () => {
  it("reads a plausible set of required variables", () => {
    // A regex that silently matched nothing would make the test below pass for
    // the worst possible reason.
    const keys = requiredKeys();
    expect(keys.length).toBeGreaterThan(3);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("INTERNAL_SERVICE_TOKEN");
  });

  it("sets every variable the environment schema requires", () => {
    const missing = requiredKeys().filter((key) => !workflowKeys().includes(key));
    expect(missing).toEqual([]);
  });
});
