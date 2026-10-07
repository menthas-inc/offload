// The thinking row on the phones (design 2026-10-07): the Splash mark from the
// first frame, the model's phrase as soon as it exists, Stop from ten seconds.
// The three dots and the 2.5 second wait are gone.
//
// The animation is one clock and five parts each reading their own keyframes,
// so the keyframes are checked against the design's numbers at the points the
// design names.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHRASE_FLOOR_MS, REST, phraseWait, pose } from "../lib/splash";

const conversation = readFileSync(
  new URL("../components/shell/Conversation.tsx", import.meta.url),
  "utf8",
);

describe("the row in the conversation", () => {
  it("replaces the dots, and shows a phrase without waiting", () => {
    expect(conversation).not.toMatch(/function Writing\b/);
    expect(conversation).not.toContain("SAY_AFTER_MS");
    expect(conversation).toContain("<Thinking />");
  });
});

describe("the row for a screen reader", () => {
  const row = readFileSync(new URL("../components/shell/Thinking.tsx", import.meta.url), "utf8");

  it("never folds Stop into one element with the mark", () => {
    // `accessible` on the row made it one element, so VoiceOver could not reach
    // Stop on a turn with no phrase, which is most of them.
    expect(row).not.toMatch(/accessible=\{!step\}/);
    expect(row).toContain('accessibilityLabel={label}');
  });

  it("says each phrase on iOS, where a live region does nothing", () => {
    expect(row).toContain("announceForAccessibility");
  });
});

describe("the phrase floor", () => {
  it("shows the first phrase at once and holds the next until the first has been up 400ms", () => {
    expect(PHRASE_FLOOR_MS).toBe(400);
    expect(phraseWait(null, 1_000)).toBe(0);
    expect(phraseWait(1_000, 1_100)).toBe(300);
    expect(phraseWait(1_000, 1_500)).toBe(0);
  });
});

describe("Splash, 3.2 seconds", () => {
  it("starts above the vessel and hidden", () => {
    const p = pose(0);
    expect(p.dot).toMatchObject({ y: -5, opacity: 0 });
  });

  it("has the dot in place and shown at 16%, and still there at 46%", () => {
    expect(pose(0.16).dot).toMatchObject({ y: 0, opacity: 1, sx: 1, sy: 1 });
    expect(pose(0.46).dot).toMatchObject({ y: 0, opacity: 1 });
  });

  it("drops the dot into the vessel and hides it on the hit", () => {
    expect(pose(0.61).dot).toMatchObject({ y: 9, sy: 1.1, opacity: 1 });
    const hit = pose(0.63).dot;
    expect(hit).toMatchObject({ y: 9.6, sx: 1.2, sy: 0.5, opacity: 0 });
  });

  it("gives the vessel under the hit and settles it by 84%", () => {
    expect(pose(0.6).vessel).toEqual({ sx: 1, sy: 1 });
    expect(pose(0.66).vessel.sy).toBeCloseTo(0.82);
    expect(pose(0.66).vessel.sx).toBeCloseTo(1.06);
    expect(pose(0.76).vessel.sy).toBeCloseTo(1.04);
    expect(pose(0.84).vessel).toEqual({ sx: 1, sy: 1 });
  });

  it("throws the three droplets over the rim and fades them out", () => {
    expect(pose(0.5).left.opacity).toBe(0);
    expect(pose(0.72).left).toMatchObject({ x: -5.5, y: -8, opacity: 1 });
    expect(pose(0.72).right).toMatchObject({ x: 5.5, y: -7, opacity: 1 });
    expect(pose(0.71).centre).toMatchObject({ x: 0.5, y: -10, s: 0.8, opacity: 1 });
    expect(pose(0.84).left).toMatchObject({ x: -8, y: -3, s: 0.6, opacity: 0 });
    expect(pose(0.82).centre).toMatchObject({ opacity: 0, s: 0.5 });
  });

  it("loops without a seam", () => {
    expect(pose(1)).toEqual(pose(0));
  });

  it("is the mark whole and still for reduced motion", () => {
    expect(REST.dot).toEqual({ y: 0, sx: 1, sy: 1, opacity: 1 });
    expect(REST.vessel).toEqual({ sx: 1, sy: 1 });
    expect([REST.left.opacity, REST.right.opacity, REST.centre.opacity]).toEqual([0, 0, 0]);
  });
});
