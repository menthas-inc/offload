// The composer's box, once open for height, stays open. 2026-09-26.
//
// On the Pixel the field jittered between one and two lines while the second
// line was being typed: a wrap beside the send controls opened the box to
// full width, where the words fit on one line again, which closed it, which
// wrapped them again. Three lines were stable only because both widths
// needed two. The rule is a latch, and it is pure so it can be pinned here.

import { describe, expect, it } from "vitest";
import { staysOpen } from "../lib/composer";

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
