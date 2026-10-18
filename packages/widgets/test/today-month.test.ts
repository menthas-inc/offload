// 2026-10-18 Today's month: the server's counts drawn by the thread calendar's
// own month, so both grids dot a day the same way.

import { describe, expect, it } from "vitest";
import { dayTitle, monthDated, monthFor } from "../src/index.js";

describe("monthDated", () => {
  it("turns a day's counts into dots of each kind, a calendar's hollow and not lifting the cell", () => {
    const dated = monthDated([{ date: "2026-10-20", task: 2, event: 1, calendar: 1 }]);
    const day = monthFor("2026-10-01", dated, "2026-10-18").weeks.flatMap((week) => week.days).find((one) => one.iso === "2026-10-20")!;
    expect(day.dots.map((dot) => dot.kind).sort()).toEqual(["calendar", "event", "task", "task"]);
    expect(day.count).toBe(4);
    expect(day.own).toBe(3);
  });

  it("past the dot cap, the count still tells the truth", () => {
    const dated = monthDated([{ date: "2026-10-20", task: 9, event: 0, calendar: 0 }]);
    const day = monthFor("2026-10-01", dated, "2026-10-18").weeks.flatMap((week) => week.days).find((one) => one.iso === "2026-10-20")!;
    expect(day.count).toBe(9);
    expect(day.dots.length).toBeLessThan(9);
  });
});

describe("dayTitle", () => {
  it("names a day in the month's head as the product writes a date, with no ordinal", () => {
    expect(dayTitle("2026-10-22")).toBe("Thursday 22 October");
  });
});
