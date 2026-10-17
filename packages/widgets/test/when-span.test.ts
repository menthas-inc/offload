// The When field's last day (the owner, 2026-10-17). offload could date a row
// across days and a person could not: the sheet held one day, and saving an
// edit to a multi-day event rebuilt its end on the start day.

import { describe, expect, it } from "vitest";
import { chipFor, drawnWhen, patchFor, whenLabel, whenValueOf } from "../src/index.js";

const noon = (day: string): string => `${day}T12:00:00.000Z`;
const base = { dueAt: null, occursAt: null, occursEndAt: null, allDay: true, doneAt: null, rrule: null };

describe("a span's last day", () => {
  it("opens on an all-day event across days with both days", () => {
    const row = { ...base, type: "event", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20") };
    expect(whenValueOf(row, "Europe/Lisbon")).toEqual({ day: "2026-10-17", endDay: "2026-10-20", time: null, endTime: null, rrule: null });
  });

  it("keeps a timed event's end day through an edit, where it used to land on the start day", () => {
    const row = { ...base, type: "event", allDay: false, occursAt: "2026-10-17T18:00:00.000Z", occursEndAt: "2026-10-20T10:00:00.000Z" };
    const value = whenValueOf(row, "Europe/Lisbon");
    expect(value).toEqual({ day: "2026-10-17", endDay: "2026-10-20", time: "19:00", endTime: "11:00", rrule: null });
    expect(patchFor(row, value)).toMatchObject({ occursAt: "2026-10-17T19:00:00", occursEndAt: "2026-10-20T11:00:00", allDay: false });
  });

  it("writes an all-day event's span as two days", () => {
    expect(patchFor({ type: "event" }, { day: "2026-10-17", endDay: "2026-10-20", time: null, endTime: null, rrule: null })).toEqual({
      occursAt: "2026-10-17",
      occursEndAt: "2026-10-20",
      allDay: true,
      rrule: null,
    });
  });

  it("writes a to-do's span with its due day on the last day", () => {
    expect(patchFor({ type: "task" }, { day: "2026-10-17", endDay: "2026-10-20", time: null, endTime: null, rrule: null })).toEqual({
      occursAt: "2026-10-17",
      occursEndAt: "2026-10-20",
      dueAt: "2026-10-20",
      allDay: true,
      rrule: null,
    });
  });

  it("opens a to-do's span on its first day, and drops it when the last day goes", () => {
    const row = { ...base, type: "task", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20"), dueAt: noon("2026-10-20") };
    const value = whenValueOf(row, null);
    expect(value).toMatchObject({ day: "2026-10-17", endDay: "2026-10-20" });
    expect(patchFor(row, { ...value, endDay: null })).toEqual({ dueAt: "2026-10-17", occursAt: null, allDay: true, rrule: null });
    expect(patchFor(row, { ...value, day: null, endDay: null })).toEqual({ dueAt: null, occursAt: null });
  });

  it("leaves a single-day to-do's other columns alone", () => {
    expect(patchFor({ type: "task", occursEndAt: null }, { day: "2026-10-17", endDay: null, time: null, endTime: null, rrule: null })).toEqual({
      dueAt: "2026-10-17",
      allDay: true,
      rrule: null,
    });
  });

  it("draws the span before the server answers", () => {
    expect(drawnWhen({ occursAt: "2026-10-17", occursEndAt: "2026-10-20", dueAt: "2026-10-20", allDay: true }, null)).toEqual({
      occursAt: noon("2026-10-17"),
      occursEndAt: noon("2026-10-20"),
      dueAt: noon("2026-10-20"),
      allDay: true,
    });
  });

  // Code review, 2026-10-17. A repeating row has no span the chip can say, so
  // a rule and a last day never travel together.
  it("never writes or opens a span on a repeating row", () => {
    expect(patchFor({ type: "event" }, { day: "2026-10-17", endDay: "2026-10-20", time: null, endTime: null, rrule: "FREQ=WEEKLY" })).toEqual({
      occursAt: "2026-10-17",
      occursEndAt: null,
      allDay: true,
      rrule: "FREQ=WEEKLY",
    });
    expect(patchFor({ type: "task" }, { day: "2026-10-17", endDay: "2026-10-20", time: null, endTime: null, rrule: "FREQ=WEEKLY" })).toEqual({
      dueAt: "2026-10-17",
      allDay: true,
      rrule: "FREQ=WEEKLY",
    });
    const row = { ...base, type: "event", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20"), rrule: "FREQ=WEEKLY" };
    expect(whenValueOf(row, null).endDay).toBeNull();
  });

  it("names both days on the When row", () => {
    expect(whenLabel({ day: "2026-10-17", endDay: "2026-10-20", time: null, endTime: null, rrule: null }, "en-GB")).toBe("Sat 17 to Tue 20");
  });
});

describe("a span's chip", () => {
  const event = { ...base, type: "event", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20") };
  const task = { ...base, type: "task", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20"), dueAt: noon("2026-10-20") };

  it("names both days before it starts", () => {
    expect(chipFor(event, null, "2026-10-15", "en-GB")).toMatchObject({ label: "Sat 17 to Tue 20", tone: "soon" });
    expect(chipFor(task, null, "2026-10-15", "en-GB")).toMatchObject({ label: "Sat 17 to Tue 20", tone: "soon" });
  });

  it("says until the last day while it is on, and is never late then", () => {
    expect(chipFor(event, null, "2026-10-18", "en-GB")).toMatchObject({ label: "Until Tue 20", tone: "soon" });
    expect(chipFor(task, null, "2026-10-18", "en-GB")).toMatchObject({ label: "Due Tue 20", tone: "soon" });
  });

  it("names the month once far out, and both months across one", () => {
    const far = { ...event, occursAt: noon("2026-11-12"), occursEndAt: noon("2026-11-15") };
    expect(chipFor(far, null, "2026-10-15", "en-GB")).toMatchObject({ label: "12 to 15 Nov" });
    const across = { ...event, occursAt: noon("2026-11-30"), occursEndAt: noon("2026-12-02") };
    expect(chipFor(across, null, "2026-10-15", "en-GB")).toMatchObject({ label: "30 Nov to 2 Dec" });
  });

  // Client review, 2026-10-17. A phone from before the last day moves a
  // to-do's due day and leaves its old occurs columns behind; a span is only a
  // span while its last day is the due day.
  it("is no span on a to-do whose last day is not its due day", () => {
    const stale = { ...task, dueAt: noon("2026-10-24") };
    expect(chipFor(stale, null, "2026-10-15", "en-GB")).toMatchObject({ label: "Due Sat 24" });
    expect(whenValueOf(stale, null)).toMatchObject({ day: "2026-10-24", endDay: null });
  });

  it("is late from its last day, not its first", () => {
    expect(chipFor(event, null, "2026-10-22", "en-GB")).toMatchObject({ label: "2 days ago", tone: "late" });
  });
});
