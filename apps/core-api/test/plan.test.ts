// 042 C1: from labels to moments. Both tables of the feature spec, cell by
// cell, and every rule that drops, moves or cuts a window. (AC-7 to AC-12)

import { describe, expect, it } from "vitest";
import { ORDER, plan, type Clock, type Slot, type Dated } from "../src/notifications/plan.js";

const ZONE = "Europe/Lisbon"; // UTC+0 from 25 October 2026
const NOW = new Date("2026-11-02T10:00:00Z"); // Monday 2 November, 10:00 in Lisbon
const LONG_AGO = new Date("2026-09-01T00:00:00Z");

function clock(over: Partial<Clock> = {}): Clock {
  return { zone: ZONE, morning: "08:00", evening: "19:00", count: 3, now: NOW, ...over };
}

function dated(over: Partial<Dated> = {}): Dated {
  return {
    kind: "deadline",
    lead: "days",
    day: "2026-12-15",
    time: null,
    anchored: false,
    rule: null,
    asked: false,
    since: LONG_AGO,
    labelledAt: LONG_AGO,
    ...over,
  };
}

/** A slot as the tables read: the window and where it lands. */
function where(slot: Slot): string {
  if (slot.at === "send") return `${slot.window} ${slot.send} ${slot.day}`;
  return `${slot.window} own ${slot.instant.toISOString()}`;
}

describe("which windows, in the order How many keeps them", () => {
  it("is the feature spec's table, cell by cell", () => {
    expect(ORDER).toEqual({
      meeting: { none: ["day"], days: ["short", "day"], weeks: ["long", "short", "day"], months: ["long", "short", "day"] },
      appointment: { none: ["short", "day"], days: ["short", "day"], weeks: ["long", "short", "day"], months: ["long", "short", "day"] },
      occasion: { none: ["day"], days: ["short", "day"], weeks: ["short", "long", "day"], months: ["long", "short", "day"] },
      deadline: { none: ["day"], days: ["short", "day"], weeks: ["long", "short", "day"], months: ["long", "short", "day"] },
      trip: { none: ["short"], days: ["short"], weeks: ["long", "short"], months: ["long", "short"] },
      day: { none: ["day"], days: ["day"], weeks: ["day"], months: ["day"] },
    });
  });

  it("Low keeps the first, Medium two, High all", () => {
    const close = dated({ kind: "occasion", lead: "weeks", day: "2026-12-20" });
    expect(plan(close, clock({ count: 1 })).map(where)).toEqual(["short morning 2026-12-15"]);
    expect(plan(close, clock({ count: 2 })).map(where)).toEqual(["long morning 2026-11-22", "short morning 2026-12-15"]);
    expect(plan(close, clock({ count: 3 })).map(where)).toEqual([
      "long morning 2026-11-22",
      "short morning 2026-12-15",
      "day morning 2026-12-20",
    ]);
  });

  it("none is nothing, and an unknown date is nothing", () => {
    expect(plan(dated({ kind: "none", lead: "none" }), clock())).toEqual([]);
    expect(plan(dated({ day: null }), clock())).toEqual([]);
  });
});

describe("where each window lands", () => {
  const at = (kind: Dated["kind"], lead: Dated["lead"], over: Partial<Dated> = {}) =>
    plan(dated({ kind, lead, day: "2026-12-15", ...over }), clock()).map(where);

  it("a month out is 4 weeks before, 8 for months, in the morning send", () => {
    expect(at("deadline", "weeks")[0]).toBe("long morning 2026-11-17");
    expect(at("deadline", "months")[0]).toBe("long morning 2026-10-20");
  });

  it("meeting: a week out 2 days before, 7 for weeks; on the day 15 minutes before", () => {
    expect(at("meeting", "days", { time: "09:30" })).toEqual([
      "short morning 2026-12-13",
      "day own 2026-12-15T09:15:00.000Z",
    ]);
    expect(at("meeting", "weeks", { time: "09:30" })[1]).toBe("short morning 2026-12-08");
    expect(at("meeting", "none")).toEqual(["day morning 2026-12-15"]);
  });

  it("appointment: the evening before, and 60 minutes before", () => {
    expect(at("appointment", "none", { time: "15:00" })).toEqual([
      "short evening 2026-12-14",
      "day own 2026-12-15T14:00:00.000Z",
    ]);
  });

  it("occasion: 5 days before, and the morning even with a clock time", () => {
    expect(at("occasion", "days", { time: "20:00" })).toEqual(["short morning 2026-12-10", "day morning 2026-12-15"]);
  });

  it("deadline: 3 days before for days, 7 for weeks; 30 minutes before a clock time", () => {
    expect(at("deadline", "days")).toEqual(["short morning 2026-12-12", "day morning 2026-12-15"]);
    expect(at("deadline", "weeks")[1]).toBe("short morning 2026-12-08");
    expect(at("deadline", "none", { time: "17:00" })).toEqual(["day own 2026-12-15T16:30:00.000Z"]);
  });

  it("trip: the evening before for none and days, 7 days before for weeks, never on the day", () => {
    expect(at("trip", "days")).toEqual(["short evening 2026-12-14"]);
    expect(at("trip", "weeks")).toEqual(["long morning 2026-11-17", "short morning 2026-12-08"]);
  });

  it("day: the morning, or 30 minutes before a clock time", () => {
    expect(at("day", "none")).toEqual(["day morning 2026-12-15"]);
    expect(at("day", "none", { time: "10:00" })).toEqual(["day own 2026-12-15T09:30:00.000Z"]);
  });

  it("follows the account's hours", () => {
    expect(plan(dated({ kind: "trip", lead: "days" }), clock({ evening: "21:00" }))[0]).toMatchObject({
      at: "send",
      send: "evening",
      day: "2026-12-14",
    });
  });
});

