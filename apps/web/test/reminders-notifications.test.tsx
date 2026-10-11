// @vitest-environment happy-dom
//
// 042, AC-22. The Reminders section of the web's Notifications page: between
// Dates and People, a switch with its line, How many as three choice tiles
// whose caption follows the pick and which grey with the switch, the two
// hours greyed only when both switches that use them are off, and the Dates
// caption reworded. Drawn first and written second, with the page's failure
// line.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_LINE, DATES_CAPTION, REMINDER_COUNTS, REMINDERS_LINE } from "@offload/widgets";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { NotificationsPane } = await import("../src/components/panes/Notifications");
const { refreshMe, forgetMe } = await import("../src/lib/use-me");

const ME = {
  accountId: "a1",
  state: "active",
  displayName: "Sam",
  email: "sam@example.com",
  initials: "SA",
  needsFirstRun: false,
  needsName: false,
  needsConsent: false,
  webSearch: true,
  webLinks: true,
  country: null,
  timeZone: "Europe/Lisbon",
  followDevice: true,
  keptTimeZone: null,
  notifyDueToday: true,
  notifyDueTodayAt: "08:00",
  notifyComingTomorrow: true,
  notifyComingTomorrowAt: "19:00",
  notifyPeopleRequests: true,
  notifySharedActivity: true,
  notifyReminders: true,
  notifyReminderCount: 2,
  activityNew: false,
  mailAvailable: true,
  signInProviders: ["google"],
  atDailyLimit: false,
  suggestedName: null,
  requestsWaiting: 0,
};

type Reply = { ok: boolean; body?: unknown };
let patches: Record<string, unknown>[] = [];
let nextPatch: Reply | null = null;
let current: Record<string, unknown> = { ...ME };

beforeEach(() => {
  patches = [];
  nextPatch = null;
  current = { ...ME };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
        patches.push(patch);
        const reply = nextPatch ?? { ok: true };
        nextPatch = null;
        if (!reply.ok) return new Response("{}", { status: 500 });
        current = { ...current, ...patch };
        return new Response(JSON.stringify(current), { status: 200 });
      }
      return new Response(JSON.stringify(current), { status: 200 });
    }),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  forgetMe();
  vi.unstubAllGlobals();
});

async function render(me: Record<string, unknown> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  current = { ...ME, ...me };
  await refreshMe();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<NotificationsPane />));
  return host;
}

const headings = (host: HTMLElement) => [...host.querySelectorAll("h2")].map((h) => h.textContent);
const section = (host: HTMLElement, name: string) =>
  [...host.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === name)!;
const switchIn = (row: Element) => row.querySelector<HTMLInputElement>('input[role="switch"]')!;
const rowTitled = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll("label, div")].find(
    (el) => el.firstElementChild?.firstElementChild?.textContent === title,
  )!;
const tiles = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="How many"] [role="radio"]'),
];
const hourInput = (host: HTMLElement, title: string) =>
  host.querySelector<HTMLInputElement>(`input[type="time"][aria-label="${title}"]`)!;

describe("the Reminders section (042, AC-22)", () => {
  it("sits between Dates and People, a switch with its line", async () => {
    const host = await render();
    expect(headings(host)).toEqual(["Dates", "Reminders", "Calendar", "People", "On your phones"]);
    const reminders = section(host, "Reminders");
    expect(reminders.textContent).toContain(REMINDERS_LINE);
    const row = rowTitled(host, "Reminders");
    expect(switchIn(row).checked).toBe(true);
  });

  it("draws How many as three tiles named Low, Medium and High, the caption following the pick", async () => {
    const host = await render();
    expect(tiles(host).map((t) => t.textContent)).toEqual(["Low", "Medium", "High"]);
    expect(tiles(host).map((t) => t.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    const reminders = section(host, "Reminders");
    expect(reminders.textContent).toContain(REMINDER_COUNTS[1].caption);
    // Each preview draws one, two or three marks before the date.
    expect(tiles(host).map((t) => t.querySelectorAll("[data-mark]").length)).toEqual([1, 2, 3]);
    expect(tiles(host).every((t) => t.querySelector("[data-date]"))).toBe(true);
  });

  it("picks Medium, the shared default, when the account has not said", async () => {
    const host = await render({ notifyReminderCount: undefined });
    expect(tiles(host).map((t) => t.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(section(host, "Reminders").textContent).toContain(REMINDER_COUNTS[1].caption);
  });

  it("draws a pick first and writes it second", async () => {
    const host = await render();
    await act(async () => tiles(host)[2]!.click());
    expect(patches).toEqual([{ notifyReminderCount: 3 }]);
    expect(tiles(host).map((t) => t.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    expect(section(host, "Reminders").textContent).toContain(REMINDER_COUNTS[2].caption);
  });

  it("puts a pick back with the page's failure line when the write fails", async () => {
    const host = await render();
    nextPatch = { ok: false };
    await act(async () => tiles(host)[0]!.click());
    expect(tiles(host).map((t) => t.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save that.");
  });

  it("writes the switch, and greys the tiles and makes them inert with it off", async () => {
    const host = await render();
    await act(async () => switchIn(rowTitled(host, "Reminders")).click());
    expect(patches).toEqual([{ notifyReminders: false }]);
    expect(tiles(host).every((t) => t.disabled)).toBe(true);
  });

  it("greys the morning hour only when Due today and Reminders are both off, the evening likewise", async () => {
    let host = await render({ notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: true });
    expect(hourInput(host, "In the morning at").disabled).toBe(false);
    expect(hourInput(host, "In the evening at").disabled).toBe(false);
    document.body.innerHTML = "";

    host = await render({ notifyDueToday: false, notifyComingTomorrow: true, notifyReminders: false });
    expect(hourInput(host, "In the morning at").disabled).toBe(true);
    expect(hourInput(host, "In the evening at").disabled).toBe(false);
  });

  it("captions Dates without saying everything comes once a day", async () => {
    const host = await render();
    expect(section(host, "Dates").textContent).toContain(DATES_CAPTION);
  });

  it("counts Reminders in the head's summary", async () => {
    const host = await render({ notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: true });
    expect(host.querySelector("p")?.textContent).toBe("Reminders");
  });
});

describe("the Calendar section (2026-10-10)", () => {
  it("sits between Reminders and People, one switch with its line, on until changed", async () => {
    const host = await render({ notifyCalendar: true });
    expect(headings(host)).toEqual(["Dates", "Reminders", "Calendar", "People", "On your phones"]);
    expect(section(host, "Calendar").textContent).toContain(CALENDAR_LINE);
    expect(switchIn(rowTitled(host, "Today's events")).checked).toBe(true);
  });

  it("writes the switch", async () => {
    const host = await render({ notifyCalendar: true });
    await act(async () => switchIn(rowTitled(host, "Today's events")).click());
    expect(patches).toEqual([{ notifyCalendar: false }]);
  });

  it("keeps the morning hour in use on its own, never the evening", async () => {
    const host = await render({ notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: false, notifyCalendar: true });
    expect(hourInput(host, "In the morning at").disabled).toBe(false);
    expect(hourInput(host, "In the evening at").disabled).toBe(true);
  });
});
