// @vitest-environment happy-dom
//
// 031 See the tutorial again (T3.11, AC-15), and 033 AC-14: `/tutorial`
// replays first run's intro for an account that finished first run long ago.
// It is not sent away to Today, its one button is Done and goes back to Help,
// and nothing is written: no onboarding, no name, no offer.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/tutorial" }));

const calls: { path: string; method: string }[] = [];
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  calls.push({ path, method: init?.method ?? "GET" });
  if (path === "/api/me")
    return json({
      accountId: "a1",
      state: "active",
      displayName: "Jo",
      email: "jo@hey.com",
      initials: "JO",
      needsFirstRun: false,
      needsName: false,
      mailAvailable: true,
    });
  if (path === "/api/connectors/calendars") return json({ available: true, askFirst: false, connections: [] });
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { default: TutorialPage } = await import("../src/app/(app)/tutorial/page");

beforeEach(() => {
  calls.length = 0;
  router.replace.mockClear();
  router.push.mockClear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(host).render(<TutorialPage />));
  await settle();
  return host;
}

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

describe("the tutorial, again (031 AC-15, 033 AC-14)", () => {
  it("shows the intro alone, with Done back to Help and no write", async () => {
    const host = await render();
    expect(host.querySelector("h1")?.textContent).toBe("offload keeps track for you");
    expect(button(host, "Next")).toBeUndefined();
    expect(button(host, "Skip")).toBeUndefined();
    expect(button(host, "Continue")).toBeUndefined();

    await act(async () => button(host, "Done")!.click());
    await settle();
    expect(router.replace.mock.calls).toEqual([["/settings/help"]]);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    expect(host.textContent).not.toContain("What should we call you?");
    expect(host.textContent).not.toContain("Before you start");
  });
});
