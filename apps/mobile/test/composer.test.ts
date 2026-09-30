// The composer's box, once open for height, stays open. 2026-09-26.
//
// On the Pixel the field jittered between one and two lines while the second
// line was being typed: a wrap beside the send controls opened the box to
// full width, where the words fit on one line again, which closed it, which
// wrapped them again. Three lines were stable only because both widths
// needed two. The rule is a latch, and it is pure so it can be pinned here.

import { describe, expect, it } from "vitest";
import { PLACEHOLDERS, staysOpen } from "../lib/composer";

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