describe("first drop, then cut", () => {
  it("drops a window passed by the time the dated was labelled", () => {
    const late = dated({ kind: "deadline", lead: "days", day: "2026-11-04", labelledAt: new Date("2026-11-02T03:00:00Z") });
    expect(plan(late, clock({ count: 1 })).map(where)).toEqual(["day morning 2026-11-04"]);
  });

  it("drops a month out or a week out within two days after the dated was dumped, never the day", () => {
    const dumped = new Date("2026-11-01T18:00:00Z");
    const fresh = dated({ kind: "deadline", lead: "days", day: "2026-11-06", since: dumped, labelledAt: dumped });
    // The week out would be the 3rd at 8:00, inside two days of the 1st at 18:00.
    expect(plan(fresh, clock()).map(where)).toEqual(["day morning 2026-11-06"]);
    const tomorrow = dated({ kind: "day", lead: "none", day: "2026-11-02", since: dumped, labelledAt: dumped });
    expect(plan(tomorrow, clock()).map(where)).toEqual(["day morning 2026-11-02"]);
  });

  it("a close birthday learned three weeks ahead still gets its week out on Low", () => {
    const learned = new Date("2026-11-20T03:00:00Z");
    const birthday = dated({ kind: "occasion", lead: "weeks", day: "2026-12-11", since: learned, labelledAt: learned });
    expect(plan(birthday, clock({ count: 1 })).map(where)).toEqual(["short morning 2026-12-06"]);
  });

  it("a birthday learned too late for both is still said on the day at any setting", () => {
    const learned = new Date("2026-12-09T03:00:00Z");
    const birthday = dated({ kind: "occasion", lead: "weeks", day: "2026-12-11", since: learned, labelledAt: learned });
    expect(plan(birthday, clock({ count: 1 })).map(where)).toEqual(["day morning 2026-12-11"]);
  });
});

describe("a late month out", () => {
  it("lands in the first morning send the two-day rule allows, when that is three days before the week out", () => {
    // The visa: dumped 13 October for a trip on 12 November, due the 11th.
    const dumped = new Date("2026-10-13T20:00:00Z");
    const visa = dated({ kind: "deadline", lead: "months", day: "2026-11-12", anchored: true, since: dumped, labelledAt: new Date("2026-10-14T02:00:00Z") });
    expect(plan(visa, clock({ now: new Date("2026-10-14T02:00:00Z"), count: 2 })).map(where)).toEqual([
      "long morning 2026-10-16",
      "short morning 2026-11-04",
    ]);
  });

  it("is dropped when it would land within three days of the week out", () => {
    const dumped = new Date("2026-11-30T20:00:00Z");
    const passport = dated({ kind: "deadline", lead: "weeks", day: "2026-12-10", since: dumped, labelledAt: dumped });
    // Week out on the 3rd; the earliest late month out is the 3rd too.
    expect(plan(passport, clock({ now: dumped })).map(where)).toEqual(["short morning 2026-12-03", "day morning 2026-12-10"]);
  });

  it("is not offered for a lead that never had a month out", () => {
    const dumped = new Date("2026-12-01T20:00:00Z");
    const bill = dated({ kind: "deadline", lead: "days", day: "2026-12-15", since: dumped, labelledAt: dumped });
    expect(plan(bill, clock({ now: dumped })).map(where)).toEqual(["short morning 2026-12-12", "day morning 2026-12-15"]);
  });
});

describe("a task that belongs to a dated dated", () => {
  it("is due the day before the dated starts, so its last reminder is never on the morning the trip starts", () => {
    const visa = dated({ kind: "deadline", lead: "days", day: "2026-12-15", anchored: true });
    expect(plan(visa, clock()).map(where)).toEqual(["short morning 2026-12-11", "day morning 2026-12-14"]);
  });
});

