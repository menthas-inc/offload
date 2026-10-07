// @vitest-environment happy-dom
//
// Asking again when the privacy policy or the terms move (S20), and first
// run's failure line, which says what happened and nothing about why (S6).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/welcome" }));

type Me = Record<string, unknown>;
const AGAIN: Me = {
  accountId: "a1",
  state: "active",
  displayName: "Jo Martins",
  suggestedName: "Jo Martins",
  email: "jo@hey.com",
  initials: "JM",
  needsFirstRun: false,
  needsName: false,
  needsConsent: true,
  mailAvailable: true,
};

let me: Me = AGAIN;
let consent = 200;
/** What /api/consent answers with: by default the account, agreed. */
let consented: () => Me = () => ({ ...me, needsConsent: false });
const calls: { path: string; method: string; body: unknown }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === "/api/me" && (init?.method ?? "GET") === "GET") return json(me);
  if (path === "/api/me") return json({ ...me, needsName: false });
  if (path === "/api/connectors/calendars") return json({ available: true, askFirst: false, connections: [] });
  if (path === "/api/consent") return json(consented(), consent);
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

const { stillAsking, useMe } = await import("../src/lib/use-me");
const { BEFORE, FAILED, RECONSENT, WAY_OUT } = await import("../src/components/firstrun/copy");
const { BeforeYouStart } = await import("../src/components/firstrun/BeforeYouStart");
const { default: WelcomePage } = await import("../src/app/(app)/welcome/page");

beforeEach(() => {
  me = AGAIN;
  consent = 200;
  consented = () => ({ ...me, needsConsent: false });
  calls.length = 0;
  router.replace.mockClear();
  window.history.replaceState(null, "", "/welcome");
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(host).render(node));
  await settle();
  return host;
}

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
const checkboxes = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

async function click(element: HTMLElement | undefined | null) {
  expect(element).toBeTruthy();
  await act(async () => element!.click());
  await settle();
}

const read = (path: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), path), "utf8");

/** A constant's string value as the phones' gate.ts declares it. */
function phones(name: string): string {
  const source = read("../../mobile/lib/gate.ts");
  const match = new RegExp(`\\b${name}: "([^"]*)"`).exec(source);
  expect(match, name).not.toBeNull();
  return match![1]!;
}

describe("S6 first run's failure line", () => {
  it("says what happened, in the phones' words, and diagnoses nothing", async () => {
    const host = await render(
      <BeforeYouStart
        nameOnly={false}
        name="Jo"
        onName={() => undefined}
        readPolicy
        agreeToProcessing
        onReadPolicy={() => undefined}
        onAgreeToProcessing={() => undefined}
        working={false}
        failed
        onContinue={() => undefined}
      />,
    );
    const line = host.querySelector('[role="alert"]')?.textContent;
    expect(line).toBe(FAILED);
    expect(line).not.toMatch(/connection/i);
    expect(FAILED).toBe(phones("failed"));
  });
});

