// @vitest-environment happy-dom
//
// 052 T4.3. A reply's calendar: the built MonthGrid, still, showing only the
// period the turn is about, read lazily and once, with the day's entries at
// full width beneath and their details opening in place (AC-3 to AC-6, AC-26).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayTitle, eventRange, periodLabel } from "@offload/widgets";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const LONG = "Parent evening with Ms Ibekwe about the spring term report X";

const event = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: "offload",
  title,
  startsAt: "2026-11-20T15:00:00.000Z",
  endsAt: "2026-11-20T16:00:00.000Z",
  allDay: false,
  mine: true,
  calendarName: null,
  link: null,
  threadId: "th3",
  threadName: "Health",
  threadIcon: "heart-pulse",
  threadHue: 3,
  authorName: null,
  location: null,
  place: null,
  calendar: null,
  ...extra,
});
const task = (id: string, title: string) => ({
  id,
  type: "task",
  title,
  doneAt: null,
  dueAt: "2026-11-23T00:00:00.000Z",
  occursAt: null,
  occursEndAt: null,
  allDay: true,
  rrule: null,
  threadId: "th4",
  threadName: "Flat admin",
  threadIcon: "house",
  threadHue: 1,
  calendar: null,
});
const day = (date: string, events: unknown[], rest: unknown[] = []) => ({
  date,
  events,
  eventCount: events.length,
  late: [],
  lateMore: 0,
  timed: [],
  rest,
  restMore: 0,
  timedMore: 0,
  everDumped: true,
  threadLabels: [],
});
const days: Record<string, object> = {
  "2026-11-20": day("2026-11-20", [
    event("c1", "Dentist", { place: { lat: 51.5, lng: -0.12, approximate: false }, calendar: { name: "Personal", colour: "rgb(121, 134, 203)" } }),
    event("c2", LONG, { startsAt: "2026-11-20T18:00:00.000Z", endsAt: null }),
  ]),
  "2026-11-21": day("2026-11-21", [event("c3", "Swim", { startsAt: "2026-11-21T09:00:00.000Z", endsAt: null })]),
  "2026-11-23": day("2026-11-23", [], [task("c4", "Pay rent")]),
};

let offline = false;
let busy = false;
const asked: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  asked.push(String(url));
  if (offline) throw new TypeError("offline");
  const at = new URL(String(url));
  if (at.pathname === "/v1/today/month")
    return new Response(
      JSON.stringify({
        days: busy
          ? Array.from({ length: 10 }, (_, n) => ({ date: `2026-12-${String(n + 1).padStart(2, "0")}`, task: 1, event: 0, calendar: 0 }))
          : [
              { date: "2026-11-20", task: 0, event: 2, calendar: 0 },
              { date: "2026-11-21", task: 0, event: 1, calendar: 0 },
              { date: "2026-11-23", task: 1, event: 0, calendar: 0 },
            ],
      }),
      { status: 200 },
    );
  if (at.pathname === "/v1/today/day") return new Response(JSON.stringify(days[at.searchParams.get("date")!] ?? day(at.searchParams.get("date")!, [])), { status: 200 });
  return new Response("{}", { status: 404 });
});

/** On screen at once, unless a test says the slice has not been seen yet. */
let seen: (() => void)[] = [];
let visible = true;
class FakeObserver {
  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    const fire = () => this.callback([{ isIntersecting: true }]);
    if (visible) fire();
    else seen.push(fire);
  }
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeObserver);

const { CalendarSlice } = await import("../src/components/shell/CalendarSlice");
const { MonthGrid } = await import("../src/components/panes/MonthGrid");
const { forgetReplyReads } = await import("../src/lib/today");
const { twoWeekFor } = await import("@offload/widgets");

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  asked.length = 0;
  offline = false;
  visible = true;
  seen = [];
  forgetReplyReads();
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const twoWeeks: { kind: "calendar"; period: { from: string; to: string }; day: string; marked: string[]; span: boolean; previous?: Record<string, { occursAt?: string | null; dueAt?: string | null }> } = { kind: "calendar" as const, period: { from: "2026-11-16", to: "2026-11-29" }, day: "2026-11-20", marked: ["c1"], span: false };
async function draw(slice: typeof twoWeeks, live = false) {
  await act(async () => root.render(<CalendarSlice slice={slice} live={live} />));
  await settle();
  await settle();
}
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const entry = (title: string) => [...host.querySelectorAll("button[aria-expanded]")].find((one) => one.textContent?.includes(title)) as HTMLButtonElement;

