// 051. Reading a yearly day out of what somebody said, and out of a memory.

import { describe, expect, it } from "vitest";
import { daysIn, realDay, withoutDays } from "../src/memories/dates.js";

describe("daysIn", () => {
  it.each([
    ["Kristina's birthday is Feb 1st", "02-01"],
    ["Kristina's birthday is 1 February.", "02-01"],
    ["her birthday is February 1", "02-01"],
    ["it's on the 1st of Feb", "02-01"],
    ["Sam was born on 3 May 2019", "05-03"],
    ["our anniversary is June 12th", "06-12"],
    ["Meera's birthday, 14 Mar", "03-14"],
    ["Leap day baby: 29 Feb", "02-29"],
    ["Sept 9", "09-09"],
    ["1er février", null],
  ])("reads %s", (text, on) => {
    expect(daysIn(text)[0] ?? null).toBe(on);
  });

  it.each([
    "her birthday is in February",
    "1/2",
    "2026-02-01",
    "may I ask something",
    "February 31",
    "30 Feb",
    "Feb 0",
  ])("reads nothing from %s", (text) => {
    expect(daysIn(text)).toEqual([]);
  });

  it("reads every day in a sentence", () => {
    expect(daysIn("Ana is 2 March and Tom is March 9")).toEqual(["03-02", "03-09"]);
  });
});

describe("withoutDays", () => {
  it("takes the day out and leaves the rest", () => {
    expect(withoutDays("Kristina's birthday is 1 February.").replace(/\s+/g, " ").trim()).toBe("Kristina's birthday is");
    expect(withoutDays("Sam's birthday is 3 May 2019.").replace(/\s+/g, " ").trim()).toBe("Sam's birthday is 2019.");
  });
});

describe("realDay", () => {
  it.each([
    ["02-01", true],
    ["02-29", true],
    ["02-30", false],
    ["13-01", false],
    ["04-31", false],
    ["2-1", false],
  ])("%s is %s", (on, ok) => {
    expect(realDay(on)).toBe(ok);
  });
});
