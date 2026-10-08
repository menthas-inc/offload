// 2026-10-07. On iOS the waitlist line sat 8px under the Apple button, the
// foot's gap, and read as part of it. It stands apart from the buttons: 12px
// of its own above it, 20 in all. Read from the source, as the other screen
// tests are.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../components/screens/${file}`, import.meta.url), "utf8");
const source = read("SignIn.ios.tsx");
const android = read("SignIn.android.tsx");

describe("the iOS sign-in foot", () => {
  it("sets the waitlist line apart from the provider buttons", () => {
    const line = source.slice(source.indexOf("{GATE.signIn.terms}") - 200, source.indexOf("{GATE.signIn.terms}"));
    expect(line).toMatch(/<Text className="[^"]*\bmt-space-5\b[^"]*"/);
  });

  // And on Android, at its foot's 12: 8 of its own, 20 in all, as on iOS.
  it("sets the waitlist line apart on Android too", () => {
    const line = android.slice(android.indexOf("{GATE.signIn.terms}") - 200, android.indexOf("{GATE.signIn.terms}"));
    expect(line).toMatch(/<Text\s+className="[^"]*\bmt-space-4\b[^"]*"/);
  });
});
