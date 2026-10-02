// The composer's box, once open for height, stays open. 2026-09-26.
//
// On the Pixel the field jittered between one and two lines while the second
// line was being typed: a wrap beside the send controls opened the box to
// full width, where the words fit on one line again, which closed it, which
// wrapped them again. Three lines were stable only because both widths
// needed two. The rule is a latch, and it is pure so it can be pinned here.

import { describe, expect, it } from "vitest";
import { DAY_USED, PLACEHOLDERS, closedForTheDay, staysOpen } from "../lib/composer";

describe("the box opened for height", () => {
  it("opens when the words are taller than one line, and stays open while any words remain", () => {
    expect(staysOpen({ open: false, tallNow: false, draft: "" })).toBe(false);
    expect(staysOpen({ open: false, tallNow: true, draft: "two lines of words" })).toBe(true);
    // The wide box fits the words on one line: still open.
    expect(staysOpen({ open: true, tallNow: false, draft: "two lines of words" })).toBe(true);
    expect(staysOpen({ open: true, tallNow: false, draft: "a" })).toBe(true);
  });

  it("closes only once the draft is empty", () => {
    expect(staysOpen({ open: true, tallNow: false, draft: "" })).toBe(false);
    expect(staysOpen({ open: true, tallNow: false, draft: "   " })).toBe(false);
  });
});

describe("the placeholders", () => {
  // 2026-09-30, on the Pixel: "Even if it's three things at once" wrapped to
  // a second line and the empty composer grew to fit it. The field is about
  // 234dp beside its controls there, a phone of 375pt has a little less, and
  // "Out of your head, in here" at 25 characters fits with room to spare.
  it("are short enough to stay on one line", () => {
    const long = PLACEHOLDERS.filter((line) => line.length > 25);
    expect(long).toEqual([]);
  });
});

describe("the composer at the day's limit", () => {
  // Once the day's model budget is spent or its turns are used, a dump can
  // only be refused, so the field is not offered. The same words as the web.
  it("says the day is used and when it comes back", () => {
    expect(DAY_USED).toBe("Enough for today. Back tomorrow.");
    expect(closedForTheDay(null, false)).toBe(false);
    expect(closedForTheDay({ atDailyLimit: false }, false)).toBe(false);
    expect(closedForTheDay({ atDailyLimit: true }, false)).toBe(true);
    // A refusal on send closes it too, before the account is read again.
    expect(closedForTheDay({ atDailyLimit: false }, true)).toBe(true);
  });

  // 032. A section's + writes a row as typed and no model reads it, so the
  // day's limit never closes the field it raises.
  it("stays open for a section's + at the limit", () => {
    expect(closedForTheDay({ atDailyLimit: true }, false, true)).toBe(false);
    expect(closedForTheDay({ atDailyLimit: false }, true, true)).toBe(false);
    expect(closedForTheDay({ atDailyLimit: true }, false, false)).toBe(true);
  });
});
