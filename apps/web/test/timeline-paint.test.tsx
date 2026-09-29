// @vitest-environment happy-dom
//
// With a calendar picked, a month is drawn once. The thread's own dots came
// first and the calendar's arrived a second later, so the grid changed under
// whoever was reading it, and again on every step to another month.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowHandlers } from "../src/components/panes/ContentRowView";
import type { ContentRow, Note, ThreadEvent } from "../src/lib/threads";

const asked: { from: string; to: string; settle: (events: ThreadEvent[] | null) => void }[] = [];

vi.mock("../src/lib/threads", async (actual) => ({
  ...(await actual<typeof import("../src/lib/threads")>()),
  fetchThreadEvents: (_thread: string, from: string, to: string) =>
    new Promise<ThreadEvent[] | null>((settle) => asked.push({ from, to, settle })),
}));

const { Timeline } = await import("../src/components/panes/Timeline");

const iso = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

/** A day in this month that is not today, so nothing on it is listed. */
function anotherDay(offsetMonths = 0): string {
  const at = new Date();
  at.setDate(1);
  at.setMonth(at.getMonth() + offsetMonths);
  at.setDate(new Date().getDate() === 15 && offsetMonths === 0 ? 14 : 15);
  return iso(at);
}

function task(day: string): ContentRow {
  return { id: "t", type: "task", title: "Pack", occursAt: `${day}T00:00:00Z`, allDay: true, doneAt: null } as unknown as ContentRow;
}

function event(day: string): ThreadEvent {
  return {
    id: `e${day}`,
    sourceRef: "s",
    calendarId: "c",
    calendarName: "Family",
    colour: null,
    title: "Yoga",
    occursAt: `${day}T00:00:00Z`,
    occursEndAt: null,
    allDay: true,
    untrusted: false,
  };
}

function cell(host: HTMLElement, day: string): string {
  const [year, month, dom] = day.split("-").map(Number);
  const name = new Date(year!, month! - 1, dom!).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const button = [...host.querySelectorAll("button[aria-label]")].find((one) => one.getAttribute("aria-label")!.startsWith(name));
  return button?.getAttribute("aria-label") ?? "";
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  asked.length = 0;
});
afterEach(() => {
  document.body.innerHTML = "";
});

function mount(rows: ContentRow[], notes: Note[] = []) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() =>
    root.render(
      <Timeline
        threadId="t"
        rows={rows}
        notes={notes}
        handlers={{} as RowHandlers}
        onToggle={() => {}}
        onAdd={() => {}}
        calendars={{ anyPicked: true, version: 0 }}
      />,
    ),
  );
  return { host, unmount: () => act(() => root.unmount()) };
}

describe("a month with a calendar picked", () => {
  it("holds the thread's own dots until the calendar's are in", async () => {
    const day = anotherDay();
    const { host, unmount } = mount([task(day)]);
    expect(cell(host, day)).toContain("nothing on");
    const current = asked.find((one) => one.from <= day && day <= one.to)!;
    await act(async () => current.settle([event(day)]));
    expect(cell(host, day)).toContain("1 to do");
    expect(cell(host, day)).toContain("1 calendar event");
    unmount();
  });

  it("lists the day's own things while the calendar is still being read", () => {
    const today = iso(new Date());
    const note = { id: "n", text: "Staying in Lisbon", occursAt: `${today}T00:00:00Z`, occursEndAt: null, dueAt: null, allDay: true, origin: "typed", labels: [] } as unknown as Note;
    const { host, unmount } = mount([], [note]);
    expect(host.textContent).not.toContain("Nothing on this day.");
    expect(host.textContent).toContain("Staying in Lisbon");
    unmount();
  });

  it("draws a month whose calendar did not answer, and asks again when it is back", async () => {
    const day = anotherDay();
    const { host, unmount } = mount([task(day)]);
    const current = asked.find((one) => one.from <= day && day <= one.to)!;
    await act(async () => current.settle(null));
    expect(cell(host, day)).toContain("1 to do");
    act(() => (host.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click());
    expect(asked.filter((one) => one.from === current.from && one.to === current.to)).toHaveLength(2);
    unmount();
  });

  it("has the next month ready before the arrow is pressed", async () => {
    const next = anotherDay(1);
    const { host, unmount } = mount([]);
    await act(async () => {
      for (const one of [...asked]) one.settle(one.from <= next && next <= one.to ? [event(next)] : []);
    });
    act(() => (host.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click());
    expect(cell(host, next)).toContain("1 calendar event");
    unmount();
  });
});
