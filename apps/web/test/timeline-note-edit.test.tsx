// @vitest-environment happy-dom
//
// A note on a Timeline day was a line of text that nothing opened, so a diary
// entry could not be changed, deleted or moved once it was on a day. It opens
// in the same editor the Notes section draws, wired to the same writes.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../src/lib/threads";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

const { LayoutSections } = await import("../src/components/panes/LayoutSections");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const note: Note = {
  id: "n1",
  labels: [],
  text: "Flight back home",
  body: null,
  origin: "stated",
  authorId: "me",
  authorIsMember: true,
  muted: false,
  occursAt: "2026-11-21",
  occursEndAt: null,
  dueAt: null,
  placeId: null,
  priority: 50,
  writtenAt: "2026-10-31T10:00:00Z",
  createdAt: "2026-10-31T10:00:00Z",
} as unknown as Note;

const actions = {
  viewerId: "me",
  canDelete: () => true,
  add: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  mute: vi.fn(),
  move: vi.fn(),
  remind: vi.fn(),
};

const draw = () =>
  act(() =>
    root.render(
      <LayoutSections
        page={{ rail: false, sections: [{ kind: "day", key: "2026-11-21", day: "2026-11-21", rows: [note] }], others: { rows: [], notes: [] } } as never}
        handlers={{} as never}
        labels={[]}
        onAdd={() => {}}
        onToggle={() => {}}
        threadId="t0"
        noteActions={actions}
      />,
    ),
  );

const press = (text: string) => {
  const button = [...host.querySelectorAll("button")].find((one) => one.textContent?.includes(text));
  expect(button, text).toBeDefined();
  act(() => button!.click());
};

describe("a note on a Timeline day", () => {
  it("opens in the note editor and saves through the note's edit", () => {
    draw();
    press("Flight back home");
    const field = host.querySelector("textarea")!;
    expect(field.value).toBe("Flight back home");
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(field, "Flight back home, 9pm");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    press("Save");
    expect(actions.edit).toHaveBeenCalledWith(note, "Flight back home, 9pm");
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("deletes from the open note", () => {
    draw();
    press("Flight back home");
    press("Delete");
    expect(actions.remove).toHaveBeenCalledWith(note);
  });
});