describe("a dated that repeats", () => {
  it("is reminded about for its next occurrence only", () => {
    const rent = dated({ kind: "deadline", lead: "days", day: "2026-01-01", rule: "FREQ=MONTHLY" });
    expect(plan(rent, clock()).map(where)).toEqual(["short morning 2026-11-28", "day morning 2026-12-01"]);
  });

  it("weekly or more often, on the day at most", () => {
    const standup = dated({ kind: "meeting", lead: "days", day: "2026-10-05", time: "09:30", rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" });
    // 10:00 on Monday: today's standup is over, but it is still the next
    // occurrence on or after today, and its moment has simply passed.
    expect(plan(standup, clock()).map(where)).toEqual(["day own 2026-11-02T09:15:00.000Z"]);
  });

  it("monthly, a week out and on the day at most", () => {
    const rent = dated({ kind: "deadline", lead: "weeks", day: "2026-01-01", rule: "FREQ=MONTHLY" });
    expect(plan(rent, clock()).map((slot) => slot.window)).toEqual(["short", "day"]);
  });

  it("yearly, all of its windows every year", () => {
    const birthday = dated({ kind: "occasion", lead: "weeks", day: "2000-03-14", rule: "FREQ=YEARLY" });
    expect(plan(birthday, clock()).map(where)).toEqual([
      "long morning 2027-02-14",
      "short morning 2027-03-09",
      "day morning 2027-03-14",
    ]);
  });
});

describe("asked, at a clock time", () => {
  it("is reminded about at that time, first, whatever the label and How many", () => {
    const call = dated({ kind: "none", lead: "none", day: "2026-12-15", time: "15:00", asked: true });
    expect(plan(call, clock({ count: 1 })).map(where)).toEqual(["day own 2026-12-15T15:00:00.000Z"]);
    const meeting = dated({ kind: "meeting", lead: "days", day: "2026-12-15", time: "15:00", asked: true });
    expect(plan(meeting, clock({ count: 1 })).map(where)).toEqual(["day own 2026-12-15T15:00:00.000Z"]);
    expect(plan(meeting, clock({ count: 2 })).map(where)).toEqual([
      "short morning 2026-12-13",
      "day own 2026-12-15T15:00:00.000Z",
    ]);
  });
});

describe("asked, on a kind whose table has no day", () => {
  it("is still reminded about at its time (review, 2026-10-10)", () => {
    const flight = dated({ kind: "trip", lead: "days", day: "2026-12-15", time: "15:00", asked: true });
    expect(plan(flight, clock({ count: 1 })).map(where)).toEqual(["day own 2026-12-15T15:00:00.000Z"]);
  });
});

describe("before the pass has seen it", () => {
  it("a clock time in the next 24 hours gets one reminder 30 minutes before, whatever How many says", () => {
    const meeting = dated({ kind: null, lead: null, day: "2026-11-02", time: "15:00" });
    expect(plan(meeting, clock({ count: 1 })).map(where)).toEqual(["day own 2026-11-02T14:30:00.000Z"]);
  });

  it("nothing further out, and nothing without a clock time", () => {
    expect(plan(dated({ kind: null, lead: null, day: "2026-11-04", time: "15:00" }), clock())).toEqual([]);
    expect(plan(dated({ kind: null, lead: null, day: "2026-11-02" }), clock())).toEqual([]);
  });
});

describe("a notification of its own only between 7:00 and 22:00", () => {
  it("before 7:00 it is named in the evening send the day before", () => {
    const flight = dated({ kind: "appointment", lead: "none", day: "2026-12-15", time: "06:00" });
    // The week out is already that evening send; the two are one mention.
    expect(plan(flight, clock()).map(where)).toEqual(["short evening 2026-12-14"]);
  });

  it("after 22:00 it is named in the morning send of its day", () => {
    const late = dated({ kind: "deadline", lead: "none", day: "2026-12-15", time: "23:00" });
    expect(plan(late, clock()).map(where)).toEqual(["day morning 2026-12-15"]);
  });

  it("holds across a clock change", () => {
    // 25 October 2026, Lisbon goes from UTC+1 to UTC+0.
    const before = dated({ kind: "meeting", lead: "none", day: "2026-10-24", time: "09:00" });
    const after = dated({ kind: "meeting", lead: "none", day: "2026-10-26", time: "09:00" });
    const early = clock({ now: new Date("2026-10-20T10:00:00Z") });
    expect(plan(before, early).map(where)).toEqual(["day own 2026-10-24T07:45:00.000Z"]);
    expect(plan(after, early).map(where)).toEqual(["day own 2026-10-26T08:45:00.000Z"]);
  });

  it("reads a zone behind UTC", () => {
    const meeting = dated({ kind: "meeting", lead: "none", day: "2026-12-15", time: "09:00" });
    expect(plan(meeting, clock({ zone: "America/Toronto" })).map(where)).toEqual(["day own 2026-12-15T13:45:00.000Z"]);
  });
});

describe("every slot says its moment", () => {
  it("as an instant, for the send's hour or the notification's", () => {
    const [short, day] = plan(dated({ kind: "deadline", lead: "days", day: "2026-12-15" }), clock());
    expect(short!.moment.toISOString()).toBe("2026-12-12T08:00:00.000Z");
    expect(day!.moment.toISOString()).toBe("2026-12-15T08:00:00.000Z");
    expect(day!.occurrence).toBe("2026-12-15");
  });
});
