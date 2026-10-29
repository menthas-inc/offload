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

describe("leaving a shared thread from My threads", () => {
  it("says Leave on a shared thread and names who it stays with", async () => {
    await act(async () =>
      root.render(
        <ToastProvider>
          <MyThreads groups={groups} loading={false} />
        </ToastProvider>,
      ),
    );
    expect(host.querySelector('[aria-label="Delete Dentist"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Delete Flat admin"]')).toBeNull();
    const leave = host.querySelector('[aria-label="Leave Flat admin"]') as HTMLButtonElement;
    await act(async () => leave.click());
    expect(host.textContent).toContain("Leave Flat admin?");
    expect(host.textContent).toContain("It stays for Sam.");
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Leave")).toBe(true);
  });
});

describe("048 W3 a row renamed elsewhere", () => {
  it("holds the question at the row's height as it is now, not as it first drew", async () => {
    // happy-dom lays nothing out: a longer name stands for a row that wraps.
    const tall = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return (this.textContent ?? "").length > 30 ? 64 : 40;
      },
    });
    try {
      const draw = (name: string) =>
        act(async () =>
          root.render(
            <ToastProvider>
              <MyThreads groups={[{ key: "now", threads: [thread("t2", name, [])] }]} loading={false} />
            </ToastProvider>,
          ),
        );
      await draw("Dentist");
      await draw("Dentist, and the kids' check-ups in May");
      await act(async () => (host.querySelector('[aria-label^="Delete Dentist"]') as HTMLButtonElement).click());
      const question = [...host.querySelectorAll("button")].find((one) => one.textContent === "Cancel")!.parentElement!;
      expect(parseFloat(question.style.minHeight)).toBe(64);
    } finally {
      if (tall) Object.defineProperty(HTMLElement.prototype, "offsetHeight", tall);
    }
  });
});
