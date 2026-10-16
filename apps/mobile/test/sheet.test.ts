import { describe, expect, it } from "vitest";
import { atHistoryStart, backPull, closes, dragTo, progress, recede, startsFresh, STALE_MS } from "../lib/sheet";

describe("dragTo", () => {
  it("follows the finger from where the drag took hold, with no jump", () => {
    // Activated 8px in: the first frame after activation is where it was.
    expect(dragTo(0, 8, 8)).toBe(0);
    expect(dragTo(0, 108, 8)).toBe(100);
  });

  it("picks up a sheet that is still moving from where it is", () => {
    expect(dragTo(240, 58, 8)).toBe(290);
  });

  it("resists above open", () => {
    expect(dragTo(0, -52, -8)).toBe(-44 / 3);
  });
});

describe("closes", () => {
  const travel = 800;
  it("closes past a quarter of the travel", () => {
    expect(closes(201, 0, travel)).toBe(true);
    expect(closes(199, 0, travel)).toBe(false);
  });

  it("closes on a flick down from anywhere", () => {
    expect(closes(10, 900, travel)).toBe(true);
  });

  it("stays on a flick up, however far down it was", () => {
    expect(closes(600, -900, travel)).toBe(false);
  });
});

describe("progress", () => {
  it("is 1 open, 0 closed, and never outside them", () => {
    expect(progress(0, 800)).toBe(1);
    expect(progress(800, 800)).toBe(0);
    expect(progress(400, 800)).toBe(0.5);
    expect(progress(-30, 800)).toBe(1);
    expect(progress(1200, 800)).toBe(0);
  });

  it("is closed before anything has been measured", () => {
    expect(progress(0, 0)).toBe(0);
  });
});

describe("recede", () => {
  it("is the design's page at full rise: 0.93 from the top, down 10, a 14 corner", () => {
    expect(recede(1)).toEqual({ scale: 0.93, translateY: 10, radius: 14 });
  });

  it("is nothing at rest", () => {
    expect(recede(0)).toEqual({ scale: 1, translateY: 0, radius: 0 });
  });
});

describe("backPull", () => {
  it("pulls the sheet down by part of its travel as a back swipe goes", () => {
    expect(backPull(0, 800)).toBe(0);
    expect(backPull(1, 800)).toBeGreaterThan(0);
    expect(backPull(1, 800)).toBeLessThan(800 * 0.5);
    expect(backPull(0.5, 800)).toBeCloseTo(backPull(1, 800) / 2);
  });
});

describe("startsFresh", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  it("keeps a conversation closed for less than thirty minutes", () => {
    expect(startsFresh(now - STALE_MS + 1000, now)).toBe(false);
  });

  it("starts fresh once it has been closed for thirty minutes", () => {
    expect(STALE_MS).toBe(30 * 60 * 1000);
    expect(startsFresh(now - STALE_MS, now)).toBe(true);
  });

  it("never starts fresh on a conversation that is open", () => {
    expect(startsFresh(null, now)).toBe(false);
  });
});

// The owner, 2026-10-16: a short conversation leaves most of the sheet empty,
// so a drag down from that empty space is how it gets put away. With the
// keyboard up the transcript is lifted by the keyboard's height, and that
// lift was read as history to scroll back through: the drag scrolled the
// turns down behind the composer instead of moving the sheet.
describe("atHistoryStart", () => {
  it("is at the start of a long conversation scrolled to its top", () => {
    expect(atHistoryStart(0, 0)).toBe(true);
  });

  it("is not partway through a long conversation", () => {
    expect(atHistoryStart(300, 0)).toBe(false);
  });

  it("is at the start of a short conversation lifted by the keyboard", () => {
    // 336 of lift, the first turn 420 down the empty list.
    expect(atHistoryStart(336, 420)).toBe(true);
  });

  it("is not when the lift hides turns above the top", () => {
    expect(atHistoryStart(336, 200)).toBe(false);
  });

  it("allows for a scroll that stops a fraction short", () => {
    expect(atHistoryStart(0.5, 0)).toBe(true);
  });
});
