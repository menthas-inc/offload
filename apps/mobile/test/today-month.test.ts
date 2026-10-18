// 2026-10-18 Today's month on the phones: the thread calendar's grid in place
// of the day stepper. These tests read source; the counts are tested on the
// server and drawn by `@offload/widgets`' `monthFor`, tested there.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("Today's month", () => {
  const screen = read("components/today/TodayScreen.tsx");

  it("draws the shared month grid, with the days before today and past the edge closed", () => {
    expect(screen).toMatch(/<MonthGrid/);
    expect(screen).toMatch(/closed=\{\(iso\) => iso < today \|\| iso > lastDay\}/);
    expect(screen).not.toMatch(/DayStepper/);
  });

  it("dots the grid from the month read, for the grid's whole window", () => {
    expect(screen).toMatch(/fetchMonth\(gridFrom, gridTo\)/);
    expect(read("lib/today.ts")).toMatch(/\/v1\/today\/month\?from=\$\{from\}&to=\$\{to\}/);
  });

  it("names the picked day in the month's head, as a header, with no name under the grid and no day arrows (the owner, 2026-10-18)", () => {
    expect(screen).toMatch(/title=\{date !== today && grid\.inMonth\(date\) \? dayTitle\(date\) : undefined\}/);
    expect(screen).not.toMatch(/DayName/);
    expect(read("components/shell/MonthGrid.tsx")).toMatch(/accessibilityRole=\{heading \? "header" : undefined\}/);
    expect(read("components/today/DayParts.tsx") + screen).not.toMatch(/Previous day|Next day|export function DayName/);
  });

  it("is the same grid the thread calendar draws", () => {
    expect(read("components/shell/Timeline.tsx")).toMatch(/<MonthGrid /);
    expect(read("components/shell/MonthGrid.tsx")).toMatch(/disabled=\{closed\?\.\(day\.iso\) \?\? false\}/);
  });
});
