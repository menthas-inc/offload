// @vitest-environment happy-dom
//
// 2026-10-31. Add a to do on a thread with no to dos draws the To do section
// with its quick add open, so the first one can be typed straight in.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

const { Widgets } = await import("../src/components/panes/Widgets");

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

const draw = (addingTodo: boolean, onAdd = vi.fn(), onAddingTodo = vi.fn()) => {
  act(() =>
    root.render(
      <Widgets
        rows={[]}
        preference={{}}
        handlers={{} as never}
        onAdd={onAdd}
        onToggle={() => {}}
        onFold={() => {}}
        onReorder={() => {}}
        addingTodo={addingTodo}
        onAddingTodo={onAddingTodo}
      />,
    ),
  );
  return { onAdd, onAddingTodo };
};

describe("Add a to do on a thread with none", () => {
  it("draws nothing until it is asked for", () => {
    draw(false);
    expect(host.textContent).toBe("");
  });

  it("draws To do with its field open, and writes what is typed as a to do", () => {
    const { onAdd, onAddingTodo } = draw(true);
    expect(host.textContent).toContain("To do");
    const field = host.querySelector("input")!;
    expect(field).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Book the ferry");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onAdd).toHaveBeenCalledWith("Book the ferry", "todo");
    expect(onAddingTodo).toHaveBeenCalledWith(false);
  });
});
