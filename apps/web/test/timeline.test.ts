// The rail's arithmetic. Shared by three surfaces, so it is tested once.
//
// AC-1  a thread with nothing dated still has a rail: this week.
// AC-2  whole weeks, starting where the setting says.
// AC-4  the span always contains today.
// AC-5  three empty weeks collapse, two do not.
// AC-6  content and notes arrive in one shape.
// AC-7  a span has a dot on every day it covers.
// AC-8  every occurrence of a repeating thing is drawn.
// AC-10 the day says what it holds in words.

import { describe, expect, it } from "vitest";
import {
  MAX_DOTS,
  datedFor,
  dayLabel,
  localDay,
  monthFor,
  railFor,
  stepMonth,
  thingsOn,
  weeksSpanned,
  type Dated,
  type RailRow,
} from "../src/lib/widgets";

/** A Wednesday, so a week-start bug cannot hide behind a Monday. */
const TODAY = "2026-09-16";

function weeks(rows: RailRow[]): RailRow[] {
  return rows;
}

function point(id: string, iso: string, kind: Dated["kind"] = "event"): Dated {
  return { id, rowId: id, due: false, kind, from: iso, to: iso, done: false };
}

function span(id: string, from: string, to: string, kind: Dated["kind"] = "note"): Dated {
  return { id, rowId: id, due: false, kind, from, to, done: false };
}

