// 033 First run on the phones: what the screens draw and call, read from their
// source, since these tests render nothing. Each is a rule the handoff states
// that a logic test cannot reach.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path: string): boolean => existsSync(new URL(`../${path}`, import.meta.url));

const FIRST_RUN = [
  "components/firstrun/FirstRun.tsx",
  "components/firstrun/Intro.tsx",
  "components/firstrun/IntroArt.tsx",
  "components/firstrun/BeforeYouStart.tsx",
  "components/firstrun/BringItIn.tsx",
  "components/firstrun/RunFooter.tsx",
  "components/screens/Welcome.ios.tsx",
  "components/screens/Welcome.android.tsx",
];
// Comments say what the code no longer does; the rules are about the code.
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("033 the phones' first run", () => {
  it("asks for notifications only from the card (AC-6)", () => {
    const asking = FIRST_RUN.filter((file) => /requestPermissionsAsync/.test(code(file)));
    expect(asking).toEqual(["components/firstrun/BringItIn.tsx"]);
  });

  it("puts no Skip or Not now in a corner (AC-13)", () => {
    for (const file of FIRST_RUN) {
      expect(code(file), file).not.toMatch(/"Not now"|>\s*Skip\s*</);
    }
    expect(code("components/firstrun/BringItIn.tsx")).toMatch(/skip=\{/);
  });

  it("connects with the Bring landing and comes back to its web page (AC-9)", () => {
    const source = code("components/firstrun/BringItIn.tsx");
    expect(source).toMatch(/landing=first-run-bring/);
    expect(source).toMatch(/\/welcome\/bring/);
    expect(source).not.toMatch(/\/settings\/calendar/);
  });

  it("blooms only behind the intro's art (AC-16)", () => {
    for (const file of FIRST_RUN) expect(code(file), file).not.toMatch(/GateBackdrop/);
    expect(code("components/firstrun/Intro.tsx")).toMatch(/<PrismField\b/);
    for (const file of ["components/firstrun/BeforeYouStart.tsx", "components/firstrun/BringItIn.tsx"]) {
      expect(code(file), file).not.toMatch(/PrismField/);
    }
  });

  it("hides the art's drawing and announces the copy (AC-4)", () => {
    const source = code("components/firstrun/Intro.tsx");
    expect(source).toMatch(/accessibilityLiveRegion="polite"/);
    expect(source).toMatch(/accessibilityLabel="Next scene"/);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });

  it("is gone where it was replaced (AC-18)", () => {
    expect(exists("components/TutorialArt.tsx")).toBe(false);
    expect(read("components/ConnectStep.tsx")).not.toMatch(/ConnectStepBar/);
    expect(read("lib/gate.ts")).not.toMatch(/\bTUTORIAL\b|offersFor|dotsFor|mailStep/);
  });

  it("says what Help's row now replays (AC-21)", () => {
    expect(read("app/settings/[page].tsx")).toMatch(/note="The intro from your first day\."/);
  });
});
