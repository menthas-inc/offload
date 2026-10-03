// @vitest-environment happy-dom
//
// 035 part B. Your copy, on the web's Privacy pane (AC-15).
//
// Every state the row has, what pressing does in each, the download as a
// plain link the session cookie authorises, and polling only while a copy is
// being made.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type State = { state: string; readyAt: string | null; expiresAt: string | null; nextAt: string | null };
const none = { readyAt: null, expiresAt: null, nextAt: null };
let current: State = { state: "idle", ...none };
let afterAsk: State | { status: number } = { state: "making", ...none };
const calls: { method: string; url: string }[] = [];
const failed: string[] = [];
let signedOut = 0;
let readStatus = 200;

beforeEach(() => {
  vi.useFakeTimers();
  current = { state: "idle", ...none };
  afterAsk = { state: "making", ...none };
  calls.length = 0;
  failed.length = 0;
  signedOut = 0;
  readStatus = 200;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: String(url).replace(/^https?:\/\/[^/]+/, "") });
    if (method === "POST") {
      if ("status" in afterAsk) return new Response(null, { status: afterAsk.status });
      current = afterAsk;
      return new Response(JSON.stringify(current), { status: 202 });
    }
    if (method === "DELETE") {
      current = { state: "waiting", readyAt: null, expiresAt: null, nextAt: "2026-10-10T09:00:00Z" };
      return new Response(null, { status: 204 });
    }
    if (readStatus !== 200) return new Response(null, { status: readStatus });
    return new Response(JSON.stringify(current), { status: 200 });
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { YourCopy } = await import("../src/components/panes/YourCopy");

async function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<YourCopy zone="UTC" onFailed={(line) => failed.push(line)} onSignedOut={() => (signedOut += 1)} />));
  await act(async () => {});
  return host;
}

const button = (host: Element, name: string) =>
  [...host.querySelectorAll("button")].find((one) => one.textContent?.includes(name)) as HTMLButtonElement | undefined;

describe("Your copy", () => {
  it("is a headed section with its glyph and the two limits", async () => {
    const host = await render();
    expect(host.querySelector("h2")?.textContent).toBe("Your copy");
    expect(host.textContent).toContain("Kept for 7 days. One every 7 days.");
    expect(host.textContent).toContain("Export everything");
    expect(host.textContent).toContain("One file, readable without offload.");
  });

  it("starts a copy on Export, says it is being made, and polls until it is ready", async () => {
    const host = await render();
    await act(async () => button(host, "Export")!.click());
    expect(calls.some((call) => call.method === "POST" && call.url === "/api/me/export")).toBe(true);
    expect(host.textContent).toContain("Making your copy");
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(button(host, "Export")).toBeUndefined();

    const before = calls.length;
    current = { state: "ready", readyAt: "2026-10-03T10:00:00Z", expiresAt: "2026-10-10T09:00:00Z", nextAt: null };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls.length).toBe(before + 1);
    expect(host.textContent).toContain("Ready, 3 Oct");
    expect(host.textContent).toContain("Kept until 10 Oct");

    // Ready is not polled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(calls.length).toBe(before + 1);
  });

  it("downloads through a plain link to the file, and deletes the copy on Delete copy", async () => {
    current = { state: "ready", readyAt: "2026-10-03T10:00:00Z", expiresAt: "2026-10-10T09:00:00Z", nextAt: null };
    const host = await render();
    const link = host.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/\/api\/me\/export\/file$/);
    expect(link.textContent).toContain("Download");
    // Another origin: a new tab, so a copy that has gone never takes the app's
    // tab to the API, and the link is named by what it does.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("aria-label")).toBe("Download your copy");
    await act(async () => button(host, "Delete copy")!.click());
    expect(calls.some((call) => call.method === "DELETE" && call.url === "/api/me/export")).toBe(true);
    expect(host.textContent).toContain("Next copy from 10 Oct");
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("says a build failed beside Try again, which asks again", async () => {
    current = { state: "failed", ...none };
    const host = await render();
    expect(host.textContent).toContain("Couldn't make your copy");
    await act(async () => button(host, "Try again")!.click());
    expect(host.textContent).toContain("Making your copy");
  });

  it("says a press that did not go through, with nothing about why, and leaves the row to press again", async () => {
    afterAsk = { status: 500 };
    const host = await render();
    await act(async () => button(host, "Export")!.click());
    expect(failed).toEqual(["Couldn't start your copy"]);
    expect(button(host, "Export")).toBeDefined();
  });

  it("stays pressable when the first read did not arrive, so the press can say so", async () => {
    readStatus = 500;
    afterAsk = { status: 500 };
    const host = await render();
    expect(button(host, "Export")!.disabled).toBe(false);
    await act(async () => button(host, "Export")!.click());
    expect(failed).toEqual(["Couldn't start your copy"]);
  });

  it("goes to sign in when the session ended under the page, with no retry", async () => {
    const host = await render();
    afterAsk = { status: 401 };
    await act(async () => button(host, "Export")!.click());
    expect(signedOut).toBe(1);
    expect(failed).toEqual([]);
  });

  it("shows the spinner in the row while a copy is being made, named for a screen reader by its words", async () => {
    current = { state: "making", ...none };
    const host = await render();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Making your copy");
    expect(host.querySelector('[aria-hidden="true"][class*="settingsSpinner"]')).not.toBeNull();
  });

  it("reads the row again when the page is come back to, so a copy that has gone stops saying Ready", async () => {
    current = { state: "ready", readyAt: "2026-10-03T10:00:00Z", expiresAt: "2026-10-10T09:00:00Z", nextAt: null };
    const host = await render();
    current = { state: "idle", ...none };
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {});
    expect(host.textContent).toContain("Export everything");
  });

  it("reads the row again when the server says it is too soon", async () => {
    afterAsk = { status: 409 };
    const host = await render();
    current = { state: "waiting", readyAt: null, expiresAt: null, nextAt: "2026-10-10T09:00:00Z" };
    await act(async () => button(host, "Export")!.click());
    expect(host.textContent).toContain("Next copy from 10 Oct");
  });
});

describe("where it lives", () => {
  const read = (path: string) => readFileSync(`${process.cwd()}/src/${path}`, "utf8");

  it("is on the Privacy pane, under Reaching the web", () => {
    const pane = read("components/panes/Privacy.tsx");
    expect(pane.indexOf("<YourCopy")).toBeGreaterThan(pane.indexOf("Reaching the web"));
  });

  it("is offered from the delete confirmation", () => {
    const dialog = read("components/panes/DeleteAccount.tsx");
    expect(dialog).toContain("Make a copy first");
    expect(dialog).toContain('href="/settings/privacy"');
  });
});
