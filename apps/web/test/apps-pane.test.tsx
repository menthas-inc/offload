// @vitest-environment happy-dom
//
// 031 Connected apps on the web (T3.10): one Connected section of cards.
//
// The Calendar card in its four states, connected, needing sign-in again, not
// connected, and not available, which draws nothing; the Mail card always,
// and Unavailable for an Apple hidden email; Ask before adding and Copy
// working from the cards; Not built yet and What offload may do gone (AC-12).
// The per-account list at `/settings/apps/calendar`, and Disconnect on the
// card itself, one per account (AC-13, as tweaked 2026-10-04).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings/apps" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const calendar = (id: string, selected: boolean) => ({
  id,
  name: `Calendar ${id}`,
  colour: null,
  writable: true,
  sharedWithYou: false,
  primary: id === "c1",
  selected,
});

const connection = (id: string, email: string, picks: boolean[], extra: Record<string, unknown> = {}) => ({
  id,
  email,
  state: "active",
  connectedAt: "2026-09-14T10:00:00Z",
  needsScope: false,
  calendars: picks.map((on, i) => calendar(`${id}-${i}`, on)),
  ...extra,
});

let calendars: { available: boolean; askFirst: boolean; connections: unknown[] };
let mailAvailable = true;
const sent: { path: string; method: string; body: unknown }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  const method = init?.method ?? "GET";
  sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === "/api/connectors/calendars") return json(calendars);
  if (path === "/api/me" && method === "PATCH") return json({});
  if (path.endsWith("/disconnect") && method === "POST") return json({});
  if (path === "/api/me")
    return json({
      accountId: "a1",
      state: "active",
      displayName: "Jo",
      email: mailAvailable ? "jo@hey.com" : "x7q2k9@privaterelay.appleid.com",
      initials: "JO",
      needsFirstRun: false,
      needsName: false,
      mailAvailable,
    });
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { AppsPane, AppsCalendarPane } = await import("../src/components/panes/Apps");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { connectUrl } = await import("../src/lib/use-calendars");

beforeEach(() => {
  sent.length = 0;
  mailAvailable = true;
  calendars = { available: true, askFirst: false, connections: [connection("k1", "jo@hey.com", [true, true, true, true, false, false, false])] };
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <ToastProvider>
        {node}
        <ToastHost />
      </ToastProvider>,
    ),
  );
  await settle();
  return host;
}

const link = (host: HTMLElement, text: string) => [...host.querySelectorAll("a")].find((a) => a.textContent?.includes(text));

