// 037. Thread icons on the phones: the set has every glyph a thread can
// carry, the wash is placed and filtered as the design draws it, and no lasso
// stands for a particular thread.
//
// The drawing itself is checked on a device. What it rests on is checked here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THREAD_ICON, THREAD_ICON_NAMES } from "@offload/widgets";
import { ICONS } from "../components/icons.generated";
import { washFilter, washKey, washRect } from "../lib/threadWashMath";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const code = (file: string) => read(file).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the set (AC-14)", () => {
  it("has all seventy and lasso", () => {
    const missing = [...THREAD_ICON_NAMES, DEFAULT_THREAD_ICON].filter((name) => !(name in ICONS));
    expect(missing).toEqual([]);
  });
});

describe("the wash (AC-12)", () => {
  it("draws the texture at 220% of a box 30% larger than the icon, placed by the seed", () => {
    // The box is 1.6 of the icon and the texture 3.52; position 0% pins the
    // texture's left edge to the box's, 100% its right edge to the box's.
    expect(washRect(100, { x: 0, y: 0, angle: 0 })).toEqual({ left: -30, top: -30, side: 352, angle: 0 });
    expect(washRect(100, { x: 100, y: 50, angle: 90 })).toEqual({ left: -222, top: -126, side: 352, angle: 90 });
    expect(washRect(40, { x: 50, y: 50, angle: 0 }).side).toBeCloseTo(140.8);
  });

  it("greyscales, then takes the contrast and the brightness the design names, in unit scale", () => {
    const light = washFilter("light");
    // Greyscale and contrast 2.2 in one matrix: slope 2.2 on luminance,
    // intercept -0.6, not -153.
    expect(light.first.slice(0, 5).map((n) => Number(n.toFixed(4)))).toEqual([0.4677, 1.5734, 0.1588, 0, -0.6]);
    expect(light.then).toBe(1.02);
    const dark = washFilter("dark");
    // Inverted before the contrast: slope -2.4, intercept 2.4 - 0.7.
    expect(dark.first.slice(0, 5).map((n) => Number(n.toFixed(4)))).toEqual([-0.5102, -1.7165, -0.1733, 0, 1.7]);
    expect(dark.then).toBe(0.42);
  });

  it("is cached by everything that changes the picture, the screen's density among it", () => {
    const base = { seed: 7, hue: 3, size: 40, theme: "light" as const, round: false, scale: 3 };
    const keys = [base, { ...base, seed: 8 }, { ...base, hue: 4 }, { ...base, size: 44 }, { ...base, theme: "dark" as const }, { ...base, round: true }, { ...base, scale: 2 }].map(washKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is a picture and never a live canvas per row", () => {
    const icon = code("components/ThreadIcon.tsx");
    expect(icon).not.toContain("<Canvas");
    expect(icon).toContain("<Image");
  });
});

const DRAWS = [
  "components/shell/ThreadRow.tsx",
  "components/shell/ThreadPill.tsx",
  "components/shell/AnswerResult.tsx",
  "components/shell/MoveSheet.tsx",
  "components/shell/Conversation.tsx",
  "components/loose/Suggestion.tsx",
  "components/screens/Thread.tsx",
  "components/screens/EditThreadSheet.tsx",
  "app/people/[accountId].tsx",
];

describe("where it shows (AC-11)", () => {
  it.each(DRAWS)("%s draws ThreadIcon", (file) => {
    expect(code(file)).toContain("<ThreadIcon");
  });

  it.each([
    "components/shell/ThreadRow.tsx",
    "components/shell/ThreadPill.tsx",
    "components/shell/AnswerResult.tsx",
    "components/shell/MoveSheet.tsx",
    "components/shell/Conversation.tsx",
    "components/loose/Suggestion.tsx",
    "app/people/[accountId].tsx",
  ])("%s names no lasso", (file) => {
    expect(code(file)).not.toMatch(/["']lasso["']/);
  });

  it("hides the icon from a screen reader: the name beside it says it", () => {
    expect(code("components/ThreadIcon.tsx")).toContain("accessibilityElementsHidden");
    expect(code("components/ThreadIcon.tsx")).toContain('importantForAccessibility="no-hide-descendants"');
  });
});

describe("Edit thread (AC-13)", () => {
  const screen = code("components/screens/Thread.tsx");
  const sheet = code("components/screens/EditThreadSheet.tsx");

  it("replaces rename, from More and from the bar", () => {
    expect(screen).not.toContain("Rename thread");
    expect(screen).toContain("Edit thread");
    expect(screen).not.toContain("renameThread");
    expect(screen).toContain('did: "Thread updated"');
    expect(screen).toContain("threadLookAfter(before, change, shown)");
    expect(screen).toContain(`failed: "Couldn't save that"`);
  });

  it("offers the seventy and the ten hues as radio groups, named", () => {
    expect(sheet).toContain("THREAD_ICON_NAMES");
    expect(sheet).toContain("HUE_NAMES");
    expect(sheet).toContain('accessibilityRole="radiogroup"');
    expect(sheet).toContain('accessibilityRole="radio"');
    expect(sheet).toContain("threadIconLabel");
  });

  it("sends what the shared rule says changed", () => {
    expect(sheet).toContain("threadChange(");
    expect(sheet).toContain("previewThreadIcon(");
  });

  it("is as tall as its contents and rides up with the keyboard", () => {
    expect(sheet).not.toMatch(/sheetStyle=\{\{ top/);
    expect(sheet).toContain('keyboard="lift"');
  });
});
