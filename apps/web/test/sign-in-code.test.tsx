// @vitest-environment happy-dom
//
// 039, as the owner changed it: a review code is typed on the sign-in screen,
// before Apple or Google, and rides through that one sign-in. Optional and
// quiet: a line under the caption until it is wanted, and not drawn at all
// once the switch is off. A code that did not work comes back on the refusal
// screen as one clause, with the way back to try another.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const social = vi.fn(async (_body: unknown) => ({ error: null }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ signIn: { social } }) }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));

let options: unknown = { codes: true };
let attempt: unknown = { email: null, reason: null };
vi.stubGlobal("fetch", async (url: string) => {
  const path = new URL(url).pathname;
  if (path === "/api/sign-in/options") return new Response(JSON.stringify(options), { status: 200 });
  return new Response(JSON.stringify(attempt), { status: 200 });
});

const { default: SignInPage } = await import("../src/app/(app)/sign-in/page");
const { default: NoInvitePage } = await import("../src/app/(app)/no-invite/page");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  social.mockClear();
  options = { codes: true };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const open = async (page: React.ReactElement) => {
  await act(async () => {
    root.render(page);
  });
  await act(async () => {});
};
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
const click = async (label: string) => {
  await act(async () => {
    button(label)!.click();
  });
  await act(async () => {});
};
const type = async (value: string) => {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Code"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("a review code on the sign-in screen", () => {
  it("is a quiet line until wanted, then a field above the two providers", async () => {
    await open(<SignInPage />);
    expect(button("Have a code?")).toBeTruthy();
    expect(host.querySelector('input[aria-label="Code"]')).toBeNull();
    await click("Have a code?");
    const input = host.querySelector('input[aria-label="Code"]')!;
    const first = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Continue with"))!;
    expect(input.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button("Have a code?")).toBeUndefined();
  });

  it("rides with the sign-in, whichever provider is picked", async () => {
    await open(<SignInPage />);
    await click("Have a code?");
    await type("abcd-efgh-jkmn");
    await click("Continue with Apple");
    expect(social).toHaveBeenCalledWith(expect.objectContaining({ provider: "apple", additionalData: { reviewCode: "abcd-efgh-jkmn" } }));
  });

  it("sends nothing extra without a code", async () => {
    await open(<SignInPage />);
    await click("Continue with Google");
    expect(social.mock.calls[0]![0]).not.toHaveProperty("additionalData");
  });

  it("is not drawn once the switch is off", async () => {
    options = { codes: false };
    await open(<SignInPage />);
    expect(button("Have a code?")).toBeUndefined();
  });
});

describe("a code that did not work, on the refusal screen", () => {
  it("says so in one clause, beside the way back to try another", async () => {
    attempt = { email: "reviewer@example.com", reason: "code" };
    await open(<NoInvitePage />);
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("That code did not work.");
    expect(button("Have a code?")).toBeUndefined();
    await click("Try another code");
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
