// 2026-10-13 (the owner). An answer's rows can share a title, eight glass
// blowing classes, and the date is what tells them apart, so a dated row in
// an answer carries its date as the kit's meta line, in the chip's own words.

import { describe, expect, it } from "vitest";
import { foundMeta } from "../src/found.js";

const TODAY = "2026-10-13";
const base = { type: "event", dueAt: null, occursAt: null, occursEndAt: null, allDay: true, rrule: null };

describe("the meta line under an answer's row", () => {
  it("is the day, as the row's chip says it: Due and the weekday within a fortnight, the month beyond; nothing for a row with no date", () => {
    expect(foundMeta({ ...base, occursAt: "2026-11-30T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("30 Nov");
    expect(foundMeta({ ...base, type: "task", dueAt: "2026-10-15T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("Due Thu 15");
    expect(foundMeta({ ...base, type: "task", dueAt: "2026-12-05T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("5 Dec");
    expect(foundMeta({ ...base, type: "link" }, "Europe/Lisbon", TODAY, "en-GB")).toBeNull();
  });

  it("carries the time in the account's zone, and the end of a span in the same words as its start", () => {
    expect(foundMeta({ ...base, allDay: false, occursAt: "2026-11-30T18:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("30 Nov, 18:00");
    expect(foundMeta({ ...base, occursAt: "2026-10-21T12:00:00.000Z", occursEndAt: "2026-10-25T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("Wed 21 to Sun 25");
    expect(foundMeta({ ...base, occursAt: "2026-11-30T12:00:00.000Z", occursEndAt: "2026-12-01T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("30 Nov to 1 Dec");
    expect(foundMeta({ ...base, occursAt: "2026-10-21T12:00:00.000Z", occursEndAt: "2026-10-21T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).toBe("Wed 21");
  });

  it("no dash in anything it says", () => {
    expect(foundMeta({ ...base, occursAt: "2026-10-21T12:00:00.000Z", occursEndAt: "2026-10-25T12:00:00.000Z" }, "Europe/Lisbon", TODAY, "en-GB")).not.toMatch(/[–—-]/);
  });
});
