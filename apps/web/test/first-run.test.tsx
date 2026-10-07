// @vitest-environment happy-dom
//
// 033 First run, three screens, on the web: the intro, Before you start and
// Bring it all in, and the decisions between them.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/welcome" }));

type Me = Record<string, unknown>;
const FIRST_RUN: Me = {
  accountId: "a1",
  state: "invited",
  displayName: null,
  suggestedName: "Jo Martins",
  email: "jo@hey.com",
  initials: "JM",
  needsFirstRun: true,
  needsName: true,
  mailAvailable: true,
};
const ACTIVE: Me = { ...FIRST_RUN, state: "active", displayName: "Jo Martins", needsFirstRun: false, needsName: false };

let me: Me = FIRST_RUN;
let calendars: Record<string, unknown> = { available: true, askFirst: false, connections: [] };
let onboarding = 200;
const calls: { path: string; method: string; body: unknown }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === "/api/me") return json(me);
  if (path === "/api/connectors/calendars") return json(calendars);
  if (path === "/api/onboarding/complete") return json({ ok: onboarding === 200 }, onboarding);
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let reduced = false;
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("reduce") ? reduced : false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

const writeText = vi.fn(() => Promise.resolve());
Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });

const { afterYou, autoAdvance, bringCards, firstStep, introNext } = await import("../src/lib/first-run");
const { default: WelcomePage } = await import("../src/app/(app)/welcome/page");
const { default: BringPage } = await import("../src/app/(app)/welcome/bring/page");
const { default: TutorialPage } = await import("../src/app/(app)/tutorial/page");
const { FAILED } = await import("../src/components/firstrun/copy");

beforeEach(() => {
  me = FIRST_RUN;
  calendars = { available: true, askFirst: false, connections: [] };
  onboarding = 200;
  reduced = false;
  calls.length = 0;
  router.replace.mockClear();
  writeText.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      else await new Promise((r) => setTimeout(r, 0));
    });
  }
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
const link = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent?.trim() === text);
const heading = (host: HTMLElement) => host.querySelector("h1")?.textContent;
const checkboxes = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

async function click(element: HTMLElement | undefined | null) {
  expect(element).toBeTruthy();
  await act(async () => element!.click());
  await settle();
}

describe("033 the decisions, as the phones make them", () => {
  it("matches the phones' cases", () => {
    expect(firstStep({ replay: false, nameOnly: true })).toBe("you");
    expect(firstStep({ replay: false, nameOnly: false })).toBe("intro");
    expect(bringCards({ mailAvailable: true, calendarOffer: true, notifications: "unsupported" })).toEqual(["mail", "calendar"]);
    expect(afterYou([])).toBe("today");
    expect([0, 1, 2].map(introNext)).toEqual([1, 2, 0]);
    expect(autoAdvance({ reduceMotion: true, screenReader: false })).toBe(false);
  });
});

describe("033 the intro (AC-2, AC-3, AC-4)", () => {
  it("plays three scenes on its own and leaves from any of them with Continue", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = await render(<WelcomePage />);
    expect(heading(host)).toBe("offload keeps track for you");
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain("offload remembers it");
    expect(button(host, "Next")).toBeUndefined();
    expect(button(host, "Skip")).toBeUndefined();

    await act(async () => vi.advanceTimersByTime(9600));
    expect(heading(host)).toBe("Everything lands in threads");
    await act(async () => vi.advanceTimersByTime(9600));
    expect(heading(host)).toBe("Send it any way");
    await act(async () => vi.advanceTimersByTime(9600));
    expect(heading(host)).toBe("offload keeps track for you");

    await act(async () => button(host, "Continue")!.click());
    expect(heading(host)).toBe("Before you start");
  });

  it("moves on when the art is pressed, and restarts the scene's clock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = await render(<WelcomePage />);
    await act(async () => vi.advanceTimersByTime(9000));
    const art = host.querySelector<HTMLButtonElement>('button[aria-label="Next scene"]');
    await act(async () => art!.click());
    expect(heading(host)).toBe("Everything lands in threads");
    await act(async () => vi.advanceTimersByTime(9000));
    expect(heading(host)).toBe("Everything lands in threads");
    // The drawing is a picture; the words are the copy.
    expect(art!.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("stands still with reduced motion, until asked", async () => {
    reduced = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = await render(<WelcomePage />);
    await act(async () => vi.advanceTimersByTime(30000));
    expect(heading(host)).toBe("offload keeps track for you");
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Next scene"]')!.click());
    expect(heading(host)).toBe("Everything lands in threads");
  });

  it("pauses while the pointer is over it or focus is inside it (owner, 2026-10-03)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const host = await render(<WelcomePage />);
    const intro = host.querySelector<HTMLElement>("[data-intro]")!;
    await act(async () => vi.advanceTimersByTime(4000));
    await act(async () => intro.dispatchEvent(new Event("pointerenter", { bubbles: false })));
    await act(async () => vi.advanceTimersByTime(20000));
    expect(heading(host)).toBe("offload keeps track for you");
    await act(async () => intro.dispatchEvent(new Event("pointerleave", { bubbles: false })));
    // Resumes where it stopped, not from the start of the scene.
    await act(async () => vi.advanceTimersByTime(5700));
    expect(heading(host)).toBe("Everything lands in threads");
  });

  it("draws each scene's end state without motion (AC-19)", async () => {
    reduced = true;
    const host = await render(<WelcomePage />);
    const art = () => host.querySelector('button[aria-label="Next scene"]')!.textContent ?? "";
    expect(art()).toContain("Lisbon trip4");
    expect(art()).toContain("Bookshelf build3");
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Next scene"]'));
    expect(art()).toContain("Shared with Ana and Tom");
    expect(art()).toContain("added Pastéis de Belém");
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Next scene"]'));
    expect(art()).toContain("All four filed in Lisbon trip");
  });
});