describe("MonthGrid, still", () => {
  it("says when a moved entry was, while the Undo holds it (AC-9)", async () => {
    await draw({ ...twoWeeks, previous: { c1: { occursAt: "2026-11-23T10:00:00Z" } } });
    expect(entry("Dentist").textContent).toMatch(/was Monday 23 November, \d{1,2}:\d\d/);
  });

  it("has no arrows and no Today", async () => {
    const grid = twoWeekFor("2026-11-16", [], "2026-11-17");
    await act(async () => root.render(<MonthGrid grid={grid} selected="2026-11-20" went={1} onPick={() => undefined} still unit="week" />));
    expect(host.querySelector('[aria-label="Previous week"]')).toBeNull();
    expect(host.querySelector('[aria-label="Next week"]')).toBeNull();
    expect([...host.querySelectorAll("button")].some((one) => one.textContent === "Today")).toBe(false);
  });
});

describe("a reply's calendar", () => {
  it("draws this week and the next with the turn's day picked and today outlined", async () => {
    await draw(twoWeeks);
    expect(host.querySelectorAll("[data-day]")).toHaveLength(14);
    const on = host.querySelector("[data-on]")!;
    expect(on.getAttribute("data-day")).toBe("2026-11-20");
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("[data-today]")!.getAttribute("data-day")).toBe("2026-11-17");
    // A day with something on it is lifted, and the dots are the day's.
    expect(host.querySelector('[data-day="2026-11-23"]')!.hasAttribute("data-has")).toBe(true);
    expect(host.querySelectorAll('[data-day="2026-11-20"] [data-dot]')).toHaveLength(2);
    expect([...host.querySelectorAll("button")].some((one) => one.textContent === "Today")).toBe(false);
  });

  it("draws a month further off with how far away it is beside its name", async () => {
    await draw({ ...twoWeeks, period: { from: "2027-05-01", to: "2027-05-31" }, day: "2027-05-09" });
    expect(host.textContent).toContain(periodLabel("2027-05-09", "2026-11-17")!);
    expect(host.querySelector("[data-on]")!.getAttribute("data-day")).toBe("2027-05-09");
  });

  it("lists the day's entries under the grid at full width, an event leading with its time", async () => {
    await draw(twoWeeks);
    expect(host.textContent).toContain(dayTitle("2026-11-20"));
    const long = entry(LONG);
    expect(LONG).toHaveLength(60);
    // Whole: never cut, never an ellipsis.
    expect(long.querySelector("[data-title]")!.textContent).toBe(LONG);
    expect(entry("Dentist").textContent).toContain(eventRange({ startsAt: "2026-11-20T15:00:00.000Z", endsAt: null, allDay: false }, zone()));
  });

  it("marks the turn's own entries when the result arrived here", async () => {
    await draw(twoWeeks, true);
    expect([...host.querySelectorAll("[data-marked]")].map((one) => one.textContent)).toEqual([expect.stringContaining("Dentist")]);
  });

  it("opens an entry's details in place and folds them again, several at once", async () => {
    await draw(twoWeeks);
    const dentist = entry("Dentist");
    expect(dentist.getAttribute("aria-expanded")).toBe("false");
    await act(async () => dentist.click());
    expect(dentist.getAttribute("aria-expanded")).toBe("true");
    const details = document.getElementById(dentist.getAttribute("aria-controls")!)!;
    expect(details.textContent).toContain(`${dayTitle("2026-11-20")}, ${eventRange({ startsAt: "2026-11-20T15:00:00.000Z", endsAt: "2026-11-20T16:00:00.000Z", allDay: false }, zone())}`);
    expect(details.querySelector("a[target=_blank]")!.textContent).toBe("Directions");
    expect(details.textContent).toContain("Health");
    expect(details.textContent).toContain("Personal");
    expect(details.querySelector("[data-calendar-dot]")).not.toBeNull();

    await act(async () => entry(LONG).click());
    expect(entry(LONG).getAttribute("aria-expanded")).toBe("true");
    expect(dentist.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(entry(LONG).getAttribute("aria-controls")!)!.textContent).toMatch(/not on a calendar/i);

    await act(async () => dentist.click());
    expect(dentist.getAttribute("aria-expanded")).toBe("false");
  });

  it("swaps the list when another day is tapped, a to-do leading with its tick", async () => {
    await draw(twoWeeks);
    await act(async () => (host.querySelector('[data-day="2026-11-23"]') as HTMLButtonElement).click());
    await settle();
    expect(host.querySelector("[data-on]")!.getAttribute("data-day")).toBe("2026-11-23");
    expect(host.textContent).toContain("Pay rent");
    expect(host.textContent).not.toContain("Dentist");
    expect(host.querySelector('[role="checkbox"][aria-label="Pay rent, Flat admin"]')).not.toBeNull();
  });

  it("lists every day of a span with something on it, under the day", async () => {
    await draw({ ...twoWeeks, period: { from: "2026-11-16", to: "2026-11-22" }, day: "2026-11-16", marked: [], span: true });
    const headings = [...host.querySelectorAll("[data-day-heading]")].map((one) => one.textContent);
    expect(headings).toEqual([dayTitle("2026-11-20"), dayTitle("2026-11-21")]);
    expect(host.textContent).toContain("Swim");
    // Only the span's own week is drawn, as on the phones.
    expect(host.querySelectorAll("[data-day]")).toHaveLength(7);
    // Nothing is picked until a day is tapped: the list is every day.
    expect(host.querySelector("[data-on]")).toBeNull();
  });

  it("lists the first seven days of a span with something on them, as the phones do", async () => {
    busy = true;
    await draw({ ...twoWeeks, period: { from: "2026-12-01", to: "2026-12-31" }, day: "2026-12-01", marked: [], span: true });
    busy = false;
    expect(host.querySelectorAll("[data-day-heading]")).toHaveLength(7);
    expect(asked.filter((one) => one.includes("/v1/today/day"))).toHaveLength(7);
  });

  it("reads again when something is filed, so what a pill or a tick just changed shows", async () => {
    const { ThreadsProvider } = await import("../src/components/shell/threads-context");
    const base = { groups: [], invitations: [], loose: null, order: { sort: "newest" as const, ids: [] }, viewerId: null, ready: true, reload: () => {}, changed: null, turnOut: false };
    const slice = { ...twoWeeks, period: { from: "2026-11-02", to: "2026-11-15" }, day: "2026-11-04" };
    const at = (filed: { threadIds: string[]; at: number } | null) =>
      act(async () =>
        root.render(
          <ThreadsProvider value={{ ...base, filed }}>
            <CalendarSlice slice={slice} live={false} />
          </ThreadsProvider>,
        ),
      );
    await at(null);
    await settle();
    const months = () => asked.filter((one) => one.includes("/v1/today/month") && one.includes("2026-11-02")).length;
    expect(months()).toBe(1);
    await at({ threadIds: [], at: 5 });
    await settle();
    expect(months()).toBe(2);
  });

  it("reads nothing until it is on screen, and each period once", async () => {
    visible = false;
    await draw(twoWeeks);
    expect(asked.filter((url) => url.includes("/v1/today/"))).toEqual([]);
    await act(async () => seen.forEach((fire) => fire()));
    await settle();
    expect(asked.filter((url) => url.includes("/v1/today/month"))).toHaveLength(1);
    // A reply's grid may show days gone by, which Today's never asks for.
    expect(asked.find((url) => url.includes("/v1/today/month"))).toContain("past=1");
    act(() => root.unmount());
    root = createRoot(host);
    visible = true;
    await draw(twoWeeks);
    expect(asked.filter((url) => url.includes("/v1/today/month"))).toHaveLength(1);
  });

  it("draws nothing when its period cannot be read, so the undo line's summary stands alone", async () => {
    offline = true;
    await draw(twoWeeks);
    expect(host.textContent).toBe("");
  });
});
