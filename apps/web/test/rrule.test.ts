// The recurrence rule: a closed grammar, one implementation, three surfaces.
//
// 023 AC-8  every shape in the fixture is accepted or refused by name, and the
//           stored string is always the canonical serialisation.
// 023 AC-9  the expander draws a rule over a window, jumps rather than walks,
//           clamps, lands on the nth and the last weekday, honours UNTIL and
//           COUNT, and stops at 400 steps.
// 023 AC-19 the presets read off the picked day.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RULE_STEP_CAP,
  describeRule,
  formatRule,
  nextOnOrAfter,
  occurrencesIn,
  parseRule,
  presetsFor,
} from "@offload/widgets";

const fixture = JSON.parse(
  readFileSync(new URL("../../../packages/widgets/fixtures/rules.json", import.meta.url), "utf8"),
) as {
  accepted: { in: string; canonical: string }[];
  refused: { in: string; reason: string }[];
};

function rule(text: string) {
  const parsed = parseRule(text);
  if (!parsed.ok) throw new Error(`refused ${text}: ${parsed.reason}`);
  return parsed.rule;
}

describe("AC-8 the grammar", () => {
  for (const { in: text, canonical } of fixture.accepted) {
    it(`accepts ${JSON.stringify(text)} as ${canonical}`, () => {
      const parsed = parseRule(text);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(formatRule(parsed.rule)).toBe(canonical);
    });
  }
  for (const { in: text, reason } of fixture.refused) {
    it(`refuses ${JSON.stringify(text)} as ${reason}`, () => {
      const parsed = parseRule(text);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.reason).toBe(reason);
    });
  }
  it("is idempotent on its own output", () => {
    for (const { canonical } of fixture.accepted) {
      expect(formatRule(rule(canonical))).toBe(canonical);
    }
  });
});

/** A Friday. */
const ANCHOR = "2026-09-25";

