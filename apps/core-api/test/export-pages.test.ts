// 035 part B, the pages of a copy. A row that comes round again says so in
// words beside its date, so a weekly class does not read as one evening.

import { describe, expect, it } from "vitest";
import { threadPage, type CopyRow, type CopyThread } from "../src/exports/pages.js";

const row = (over: Partial<CopyRow>): CopyRow => ({
  id: "018f0000-0000-7000-8000-000000000010",
  type: "event",
  title: "Yoga",
  body: null,
  url: null,
  location: null,
  done: false,
  archived: false,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  addedAt: "2026-09-01T09:00:00.000Z",
  author: null,
  labels: [],
  files: [],
  ...over,
});

const thread = (rows: CopyRow[]): CopyThread => ({
  n: 1,
  id: "018f0000-0000-7000-8000-000000000001",
  name: "Classes",
  shared: false,
  members: [],
  labels: [],
  notes: [],
  rows,
});

describe("a thread page", () => {
  it("says a weekly row repeats, in words, beside its date", () => {
    // Tuesday 6 October 2026, 18:30 in London.
    const html = threadPage(thread([row({ occursAt: "2026-10-06T17:30:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=TU" })]), "Europe/London");
    expect(html).toContain("On 6 Oct 2026, 18:30 · Weekly on Tuesday");
  });

  it("anchors a task's rule on its due day in the reader's zone", () => {
    // Late on Sunday in UTC is Monday morning in Auckland.
    const html = threadPage(thread([row({ type: "task", title: "Bins", dueAt: "2026-10-04T20:00:00.000Z", rrule: "FREQ=WEEKLY" })]), "Pacific/Auckland");
    expect(html).toContain("Weekly on Monday");
  });

  // The sweep's final review: data.json carried a note's rule and the page
  // a person reads dropped it, so a weekly note read as a one-off.
  it("says a repeating note repeats, too", () => {
    const html = threadPage(
      {
        ...thread([]),
        notes: [{ text: "Bins go out", body: null, author: null, addedAt: "2026-09-01T09:00:00.000Z", occursAt: null, dueAt: "2026-10-07T07:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=WE" }],
      },
      "Europe/London",
    );
    expect(html).toContain("Weekly on Wednesday");
  });

  it("says nothing more for a row that does not repeat, or a rule it cannot read", () => {
    const once = threadPage(thread([row({ occursAt: "2026-10-06T17:30:00.000Z" })]), "Europe/London");
    expect(once).not.toMatch(/Weekly|Daily|Monthly|Annually|Every/);
    const unread = threadPage(thread([row({ occursAt: "2026-10-06T17:30:00.000Z", rrule: "FREQ=HOURLY" })]), "Europe/London");
    expect(unread).toContain("On 6 Oct 2026, 18:30");
    expect(unread).not.toContain("HOURLY");
  });
});
