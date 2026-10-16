// @vitest-environment happy-dom
//
// 2026-10-12 (the owner). The edit dialog showed a disabled 09:00 beside All
// day, which read as a time the row had. A time field exists only while the
// row has a time; All day alone says the rest.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EditModal } from "../src/components/panes/EditModal";
import type { ContentRow } from "../src/lib/threads";

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const base = {
  id: "r",
  type: "task",
  title: "Book the flat",
  body: null,
  occursAt: null,
  occursEndAt: null,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  labels: [],
};
const allDay = { ...base, dueAt: "2026-10-14T12:00:00.000Z", allDay: true } as unknown as ContentRow;
const timed = { ...base, dueAt: "2026-10-14T08:00:00.000Z", allDay: false } as unknown as ContentRow;

function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(node));
}
const timeField = () => document.querySelector('input[aria-label="Time"]') as HTMLInputElement | null;
const allDayBox = () => [...document.querySelectorAll('input[role="switch"]')].find((one) => one.closest("label")?.textContent === "All day") as HTMLInputElement;

describe("the edit dialog's time", () => {
  // 2026-10-16 (the owner). One row, the All day switch; the hour is a row
  // of its own under it while the switch is off, with nothing labelled Time
  // above the switch.
  it("is the All day switch, with no Time label on its row", () => {
    render(<EditModal row={timed} onClose={() => {}} onSave={() => {}} />);
    const row = allDayBox().closest("div")!;
    expect(row.textContent).toContain("All day");
    expect(row.textContent).not.toContain("Time");
    expect(timeField()?.closest("div")).not.toBe(row);
  });

  it("draws no time field on an all-day row, only the All day tick", () => {
    render(<EditModal row={allDay} onClose={() => {}} onSave={() => {}} />);
    expect(allDayBox().checked).toBe(true);
    expect(timeField()).toBeNull();
  });

  it("draws the time field on a timed row, and takes it away when All day is ticked", () => {
    render(<EditModal row={timed} onClose={() => {}} onSave={() => {}} />);
    expect(allDayBox().checked).toBe(false);
    expect(timeField()).not.toBeNull();
    act(() => allDayBox().click());
    expect(allDayBox().checked).toBe(true);
    expect(timeField()).toBeNull();
    act(() => allDayBox().click());
    expect(timeField()?.value).toBe("09:00");
  });
});