describe("AC-9 the expander", () => {
  it("daily from the anchor", () => {
    expect(occurrencesIn(rule("FREQ=DAILY"), ANCHOR, "2026-09-24", "2026-09-27")).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });
  it("every third day", () => {
    expect(occurrencesIn(rule("FREQ=DAILY;INTERVAL=3"), ANCHOR, "2026-09-25", "2026-10-05")).toEqual([
      "2026-09-25",
      "2026-09-28",
      "2026-10-01",
      "2026-10-04",
    ]);
  });
  it("weekly on the anchor's weekday", () => {
    expect(occurrencesIn(rule("FREQ=WEEKLY;BYDAY=FR"), ANCHOR, "2026-09-25", "2026-10-10")).toEqual([
      "2026-09-25",
      "2026-10-02",
      "2026-10-09",
    ]);
  });
  it("weekly with no day set is the anchor's weekday", () => {
    expect(occurrencesIn(rule("FREQ=WEEKLY"), ANCHOR, "2026-09-25", "2026-10-10")).toEqual([
      "2026-09-25",
      "2026-10-02",
      "2026-10-09",
    ]);
  });
  it("every other week on two days, counted from the anchor's week, with the anchor itself first", () => {
    expect(
      occurrencesIn(rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH"), ANCHOR, "2026-09-20", "2026-10-25"),
    ).toEqual(["2026-09-25", "2026-10-05", "2026-10-08", "2026-10-19", "2026-10-22"]);
  });
  it("every weekday skips the weekend", () => {
    expect(
      occurrencesIn(rule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), ANCHOR, "2026-09-25", "2026-09-30"),
    ).toEqual(["2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30"]);
  });
  it("the fourth Friday of the month", () => {
    expect(occurrencesIn(rule("FREQ=MONTHLY;BYDAY=4FR"), ANCHOR, "2026-09-01", "2026-12-31")).toEqual([
      "2026-09-25",
      "2026-10-23",
      "2026-11-27",
      "2026-12-25",
    ]);
  });
  it("the last Friday of the month", () => {
    expect(occurrencesIn(rule("FREQ=MONTHLY;BYDAY=-1FR"), ANCHOR, "2026-09-01", "2026-12-31")).toEqual([
      "2026-09-25",
      "2026-10-30",
      "2026-11-27",
      "2026-12-25",
    ]);
  });
  it("a day of the month clamps in short months and comes back", () => {
    expect(
      occurrencesIn(rule("FREQ=MONTHLY;BYMONTHDAY=31"), "2026-08-31", "2026-08-01", "2026-11-30"),
    ).toEqual(["2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30"]);
  });
  it("monthly with no anchor part keeps the anchor's day and clamps", () => {
    expect(occurrencesIn(rule("FREQ=MONTHLY"), "2026-01-31", "2026-01-01", "2026-03-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
  it("yearly clamps the 29th of February", () => {
    expect(occurrencesIn(rule("FREQ=YEARLY"), "2024-02-29", "2024-01-01", "2028-12-31")).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });
  it("UNTIL is inclusive of its day", () => {
    expect(
      occurrencesIn(rule("FREQ=DAILY;UNTIL=20260927T000000Z"), ANCHOR, "2026-09-25", "2026-10-05"),
    ).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
  });
  it("COUNT counts from the anchor", () => {
    expect(occurrencesIn(rule("FREQ=DAILY;COUNT=3"), ANCHOR, "2026-09-01", "2026-10-05")).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(
      occurrencesIn(rule("FREQ=WEEKLY;BYDAY=MO,TH;COUNT=3"), ANCHOR, "2026-09-01", "2026-12-31"),
    ).toEqual(["2026-09-25", "2026-09-28", "2026-10-01"]);
  });
  it("jumps to the window rather than walking from an old anchor", () => {
    expect(occurrencesIn(rule("FREQ=DAILY"), "2020-01-01", "2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(occurrencesIn(rule("FREQ=WEEKLY;BYDAY=TU"), "2020-01-07", "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
    ]);
    expect(occurrencesIn(rule("FREQ=MONTHLY;BYDAY=1MO"), "2020-01-06", "2026-09-01", "2026-10-31")).toEqual([
      "2026-09-07",
      "2026-10-05",
    ]);
  });
  it("draws nothing before the anchor", () => {
    expect(occurrencesIn(rule("FREQ=DAILY"), ANCHOR, "2026-09-01", "2026-09-24")).toEqual([]);
  });
  it("stops at the cap inside one call", () => {
    const days = occurrencesIn(rule("FREQ=DAILY"), "2026-01-01", "2026-01-01", "2027-12-31");
    expect(days).toHaveLength(RULE_STEP_CAP);
    expect(RULE_STEP_CAP).toBe(400);
  });
  it("names the next occurrence on or after a day", () => {
    expect(nextOnOrAfter(rule("FREQ=WEEKLY;BYDAY=FR"), ANCHOR, "2026-10-03")).toBe("2026-10-09");
    expect(nextOnOrAfter(rule("FREQ=WEEKLY;BYDAY=FR"), ANCHOR, "2026-09-25")).toBe("2026-09-25");
    expect(nextOnOrAfter(rule("FREQ=DAILY;COUNT=3"), ANCHOR, "2026-10-03")).toBeNull();
    expect(nextOnOrAfter(rule("FREQ=DAILY;UNTIL=20260927T000000Z"), ANCHOR, "2026-09-28")).toBeNull();
  });
});

describe("AC-19 and the cadence line", () => {
  it("describes every shape in words", () => {
    const cases: [string, string][] = [
      ["FREQ=DAILY", "Daily"],
      ["FREQ=DAILY;INTERVAL=3", "Every 3 days"],
      ["FREQ=WEEKLY", "Weekly on Friday"],
      ["FREQ=WEEKLY;BYDAY=FR", "Weekly on Friday"],
      ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", "Every 2 weeks on Monday and Thursday"],
      ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
      ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "Weekly on Monday, Wednesday and Friday"],
      ["FREQ=MONTHLY;BYDAY=4FR", "Monthly on the fourth Friday"],
      ["FREQ=MONTHLY;BYDAY=-1FR", "Monthly on the last Friday"],
      ["FREQ=MONTHLY;BYMONTHDAY=25", "Monthly on the 25th"],
      ["FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1", "Every 2 months on the 1st"],
      ["FREQ=MONTHLY", "Monthly on the 25th"],
      ["FREQ=YEARLY", "Annually on 25 September"],
      ["FREQ=YEARLY;INTERVAL=2", "Every 2 years on 25 September"],
      ["FREQ=WEEKLY;BYDAY=TU;UNTIL=20261225T000000Z", "Weekly on Tuesday, until 25 Dec"],
      ["FREQ=WEEKLY;BYDAY=TU;UNTIL=20270105T000000Z", "Weekly on Tuesday, until 5 Jan 2027"],
      ["FREQ=DAILY;COUNT=13", "Daily, 13 times"],
    ];
    for (const [text, words] of cases) {
      expect(describeRule(rule(text), ANCHOR, "en-GB")).toBe(words);
    }
  });
  it("offers the seven presets for a day, reading off it", () => {
    expect(presetsFor(ANCHOR, "en-GB")).toEqual([
      { label: "Never", rule: null },
      { label: "Daily", rule: "FREQ=DAILY" },
      { label: "Weekly on Friday", rule: "FREQ=WEEKLY;BYDAY=FR" },
      { label: "Every weekday", rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
      { label: "Monthly on the fourth Friday", rule: "FREQ=MONTHLY;BYDAY=4FR" },
      { label: "Annually on 25 September", rule: "FREQ=YEARLY" },
      { label: "Custom", rule: "custom" },
    ]);
  });
  it("reads a fifth weekday as the last", () => {
    expect(presetsFor("2026-10-30", "en-GB")[4]).toEqual({
      label: "Monthly on the last Friday",
      rule: "FREQ=MONTHLY;BYDAY=-1FR",
    });
  });
});
