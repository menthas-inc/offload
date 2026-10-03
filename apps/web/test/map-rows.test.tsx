// @vitest-environment happy-dom
//
// 030 T4.4. The list's side of the map: a row reports its hover so its point
// scales, a picked point marks its loaded row, and the label chips float over
// the map with no counts and no plus.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

const { ContentRowView } = await import("../src/components/panes/ContentRowView");
const { FilterBar } = await import("../src/components/labels/FilterBar");
type Row = import("../src/lib/threads").ContentRow;
type Handlers = import("../src/components/panes/ContentRowView").RowHandlers;

const row = {
  id: "c1",
  type: "location",
  title: "Time Out Market",
  body: null,
  occursAt: null,
  occursEndAt: null,
  dueAt: null,
  allDay: false,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  canMove: true,
  labels: [],
} as unknown as Row;

const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  editing: null,
  draft: "",
  asking: null,
  arrived: new Set(),
  onDraft: () => undefined,
  onEdit: () => undefined,
  onSaveTitle: () => undefined,
  onStopEditing: () => undefined,
  onArchive: () => undefined,
  onAsk: () => undefined,
  onDelete: () => undefined,
  ...over,
});

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const render = async (node: React.ReactNode) => act(async () => root.render(node));

describe("a row and its point (AC-18)", () => {
  it("reports the pointer coming and going", async () => {
    const onHover = vi.fn();
    await render(<ContentRowView row={row} lead={null} meta={null} handlers={handlers({ onHover })} />);
    const el = host.querySelector("[data-row]") as HTMLElement;
    await act(async () => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(onHover).toHaveBeenLastCalledWith("c1");
    await act(async () => el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("reports a keyboard's focus the same way", async () => {
    const onHover = vi.fn();
    await render(<ContentRowView row={row} lead={null} meta={null} handlers={handlers({ onHover })} />);
    const el = host.querySelector("[data-row]") as HTMLElement;
    await act(async () => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(onHover).toHaveBeenLastCalledWith("c1");
    await act(async () => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("is marked while its point is picked, and only then", async () => {
    await render(<ContentRowView row={row} lead={null} meta={null} handlers={handlers({ picked: "c1" })} />);
    expect(host.querySelector("[data-row]")?.hasAttribute("data-picked")).toBe(true);
    await render(<ContentRowView row={row} lead={null} meta={null} handlers={handlers({ picked: "c2" })} />);
    expect(host.querySelector("[data-row]")?.hasAttribute("data-picked")).toBe(false);
  });
});

describe("the chips over the map (AC-13)", () => {
  it("carry no counts and no plus", async () => {
    const labels = [{ id: "food", name: "Food", colour: 5, count: 3 }] as never;
    await render(
      <FilterBar floating labels={labels} unlabelled={2} pick={{ labels: [], none: false }} onPick={() => undefined} onNew={() => undefined} onOpen={() => undefined} />,
    );
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.querySelector('[aria-label="New label"]')).toBeNull();
    expect(host.textContent).toContain("Food");
  });
});
