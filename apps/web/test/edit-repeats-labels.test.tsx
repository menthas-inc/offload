// @vitest-environment happy-dom
//
// 2026-10-07. Two things the edit dialog got wrong. Repeats on a row with no
// date was a disabled select with nothing in it, which read as broken: it
// says Never. And the row's labels could only be changed from the tag tool;
// the dialog has them too, as the phones' sheet does, through the same label
// popover, saved with everything else in one write.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EditModal } from "../src/components/panes/EditModal";
import type { ContentPatch, ContentRow } from "../src/lib/threads";
import type { Label } from "../src/lib/labels";

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const row = {
  id: "r",
  type: "task",
  title: "Book the flat",
  body: null,
  occursAt: null,
  occursEndAt: null,
  dueAt: null,
  allDay: false,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  labels: ["l1"],
} as unknown as ContentRow;

const labels = [
  { id: "l1", name: "Lisbon", colour: 1, count: 3 },
  { id: "l2", name: "Paris", colour: 2, count: 1 },
] as Label[];

function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(node));
}

const button = (text: string) => [...document.querySelectorAll("button")].find((one) => one.textContent?.trim() === text)!;

describe("the edit dialog's Repeats", () => {
  it("says Never on a row with no date", () => {
    render(<EditModal row={row} onClose={() => {}} onSave={() => {}} />);
    const select = document.querySelector('select[aria-label="Repeats"]') as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(0);
    expect(select.selectedOptions[0]?.textContent).toBe("Never");
  });
});

describe("the edit dialog's Labels", () => {
  it("shows what the row carries and saves a change with the rest", () => {
    const saved: { patch: ContentPatch; made: string[] }[] = [];
    render(
      <EditModal row={row} labels={labels} onClose={() => {}} onSave={(_row, patch, made) => saved.push({ patch, made })} />,
    );
    const open = document.querySelector('[aria-label^="Labels"]') as HTMLButtonElement;
    expect(open.textContent).toContain("Lisbon");
    act(() => open.click());

    const paris = [...document.querySelectorAll('[role="checkbox"]')].find((one) => one.textContent?.includes("Paris")) as HTMLElement;
    act(() => paris.click());
    act(() => button("Done").click());
    expect(open.textContent).toContain("Paris");

    act(() => button("Save").click());
    expect(saved).toEqual([{ patch: { labels: ["l1", "l2"] }, made: [] }]);
  });

  it("says None when the row carries no label, and sends nothing for labels left alone", () => {
    const saved: ContentPatch[] = [];
    let closed = 0;
    render(
      <EditModal row={{ ...row, labels: [] }} labels={labels} onClose={() => closed++} onSave={(_row, patch) => saved.push(patch)} />,
    );
    const open = document.querySelector('[aria-label^="Labels"]') as HTMLButtonElement;
    expect(open.textContent).toContain("None");
    act(() => button("Save").click());
    expect(saved).toEqual([]);
    expect(closed).toBe(1);
  });

  it("has no Labels row where there is no thread to take them from", () => {
    render(<EditModal row={row} onClose={() => {}} onSave={() => {}} />);
    expect(document.querySelector('[aria-label^="Labels"]')).toBeNull();
  });
});
