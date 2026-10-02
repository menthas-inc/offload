// 030 T0.5. The map's three shadows, from the design system's own tokens.
//
// They sit over Google's map rather than a surface, so they keep one value in
// both themes; dark's "no drop shadow" rule is for surfaces.

import { describe, expect, it } from "vitest";
import { token } from "@offload/tokens";

describe("the map's tokens", () => {
  it("has a point, a picked point and a callout shadow, the same in both themes", () => {
    for (const name of ["shadow-point", "shadow-point-picked", "shadow-callout"] as const) {
      const light = token(name as never, "light");
      expect(light, name).toMatch(/rgba\(11,\s*11,\s*11/);
      expect(token(name as never, "dark"), name).toBe(light);
    }
  });
});