describe("the Connected apps cards (AC-12)", () => {
  it("connected: the account, Connected, the calendars count and Ask before adding; Mail beside it", async () => {
    const host = await render(<AppsPane />);
    expect([...host.querySelectorAll("section h2")].map((h) => h.textContent)).toEqual(["Connected"]);
    const text = host.textContent ?? "";
    expect(text).toContain("Calendar and Mail");
    expect(text).toMatch(/Google Calendarjo@hey\.com, connected 14 Sept?Connected/);
    expect(link(host, "Calendars offload can use")?.getAttribute("href")).toBe("/settings/apps/calendar");
    expect(link(host, "Calendars offload can use")?.textContent).toContain("4 of 7");
    expect(text).toContain("Off means offload adds it without asking, unless somebody else would see it.");
    expect(text).not.toContain("Not built yet");
    expect(text).not.toContain("What offload may do");

    const ask = host.querySelector<HTMLInputElement>('input[role="switch"]')!;
    await act(async () => ask.click());
    await settle();
    expect(sent.find((c) => c.method === "PATCH")?.body).toEqual({ calendarAskFirst: true });
  });

  it("several accounts are counted, and the calendars summed across them", async () => {
    calendars.connections = [
      connection("k1", "jo@hey.com", [true, true, false]),
      connection("k2", "jo@work.com", [true, true, false, false]),
    ];
    const host = await render(<AppsPane />);
    expect(host.textContent).toContain("2 Google accounts");
    expect(link(host, "Calendars offload can use")?.textContent).toContain("4 of 7");
  });

  it("Disconnect is on the card: it asks once, then disconnects that account", async () => {
    const host = await render(<AppsPane />);
    const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    expect(host.textContent).toContain("Notes offload made from your days stay.");
    await act(async () => button("Disconnect Google Calendar")!.click());
    expect(host.textContent).toContain("Disconnect Google Calendar?");
    expect(sent.some((c) => c.path.endsWith("/disconnect"))).toBe(false);

    calendars.connections = [];
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Disconnect")!.click());
    await settle();
    expect(sent.find((c) => c.path === "/api/connectors/k1/disconnect")?.method).toBe("POST");
    expect(link(host, "Connect")?.getAttribute("href")).toBe(connectUrl("settings"));
  });

  it("several accounts each get their own Disconnect, named by address", async () => {
    calendars.connections = [connection("k1", "jo@hey.com", [true]), connection("k2", "jo@work.com", [true])];
    const host = await render(<AppsPane />);
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent ?? "").filter((t) => t.startsWith("Disconnect"));
    expect(labels.map((t) => t.split("Notes")[0])).toEqual(["Disconnect jo@hey.com", "Disconnect jo@work.com"]);
  });

  it("a connection needing sign-in swaps the pill for Sign in again", async () => {
    calendars.connections = [connection("k1", "jo@hey.com", [true], { state: "needs_reauth" })];
    let host = await render(<AppsPane />);
    expect(link(host, "Sign in again")?.getAttribute("href")).toBe(connectUrl("settings"));
    expect(host.textContent).not.toMatch(/connected 14 Sept?Connected/);

    document.body.innerHTML = "";
    calendars.connections = [connection("k1", "jo@hey.com", [true], { needsScope: true })];
    host = await render(<AppsPane />);
    expect(link(host, "Sign in again")).toBeTruthy();
  });

  it("not connected: the head alone, with Connect", async () => {
    calendars.connections = [];
    const host = await render(<AppsPane />);
    const text = host.textContent ?? "";
    expect(text).toContain("See your week in offload, and let it add to your calendar.");
    expect(link(host, "Connect")?.getAttribute("href")).toBe(connectUrl("settings"));
    expect(text).not.toContain("Calendars offload can use");
    expect(text).not.toContain("Ask before adding");
    expect(text).toContain("Mail");
  });

  it("not available: no Calendar card, Mail still there", async () => {
    calendars = { available: false, askFirst: false, connections: [] };
    const host = await render(<AppsPane />);
    expect(host.textContent).not.toContain("Google Calendar");
    expect(host.textContent).toContain("Forward an email and it's filed like anything you dump");
  });

  it("Mail: the address with Copy, which says Copied, and Add to contacts", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const host = await render(<AppsPane />);
    const text = host.textContent ?? "";
    expect(text).toContain("Ready");
    expect(text).toContain("over@to.offload.club");
    expect(text).toContain("Only mail from jo@hey.com is accepted. Forward by hand.");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Copy the address"]')!.click());
    expect(writeText).toHaveBeenCalledWith("over@to.offload.club");
    expect(host.textContent).toContain("Copied");
    const card = link(host, "Add to contacts")!;
    expect(card.getAttribute("href")).toBe("/offload.vcf");
    expect(card.hasAttribute("download")).toBe(true);
  });

  it("Mail for an Apple hidden email: the relay note and Unavailable, nothing to copy", async () => {
    mailAvailable = false;
    const host = await render(<AppsPane />);
    const text = host.textContent ?? "";
    expect(text).toContain("You signed in with an address Apple keeps private, so mail you forward can't be matched to you.");
    expect(text).toContain("Unavailable");
    expect(text).not.toContain("over@to.offload.club");
    expect(host.querySelector('[aria-label="Copy the address"]')).toBeNull();
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("the calendar page (AC-13)", () => {
  it("lists each account's calendars and Ask before adding, and leaves Disconnect to the card", async () => {
    const host = await render(<AppsCalendarPane />);
    const text = host.textContent ?? "";
    expect(text).toContain("4 of 7 in use");
    expect(text).toContain("Calendar k1-0");
    expect(text).not.toContain("Disconnect");
    expect(text).toContain("Ask before adding");
  });

  it("with nothing connected, is the connect screen", async () => {
    calendars.connections = [];
    const host = await render(<AppsCalendarPane />);
    expect(link(host, "Connect Google Calendar")?.getAttribute("href")).toBe(connectUrl("settings"));
  });
});
