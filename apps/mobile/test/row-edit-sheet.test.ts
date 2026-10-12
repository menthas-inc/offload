// 2026-10-07. The row's sheet never draws an empty value. Repeats on a row
// with no date said nothing, which read as broken, and Labels on a row with
// none said nothing either: they say Never and None, as the kit's sheet does.
// Read from the source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { repeatsLabel } from "../lib/when";

const source = readFileSync(new URL("../components/shell/RowEditSheet.tsx", import.meta.url), "utf8");

describe("the row's sheet", () => {
  it("says Never for Repeats with no date", () => {
    expect(repeatsLabel({ day: null, time: null, endTime: null, rrule: null })).toBe("Never");
    expect(source).toContain("{repeatsLabel(when)}");
    expect(source).not.toMatch(/when\.day \? repeatsLabel\(when\) : ""/);
  });

  it("says None for Labels when the row carries none", () => {
    expect(source).toMatch(/\.join\(", "\) \|\| "None"\}/);
  });
});

describe("the When sheet (owner, 2026-10-12)", () => {
  const sheet = readFileSync(new URL("../components/shell/WhenSheet.tsx", import.meta.url), "utf8");

  it("draws no clock while All day is on: the hour rows and the wheel exist only with a time", () => {
    expect(sheet).not.toMatch(/clockLabel\(time \?\? "09:00"\)/);
    expect(sheet).not.toMatch(/opacity: time === null \? 0\.4/);
    expect(sheet).toMatch(/time !== null \? \(/);
  });
});
