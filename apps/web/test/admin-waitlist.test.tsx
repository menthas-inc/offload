// @vitest-environment happy-dom
//
// 034 AC-7, AC-9 and AC-10, on the waitlist page: the stats row and the batch
// come from the API, a failed read says so and is never an empty list, and
// invite by address is a one-field dialog that posts the address.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/waitlist", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: WaitlistPage } = await import("../src/app/(admin)/admin/waitlist/page");

const STATS = { waiting: 1204, oldestWaiting: "2026-06-03T10:00:00.000Z", invitedThisWeek: 25, signedUp: 31, invitedNotSignedUp: 9, batch: 40 };
const ROWS = { rows: [{ id: "a1", email: "w1@example.test", state: "waiting", joined: "3 Jun", source: "waitlist", note: null }], nextCursor: null };

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function api(answers: { list?: number; stats?: number; invite?: unknown } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      if (path.startsWith("/waitlist/stats")) return new Response(JSON.stringify(STATS), { status: answers.stats ?? 200 });
      if (path.startsWith("/waitlist/invite-address")) return new Response(JSON.stringify(answers.invite ?? { accountId: "x", status: "invited" }), { status: 200 });
      if (path.startsWith("/waitlist")) return new Response(JSON.stringify(ROWS), { status: answers.list ?? 200 });
      return new Response("{}", { status: 404 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<WaitlistPage />));
  // The search is debounced, so the first read is 200ms out.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  return host;
}

const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the waitlist page", () => {
  it("draws the stats row and says the batch is set on Limits", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("1,204 waiting · letting 40 in a week, set on Limits");
    expect(host.textContent).toContain("Waiting1,204oldest joined 3 Jun");
    expect(host.textContent).toContain("Invited this week25");
    expect(host.textContent).toContain("Signed up319 invited have not signed in");
    expect(host.textContent).toContain("Weekly batch40set on the Limits page");
    expect(button(host, "Invite the next 40")).toBeDefined();
  });

  it("says a failed read failed, beside Try again, and never draws it as an empty list", async () => {
    api({ list: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the waitlist.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.textContent).not.toContain("Nobody is waiting.");
  });

  it("invites by address from a one-field dialog, and only once it looks like one", async () => {
    api();
    const host = await open();
    await click(button(host, "Invite by address"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    const send = button(dialog, "Invite") as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    await act(async () => type(dialog.querySelector("input")!, "new@example.test"));
    expect(send.disabled).toBe(false);
    await click(send);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const post = calls.find((call) => call.url.endsWith("/v1/admin/waitlist/invite-address"))!;
    expect(post.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(post.init!.body))).toEqual({ email: "new@example.test" });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Invite sent");
  });

  it("says already in for an address that is", async () => {
    api({ invite: { accountId: "x", status: "already-in" } });
    const host = await open();
    await click(button(host, "Invite by address"));
    const dialog = host.querySelector('[role="dialog"]')!;
    await act(async () => type(dialog.querySelector("input")!, "in@example.test"));
    await click(button(dialog, "Invite"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("They are already in.");
  });
});
