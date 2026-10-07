// Sweep 2026-10-07, the final client review. The re-ask's way out opens the
// account settings inside the shell, which draws the composer; an account that
// has not agreed to the changed terms must not be able to dump from there.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(`${process.cwd()}/src/app/(shell)/layout.tsx`, "utf8");

describe("the shell while consent is asked again", () => {
  it("draws no composer", () => {
    expect(layout).toMatch(/needsConsent \? null : \(\s*<Composer/);
  });
});