describe("S20 asking again when the policy or the terms change", () => {
  it("holds the shell for it", () => {
    expect(stillAsking(AGAIN as never)).toBe(true);
    expect(stillAsking({ ...AGAIN, needsConsent: false } as never)).toBe(false);
  });

  it("shows the two ticks alone, with a line linking both pages, and never the intro", async () => {
    const host = await render(<WelcomePage />);
    expect(router.replace).not.toHaveBeenCalled();
    expect(host.querySelector("h1")?.textContent).toBe(BEFORE.again);
    expect(host.querySelector("h2")?.textContent).toBe(BEFORE.agree);
    expect(host.querySelector('input[type="text"]')).toBeNull();
    expect(checkboxes(host)).toHaveLength(2);

    const notice = host.querySelector("[data-reconsent]");
    expect(notice?.textContent).toBe(`${RECONSENT.before}${RECONSENT.terms}${RECONSENT.middle}${RECONSENT.policy}${RECONSENT.after}`);
    const hrefs = [...notice!.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/terms", "/privacy"]);
    expect(notice!.textContent).not.toMatch(new RegExp("[\\u2013\\u2014]"));

    expect(button(host, "Continue")!.disabled).toBe(true);
  });

  it("posts both ticks to /api/consent and goes on to Today", async () => {
    const host = await render(<WelcomePage />);
    for (const box of checkboxes(host)) await click(box);
    expect(button(host, "Continue")!.disabled).toBe(false);
    await click(button(host, "Continue"));

    const posted = calls.filter((c) => c.method === "POST");
    expect(posted).toEqual([{ path: "/api/consent", method: "POST", body: { readPolicy: true, agreeToProcessing: true } }]);
    expect(router.replace).toHaveBeenCalledWith("/today");
  });

  it("stays and says so when the write is refused", async () => {
    consent = 500;
    const host = await render(<WelcomePage />);
    for (const box of checkboxes(host)) await click(box);
    await click(button(host, "Continue"));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(FAILED);
    expect(router.replace).not.toHaveBeenCalledWith("/today");
  });

  it("asks for a name first when there is none either", async () => {
    me = { ...AGAIN, displayName: null, needsName: true };
    const host = await render(<WelcomePage />);
    expect(host.querySelector('input[type="text"]')).not.toBeNull();
    expect(host.querySelector("[data-reconsent]")).not.toBeNull();
    for (const box of checkboxes(host)) await click(box);
    await click(button(host, "Continue"));
    const posted = calls.filter((c) => c.method !== "GET").map((c) => c.path);
    expect(posted).toEqual(["/api/me", "/api/consent"]);
    expect(router.replace).toHaveBeenCalledWith("/today");
  });

  it("is never titled Before you start, and the name takes focus and Enter as it does alone", async () => {
    me = { ...AGAIN, displayName: null, needsName: true };
    const host = await render(<WelcomePage />);
    expect(host.querySelector("h1")?.textContent).toBe(BEFORE.again);
    expect(host.querySelector("h1")?.textContent).not.toBe(BEFORE.title);
    const field = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(document.activeElement).toBe(field);
    for (const box of checkboxes(host)) await click(box);
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(calls.filter((c) => c.method !== "GET").map((c) => c.path)).toEqual(["/api/me", "/api/consent"]);
  });

  it("stays and says so when the write answers but the account still needs consent", async () => {
    consented = () => ({ ...me, needsConsent: true });
    const host = await render(<WelcomePage />);
    for (const box of checkboxes(host)) await click(box);
    await click(button(host, "Continue"));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/api/consent"]);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(FAILED);
    expect(router.replace).not.toHaveBeenCalledWith("/today");
  });

  it("offers a way out, to take a copy or delete the account, and only when asked again", async () => {
    const host = await render(<WelcomePage />);
    const out = [...host.querySelectorAll("a")].find((a) => a.textContent === WAY_OUT);
    expect(out?.getAttribute("href")).toBe("/settings/account");
    expect(WAY_OUT).not.toMatch(new RegExp("[\\u2013\\u2014]"));

    document.body.innerHTML = "";
    const first = await render(
      <BeforeYouStart
        nameOnly={false}
        name="Jo"
        onName={() => undefined}
        readPolicy={false}
        agreeToProcessing={false}
        onReadPolicy={() => undefined}
        onAgreeToProcessing={() => undefined}
        working={false}
        failed={false}
        onContinue={() => undefined}
      />,
    );
    expect(first.textContent).not.toContain(WAY_OUT);
  });

  it("lets that way out through the shell without agreeing, and bounces everything else", async () => {
    let seen = "";
    function Probe() {
      seen = useMe("shell").status;
      return null;
    }
    async function at(path: string) {
      window.history.replaceState(null, "", path);
      router.replace.mockClear();
      document.body.innerHTML = "";
      await render(<Probe />);
    }

    await at("/settings/account");
    expect(router.replace).not.toHaveBeenCalled();
    expect(seen).toBe("ready");

    await at("/settings/privacy");
    expect(router.replace).not.toHaveBeenCalled();
    expect(seen).toBe("ready");

    await at("/today");
    expect(router.replace).toHaveBeenCalledWith("/welcome");

    // Somewhere else from the way out, with the shell already mounted.
    window.history.replaceState(null, "", "/settings/account");
    router.replace.mockClear();
    document.body.innerHTML = "";
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));
    await settle();
    expect(router.replace).not.toHaveBeenCalled();
    window.history.pushState(null, "", "/settings/notifications");
    await act(async () => root.render(<Probe />));
    await settle();
    expect(router.replace).toHaveBeenCalledWith("/welcome");
    act(() => root.unmount());

    // Never for an account still in first run.
    me = { ...AGAIN, needsFirstRun: true, state: "invited" };
    await at("/settings/account");
    expect(router.replace).toHaveBeenCalledWith("/welcome");
  });

  it("keeps the phones' words", () => {
    const pick = (source: string) =>
      /export const RECONSENT = (\{[\s\S]*?\}) as const;/.exec(source)?.[1]?.replace(/\/\/.*$/gm, "").replace(/\s+/g, " ");
    const web = read("../src/components/firstrun/copy.ts");
    const phone = read("../../mobile/lib/gate.ts");
    expect(pick(web)).toBeTruthy();
    expect(pick(phone)).toBe(pick(web));
    const wayOut = (source: string) => /export const WAY_OUT = "([^"]*)";/.exec(source)?.[1];
    expect(wayOut(phone)).toBe(WAY_OUT);
    expect(phones("again")).toBe(BEFORE.again);
  });
});
