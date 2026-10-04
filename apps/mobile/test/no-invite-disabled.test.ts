// 2026-10-04. A disabled account that signs in again is told it is disabled,
// on both phones, from the one copy both read. What the screens draw is read
// from their source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATE } from "../lib/gate";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("the gate's refusal on a phone", () => {
  it("has the words for a disabled account", () => {
    expect(GATE.disabled.title).toBe("Your account is disabled");
    expect(GATE.disabled.sub("jo@hey.com")).toBe("jo@hey.com cannot sign in. Write to hello@offload.club about it.");
    expect(GATE.disabled.switch).toBe("Use a different account");
  });

  for (const file of ["components/screens/NoInvite.ios.tsx", "components/screens/NoInvite.android.tsx"]) {
    it(`${file} reads the reason and draws no waitlist for it`, () => {
      const source = read(file);
      expect(source).toContain('setDisabled(data.reason === "disabled")');
      expect(source).toContain("disabled ? GATE.disabled : joined ? GATE.joined : GATE.notInvited");
      expect(source).toMatch(/\{disabled \? null : \(\s*<Pressable\s+onPress=\{join\}/);
    });
  }
});

describe("the retired noun", () => {
  it("is not on the calendar card", () => {
    const card = read("components/settings/AppCards.tsx");
    expect(card).toContain("See your week in offload, and let it add to your calendar.");
    expect(card).not.toMatch(/add things/);
  });
});
