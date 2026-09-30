import { describe, expect, it } from "vitest";
import { raisedOf, settled } from "../lib/conversation-sheet";

describe("the conversation sheet's state", () => {
  it("is up for a pin, or for a live conversation that is open", () => {
    expect(raisedOf({ pinned: true, live: false, open: false })).toBe(true);
    expect(raisedOf({ pinned: false, live: true, open: true })).toBe(true);
    expect(raisedOf({ pinned: false, live: true, open: false })).toBe(false);
    expect(raisedOf({ pinned: false, live: false, open: true })).toBe(false);
  });

  // Found in review, 2026-09-30: a pin raised while the conversation was
  // rising, then dragged shut, cleared the pin and left `open`, so the sheet
  // was down while `raised` said up and an invisible scrim took every tap.
  it("is down once it reaches its closed edge, whatever held it up", () => {
    expect(raisedOf(settled({ pinned: true, live: true, open: true }))).toBe(false);
    expect(raisedOf(settled({ pinned: true, live: false, open: false }))).toBe(false);
    expect(raisedOf(settled({ pinned: false, live: true, open: true }))).toBe(false);
  });

  it("keeps the conversation when it is put away", () => {
    expect(settled({ pinned: false, live: true, open: true }).live).toBe(true);
  });
});
