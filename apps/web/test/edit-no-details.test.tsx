// @vitest-environment happy-dom
//
// 2026-09-29. offload is for short things, and the details field took space,
// looked odd and confused people. The edit dialog has no details now, and a
// save never touches what is already stored there.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EditModal } from "../src/components/panes/EditModal";
import type { ContentPatch, ContentRow } from "../src/lib/threads";

afterEach(() => {
  document.body.innerHTML = "";
});

const row = {
  id: "r",
  type: "task",
  title: "Book the flat",
  body: "Old details somebody dumped",
  occursAt: null,
  occursEndAt: null,
  dueAt: null,
  allDay: false,
  rrule: null,
  isReminder: false,
  onCalendar: false,
} as unknown as ContentRow;

describe("the edit dialog", () => {
  it("has no details field and never sends one", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const saved: ContentPatch[] = [];
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root.render(<EditModal row={row} onClose={() => {}} onSave={(_row, patch) => saved.push(patch)} />));

    expect(document.querySelector('[aria-label="Details"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Old details");

    const title = document.querySelector('[aria-label="Title"]') as HTMLInputElement;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(title, "Book the flat for May");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...document.querySelectorAll("button")].find((one) => one.textContent === "Save")!;
    act(() => save.click());

    expect(saved).toEqual([{ title: "Book the flat for May" }]);
    act(() => root.unmount());
  });
});
