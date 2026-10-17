// @vitest-environment happy-dom
//
// 2026-10-17 (the owner). offload could date a row across days, the 17th to
// the 20th, and a person could not: the dialog held one day. A Last day row
// under the grid picks the span's end on the same grid.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditModal } from "../src/components/panes/EditModal";
import type { ContentRow } from "../src/lib/threads";

vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "Europe/Lisbon", today: "2026-10-15" }) }));

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const base = {
  id: "r",
  title: "Lisbon",
  body: null,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  labels: [],
  allDay: true,
};
const noon = (day: string) => `${day}T12:00:00.000Z`;

function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(node));
}
const lastDay = () => document.querySelector('button[aria-label^="Last day"]') as HTMLButtonElement | null;
const day = (iso: string) => {
  const name = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(noon(iso)));
  return document.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
};
const save = () => [...document.querySelectorAll("button")].find((one) => one.textContent === "Save")!;

describe("the edit dialog's last day", () => {
  it("says Same day on a one-day row, and picks the end on the grid", () => {
    const onSave = vi.fn();
    const row = { ...base, type: "task", dueAt: noon("2026-10-17") } as unknown as ContentRow;
    render(<EditModal row={row} onClose={() => {}} onSave={onSave} />);
    expect(lastDay()?.textContent).toBe("Same day");
    act(() => lastDay()!.click());
    expect(lastDay()?.getAttribute("aria-pressed")).toBe("true");
    act(() => day("2026-10-20").click());
    expect(lastDay()?.textContent).toBe("Tue 20");
    expect(lastDay()?.getAttribute("aria-pressed")).toBe("false");
    act(() => save().click());
    expect(onSave.mock.calls[0]![1]).toMatchObject({ occursAt: "2026-10-17", occursEndAt: "2026-10-20", dueAt: "2026-10-20", allDay: true });
  });

  it("opens a span on its days, marks the days between, and goes back to one day from a day on or before the first", () => {
    const onSave = vi.fn();
    const row = { ...base, type: "event", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20") } as unknown as ContentRow;
    render(<EditModal row={row} onClose={() => {}} onSave={onSave} />);
    expect(lastDay()?.textContent).toBe("Tue 20");
    expect(day("2026-10-18").dataset["between"]).toBe("true");
    expect(day("2026-10-20").getAttribute("aria-pressed")).toBe("true");
    act(() => lastDay()!.click());
    act(() => day("2026-10-17").click());
    expect(lastDay()?.textContent).toBe("Same day");
    act(() => save().click());
    expect(onSave.mock.calls[0]![1]).toMatchObject({ occursAt: "2026-10-17", occursEndAt: null });
  });

  it("moves the last day with the first when the first is picked past it", () => {
    const row = { ...base, type: "event", occursAt: noon("2026-10-17"), occursEndAt: noon("2026-10-20") } as unknown as ContentRow;
    render(<EditModal row={row} onClose={() => {}} onSave={() => {}} />);
    act(() => day("2026-10-22").click());
    expect(lastDay()?.textContent).toBe("Same day");
  });

  it("is not offered on a repeating row", () => {
    const row = { ...base, type: "task", dueAt: noon("2026-10-17"), rrule: "FREQ=WEEKLY" } as unknown as ContentRow;
    render(<EditModal row={row} onClose={() => {}} onSave={() => {}} />);
    expect(lastDay()).toBeNull();
  });

  it("is not offered with no day", () => {
    const row = { ...base, type: "task" } as unknown as ContentRow;
    render(<EditModal row={row} onClose={() => {}} onSave={() => {}} />);
    expect(lastDay()).toBeNull();
  });
});
