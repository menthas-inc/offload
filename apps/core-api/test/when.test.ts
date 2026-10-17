// The when field the sheets hold, shared. 023.
//
// The code review of 2026-09-22 found the phones and the web with
// byte-identical copies of this module and a helper each sheet had written
// again on its own, which is where the first defect was: an hour after 23:30
// wrapped to 00:30 on the same day and the route refused the end.

import { describe, expect, it } from "vitest";
import { anHourAfter, drawnWhen, patchFor, whenValueOf } from "@offload/widgets";

describe("023 AC-19 the end an event is offered", () => {
  it("is an hour later, and never before the start when the start is late", () => {
    expect(anHourAfter("09:00")).toBe("10:00");
    expect(anHourAfter("22:55")).toBe("23:55");
    expect(anHourAfter("23:30")).toBe("23:55");
    const patch = patchFor({ type: "event" }, { day: "2026-10-01", endDay: null, time: "23:30", endTime: anHourAfter("23:30"), rrule: null });
    expect(patch.occursAt).toBe("2026-10-01T23:30:00");
    expect(patch.occursEndAt).toBe("2026-10-01T23:55:00");
  });
});

describe("023 what Save draws before the server answers", () => {
  it("reads a wall time in the account's clock as the route does, and a day as noon UTC", () => {
    expect(drawnWhen({ dueAt: "2026-10-01T09:00:00", allDay: false }, "Europe/Lisbon")).toEqual({
      dueAt: "2026-10-01T08:00:00.000Z",
      allDay: false,
    });
    expect(drawnWhen({ dueAt: "2026-10-01", allDay: true, rrule: "FREQ=WEEKLY" }, "Europe/Lisbon")).toEqual({
      dueAt: "2026-10-01T12:00:00.000Z",
      allDay: true,
      rrule: "FREQ=WEEKLY",
    });
  });

  it("leaves what was not sent alone, and clears the end and the rule with the day", () => {
    expect(drawnWhen({}, null)).toEqual({});
    expect(drawnWhen({ occursAt: null }, null)).toEqual({ occursAt: null, occursEndAt: null, rrule: null });
    expect(drawnWhen({ dueAt: null }, "Asia/Tokyo")).toEqual({ dueAt: null, rrule: null });
  });

  it("round-trips a row through the sheet's value and back", () => {
    const row = {
      type: "event",
      dueAt: null,
      occursAt: "2026-10-01T08:00:00.000Z",
      occursEndAt: "2026-10-01T09:00:00.000Z",
      allDay: false,
      doneAt: null,
      rrule: null,
      isReminder: false,
    };
    const value = whenValueOf(row, "Europe/Lisbon");
    expect(value).toEqual({ day: "2026-10-01", endDay: null, time: "09:00", endTime: "10:00", rrule: null });
    expect(drawnWhen(patchFor(row, value), "Europe/Lisbon")).toMatchObject({
      occursAt: "2026-10-01T08:00:00.000Z",
      occursEndAt: "2026-10-01T09:00:00.000Z",
      allDay: false,
    });
  });
});
