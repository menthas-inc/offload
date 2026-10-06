// @vitest-environment happy-dom
//
// 2026-10-04. A disabled account that signs in again is told it is disabled.
// It used to read "You are not on the list yet" beside a waitlist button,
// about an account that exists: staff disabled it, or it is in the day before
// its deletion. Nothing to join, and one address to write to.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

let attempt: unknown;
const calls: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  calls.push(new URL(url).pathname);
  return new Response(JSON.stringify(attempt), { status: 200 });
});

const { default: NoInvitePage } = await import("../src/app/(app)/no-invite/page");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  calls.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const open = async () => {
  await act(async () => {
    root.render(<NoInvitePage />);
  });
  await act(async () => {});
};
const buttons = () => [...host.querySelectorAll("button")].map((button) => button.textContent);

describe("the gate's refusal", () => {
  it("says a disabled account is disabled, offers no waitlist, and gives the address to write to", async () => {
    attempt = { email: "jo@hey.com", reason: "disabled" };
    await open();
    expect(host.querySelector("h1")!.textContent).toBe("Your account is disabled");
    expect(host.textContent).toContain("jo@hey.com");
    expect(host.textContent).not.toContain("not on the list");
    expect(host.textContent).not.toContain("invite");
    expect(buttons()).toEqual(["Use a different account"]);
    expect(host.querySelector('a[href="mailto:hello@offload.club"]')!.textContent).toBe("hello@offload.club");
  });

  it("is unchanged for an address with no invite", async () => {
    attempt = { email: "jo@hey.com", reason: null };
    await open();
    expect(host.querySelector("h1")!.textContent).toBe("You are not on the list yet");
    // 039 added the review code's line under the two buttons.
    expect(buttons()).toEqual(["Join the waitlist with this email", "Use a different account", "Have a code?"]);
  });
});
