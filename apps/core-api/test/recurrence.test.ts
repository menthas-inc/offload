// 012 D: a recurring edit means this and all following, and never a past one.
//
// AC-7.

import { describe, expect, it } from "vitest";
import { splitUid, truncate, untilFor } from "../src/connectors/recurrence.js";

const SPLIT = new Date("2026-10-06T09:00:00Z");

describe("AC-7 the split point", () => {
  it("ends the old series just before the occurrence being changed", () => {
    // UNTIL is inclusive in iCalendar, so the split point itself has to fall
    // outside it. A second either way is an occurrence that exists twice or
    // not at all.
    expect(untilFor(SPLIT)).toBe("20261006T085959Z");
  });

  it("never touches a past occurrence", () => {
    const truncated = truncate(["RRULE:FREQ=WEEKLY;BYDAY=TU"], SPLIT);
    expect(truncated[0]).toContain("UNTIL=20261006T085959Z");
    expect(truncated[0]).toContain("FREQ=WEEKLY");
  });
});

describe("AC-7 truncating a rule", () => {
  it("replaces an UNTIL that is already there", () => {
    const truncated = truncate(["RRULE:FREQ=WEEKLY;UNTIL=20271231T000000Z"], SPLIT);
    expect(truncated[0]).toBe("RRULE:FREQ=WEEKLY;UNTIL=20261006T085959Z");
  });

  it("drops a COUNT, because a rule cannot carry both", () => {
    // The series is being given an end date instead, which is the same intent
    // in the form this split needs. Leaving both makes the rule invalid.
    const truncated = truncate(["RRULE:FREQ=WEEKLY;COUNT=52"], SPLIT);
    expect(truncated[0]).not.toContain("COUNT");
    expect(truncated[0]).toContain("UNTIL=");
  });

  it("leaves lines that are not the rule alone", () => {
    const truncated = truncate(["EXDATE;TZID=Europe/Lisbon:20261013T100000", "RRULE:FREQ=WEEKLY"], SPLIT);
    expect(truncated[0]).toBe("EXDATE;TZID=Europe/Lisbon:20261013T100000");
    expect(truncated[1]).toContain("UNTIL=");
  });
});

describe("AC-7 a split that fails halfway", () => {
  it("names the new series the same way every time", () => {
    // The split posts the new series first and truncates the old second, so a
    // failure between them leaves a duplicate rather than a hole. This is what
    // lets a retry recognise its own work instead of posting a third one.
    expect(splitUid("abc", SPLIT)).toBe(splitUid("abc", SPLIT));
    expect(splitUid("abc", SPLIT)).not.toBe(splitUid("abc", new Date("2026-10-13T09:00:00Z")));
  });
});
