// 2026-10-07. On iOS the waitlist line sat 8px under the Apple button, the
// foot's gap, and read as part of it. It stands apart from the buttons: 12px
// of its own above it, 20 in all. Read from the source, as the other screen
// tests are.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/screens/SignIn.ios.tsx", import.meta.url), "utf8");

describe("the iOS sign-in foot", () => {
  it("sets the waitlist line apart from the provider buttons", () => {
    const line = source.slice(source.indexOf("{GATE.signIn.terms}") - 200, source.indexOf("{GATE.signIn.terms}"));
    expect(line).toMatch(/<Text className="[^"]*\bmt-space-5\b[^"]*"/);
  });
});
