// @vitest-environment happy-dom
//
// 2026-10-31. A new note typed from the More menu on a layout that does not
// draw the Notes section: its own editor, written through the same add.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

const { NewNote } = await import("../src/components/panes/Notes");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const type = (text: string) => {
  const field = host.querySelector("textarea")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
};

describe("a new note on a layout", () => {
  it("writes what is typed through the note add, and closes", () => {
    const actions = { add: vi.fn() };
    const onClose = vi.fn();
    act(() => root.render(<NewNote actions={actions} onClose={onClose} />));
    type("  Passports are in the blue folder  ");
    expect(actions.add).toHaveBeenCalledWith("Passports are in the blue folder");
    expect(onClose).toHaveBeenCalled();
  });

  it("writes nothing for nothing typed", () => {
    const actions = { add: vi.fn() };
    const onClose = vi.fn();
    act(() => root.render(<NewNote actions={actions} onClose={onClose} />));
    type("   ");
    expect(actions.add).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
