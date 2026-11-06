// @vitest-environment happy-dom
//
// 2026-10-17 (the owner). To do, Files and Notes fold from their heading, and
// Files starts folded so photos do not take the page. The state is kept in
// this browser and read back on the next thread.

import { readFileSync } from "node:fs";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRow } from "../src/lib/threads";

vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-17" }) }));

const { Widgets } = await import("../src/components/panes/Widgets");

let root: Root | null = null;
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const row = (over: Partial<ContentRow>): ContentRow =>
  ({
    id: "r",
    type: "task",
    title: "Book the ferry",
    body: null,
    url: null,
    imageUrl: null,
    photo: null,
    createdAt: "2026-10-01T09:00:00Z",
    archivedAt: null,
    doneAt: null,
    dueAt: null,
    occursAt: null,
    occursEndAt: null,
    rrule: null,
    isReminder: false,
    onCalendar: false,
    priority: 0,
    priorityPinned: false,
    labels: [],
    place: null,
    location: null,
    ...over,
  }) as unknown as ContentRow;

const rows = [row({ id: "t", title: "Book the ferry" }), row({ id: "p", type: "image", title: "Ferry times" })];

// To do's add field is the page's, so the test holds it as the page does.
function Page() {
  const [addingTodo, setAddingTodo] = useState(false);
  return (
    <Widgets rows={rows} preference={{}} handlers={{ arrived: new Set<string>() } as never} onAdd={() => {}} onToggle={() => {}} onFold={() => {}} onReorder={() => {}} addingTodo={addingTodo} onAddingTodo={setAddingTodo} />
  );
}

function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() =>
    root!.render(
      <Page />,
    ),
  );
}
const heading = (name: string) =>
  [...document.querySelectorAll("button[aria-expanded]")].find((one) => one.textContent?.startsWith(name)) as HTMLButtonElement;

describe("a thread's sections fold", () => {
  it("draws Files folded and To do open at first", () => {
    render();
    expect(heading("Files").getAttribute("aria-expanded")).toBe("false");
    expect(heading("To do").getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("Book the ferry");
    expect(document.querySelector('[aria-label="Ferry times"]')).toBeNull();
  });

  it("opens and folds from the heading, and keeps it in this browser", () => {
    render();
    act(() => heading("Files").click());
    act(() => heading("To do").click());
    expect(heading("Files").getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).not.toContain("Book the ferry");
    act(() => root?.unmount());
    render();
    expect(heading("Files").getAttribute("aria-expanded")).toBe("true");
    expect(heading("To do").getAttribute("aria-expanded")).toBe("false");
  });

  // Client review, 2026-10-17. Folding with the add field open put the field
  // away under the fold and kept it open; the fold press is its Cancel.
  it("puts the add field away when the section folds", () => {
    render();
    act(() => (document.querySelector('button[aria-label="Add to To do"]') as HTMLButtonElement).click());
    expect(document.querySelector('input[aria-label="Add to this section"]')).not.toBeNull();
    act(() => heading("To do").click());
    expect(heading("To do").getAttribute("aria-expanded")).toBe("false");
    act(() => heading("To do").click());
    expect(document.querySelector('input[aria-label="Add to this section"]')).toBeNull();
  });

  it("folds Notes from its heading too", () => {
    const notes = readFileSync("src/components/panes/Notes.tsx", "utf8");
    expect(notes).toMatch(/useFolds\(\)/);
    expect(notes).toMatch(/aria-expanded=\{!sectionFolded\}/);
    expect(notes).toMatch(/const sectionFolded = folds\.notes && !adding && editingId === null && !notes\.some\(\(note\) => note\.id === reveal\);/);
    expect(notes).toMatch(/onAdding\(false\)[\s\S]{0,120}setFold\("notes", !sectionFolded\)/);
  });
});
