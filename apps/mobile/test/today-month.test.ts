// 2026-10-19 Today's two weeks on the phones: this week and next, in place of
// the thread calendar's whole month (2026-10-18). Still the shared grid, so a
// day is dotted, named and picked the same way; it is drawn two rows and the
// arrows step a week at a time. These tests read source; the counts are tested
// on the server and the two-week arithmetic in `@offload/widgets`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("Today's two weeks", () => {
  const screen = read("components/today/TodayScreen.tsx");

  it("draws the shared grid over two weeks, stepping a week at a time", () => {
    expect(screen).toMatch(/<MonthGrid/);
    expect(screen).toMatch(/unit="week"/);
    expect(screen).toMatch(/twoWeekFor\(month \?\? date/);
    expect(screen).toMatch(/stepWeek\(grid\.key, by\)/);
    expect(screen).toMatch(/last=\{stepWeek\(grid\.key, 1\) > lastDay\}/);
    expect(screen).not.toMatch(/monthFor|stepMonth/);
  });

  it("closes the days before today and past the edge", () => {
    expect(screen).toMatch(/closed=\{\(iso\) => iso < today \|\| iso > lastDay\}/);
    expect(screen).not.toMatch(/DayStepper/);
  });

  it("dots the grid from the read, for the grid's whole window", () => {
    expect(screen).toMatch(/fetchMonth\(gridFrom, gridTo\)/);
    expect(read("lib/today.ts")).toMatch(/\/v1\/today\/month\?from=\$\{encodeURIComponent\(from\)\}&to=\$\{encodeURIComponent\(to\)\}/);
  });

  it("names the picked day in the head, as a header, with no name under the grid and no day arrows (the owner, 2026-10-19)", () => {
    expect(screen).toMatch(/title=\{date !== today \? dayTitle\(date\) : undefined\}/);
    expect(screen).not.toMatch(/DayName/);
    expect(read("components/shell/MonthGrid.tsx")).toMatch(/accessibilityRole=\{heading \? "header" : undefined\}/);
    expect(read("components/today/DayParts.tsx") + screen).not.toMatch(/Previous day|Next day|export function DayName/);
  });

  it("is the same grid the thread calendar draws, which stays a month", () => {
    const timeline = read("components/shell/Timeline.tsx");
    expect(timeline).toMatch(/<MonthGrid /);
    expect(timeline).not.toMatch(/unit="week"/);
    expect(read("components/shell/MonthGrid.tsx")).toMatch(/disabled=\{closed\?\.\(day\.iso\) \?\? false\}/);
  });
});
