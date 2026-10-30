// @vitest-environment happy-dom
//
// 2026-10-07. A thread with others in it is left, not deleted: its row's tool
// says Leave and the question names who it stays with. A thread of your own
// keeps Delete.

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
vi.stubGlobal("fetch", async () => new Response(JSON.stringify({}), { status: 200 }));

const { MyThreads } = await import("../src/components/panes/MyThreads");
const { ToastProvider } = await import("../src/components/shell/Toast");
type Group = import("../src/lib/threads").ThreadGroup;

const thread = (id: string, name: string, others: string[]) =>
  ({ id, name, icon: "lasso", hue: 1, count: 3, meta: "3 to do", isDefault: false, others }) as never;
const groups: Group[] = [{ key: "now", threads: [thread("t1", "Flat admin", ["Sam Reed"]), thread("t2", "Dentist", [])] }];

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

const menuOf = async (name: string) => {
  const tile = [...host.querySelectorAll("[data-tile]")].find((one) => one.getAttribute("aria-label")!.startsWith(name))!;
  await act(async () => void tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  return [...host.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
};

describe("leaving a shared thread from My threads", () => {
  it("says Leave on a shared thread and names who it stays with", async () => {
    await act(async () =>
      root.render(
        <ToastProvider>
          <MyThreads groups={groups} loading={false} />
        </ToastProvider>,
      ),
    );
    expect((await menuOf("Dentist")).map((item) => item.textContent)).toContain("Delete thread");
    const items = await menuOf("Flat admin");
    expect(items.map((item) => item.textContent)).not.toContain("Delete thread");
    await act(async () => items.find((item) => item.textContent === "Leave thread")!.click());
    expect(document.body.textContent).toContain("Leave Flat admin?");
    expect(document.body.textContent).toContain("It stays for Sam.");
    expect([...document.body.querySelectorAll("button")].some((b) => b.textContent === "Leave")).toBe(true);
  });
});
