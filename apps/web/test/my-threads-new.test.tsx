// @vitest-environment happy-dom
//
// 2026-10-07. A thread made by hand: the plus on My threads opens Edit
// thread as New thread, Create makes it, and the pane opens on it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
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

const posts: { url: string; body: unknown }[] = [];
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (init?.method === "POST" && new URL(url).pathname === "/v1/threads") {
    posts.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ thread: { id: "new-1", name: "Dentist", icon: "stethoscope", hue: 2 } }), { status: 200 });
  }
  return new Response(JSON.stringify({}), { status: 200 });
});

const { MyThreads } = await import("../src/components/panes/MyThreads");
const { ToastProvider } = await import("../src/components/shell/Toast");
type Group = import("../src/lib/threads").ThreadGroup;

const groups: Group[] = [
  { key: "now", threads: [{ id: "t1", name: "Lisbon trip", icon: "plane", hue: 1, count: 3, meta: "3 to do", isDefault: false } as never] },
];

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  posts.length = 0;
  router.push.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("a new thread from My threads", () => {
  it("opens New thread from the plus, makes it on Create and opens it", async () => {
    const changed = vi.fn();
    await act(async () =>
      root.render(
        <ToastProvider>
          <MyThreads groups={groups} loading={false} onChanged={changed} />
        </ToastProvider>,
      ),
    );
    const plus = host.querySelector('button[aria-label="New thread"]') as HTMLButtonElement;
    expect(plus).not.toBeNull();
    await act(async () => plus.click());

    const dialog = document.querySelector('[role="dialog"][aria-label="New thread"]')!;
    expect(dialog).not.toBeNull();
    const create = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Create") as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    const field = dialog.querySelector("input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Dentist");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => create.click());

    // The icon the name reads as, and the colour least used beside Lisbon's.
    expect(posts).toEqual([{ url: expect.stringContaining("/v1/threads"), body: { name: "Dentist", icon: "stethoscope", hue: 2 } }]);
    expect(router.push).toHaveBeenCalledWith("/threads/new-1?from=threads");
    expect(changed).toHaveBeenCalled();
  });

  it("offers the plus on an empty My threads too", async () => {
    await act(async () =>
      root.render(
        <ToastProvider>
          <MyThreads groups={[]} loading={false} />
        </ToastProvider>,
      ),
    );
    expect(host.querySelector('button[aria-label="New thread"]')).not.toBeNull();
  });
});