describe("033 Before you start (AC-5, AC-6)", () => {
  async function atYou() {
    const host = await render(<WelcomePage />);
    await click(button(host, "Continue"));
    return host;
  }

  it("asks the name and both consents on one screen, with one button", async () => {
    const host = await atYou();
    expect(heading(host)).toBe("Before you start");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Your name"]')!.value).toBe("Jo Martins");
    expect(checkboxes(host)).toHaveLength(2);
    expect(button(host, "Continue")!.disabled).toBe(true);
    await click(checkboxes(host)[0]);
    expect(button(host, "Continue")!.disabled).toBe(true);
    await click(checkboxes(host)[1]);
    expect(button(host, "Continue")!.disabled).toBe(false);
    expect(host.textContent).not.toContain("so it is worth knowing what that means");
  });

  // Apple 5.1.2(i): explicit permission before anything goes to another
  // company's AI, and the terms accepted with a tick rather than by use.
  it("links the terms and the privacy policy, and names AI services from other companies", async () => {
    const host = await atYou();
    const [first, second] = [...host.querySelectorAll("label")].filter((label) => label.querySelector('input[type="checkbox"]'));
    expect(first!.textContent).toBe("I agree to the terms and have read the privacy policy.");
    expect([...first!.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/terms", "/privacy"]);
    expect(second!.textContent).toBe(
      "I understand offload will hold whatever I dump in, which can include health, money and other private matters, and I agree to it being processed to run offload, including by AI services from other companies.",
    );
  });

  it("writes once with the name and the zone, then opens Bring it all in", async () => {
    const host = await atYou();
    await click(checkboxes(host)[0]);
    await click(checkboxes(host)[1]);
    await click(button(host, "Continue"));
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe("/api/onboarding/complete");
    expect(writes[0]!.body).toMatchObject({ readPolicy: true, agreeToProcessing: true, displayName: "Jo Martins" });
    expect(router.replace.mock.calls).toEqual([["/welcome/bring"]]);
  });

  it("goes straight to Today when nothing on Bring it all in applies", async () => {
    me = { ...FIRST_RUN, mailAvailable: false };
    calendars = { available: false, askFirst: false, connections: [] };
    const host = await atYou();
    await click(checkboxes(host)[0]);
    await click(checkboxes(host)[1]);
    await click(button(host, "Continue"));
    expect(router.replace.mock.calls).toEqual([["/today"]]);
  });

  it("stays put with the failure line when the write is refused", async () => {
    onboarding = 500;
    const host = await atYou();
    await click(checkboxes(host)[0]);
    await click(checkboxes(host)[1]);
    await click(button(host, "Continue"));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(FAILED);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("is the name alone for an account that finished first run before names (AC-15)", async () => {
    me = { ...ACTIVE, displayName: null, needsName: true };
    const host = await render(<WelcomePage />);
    expect(heading(host)).toBe("What should we call you?");
    expect(checkboxes(host)).toHaveLength(0);
  });
});

describe("033 Bring it all in (AC-7, AC-8, AC-9, AC-12)", () => {
  it("draws Mail and Calendar for an account that can have both, and no notifications on the web", async () => {
    me = ACTIVE;
    const host = await render(<BringPage />);
    expect(heading(host)).toBe("Bring it all in");
    expect(host.textContent).toContain("Send anything to over@to.offload.club from jo@hey.com and it is filed.");
    expect(link(host, "Connect Google Calendar")!.getAttribute("href")).toContain("landing=first-run-bring");
    expect(host.textContent).not.toContain("Hear about what is due");
    expect(link(host, "Add to contacts")!.getAttribute("href")).toBe("/offload.vcf");
  });

  it("copies the address", async () => {
    me = ACTIVE;
    const host = await render(<BringPage />);
    await click(button(host, "Copy address"));
    expect(writeText).toHaveBeenCalledWith("over@to.offload.club");
    expect(host.textContent).toContain("Copied");
  });

  it("says Connected from the calendars it reads, not from the URL", async () => {
    me = ACTIVE;
    calendars = { available: true, askFirst: false, connections: [{ id: "c1", email: "jo@gmail.com", state: "active", needsScope: false, connectedAt: "2026-10-03T10:00:00Z", calendars: [] }] };
    const host = await render(<BringPage />);
    expect(link(host, "Connect Google Calendar")).toBeUndefined();
    expect(host.textContent).toContain("Connected");
  });

  it("waits for the calendars before drawing, so a card never pops in under the first", async () => {
    me = ACTIVE;
    let answer!: (r: Response) => void;
    const held = new Promise<Response>((resolve) => (answer = resolve));
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      new URL(url).pathname === "/api/connectors/calendars" ? held : real(url, init),
    );
    const host = await render(<BringPage />);
    expect(host.textContent).not.toContain("Forward emails to offload");
    await act(async () => answer(json(calendars)));
    await settle();
    expect(host.textContent).toContain("Forward emails to offload");
    expect(host.textContent).toContain("Bring in your calendar");
    vi.stubGlobal("fetch", real);
  });

  it("goes to Today when nothing on it applies", async () => {
    me = { ...ACTIVE, mailAvailable: false };
    calendars = { available: false, askFirst: false, connections: [] };
    await render(<BringPage />);
    expect(router.replace.mock.calls).toEqual([["/today"]]);
  });

  it("leaves for Today from Skip for now and from Done, with nothing required", async () => {
    me = ACTIVE;
    let host = await render(<BringPage />);
    await click(button(host, "Skip for now"));
    document.body.innerHTML = "";
    host = await render(<BringPage />);
    await click(button(host, "Done"));
    expect(router.replace.mock.calls).toEqual([["/today"], ["/today"]]);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});
