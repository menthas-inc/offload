// @vitest-environment happy-dom
//
// Undo in place (2026-10-18), on My threads and the filter bar: a thread
// deleted or left keeps its row's slot for the line, and a deleted label its
// chip's, pill-shaped. Nothing floats over the page while an Undo is up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
let deleted: boolean | null = true;
vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) =>
  init?.method === "DELETE"
    ? deleted === null
      ? new Response("{}", { status: 500 })
      : new Response(JSON.stringify({ left: !deleted, deleted }), { status: 200 })
    : new Response("{}", { status: 200 }),
);

const { MyThreads } = await import("../src/components/panes/MyThreads");
const { FilterBar } = await import("../src/components/labels/FilterBar");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { undoStore } = await import("../src/lib/undo");
type Group = import("../src/lib/threads").ThreadGroup;

const thread = (id: string, name: string) => ({ id, name, icon: "lasso", hue: 1, count: 3, meta: "3 to do", isDefault: false, others: [] }) as never;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  deleted = true;
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((one) => one.textContent === text || one.getAttribute("aria-label") === text) as HTMLButtonElement;
/** Thread names and lines, in the order they are drawn. */
const drawn = () =>
  [...host.querySelectorAll("a[href^='/threads/'], [role=status], [role=alert]")].map((one) =>
    one.matches("a") ? one.textContent?.replace("3 to do", "") : `line: ${one.textContent}`,
  );

describe("My threads", () => {
  function Page({ groups }: { groups: Group[] }) {
    return (
      <ToastProvider>
        <MyThreads groups={groups} loading={false} onChanged={() => undefined} />
        <ToastHost />
      </ToastProvider>
    );
  }
  const before: Group[] = [{ key: "now", threads: [thread("t1", "Lisbon trip"), thread("t2", "Dentist"), thread("t3", "Flat admin")] }];

  it("draws a deleted thread's line in its row's slot, before and after the list is read again", async () => {
    await act(async () => root.render(<Page groups={before} />));
    await act(async () => button("Delete Dentist").click());
    await act(async () => button("Delete").click());
    await settle();
    expect(drawn()).toEqual(["Lisbon trip", "line: Thread deletedUndo", "Flat admin"]);
    await act(async () => root.render(<Page groups={[{ key: "now", threads: [thread("t1", "Lisbon trip"), thread("t3", "Flat admin")] }]} />));
    expect(drawn()).toEqual(["Lisbon trip", "line: Thread deletedUndo", "Flat admin"]);
  });

  it("says a refusal under the row it left in place", async () => {
    deleted = null;
    await act(async () => root.render(<Page groups={before} />));
    await act(async () => button("Delete Dentist").click());
    await act(async () => button("Delete").click());
    await settle();
    expect(drawn()).toEqual(["Lisbon trip", "Dentist", "line: Couldn't delete that threadTry again", "Flat admin"]);
  });
});

describe("the filter bar", () => {
  const label = (id: string, name: string) => ({ id, name, colour: 1, count: 2 });
  const bar = (labels: ReturnType<typeof label>[]) => (
    <FilterBar labels={labels} unlabelled={0} pick={{ labels: [], none: false }} onPick={() => undefined} onNew={() => undefined} onOpen={() => undefined} />
  );

  it("keeps a deleted label's chip for its line, even the last one", () => {
    act(() => root.render(bar([label("l1", "Repairs")])));
    act(() => {
      root.render(bar([]));
      undoStore.put({ id: "l1", icon: "trash-2", form: "slot" }, "Repairs deleted", { label: "Undo", onPress: () => undefined });
    });
    expect(host.querySelector("[role=status]")?.textContent).toBe("Repairs deletedUndo");
  });
});
