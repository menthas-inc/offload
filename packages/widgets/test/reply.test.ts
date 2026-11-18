// 052. Every word a reply draws beside its slices comes from code, fed the
// turn's record (AC-23). No model writes any of these.

import { describe, expect, it } from "vitest";
import { alsoLine, calendarColour, changedLine, dayTitle, gridFor, periodLabel, wasLine, pillLabel, sourceLine, summaryWords } from "../src/index.js";

describe("summaryWords", () => {
  it.each([
    [{ kind: "new", count: 4 }, "4 new"],
    [{ kind: "new", count: 1 }, "Added"],
    [{ kind: "filed", count: 2 }, "2 filed"],
    [{ kind: "moved", count: 1 }, "Moved"],
    [{ kind: "moved", count: 3 }, "3 moved"],
    [{ kind: "ticked", count: 2 }, "2 ticked"],
    [{ kind: "ticked", count: 1 }, "Ticked"],
    [{ kind: "started", count: 1 }, "Started"],
    [{ kind: "remembered", count: 1 }, "Remembered"],
    [{ kind: "added", count: 1 }, "Added"],
    [{ kind: "changed", count: 1 }, "Changed"],
    [{ kind: "changed", count: 3 }, "3 changed"],
  ] as const)("%o reads %s", (summary, words) => {
    expect(summaryWords(summary)).toBe(words);
  });
});

describe("pillLabel", () => {
  it("words each kind", () => {
    expect(pillLabel({ kind: "date" })).toBe("Add a date");
    expect(pillLabel({ kind: "remind" })).toBe("Remind me");
    expect(pillLabel({ kind: "directions" })).toBe("Directions");
    expect(pillLabel({ kind: "calendar", calendar: { id: "c", name: "Personal", colour: "provider-lavender" } })).toBe("Add to Personal");
    expect(pillLabel({ kind: "share", person: { accountId: "a", name: "Ana Duarte" } })).toBe("Share with Ana");
  });

  it("keeps every label to 24 characters, cutting a long name at a word", () => {
    const label = pillLabel({ kind: "calendar", calendar: { id: "c", name: "Family and friends shared calendar", colour: "provider-black" } });
    expect(label).toBe("Add to Family and…");
    expect(label.length).toBeLessThanOrEqual(24);
    const one = pillLabel({ kind: "calendar", calendar: { id: "c", name: "Supercalifragilisticexpialidocious", colour: "provider-black" } });
    expect(one.length).toBeLessThanOrEqual(24);
  });
});

describe("alsoLine", () => {
  it("leads the threads past the third", () => {
    expect(alsoLine([{ id: "1", name: "Bookshelf" }, { id: "2", name: "Flat admin" }])).toEqual({ lead: "Also in", threads: [{ id: "1", name: "Bookshelf" }, { id: "2", name: "Flat admin" }] });
    expect(alsoLine([])).toBeNull();
  });
});

describe("sourceLine", () => {
  it("shows three domains, then a count in words", () => {
    const four = ["a.com", "b.com", "c.com", "d.com"].map((domain) => ({ domain, url: `https://${domain}/` }));
    expect(sourceLine(four)).toEqual({ shown: four.slice(0, 3), more: "and 1 more" });
    expect(sourceLine(four.slice(0, 2))).toEqual({ shown: four.slice(0, 2), more: null });
    expect(sourceLine([])).toBeNull();
  });
});

describe("changedLine", () => {
  it("names what a late Undo left as it was", () => {
    expect(changedLine([])).toBe("Undone");
    expect(changedLine(["Pay rent"])).toBe("Undone, except Pay rent, which changed since");
    expect(changedLine(["Pay rent", "Bins"])).toBe("Undone, except Pay rent and Bins, which changed since");
    expect(changedLine(["a", "b", "c", "d"])).toBe("Undone, except 4 that changed since");
  });
});

describe("periodLabel", () => {
  it("says how far a date is, from two weeks on", () => {
    expect(periodLabel("2027-03-28", "2026-11-17")).toBe("in 19 weeks");
    expect(periodLabel("2027-05-09", "2026-11-17")).toBe("in 25 weeks");
    expect(periodLabel("2026-11-20", "2026-11-17")).toBeNull();
    expect(periodLabel("2027-11-17", "2026-11-17")).toBe("in 12 months");
    expect(periodLabel("2026-09-01", "2026-11-17")).toBe("11 weeks ago");
  });
});

describe("gridFor", () => {
  const days = (grid: ReturnType<typeof gridFor>) => grid.weeks.flatMap((week) => week.days.map((day) => day.iso));
  it("draws two weeks for a fortnight and only the weeks a shorter span reaches", () => {
    expect(days(gridFor({ from: "2026-11-16", to: "2026-11-29" }, [], "2026-11-17"))).toHaveLength(14);
    const week = days(gridFor({ from: "2026-11-16", to: "2026-11-22" }, [], "2026-11-17"));
    expect([week[0], week.at(-1), week.length]).toEqual(["2026-11-16", "2026-11-22", 7]);
  });

  it("starts two weeks on the Monday the server's period does, whatever the week start", () => {
    const sunday = days(gridFor({ from: "2026-11-16", to: "2026-11-29" }, [], "2026-11-17", "sunday"));
    expect([sunday[0], sunday.at(-1)]).toEqual(["2026-11-16", "2026-11-29"]);
  });

  it("draws a month for a longer period", () => {
    const may = days(gridFor({ from: "2027-05-01", to: "2027-05-31" }, [], "2026-11-17"));
    expect(may).toContain("2027-05-31");
    expect(may.length % 7).toBe(0);
  });
});

describe("wasLine", () => {
  it("says when a moved entry was, in the reader's zone, and nothing without a date", () => {
    expect(wasLine({ occursAt: "2026-11-20T15:00:00.000Z" }, "Europe/London")).toBe(`was ${dayTitle("2026-11-20")}, 15:00`);
    expect(wasLine({ dueAt: "2026-11-20T23:30:00.000Z" }, "Asia/Tokyo")).toBe(`was ${dayTitle("2026-11-21")}, 8:30`);
    expect(wasLine({ dueAt: null }, "UTC")).toBeNull();
    expect(wasLine(undefined, "UTC")).toBeNull();
  });
});

describe("calendarColour", () => {
  it("passes a colour and nothing that could load or break a style", () => {
    expect(calendarColour("rgb(121, 134, 203)")).toBe("rgb(121, 134, 203)");
    expect(calendarColour(`#${"e67c73"}`)).toBe(`#${"e67c73"}`);
    for (const bad of ["url(https://x.example/p.png)", "red;background:url(x)", "provider-flamingo", "", null, undefined]) {
      expect(calendarColour(bad)).toBeNull();
    }
  });
});

describe("the words", () => {
  it("carry no dash and no banned noun", () => {
    const all = [
      summaryWords({ kind: "new", count: 4 }),
      pillLabel({ kind: "date" }),
      changedLine(["x"]),
      periodLabel("2027-03-28", "2026-11-17")!,
      alsoLine([{ id: "1", name: "x" }])!.lead,
      sourceLine([1, 2, 3, 4].map((n) => ({ domain: `${n}.com`, url: "" })))!.more!,
    ].join(" ");
    expect(all).not.toMatch(/[\u2013\u2014]|\b(item|thing|things|folder|capture)\b/i);
  });
});