describe("the span", () => {
  it("is this week alone when nothing is dated (AC-1)", () => {
    const rail = railFor([], TODAY, "monday");
    expect(rail).toHaveLength(1);
    expect(weeks(rail)[0]?.days.map((d) => d.iso)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("starts the week where the setting says (AC-2)", () => {
    const monday = weeks(railFor([], TODAY, "monday"))[0]?.days[0]?.iso;
    const sunday = weeks(railFor([], TODAY, "sunday"))[0]?.days[0]?.iso;
    expect(monday).toBe("2026-09-14");
    expect(sunday).toBe("2026-09-13");
  });

  it("always contains today, whichever side the dates are on (AC-4)", () => {
    const past = railFor([point("a", "2026-08-31")], TODAY, "monday");
    const future = railFor([point("a", "2026-09-30")], TODAY, "monday");

    for (const rail of [past, future]) {
      const days = weeks(rail).flatMap((week) => week.days.map((day) => day.iso));
      expect(days).toContain(TODAY);
    }
  });

  it("draws whole weeks at both ends (AC-2)", () => {
    const rail = weeks(railFor([point("a", "2026-09-30")], TODAY, "monday"));
    expect(rail[0]?.days).toHaveLength(7);
    expect(rail[rail.length - 1]?.days).toHaveLength(7);
    expect(rail[rail.length - 1]?.days[6]?.iso).toBe("2026-10-04");
  });
});

describe("past a few weeks it is a month, not a rail", () => {
  it("counts the weeks a thread spans", () => {
    expect(weeksSpanned([], TODAY, "monday")).toBe(1);
    expect(weeksSpanned([point("a", "2026-09-30")], TODAY, "monday")).toBe(3);
    expect(weeksSpanned([point("a", "2027-09-30")], TODAY, "monday")).toBeGreaterThan(50);
  });

  it("draws a month as whole weeks, with the days either side of it", () => {
    // A month starting on a Thursday with three empty cells in front of it
    // reads as a hole, and the days there are real days somebody may want.
    const month = monthFor("2026-09-16", [point("a", "2026-09-30")], TODAY, "monday");
    expect(month.key).toBe("2026-09-01");
    expect(month.label).toContain("2026");
    for (const week of month.weeks) expect(week.days).toHaveLength(7);
    expect(month.inMonth("2026-09-01")).toBe(true);
    expect(month.inMonth("2026-08-31")).toBe(false);
  });

  it("carries the dots into the month, and marks today", () => {
    const month = monthFor(TODAY, [point("a", "2026-09-30")], TODAY, "monday");
    const days = month.weeks.flatMap((week) => week.days);
    expect(days.find((day) => day.iso === "2026-09-30")?.count).toBe(1);
    expect(days.find((day) => day.iso === TODAY)?.today).toBe(true);
  });

  it("steps a month either way, including across a year", () => {
    expect(stepMonth("2026-09-01", 1)).toBe("2026-10-01");
    expect(stepMonth("2026-09-01", -1)).toBe("2026-08-01");
    expect(stepMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(stepMonth("2026-01-01", -1)).toBe("2025-12-01");
  });
});

describe("what lands on a day", () => {
  it("fills every day a span covers, inclusive (AC-7)", () => {
    const rail = railFor(
      [span("stay", "2026-09-15", "2026-09-17")],
      TODAY,
      "monday",
    );
    const days = weeks(rail)[0]?.days ?? [];
    expect(days.filter((day) => day.count > 0).map((day) => day.iso)).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
  });

  it("draws every occurrence of a repeating thing (AC-8)", () => {
    // Three Tuesdays. The list widget collapsed these into one row; a rail has
    // a cell per day already, so every one is drawn.
    const rail = railFor(
      [point("y1", "2026-09-15"), point("y2", "2026-09-22"), point("y3", "2026-09-29")],
      TODAY,
      "monday",
    );
    const marked = weeks(rail)
      .flatMap((week) => week.days)
      .filter((day) => day.count > 0)
      .map((day) => day.iso);
    expect(marked).toEqual(["2026-09-15", "2026-09-22", "2026-09-29"]);
  });

  it("caps the dots and keeps the count honest", () => {
    const many = Array.from({ length: MAX_DOTS + 3 }, (_, i) => point(`e${i}`, TODAY));
    const day = weeks(railFor(many, TODAY, "monday"))[0]?.days.find((d) => d.iso === TODAY);
    expect(day?.dots).toHaveLength(MAX_DOTS);
    expect(day?.count).toBe(MAX_DOTS + 3);
  });

  it("says what a day holds in words (AC-10)", () => {
    const rail = railFor([point("a", TODAY, "task"), point("b", TODAY, "note")], TODAY, "monday");
    const day = weeks(rail)[0]?.days.find((d) => d.iso === TODAY);
    expect(dayLabel(day!, "en-GB")).toContain("1 to do");
    expect(dayLabel(day!, "en-GB")).toContain("1 note");
  });

  it("says so when a day holds nothing (AC-10)", () => {
    const day = weeks(railFor([], TODAY, "monday"))[0]?.days[0];
    expect(dayLabel(day!, "en-GB")).toContain("nothing on");
  });

  it("answers what is on a day, for the list underneath", () => {
    const dated = [span("stay", "2026-09-15", "2026-09-17"), point("dinner", "2026-09-17")];
    expect(thingsOn(dated, "2026-09-16").map((one) => one.id)).toEqual(["stay"]);
    expect(
      thingsOn(dated, "2026-09-17")
        .map((one) => one.id)
        .sort(),
    ).toEqual(["dinner", "stay"]);
  });
});

describe("one shape from two stores (AC-6)", () => {
  const base = {
    priority: 50,
    tags: [],
    doneAt: null,
    placeId: null,
    occursEndAt: null,
    dueAt: null,
  };

  it("reads content and notes into the same list", () => {
    const dated = datedFor(
      [{ ...base, id: "c1", type: "event", occursAt: "2026-09-16T09:00:00Z" }],
      [{ id: "n1", occursAt: "2026-09-16T09:00:00Z", occursEndAt: null, dueAt: null }],
    );
    expect(dated.map((one) => one.kind).sort()).toEqual(["event", "note"]);
  });

  it("puts a task with a due date and an occurrence on both days", () => {
    // Two facts: the day it happens and the day it is wanted by. Choosing one
    // of them to draw is choosing for somebody.
    const dated = datedFor([
      {
        ...base,
        id: "c1",
        type: "task",
        occursAt: "2026-09-16T09:00:00Z",
        dueAt: "2026-09-18T09:00:00Z",
      },
    ]);
    expect(dated.map((one) => one.from).sort()).toEqual(["2026-09-16", "2026-09-18"]);
  });

  it("draws a backwards range as the point it started on", () => {
    const dated = datedFor([
      {
        ...base,
        id: "c1",
        type: "event",
        occursAt: "2026-09-18T09:00:00Z",
        occursEndAt: "2026-09-16T09:00:00Z",
      },
    ]);
    expect(dated[0]).toMatchObject({ from: "2026-09-18", to: "2026-09-18" });
  });

  it("keeps a late evening on its own day, not tomorrow's", () => {
    // The bug that ships quietly: `toISOString` is UTC, so an event at 23:00
    // east of Greenwich lands on the next day, correctly for most of the day
    // and wrong every evening.
    const late = new Date(2026, 8, 16, 23, 30);
    expect(localDay(late)).toBe("2026-09-16");
    const dated = datedFor([
      { ...base, id: "c1", type: "event", occursAt: late.toISOString() },
    ]);
    expect(dated[0]?.from).toBe("2026-09-16");
  });
});

describe("what the review found", () => {
  it("says which fact put a thing on a day", () => {
    // A task with an occurrence on one day and a due date on another is on
    // both, and they are two different facts. Drawing the day from the row's
    // own fields put the occurrence's time on the due day.
    const dated = datedFor([
      {
        id: "c1",
        type: "task",
        priority: 50,
        tags: [],
        doneAt: null,
        placeId: null,
        occursEndAt: null,
        occursAt: "2026-09-16T09:00:00Z",
        dueAt: "2026-09-18T09:00:00Z",
      },
    ]);

    const onOccurrence = thingsOn(dated, "2026-09-16")[0];
    const onDue = thingsOn(dated, "2026-09-18")[0];

    expect(onOccurrence?.due).toBe(false);
    expect(onDue?.due).toBe(true);
    // Both point back at the one row, so a day can draw it either way.
    expect(onOccurrence?.rowId).toBe("c1");
    expect(onDue?.rowId).toBe("c1");
  });
});
