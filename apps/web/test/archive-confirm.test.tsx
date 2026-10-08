// @vitest-environment happy-dom
//
// 2026-10-07. Archive in a shared thread hides the row for everyone in it, so
// it asks first, in the row's own place as delete does, and says so.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

const { ContentRowView } = await import("../src/components/panes/ContentRowView");
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

const button = (text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;

describe("archiving in a shared thread", () => {
  it("asks in the row's place and says it goes for everyone", async () => {
    const archived = vi.fn();
    const asked = vi.fn();
    await render(
      <ContentRowView
        row={row}
        lead={null}
        meta={null}
        handlers={handlers({ archiving: "c1", onArchiveNow: archived, onArchiveAsk: asked })}
      />,
    );
    expect(host.textContent).toContain("Archive Time Out Market?");
    expect(host.textContent).toContain("It leaves the list for everyone in the thread.");
    await act(async () => button("Cancel").click());
    expect(asked).toHaveBeenCalledWith(null);
    await act(async () => button("Archive").click());
    expect(archived).toHaveBeenCalledWith(row);
  });

  it("draws the row as usual while nothing is asking", async () => {
    await render(<ContentRowView row={row} lead={null} meta={null} handlers={handlers({ archiving: null })} />);
    expect(host.textContent).not.toContain("Archive Time Out Market?");
  });
});
