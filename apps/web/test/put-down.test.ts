// 028. When a loose thing was put down, one wording on every surface: today,
// yesterday, the weekday within the week, then the date.

import { describe, expect, it } from "vitest";
import { putDown } from "@offload/widgets";

describe("when it was put down", () => {
  const today = "2026-10-02"; // a Friday
  it("is today and yesterday by name", () => {
    expect(putDown("2026-10-02", today)).toBe("today");
    expect(putDown("2026-10-01", today)).toBe("yesterday");
  });
  it("is the weekday within the week", () => {
    expect(putDown("2026-09-28", today)).toBe("Monday");
    expect(putDown("2026-09-26", today)).toBe("Saturday");
  });
  it("is the date from a week back, never 'last week'", () => {
    expect(putDown("2026-09-25", today)).toMatch(/25 Sept?|Sep 25/);
    expect(putDown("2026-08-14", today)).toMatch(/14 Aug|Aug 14/);
  });
});
