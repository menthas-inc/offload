// @vitest-environment happy-dom
//
// 039. A store reviewer, refused like any stranger, types a review code on
// the no-invite screen. Offered only when the screen knows the address it
// checked, since that address is what the code lets in. Three answers: in,
// refused beside the field, and sign in again beside a Sign in button.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));

let attempt: unknown;
let answer: unknown;
const posted: Array<{ path: string; body: unknown; credentials: string | undefined }> = [];
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  if (path === "/api/sign-in/code") {
    posted.push({ path, body: JSON.parse(String(init?.body)), credentials: init?.credentials });
    return new Response(JSON.stringify(answer), { status: 200 });
  }
  return new Response(JSON.stringify(attempt), { status: 200 });
});

const { default: NoInvitePage } = await import("../src/app/(app)/no-invite/page");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  posted.length = 0;
  replace.mockClear();
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
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);
const click = async (label: string) => {
  await act(async () => {
    button(label)!.click();
  });
  await act(async () => {});
};
const type = async (value: string) => {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Code"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submit = async () => {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
};

describe("a review code on the no-invite screen", () => {
  it("is offered under the kit's two buttons when the screen knows the address", async () => {
    attempt = { email: "reviewer@privaterelay.appleid.com", reason: null };
    await open();
    expect(button("Have a code?")).toBeTruthy();
    expect(host.querySelector('input[aria-label="Code"]')).toBeNull();
    await click("Have a code?");
    expect(host.querySelector('input[aria-label="Code"]')).toBeTruthy();
    expect(button("Use code")).toBeTruthy();
  });

  it("is not offered without an address, or to a disabled account", async () => {
    attempt = { email: null, reason: null };
    await open();
    expect(button("Have a code?")).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(host);
    attempt = { email: "jo@hey.com", reason: "disabled" };
    await open();
    expect(button("Have a code?")).toBeUndefined();
  });

  it("sends the code with the refusal's cookie, and says they are in", async () => {
    attempt = { email: "reviewer@example.com", reason: null };
    answer = { status: "in" };
    await open();
    await click("Have a code?");
    await type("abcd-efgh-jkmn");
    await submit();
    expect(posted).toEqual([{ path: "/api/sign-in/code", body: { code: "abcd-efgh-jkmn" }, credentials: "include" }]);
    expect(host.querySelector("h1")!.textContent).toBe("You are in");
    expect(host.textContent).toContain("Sign in once more with the same account.");
    await click("Sign in");
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("says a code did not work in one clause, beside the field to try again", async () => {
    attempt = { email: "reviewer@example.com", reason: null };
    answer = { status: "refused" };
    await open();
    await click("Have a code?");
    await type("nope");
    await submit();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("That code did not work.");
    expect(host.querySelector('input[aria-label="Code"]')).toBeTruthy();
    expect(button("Use code")).toBeTruthy();
    expect(host.querySelector("h1")!.textContent).toBe("You are not on the list yet");
  });

  it("asks for a sign-in when the refusal has run out, with the control that does it", async () => {
    attempt = { email: "reviewer@example.com", reason: null };
    answer = { status: "sign-in" };
    await open();
    await click("Have a code?");
    await type("ABCD-EFGH-JKMN");
    await submit();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Sign in again to use a code.");
    await click("Sign in");
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
