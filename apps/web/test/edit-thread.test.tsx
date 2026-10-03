// @vitest-environment happy-dom
//
// 037. Edit thread on the web: the name, the seventy and the ten hues in one
// popover, and one Save that sends only what changed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { EditThread } = await import("../src/components/panes/EditThread");

const THREAD = { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", name: "Lisbon", icon: "plane", hue: 3, iconSetBy: "offload" as const };

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function open(over: Partial<Parameters<typeof EditThread>[0]> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  act(() => root.render(<EditThread thread={THREAD} from="icon" onSave={onSave} onClose={onClose} {...over} />));
  return { onSave, onClose };
}

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;
const radio = (group: string, name: string) =>
  host.querySelector(`[role="radiogroup"][aria-label="${group}"] [role="radio"][aria-label="${name}"]`) as HTMLButtonElement;
const field = () => host.querySelector("input") as HTMLInputElement;

function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Edit thread", () => {
  it("is a dialog with the name, seventy icons and ten colours, the thread's own picked", () => {
    open();
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-label")).toBe("Edit thread");
    expect(field().value).toBe("Lisbon");
    expect(host.querySelectorAll('[role="radiogroup"][aria-label="Icon"] [role="radio"]')).toHaveLength(70);
    expect(host.querySelectorAll('[role="radiogroup"][aria-label="Colour"] [role="radio"]')).toHaveLength(10);
    expect(radio("Icon", "Plane").getAttribute("aria-checked")).toBe("true");
    expect(radio("Colour", "Green").getAttribute("aria-checked")).toBe("true");
  });

  it("focuses the name only when it was opened from the name", () => {
    open({ from: "name" });
    expect(document.activeElement).toBe(field());
    act(() => root.unmount());
    root = createRoot(host);
    open({ from: "icon" });
    expect(document.activeElement).not.toBe(field());
  });

  it("saves only what changed", () => {
    const { onSave, onClose } = open();
    act(() => radio("Icon", "Wine").click());
    act(() => radio("Colour", "Teal").click());
    act(() => button("Save").click());
    expect(onSave).toHaveBeenCalledWith({ icon: "wine", hue: 6 }, { name: "Lisbon", icon: "wine", hue: 6 });
    expect(onClose).toHaveBeenCalled();
  });

  it("previews the icon a new name would pick, and sends the name alone", () => {
    const { onSave } = open();
    type("Dentist");
    expect(radio("Icon", "Stethoscope").getAttribute("aria-checked")).toBe("true");
    act(() => button("Save").click());
    expect(onSave).toHaveBeenCalledWith({ name: "Dentist" }, { name: "Dentist", icon: "stethoscope", hue: 3 });
  });

  it("closes without a write when nothing changed, and will not save an empty name", () => {
    const { onSave, onClose } = open();
    act(() => button("Save").click());
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    type("   ");
    expect(button("Save").disabled).toBe(true);
  });

  it("drops everything on Cancel and on Escape", () => {
    const { onSave, onClose } = open();
    act(() => radio("Icon", "Wine").click());
    act(() => button("Cancel").click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves through the grid with the arrow keys", () => {
    open();
    act(() => radio("Icon", "Plane").focus());
    act(() => radio("Icon", "Plane").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(radio("Icon", "Car").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio("Icon", "Car"));
  });
});
