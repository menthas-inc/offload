// @vitest-environment happy-dom
//
// The thread's calendar is a month at a time, whatever the span. A thread
// whose dates ran over two or three weeks drew them as a rail of weeks that
// crossed a month boundary with no way to step, which is not how anybody
// reads a calendar.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "../src/components/panes/Timeline";
import type { RowHandlers } from "../src/components/panes/ContentRowView";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(): { host: HTMLElement; unmount: () => void } {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() =>
    root.render(
      <Timeline
        threadId="t"
        rows={[]}
        notes={[]}
        handlers={{} as RowHandlers}
        onToggle={() => {}}
        onAdd={() => {}}
        calendars={{ anyPicked: false, version: 0 }}
      />,
    ),
  );
  return { host, unmount: () => act(() => root.unmount()) };
}

describe("the thread's calendar", () => {
  it("draws the month with a step either way, even over a short span", () => {
    const { host, unmount } = mount();
    const month = new Date().toLocaleDateString(undefined, { month: "long" });
    expect(host.querySelector('[aria-label="Previous month"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Next month"]')).not.toBeNull();
    expect(host.textContent).toContain(month);
    unmount();
  });

  it("steps to the next month", () => {
    const { host, unmount } = mount();
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    act(() => (host.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click());
    expect(host.textContent).toContain(next.toLocaleDateString(undefined, { month: "long" }));
    unmount();
  });
});
