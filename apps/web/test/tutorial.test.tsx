// @vitest-environment happy-dom
//
// 031 See the tutorial again (T3.11, AC-15): `/tutorial` replays first run's
// three screens for an account that finished first run long ago. It is not
// sent away to Today, Skip and the last screen's Done both go back to Help,
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

describe("the tutorial, again (AC-15)", () => {
  it("shows the three screens, ends on Done, and goes back to Help without a write", async () => {
    const host = await render();
    expect(host.querySelector("h1")?.textContent).toBe("Dump anything");
    await act(async () => button(host, "Next")!.click());
    expect(host.querySelector("h1")?.textContent).toBe("offload sorts it");
    await act(async () => button(host, "Next")!.click());
    expect(host.querySelector("h1")?.textContent).toBe("It only interrupts when it matters");
    expect(button(host, "Next")).toBeUndefined();

    await act(async () => button(host, "Done")!.click());
    await settle();
    expect(router.replace.mock.calls).toEqual([["/settings/help"]]);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    expect(host.textContent).not.toContain("What should we call you?");
  });

  it("Skip goes back to Help too", async () => {
    const host = await render();
    await act(async () => button(host, "Skip")!.click());
    expect(router.replace.mock.calls).toEqual([["/settings/help"]]);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});
