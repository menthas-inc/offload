// 046. On Android the BlurView paints its own overlay under the plate tint, so
// the tint's stops are reduced to land on the token values combined rather than
// stacking two tints (the plate read nearly opaque on the Pixel, 2026-10-21).

import { describe, expect, it } from "vitest";
import { androidOverlay, stackedAlpha } from "../lib/glass";

const combined = (under: number, over: number) => 1 - (1 - under) * (1 - over);

describe("stackedAlpha", () => {
  it("lands the two layers on the target", () => {
    for (const target of [0.55, 0.85, 0.9]) {
      expect(combined(0.468, stackedAlpha(target, 0.468))).toBeCloseTo(target, 6);
    }
  });
  it("adds nothing when the layer underneath already reaches the target", () => {
    expect(stackedAlpha(0.45, 0.468)).toBe(0);
  });
  it("is the target itself over nothing", () => {
    expect(stackedAlpha(0.85, 0)).toBeCloseTo(0.85, 6);
  });
});

describe("androidOverlay (expo-blur 57, TintStyle.kt)", () => {
  it("light: white at 0.78 of the intensity; dark: grey at 0.55", () => {
    expect(androidOverlay(false, 60)).toBeCloseTo(0.468, 6);
    expect(androidOverlay(true, 60)).toBeCloseTo(0.33, 6);
  });
});
