// @vitest-environment happy-dom
//
// Undo in place (2026-10-18): a word with a place is drawn where the change
// is, not in the floating toast, and the toast that is left goes when its body
// is tapped.

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastHost, ToastProvider, useToast } from "../src/components/shell/Toast";
import { UndoLine } from "../src/components/shell/UndoLine";
import { undoStore, useInPlace } from "../src/lib/undo";

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
  vi.useRealTimers();
});

function mount(node: React.ReactNode): HTMLElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

let toast: ReturnType<typeof useToast> | null = null;
function Grab() {
  toast = useToast();
  return null;
}

function List({ ids }: { ids: string[] }) {
  const order = useInPlace(ids, (id) => id);
  return (
    <ul>
      {order.map((one) =>
        "slot" in one ? (
          <li key={one.entry.id}>
            <UndoLine entry={one.entry} />
          </li>
        ) : (
          <li key={one.row}>
            {one.row}
            {one.line ? <UndoLine entry={one.line} /> : null}
          </li>
        ),
      )}
    </ul>
  );
}

describe("a word with a place", () => {
  it("is drawn in the removed row's slot, and the toast stays empty", () => {
    let setIds: (ids: string[]) => void = () => undefined;
    function Page() {
      const [ids, set] = useState(["a", "b", "c"]);
      setIds = set;
      return (
        <ToastProvider>
          <Grab />
          <List ids={ids} />
          <ToastHost />
        </ToastProvider>
      );
    }
    const page = mount(<Page />);
    act(() => setIds(["a", "c"]));
    act(() => toast!.show("Archived", { label: "Undo", onPress: () => undefined }, { id: "b", icon: "archive", form: "slot" }));
    const items = [...page.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual(["a", "ArchivedUndo", "c"]);
    expect(page.querySelector("[role=status]")?.textContent).toContain("Archived");
    // Nothing floats: the one toast element is not drawn.
    expect(page.querySelectorAll("[role=status]")).toHaveLength(1);
  });

  it("Undo drops the line and runs the action; the window's end closes it up", () => {
    vi.useFakeTimers();
    const undone = vi.fn();
    const page = mount(<List ids={["a"]} />);
    act(() => undoStore.put({ id: "b", icon: "archive", form: "slot" }, "Archived", { label: "Undo", onPress: undone }));
    act(() => undoStore.put({ id: "z", icon: "archive", form: "slot" }, "Archived", { label: "Undo", onPress: undone }));
    // Neither was ever drawn here, so neither has a slot to take.
    expect(page.querySelectorAll("li")).toHaveLength(1);

    act(() => root!.render(<List ids={["a", "b"]} />));
    act(() => root!.render(<List ids={["a"]} />));
    const button = [...page.querySelectorAll("button")].find((one) => one.textContent === "Undo");
    act(() => button!.click());
    expect(undone).toHaveBeenCalledTimes(1);
    expect(undoStore.entries().has("b")).toBe(false);
  });

  it("a refusal reads as an alert with Retry", () => {
    const entry = { id: "b", message: "Couldn't archive that", icon: "archive", form: "under" as const, failed: true, startedAt: 0, action: { label: "Retry", onPress: () => undefined } };
    const page = mount(<UndoLine entry={entry} />);
    expect(page.querySelector("[role=alert]")?.textContent).toBe("Couldn't archive thatRetry");
  });
});

describe("the toast that is left", () => {
  it("goes when its body is tapped, and its action still acts", () => {
    const acted = vi.fn();
    const page = mount(
      <ToastProvider>
        <Grab />
        <ToastHost />
      </ToastProvider>,
    );
    act(() => toast!.show("Shared with Sam"));
    const body = page.querySelector("[role=status]") as HTMLElement;
    expect(body.textContent).toBe("Shared with Sam");
    act(() => body.click());
    // Faded, then gone.
    act(() => body.dispatchEvent(new Event("animationend", { bubbles: true })));
    expect(page.querySelector("[role=status]")).toBeNull();

    act(() => toast!.show("Couldn't send that", { label: "Retry", onPress: acted }));
    act(() => (page.querySelector("button") as HTMLElement).click());
    expect(acted).toHaveBeenCalledTimes(1);
  });
});

describe("a refusal under the thing it put back", () => {
  it("is drawn grey under the row, not in an amber slot", () => {
    const page = mount(<List ids={["a", "b"]} />);
    act(() => undoStore.put({ id: "b", icon: "check", form: "slot" }, "Couldn't tick that off", { label: "Retry", onPress: () => undefined }));
    const alert = page.querySelector("[role=alert]")!;
    expect(alert.className).toMatch(/under/);
    expect(alert.className).not.toMatch(/slot/);
  });
});
