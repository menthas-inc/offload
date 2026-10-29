// @vitest-environment happy-dom
//
// 027 Today on the web: T3.14 to T3.16.
//
// The page in the layout's order with Customize Today in the pane head and
// today's date in the crumb bar (AC-1); Needs you, card by card (AC-4 to
// AC-13), with the zone card saying "This browser says" and no notifications
// card (AC-6, AC-7); the stepper and its doors (AC-14, AC-15); the next line
// and the events strip (AC-16, AC-17, AC-19); To do and the picks (AC-20 to
// AC-23); the empty and failed days (AC-24, AC-25); Customize Today as the
// second pane (AC-27).
//
// Tuesday 29 September 2026, 10:30 in Lisbon. Only `Date` is faked, so the
// page's own timers run as they do in a browser.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
  usePathname: () => "/today",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
let browserZone = "Europe/Lisbon";
vi.mock("../src/lib/clock", async (actual) => ({
  ...(await actual<typeof import("../src/lib/clock")>()),
  deviceZone: () => browserZone,
}));

// ------------------------------------------------------------------ the server

interface Call {
  method: string;
  path: string;
  body: unknown;
}
let calls: Call[] = [];
type Handler = (call: Call) => Response | Promise<Response>;
let overrides: Record<string, Handler> = {};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const DEFAULT_LAYOUT = {
  version: 1,
  sections: [
    {
      kind: "needs_you",
      parts: [
        { kind: "account", on: true },
        { kind: "people", on: true },
        { kind: "questions", on: true },
        { kind: "tips", on: true },
      ],
    },
    { kind: "day", on: true },
    { kind: "open_threads", on: true },
  ],
};

let me: Record<string, unknown>;
const baseMe = () => ({
  accountId: "a1",
  state: "active",
  displayName: "Jo",
  email: "jo@hey.com",
  initials: "JO",
  needsFirstRun: false,
  needsName: false,
  timeZone: "Europe/Lisbon",
  followDevice: true,
  keptTimeZone: null,
  mailAvailable: true,
  requestsWaiting: 0,
  activityNew: false,
  todayLayout: { ...DEFAULT_LAYOUT, sections: DEFAULT_LAYOUT.sections.slice(0, 2) },
  todayLayoutV2: DEFAULT_LAYOUT,
});

let needs: unknown[] = [];
let days: Record<string, unknown> = {};

// Open in your threads (design 2026-10-07).
const openPage = (threadId: string, name: string | null, titles: string[], extra: Record<string, unknown> = {}) => ({
  threadId,
  name,
  icon: name === null ? null : "luggage",
  hue: name === null ? null : 2,
  people: [],
  todos: titles.slice(0, 4).map((title, n) => row(`${threadId}-${n}`, title, { threadId, threadName: name })),
  count: titles.length,
  loose: null,
  ...extra,
});
const fullOpen = () => {
  const pages = [
    openPage("t2", "Europe, October", ["Book the Sintra train", "Viva Viagem cards", "Orsay tickets", "Adapters", "Hotel in Paris"], {
      people: [
        { accountId: "p1", displayName: "Ana Duarte", initials: "AD" },
        { accountId: "p2", displayName: "Tom Reis", initials: "TR" },
      ],
    }),
    openPage("t1", "Flat", ["Fix the bathroom tap"]),
    openPage("t3", "Bookshelf build", ["Order the oak brackets", "Buy wall plugs"]),
    openPage("t0", null, ["Renew passport", "Call the landlord"], { loose: { inMind: 1, holds: { note: 4, link: 2 } } }),
  ];
  return { pages, count: pages.reduce((sum, page) => sum + page.count, 0) };
};
let openRead: ReturnType<typeof fullOpen>;

// 042. Today's Reminders section.
const LAYOUT_V3 = {
  version: 1,
  sections: [DEFAULT_LAYOUT.sections[0], DEFAULT_LAYOUT.sections[1], { kind: "reminders", on: true }, DEFAULT_LAYOUT.sections[2]],
};
const thread = { threadId: "t2", threadName: "Europe, October", threadIcon: "luggage", threadHue: 2 };
const fullReminders = () => ({
  // An anchored task, reminded by the day before what it is for; its week out
  // has begun and its on-the-day comes on the 2nd.
  rows: [{ ...row("c20", "Pack the adapters", thread), remindDay: "2026-10-02", remindBy: true, window: "short", next: "2026-10-02" }],
  others: [
    // Two things on the day share one card: a note with a time, and a memory.
    { of: "note", id: "n1", name: "Lisbon flat from the 1st", day: "2026-09-29", by: false, time: "21:40", window: "day", next: null, ...thread },
    { of: "memory", id: "m2", name: "Sam's birthday", day: "2026-09-29", by: false, time: null, window: "day", next: null, threadId: null, threadName: null, threadIcon: null, threadHue: null },
    // A month out that has begun; its week out comes on the 9th.
    { of: "memory", id: "m1", name: "Ana's birthday", day: "2026-10-14", by: false, time: null, window: "long", next: "2026-10-09", threadId: null, threadName: null, threadIcon: null, threadHue: null },
  ],
  more: 0,
});
let remindersRead: ReturnType<typeof fullReminders> | { rows: unknown[]; others: unknown[]; more: number };

const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "task",
  title,
  body: null,
  url: null,
  imageUrl: null,
  photo: null,
  createdAt: "2026-09-01T10:00:00Z",
  archivedAt: null,
  doneAt: null,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  priority: 0,
  priorityPinned: false,
  labels: [],
  place: null,
  location: null,
  placeId: null,
  seriesRef: null,
  allDay: false,
  author: { accountId: "a1", displayName: "Jo", isYou: true },
  canDelete: true,
  canMove: true,
  filingAt: null,
  threadId: "t1",
  threadName: "Flat",
  ...extra,
});

const lateDay = (n: number) => `2026-09-${String(29 - n).padStart(2, "0")}T12:00:00.000Z`;

const event = (id: string, title: string, extra: Record<string, unknown>) => ({
  id,
  source: "calendar",
  title,
  startsAt: null,
  endsAt: null,
  allDay: false,
  mine: true,
  calendarName: null,
  link: null,
  threadId: null,
  threadName: null,
  authorName: null,
  ...extra,
});

const emptyDay = (date: string) => ({
  date,
  events: [],
  eventCount: 0,
  late: [],
  lateMore: 0,
  timed: [],
  rest: [],
  restMore: 0,
  picks: [],
  everDumped: true,
  threadLabels: [],
});

const fullToday = () => ({
  ...emptyDay("2026-09-29"),
  events: [
    event("e0", "Holiday", { allDay: true, calendarName: "Google, Personal" }),
    event("e1", "Standup", {
      startsAt: "2026-09-29T08:00:00Z",
      endsAt: "2026-09-29T08:30:00Z",
      calendarName: "Google, Work",
      link: "https://www.google.com/calendar/event?eid=abc",
    }),
    event("e2", "Call with Ana", { startsAt: "2026-09-29T11:00:00Z", endsAt: "2026-09-29T11:30:00Z", calendarName: "Google, Personal" }),
    event("e3", "Viewing, Rua da Rosa flat", {
      source: "offload",
      startsAt: "2026-09-29T13:00:00Z",
      endsAt: "2026-09-29T14:00:00Z",
      threadId: "t1",
      threadName: "Flat",
    }),
    event("e4", "Dinner, Sam", {
      source: "offload",
      mine: false,
      startsAt: "2026-09-29T18:30:00Z",
      endsAt: "2026-09-29T21:00:00Z",
      threadId: "t2",
      threadName: "Europe, October",
      authorName: "Ana Duarte",
    }),
    event("e5", "Somewhere else", {
      startsAt: "2026-09-29T19:00:00Z",
      endsAt: "2026-09-29T20:00:00Z",
      calendarName: "Google, Work",
      link: "https://evil.example/calendar",
    }),
  ],
  eventCount: 6,
  late: [1, 2, 3, 4, 5].map((n) => row(`l${n}`, `Late number ${n}`, { dueAt: lateDay(n), allDay: true })),
  timed: [row("c6", "Call the letting agent", { dueAt: "2026-09-29T10:00:00.000Z" })],
  rest: [row("c7", "Buy Viva Viagem cards", { dueAt: "2026-09-29T12:00:00.000Z", allDay: true, labels: ["lb1"], threadId: "t2", threadName: "Europe, October" })],
  picks: [row("c9", "Return the drill to Tom")],
  threadLabels: [{ id: "lb1", name: "Lisbon", colour: 1 }],
});

const card = {
  calendar: { key: "calendar:k1", kind: "calendar", since: "2026-09-28T08:00:00Z", connectionId: "k1", email: null },
  request: (id: string, name: string, since = "2026-09-27T08:00:00Z") => ({
    key: `request:${id}`,
    kind: "request",
    since,
    requestId: id,
    person: { accountId: `p-${id}`, displayName: name, initials: "AD" },
  }),
  invitation: {
    key: "invitation:m1",
    kind: "invitation",
    since: "2026-09-29T08:00:00Z",
    memberId: "m1",
    threadName: "Europe, October",
    from: { accountId: "p1", displayName: "Ana Duarte", initials: "AD" },
    preview: { count: 14, titles: ["Book the Sintra train"] },
  },
  question: (fromEmail = false) => ({
    key: "question:q1",
    kind: "question",
    since: "2026-09-29T08:00:00Z",
    question: {
      id: "q1",
      field: "date",
      text: 'Filed "Sintra train". By when?',
      options: [
        { label: "Saturday", kind: "value" },
        { label: "Sunday", kind: "value" },
        { label: "Not that", kind: "plain" },
      ],
      ordinal: 1,
    },
    threadId: "t2",
    threadName: "Europe, October",
    fromEmail,
  }),
  tip: { key: "tip:forwarding", kind: "tip", tip: "forwarding", address: "over@to.offload.club", from: "jo@hey.com" },
};

function serve(call: Call): Response | Promise<Response> {
  const pathname = call.path.split("?")[0]!;
  const override = overrides[`${call.method} ${pathname}`];
  if (override) return override(call);
  if (pathname === "/api/me" && call.method === "GET") return json(me);
  if (pathname === "/api/me" && call.method === "PATCH") {
    const body = call.body as { todayLayout?: unknown };
    me = { ...me, ...body, ...(body.todayLayout ? { todayLayoutV2: body.todayLayout } : {}) };
    return json(me);
  }
  if (pathname === "/v1/today/threads") return json(openRead);
  if (pathname === "/v1/today/reminders") return json(remindersRead);
  if (pathname === "/v1/today/reminders/dismiss" || pathname === "/v1/today/reminders/undismiss") return json({ ok: true });
  if (pathname === "/v1/today/needs") return json({ cards: needs });
  if (pathname === "/v1/today/month") return json({ days: [] });
  if (pathname === "/v1/today/day") {
    const date = new URLSearchParams(call.path.split("?")[1]).get("date")!;
    return json(days[date] ?? emptyDay(date));
  }
  if (pathname === "/v1/questions/q1/answer") return json({ messageId: "m9", conversationId: "v1", state: "answered", turnId: "turn1", threads: [] });
  if (pathname === "/v1/invitations/m1/accept") return json({ threadId: "t2" });
  if (pathname === "/v1/threads") return json({ groups: [], invitations: [] });
  return json({ ok: true });
}

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const parsed = new URL(url);
  const call = { method: init?.method ?? "GET", path: parsed.pathname + parsed.search, body: init?.body ? JSON.parse(String(init.body)) : undefined };
  calls.push(call);
  return serve(call);
});

const { refreshMe } = await import("../src/lib/use-me");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { default: TodayRoute } = await import("../src/app/(shell)/today/page");
const { TODAY_RESET } = await import("../src/lib/today");
const { RESUME_COMPOSER } = await import("../src/lib/dump");
const { undoStore } = await import("../src/lib/undo");

// ------------------------------------------------------------------ the page

let root: Root;
let host: HTMLElement;
const settle = async (times = 3) => {
  for (let i = 0; i < times; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T09:30:00Z"));
  calls = [];
  overrides = {};
  needs = [];
  days = { "2026-09-29": fullToday() };
  openRead = fullOpen();
  remindersRead = fullReminders();
  me = baseMe();
  browserZone = "Europe/Lisbon";
  search = new URLSearchParams();
  router.push.mockClear();
  router.replace.mockClear();
  await refreshMe();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

async function open(query = "") {
  search = new URLSearchParams(query);
  await act(async () =>
    root.render(
      <ToastProvider>
        <TodayRoute />
        <ToastHost />
      </ToastProvider>,
    ),
  );
  await settle();
}

const text = () => host.textContent ?? "";
const button = (name: string, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((one) => (one.getAttribute("aria-label") ?? one.textContent?.trim()) === name) as
    | HTMLButtonElement
    | undefined;
const link = (name: string) =>
  [...host.querySelectorAll("a")].find((one) => (one.getAttribute("aria-label") ?? one.textContent?.trim()) === name) as HTMLAnchorElement | undefined;
const writes = (method: string, path: string) => calls.filter((one) => one.method === method && one.path === path);
const dayReads = () => calls.filter((one) => one.path.startsWith("/v1/today/day")).map((one) => one.path.split("date=")[1]);
const needsYou = () => host.querySelector('[aria-label="Needs you"]');
const heading = () => host.querySelector("h1")?.textContent;
const dayCell = (iso: string) => (host.querySelector(`[data-day="${iso}"]`) as HTMLButtonElement | null) ?? undefined;
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const press = async (control: HTMLElement | undefined) => {
  expect(control).toBeDefined();
  await act(async () => control!.click());
  await settle();
};
const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

// ------------------------------------------------------------------ the page

describe("027 AC-1 the page", () => {
  it("draws Needs you, then the day, in the layout's order", async () => {
    needs = [card.request("r1", "Ana Duarte")];
    await open();
    const stack = needsYou()!;
    const stepper = button("Previous week")!;
    expect(stack).not.toBeNull();
    expect(before(stack, stepper)).toBe(true);
    act(() => root.unmount());

    me = { ...baseMe(), todayLayoutV2: { version: 1, sections: [DEFAULT_LAYOUT.sections[1], DEFAULT_LAYOUT.sections[0], DEFAULT_LAYOUT.sections[2]] } };
    await refreshMe();
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    expect(before(button("Previous week")!, needsYou()!)).toBe(true);
  });

  it("names the day once, in the month's head, with no page title and no name under the grid (the owner, 2026-10-18)", async () => {
    await open();
    // On today the head is the month and Today beside it; the head is the page's one h1.
    expect([...host.querySelectorAll("h1")].map((one) => one.textContent)).toEqual(["September 2026"]);
    expect(button("Today")).toBeDefined();
    await press(dayCell("2026-10-02"));
    expect([...host.querySelectorAll("h1")].map((one) => one.textContent)).toEqual(["Friday 2 October"]);
    expect(text()).not.toContain("Next Friday");
  });

  it("puts Customize Today at the pane head's right and today's date in the crumb bar, whatever day is shown", async () => {
    await open();
    expect(link("Customize Today")!.getAttribute("href")).toBe("/today?customize=1");
    expect(text()).toContain("Tuesday 29 September");
    await press(dayCell("2026-09-30"));
    expect(heading()).toBe("Wednesday 30 September");
    expect(text()).toContain("Tuesday 29 September");
  });

  it("moves the crumb bar's date on with the day at midnight", async () => {
    // The pane moved to the new day and the crumb bar went on naming the old
    // one, so Monday's events sat under Sunday's date.
    await open();
    later(15 * 60 * 60 * 1000); // 01:30 on Wednesday in Lisbon
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(dayReads()).toContain("2026-09-30");
    expect(text()).toContain("Wednesday 30 September");
    expect(text()).not.toContain("Tuesday 29 September");
  });

  it("reads the new routes and never 024's agenda", async () => {
    await open();
    expect(calls.some((one) => one.path === "/v1/today")).toBe(false);
    expect(dayReads()).toEqual(["2026-09-29"]);
    expect(calls.filter((one) => one.path === "/v1/today/needs")).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ Needs you

describe("027 AC-2 and AC-11 the stack", () => {
  it("is not drawn when nothing waits", async () => {
    await open();
    expect(needsYou()).toBeNull();
  });

  it("shows one card with N of M, a sliver at two and two at three", async () => {
    needs = [card.request("r1", "Ana Duarte"), card.request("r2", "Sam Lee")];
    await open();
    expect(text()).toContain("1 of 2");
    expect(needsYou()!.getAttribute("data-slivers")).toBe("1");
    expect(text()).toContain("Ana Duarte wants to connect");
    expect(text()).not.toContain("Sam Lee wants to connect");
    act(() => root.unmount());

    needs = [card.request("r1", "Ana Duarte"), card.request("r2", "Sam Lee"), card.tip];
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    expect(text()).toContain("1 of 3");
    expect(needsYou()!.getAttribute("data-slivers")).toBe("2");
  });

  it("settles a card with its own route, brings the next, and holds the next card's actions for 300ms", async () => {
    needs = [card.request("r1", "Ana Duarte"), card.request("r2", "Sam Lee")];
    await open();
    await press(button("Accept"));
    expect(writes("POST", "/v1/people/requests/r1/accept")).toHaveLength(1);
    expect(text()).toContain("Sam Lee wants to connect");
    expect(text()).toContain("2 of 2");
    await press(button("Accept"));
    expect(writes("POST", "/v1/people/requests/r2/accept")).toHaveLength(0);
    later(301);
    await press(button("Accept"));
    expect(writes("POST", "/v1/people/requests/r2/accept")).toHaveLength(1);
    expect(needsYou()).toBeNull();
  });

  it("puts a card back with its own failure line and Try again when the write fails", async () => {
    needs = [card.request("r1", "Ana Duarte"), card.request("r2", "Sam Lee")];
    overrides["POST /v1/people/requests/r1/accept"] = () => json({ error: "boom" }, 500);
    await open();
    await press(button("Accept"));
    expect(text()).toContain("Ana Duarte wants to connect");
    expect(text()).toContain("That didn't go through.");
    delete overrides["POST /v1/people/requests/r1/accept"];
    later(301);
    await press(button("Try again"));
    expect(writes("POST", "/v1/people/requests/r1/accept")).toHaveLength(2);
    expect(text()).toContain("Sam Lee wants to connect");
  });

  it("lets a card go that was settled somewhere else, with its route's line and nothing to retry", async () => {
    needs = [card.request("r1", "Ana Duarte"), card.question()];
    overrides["POST /v1/people/requests/r1/accept"] = () => json({ error: "not_found" }, 404);
    overrides["POST /v1/questions/q1/answer"] = () => json({ error: "not_found" }, 404);
    await open();
    await press(button("Accept"));
    expect(text()).not.toContain("Ana Duarte wants to connect");
    expect(text()).toContain("That didn't go through.");
    expect(button("Try again")).toBeUndefined();
    later(301);
    await press(button("Saturday"));
    expect(needsYou()).toBeNull();
    expect(text()).toContain("That did not go through.");
  });

  it("lets a card go quietly when putting it off finds it already gone", async () => {
    needs = [card.request("r1", "Ana Duarte")];
    overrides["POST /v1/today/put-off"] = () => json({ error: "not_found" }, 404);
    await open();
    await press(button("Tomorrow"));
    expect(needsYou()).toBeNull();
    expect(text()).not.toContain("go through");
  });

  it("puts a card off until tomorrow with the clock", async () => {
    needs = [card.request("r1", "Ana Duarte")];
    await open();
    await press(button("Tomorrow"));
    expect(writes("POST", "/v1/today/put-off")[0]!.body).toEqual({ card: "request:r1" });
    expect(needsYou()).toBeNull();
  });

  it("drops what Needs you could not read and still draws the day", async () => {
    overrides["GET /v1/today/needs"] = () => json({ error: "boom" }, 500);
    await open();
    expect(needsYou()).toBeNull();
    expect(button("Previous week")).toBeDefined();
    expect(text()).toContain("To do");
  });
});

describe("027 AC-4 to AC-10 the cards", () => {
  it("keeps the kinds' order and says how long a person has waited", async () => {
    needs = [card.calendar, card.request("r1", "Ana Duarte"), card.question(), card.tip];
    await open();
    expect(text()).toContain("Google Calendar stopped syncing");
    expect(text()).toContain("Sign in again to see its events here.");
    expect(text()).toContain("1 of 4");
    await press(button("Tomorrow"));
    expect(text()).toContain("Waiting 2 days");
    expect(text()).toContain("Ana Duarte wants to connect");
  });

  it("names the account and still says the way forward when two are connected", async () => {
    needs = [{ ...card.calendar, email: "jo@work.example" }];
    await open();
    expect(text()).toContain("jo@work.example. Sign in again to see its events here.");
  });

  it("puts a broken calendar above the time zone card, as the table orders account issues", async () => {
    browserZone = "Asia/Tokyo";
    needs = [card.calendar];
    await open();
    expect(text()).toContain("Google Calendar stopped syncing");
    expect(text()).toContain("1 of 2");
  });

  it("reconnects a calendar through the sign-in Settings opens, and offers no Not now", async () => {
    needs = [card.calendar];
    await open();
    expect(link("Reconnect")!.getAttribute("href")).toBe("http://localhost:4701/api/connectors/google/start?landing=settings");
    expect(button("Not now")).toBeUndefined();
  });

  it("says Wants to connect before a day has passed", async () => {
    needs = [card.request("r1", "Ana Duarte", "2026-09-29T07:00:00Z")];
    await open();
    expect(text()).toContain("Wants to connect");
    await press(button("Not now"));
    expect(writes("POST", "/v1/people/requests/r1/dismiss")).toHaveLength(1);
  });

  it("adds an invitation's thread, and its Not now puts it off for good", async () => {
    needs = [card.invitation];
    await open();
    expect(text()).toContain("Shared a thread");
    expect(text()).toContain("Ana Duarte shared Europe, October");
    await press(button("Not now"));
    expect(writes("POST", "/v1/today/put-off")[0]!.body).toEqual({ card: "invitation:m1", forGood: true });
    act(() => root.unmount());

    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    await press(button("Add it to my threads"));
    expect(writes("POST", "/v1/invitations/m1/accept")).toHaveLength(1);
  });

  it("asks a question as QuickReplies with no filled option, Not that alone with the clock", async () => {
    needs = [card.question()];
    await open();
    const group = host.querySelector('[role="group"][aria-label=\'Filed "Sintra train". By when?\']')!;
    expect(group).not.toBeNull();
    expect(text()).toContain("offload asked");
    expect(group.querySelector("[data-filled]")).toBeNull();
    const notThat = button("Not that", group)!;
    const clock = button("Tomorrow")!;
    // QuickReplies' own break, then the way out, then the clock: one line.
    expect(notThat.nextElementSibling).toBe(clock);
    expect(notThat.previousElementSibling!.tagName).toBe("SPAN");
    expect(button("Sunday", group)!.nextElementSibling).toBe(notThat.previousElementSibling);
    expect(needsYou()!.querySelector('a[href="/threads/t2"]')).not.toBeNull();
    await press(button("Saturday", group));
    expect(writes("POST", "/v1/questions/q1/answer")[0]!.body).toEqual({ option: 0 });
    expect(needsYou()).toBeNull();
    const undo = button("Undo")!;
    expect(text()).toContain("Saturday");
    await press(undo);
    expect(writes("POST", "/v1/turns/turn1/undo")).toHaveLength(1);
  });

  it("offers Answer on a question only typing answers, which opens the composer on the conversation that asked", async () => {
    const typed = card.question(true);
    typed.question = { ...typed.question, field: "time", text: 'Filed "Odyssey 70mm". Which day and time?', options: [{ label: "Not that", kind: "plain" }] };
    needs = [typed];
    const opened = vi.fn();
    window.addEventListener(RESUME_COMPOSER, opened);
    overrides["POST /v1/questions/q1/resume"] = () => json({ conversationId: "v1" });
    await open();
    const answer = button("Answer");
    expect(answer).toBeDefined();
    // One row, as every other card: Answer filled, Dismiss beside it, the clock.
    expect(answer!.hasAttribute("data-filled")).toBe(true);
    expect(answer!.nextElementSibling).toBe(button("Dismiss")!);
    expect(button("Dismiss")!.nextElementSibling).toBe(button("Tomorrow")!);
    expect(button("Not that")).toBeUndefined();
    await press(answer);
    expect(writes("POST", "/v1/questions/q1/resume")).toHaveLength(1);
    expect(opened).toHaveBeenCalledTimes(1);
    // The card stays until the answer closes the question.
    expect(needsYou()).not.toBeNull();
    window.removeEventListener(RESUME_COMPOSER, opened);
  });

  it("dismisses a question only typing answers through 018's way out", async () => {
    const typed = card.question(true);
    typed.question = { ...typed.question, field: "time", options: [{ label: "Not that", kind: "plain" }] };
    needs = [typed];
    await open();
    await press(button("Dismiss"));
    expect(writes("POST", "/v1/questions/q1/answer")[0]!.body).toEqual({ option: 0 });
    expect(needsYou()).toBeNull();
  });

  it("lets a question card go when Answer finds it already closed", async () => {
    const typed = card.question(true);
    typed.question = { ...typed.question, field: "time", options: [{ label: "Not that", kind: "plain" }] };
    needs = [typed];
    overrides["POST /v1/questions/q1/resume"] = () => json({ error: "not_found" }, 404);
    await open();
    await press(button("Answer"));
    expect(needsYou()).toBeNull();
  });

  it("offers no Answer when the question has values to tap", async () => {
    needs = [card.question()];
    await open();
    expect(button("Answer")).toBeUndefined();
  });

  it("says a question came from an email", async () => {
    needs = [card.question(true)];
    await open();
    expect(text()).toContain("About an email");
  });

  it("copies the forwarding address and says so, and Got it is for good", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    needs = [card.tip];
    await open();
    expect(text()).toContain("Forward emails to offload");
    expect(text()).toContain("Send them to over@to.offload.club from jo@hey.com.");
    await press(button("Copy address"));
    expect(writeText).toHaveBeenCalledWith("over@to.offload.club");
    expect(text()).toContain("Copied");
    later(301);
    await press(button("Got it"));
    expect(writes("POST", "/v1/today/put-off")[0]!.body).toEqual({ card: "tip:forwarding", forGood: true });
  });

  it("is where the zone strip went: This browser says, Use and Keep, and no clock", async () => {
    browserZone = "Asia/Tokyo";
    await open();
    expect(text()).toContain("This browser says Tokyo");
    expect(text()).toContain("Showing times in Lisbon.");
    expect(button("Tomorrow")).toBeUndefined();
    await press(button("Use Tokyo"));
    expect(writes("PATCH", "/api/me")[0]!.body).toEqual({ timeZone: "Asia/Tokyo" });
  });

  it("goes on counting when the zone card leaves after Keep", async () => {
    browserZone = "Asia/Tokyo";
    needs = [{ key: "tip:forwarding", kind: "tip", tip: "forwarding", address: "over@to.offload.club", from: "jo@hey.com" }];
    await open();
    const total = text().match(/1 of (\d+)/)?.[1];
    expect(total).toBeDefined();
    await press(button("Keep Lisbon"));
    expect(text()).toContain(`2 of ${total}`);
  });

  it("keeps the zone card under Account issues, and never draws a notifications card", async () => {
    browserZone = "Asia/Tokyo";
    me = {
      ...baseMe(),
      todayLayoutV2: {
        version: 1,
        sections: [{ kind: "needs_you", parts: DEFAULT_LAYOUT.sections[0]!.parts!.map((part) => ({ ...part, on: part.kind !== "account" })) }, ...DEFAULT_LAYOUT.sections.slice(1)],
      },
    };
    await refreshMe();
    await open();
    expect(text()).not.toContain("This browser says");
    expect(text()).not.toContain("Notifications are off");
  });
});

// ------------------------------------------------------------------ the day

describe("027 AC-14 and AC-15 the two weeks (2026-10-19, in place of the month)", () => {
  it("draws this week and next as two rows, today pressed, the days before it closed, and no way back a week", async () => {
    await open();
    expect(text()).toContain("September 2026");
    expect(dayCell("2026-09-29")!.getAttribute("aria-pressed")).toBe("true");
    expect(dayCell("2026-09-28")!.disabled).toBe(true);
    expect(button("Previous week")!.disabled).toBe(true);
    // Always two weeks: the week after next is not drawn.
    expect(dayCell("2026-10-11")).toBeDefined();
    expect(dayCell("2026-10-12")).toBeUndefined();
  });

  it("opens a later day on a tap, names it and reads it", async () => {
    await open();
    await press(dayCell("2026-09-30"));
    expect(dayReads()).toEqual(["2026-09-29", "2026-09-30"]);
    expect(heading()).toBe("Wednesday 30 September");
    expect(dayCell("2026-09-30")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("dots each day from the read, over the two weeks it draws", async () => {
    overrides["GET /v1/today/month"] = () => json({ days: [{ date: "2026-10-02", task: 2, event: 1, calendar: 1 }] });
    await open();
    const read = calls.find((one) => one.path.startsWith("/v1/today/month"))!;
    // Monday weeks: this week and next run from Monday 28 September to Sunday 11 October.
    expect(read.path).toBe("/v1/today/month?from=2026-09-28&to=2026-10-11");
    // The date is in the reader's language; the counts are the claim.
    expect(dayCell("2026-10-02")!.getAttribute("aria-label")).toMatch(/, 2 to do, 1 event, 1 calendar event$/);
    expect(dayCell("2026-10-02")!.querySelectorAll("[data-dot]")).toHaveLength(4);
  });

  it("steps a week at a time, and Today comes back to today", async () => {
    await open();
    await press(button("Next week"));
    expect(text()).toContain("October 2026");
    expect(button("Previous week")!.disabled).toBe(false);
    await press(dayCell("2026-10-14"));
    expect(dayReads().at(-1)).toBe("2026-10-14");
    await press(button("Today"));
    expect(text()).toContain("September 2026");
    expect(dayReads().at(-1)).toBe("2026-09-29");
  });

  it("stops at the far edge of what offload keeps", async () => {
    await open("day=2027-09-29");
    expect(dayReads()).toContain("2027-09-29");
    expect(button("Next week")!.disabled).toBe(true);
    expect(dayCell("2027-09-30")!.disabled).toBe(true);
  });

  it("opens the day a door names, once, and the Today tab goes back to Today", async () => {
    await open("day=2026-09-30");
    expect(heading()).toBe("Wednesday 30 September");
    await act(async () => void window.dispatchEvent(new Event(TODAY_RESET)));
    await settle();
    expect(dayCell("2026-09-29")!.getAttribute("aria-pressed")).toBe("true");
    expect(dayReads().at(-1)).toBe("2026-09-29");
  });

  it("ignores a door naming a day already past", async () => {
    await open("day=2026-09-20");
    expect(dayReads()).toEqual(["2026-09-29"]);
  });
});

describe("027 AC-16, AC-17 and AC-19 the next line and the strip", () => {
  it("names the person's next event with its countdown, and raises its card", async () => {
    await open();
    const line = host.querySelector("[data-next-line]")!;
    expect(line.textContent).toBe("Call with Ana in 1h 30m");
    const raised = host.querySelector('[data-event][data-next="true"]')!;
    expect(raised.textContent).toContain("Call with Ana");
    expect(text()).toContain("Where you will be");
    expect(text()).toContain("12:00 to 12:30");
    expect(text()).toContain("All day");
  });

  it("strikes a past event's title through as a finished row is (the owner, 2026-10-12), and names another member's event as theirs", async () => {
    await open();
    const standup = [...host.querySelectorAll("[data-event]")].find((one) => one.textContent?.includes("Standup"))!;
    expect(standup.getAttribute("data-past")).toBe("true");
    // The title is an <s>: struck through by the element itself, so the
    // strike holds with no stylesheet and reads as "no longer current".
    expect(standup.querySelector("s")?.textContent).toBe("Standup");
    const dinner = [...host.querySelectorAll("[data-event]")].find((one) => one.textContent?.includes("Dinner, Sam"))!;
    expect(dinner.getAttribute("data-past")).toBeNull();
    expect(dinner.querySelector("s")).toBeNull();
    expect(dinner.textContent).toContain("Ana's");
  });

  it("opens a calendar's event in Google Calendar, an offload event in its thread, and nothing else", async () => {
    await open();
    const standup = [...host.querySelectorAll("[data-event]")].find((one) => one.textContent?.includes("Standup"))!;
    expect(standup.tagName).toBe("A");
    expect(standup.getAttribute("href")).toBe("https://www.google.com/calendar/event?eid=abc");
    expect(standup.getAttribute("target")).toBe("_blank");
    expect(standup.getAttribute("rel")).toBe("noreferrer noopener");
    const call = [...host.querySelectorAll("[data-event]")].find((one) => one.textContent?.includes("Call with Ana"))!;
    expect(call.tagName).toBe("DIV");
    expect(call.querySelector("a, button")).toBeNull();
    const elsewhere = [...host.querySelectorAll("[data-event]")].find((one) => one.textContent?.includes("Somewhere else"))!;
    expect(elsewhere.tagName).toBe("DIV");
    const viewing = [...host.querySelectorAll("[data-event]")].find((one) => one.textContent?.includes("Viewing"))!;
    expect(viewing.tagName).toBe("A");
    expect(viewing.getAttribute("href")).toBe("/threads/t1");
    expect(viewing.querySelectorAll("a")).toHaveLength(0);
  });

  it("names the first event with its hour on another day", async () => {
    days["2026-09-30"] = {
      ...emptyDay("2026-09-30"),
      events: [event("d1", "Dentist", { startsAt: "2026-09-30T09:00:00Z", endsAt: "2026-09-30T09:45:00Z" })],
      eventCount: 1,
    };
    await open();
    await press(dayCell("2026-09-30"));
    expect(host.querySelector("[data-next-line]")!.textContent).toBe("Dentist at 10:00");
  });
});

describe("027 AC-20 and AC-21 To do", () => {
  it("folds late rows past three and opens them in place", async () => {
    await open();
    expect(text()).toContain("Late number 1");
    expect(text()).toContain("Late number 3");
    expect(text()).not.toContain("Late number 4");
    await press(button("2 more late"));
    expect(text()).toContain("Late number 5");
  });

  it("counts what the read left out in the late fold, and says and N more for the rest, as the phones do", async () => {
    days["2026-09-29"] = { ...(days["2026-09-29"] as object), lateMore: 4, timedMore: 2, restMore: 3 };
    await open();
    await press(button("6 more late"));
    expect(text()).not.toContain("more before these");
    expect(text()).toContain("and 5 more");
  });

  it("draws a timed row with its hour, the rest with no date, each with its thread pill and labels", async () => {
    await open();
    const timed = [...host.querySelectorAll("[data-row]")].find((one) => one.textContent?.includes("Call the letting agent"))!;
    expect(timed.textContent).toContain("11:00");
    expect(timed.textContent).not.toContain("Due");
    expect(timed.querySelector('a[href="/threads/t1"]')).not.toBeNull();
    const rest = [...host.querySelectorAll("[data-row]")].find((one) => one.textContent?.includes("Buy Viva Viagem cards"))!;
    expect(rest.textContent).not.toContain("Due");
    expect(rest.textContent).toContain("Lisbon");
    expect(rest.querySelector('a[href="/threads/t2"]')).not.toBeNull();
    const late = [...host.querySelectorAll("[data-row]")].find((one) => one.textContent?.includes("Late number 2"))!;
    expect(late.textContent).toContain("Due 2 days ago");
  });

  it("ticks a row in place, as the thread page does", async () => {
    await open();
    const box = host.querySelector('input[aria-label="Finish Call the letting agent"]') as HTMLInputElement;
    await press(box);
    expect(writes("POST", "/v1/content/c6/complete")[0]!.body).toEqual({ done: true });
  });

  it("never draws If you have time, whatever the day carries", async () => {
    await open();
    expect(text()).not.toContain("If you have time");
    expect(text()).not.toContain("Return the drill to Tom");
  });
});

describe("027 AC-24 and AC-25 the empty, failed and slow days", () => {
  it("draws the day-one invitation for an account that has never dumped", async () => {
    days["2026-09-29"] = { ...emptyDay("2026-09-29"), everDumped: false };
    await open();
    expect(text()).toContain("Dump anything and offload will sort it.");
    expect(button("Previous week")).toBeUndefined();
  });

  it("draws one line for a day with nothing in it", async () => {
    days["2026-09-29"] = emptyDay("2026-09-29");
    await open();
    expect(text()).toContain("Nothing today.");
    await press(dayCell("2026-09-30"));
    expect(text()).toContain("Nothing tomorrow.");
  });

  it("says a day did not load, with Try again", async () => {
    overrides["GET /v1/today/day"] = () => json({ error: "boom" }, 500);
    await open();
    expect(text()).toContain("Couldn't load this day");
    delete overrides["GET /v1/today/day"];
    await press(button("Try again"));
    expect(text()).toContain("To do");
  });

  it("shows no spinner for a day that arrives within a quarter second, and one for a slow day", async () => {
    await open();
    let release: () => void = () => undefined;
    overrides["GET /v1/today/day"] = (call) =>
      new Promise((resolve) => {
        release = () => resolve(json(emptyDay(new URLSearchParams(call.path.split("?")[1]).get("date")!)));
      });
    await press(dayCell("2026-09-30"));
    expect(host.querySelector('[role="status"]')).toBeNull();
    await wait(300);
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => release());
    await settle();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(text()).toContain("Nothing tomorrow.");
  });
});

// ------------------------------------------------------------------ Customize Today

// ------------------------------------------------------------------ open in your threads

const section = () => (host.querySelector("#open-threads-head")?.closest("section") ?? null) as HTMLElement | null;
const pages = () => [...(section()?.querySelectorAll("[data-page]") ?? [])] as HTMLElement[];
const box = (title: string) =>
  section()!.querySelector(`input[aria-label="Finish ${title}"], input[aria-label="Put ${title} back on the list"]`) as HTMLInputElement;

describe("open in your threads (design 2026-10-07)", () => {
  it("comes after To do on Today, with the count of what the pages hold", async () => {
    await open();
    expect(section()).not.toBeNull();
    expect(section()!.querySelector("h3")!.textContent).toBe("Open in your threads 10");
    const todo = [...host.querySelectorAll("h3")].find((one) => one.textContent?.startsWith("To do"))!;
    expect(before(todo, section()!)).toBe(true);
  });

  it("shows two pages side by side, stepped by two with the arrows, each disabled at its end", async () => {
    await open();
    expect(pages().map((one) => one.querySelector("[data-page-name]")!.textContent)).toEqual(["Europe, October", "Flat"]);
    expect(button("Previous threads")!.disabled).toBe(true);
    await press(button("Next threads"));
    expect(pages().map((one) => one.querySelector("[data-page-name]")!.textContent)).toEqual(["Bookshelf build", "Not in a thread"]);
    expect(button("Next threads")!.disabled).toBe(true);
    await press(button("Previous threads"));
    expect(pages()[0]!.textContent).toContain("Europe, October");
  });

  it("keeps the arrows with two pages or fewer, both disabled", async () => {
    openRead = { ...openRead, pages: openRead.pages.slice(0, 2) };
    await open();
    expect(button("Previous threads")!.disabled).toBe(true);
    expect(button("Next threads")!.disabled).toBe(true);
  });

  it("draws a page's people, four to-dos with how long they have been open, N more and Open thread", async () => {
    await open();
    const [trip] = pages();
    expect(trip!.textContent).toContain("AD");
    expect(trip!.textContent).toContain("TR");
    expect(trip!.textContent).toContain("Book the Sintra train");
    expect(trip!.textContent).toContain("Adapters");
    expect(trip!.textContent).not.toContain("Hotel in Paris");
    expect(trip!.textContent).toContain("3 weeks");
    expect(trip!.textContent).toContain("1 more");
    const doors = [...trip!.querySelectorAll("a")].map((one) => one.getAttribute("href"));
    expect(doors).toEqual(["/threads/t2", "/threads/t2"]);
    expect([...trip!.querySelectorAll("a")].at(-1)!.textContent).toBe("Open thread");
  });

  it("puts Not in a thread last, with offload's line, what else it holds and Sort them", async () => {
    await open();
    await press(button("Next threads"));
    const loose = pages()[1]!;
    expect(loose.textContent).toContain("offload has a thread in mind for one of these.");
    expect(loose.textContent).toContain("6 notes and links");
    expect([...loose.querySelectorAll("a")].map((one) => [one.textContent, one.getAttribute("href")]).at(-1)).toEqual(["Sort them", "/threads/loose"]);
  });

  it("ticks a to-do off with its line in the row's place, each with its own Undo (2026-10-18)", async () => {
    await open();
    const trip = pages()[0]!;
    await press(box("Book the Sintra train"));
    expect(box("Book the Sintra train")).toBeNull();
    expect(writes("POST", "/v1/content/t2-0/complete")[0]!.body).toEqual({ done: true });
    expect(trip.querySelector("a")!.nextElementSibling!.textContent).toBe("Ticked offUndo");
    // The server no longer has it; the line holds its place while Today reads again.
    openRead = { ...openRead, pages: openRead.pages.map((one) => (one.threadId === "t2" ? { ...one, todos: one.todos.slice(1), count: 4 } : one)) };
    await press(box("Fix the bathroom tap"));
    // Ten, less the one the server no longer has and the one ticked here.
    expect(section()!.querySelector("h3")!.textContent).toBe("Open in your threads 8");
    expect(section()!.querySelectorAll("[role=status]")).toHaveLength(2);
    // The Flat line's Undo takes back the Flat tick only.
    await press(button("Undo", pages()[1]!));
    expect(writes("POST", "/v1/content/t1-0/complete").map((one) => one.body)).toEqual([{ done: true }, { done: false }]);
    expect(box("Fix the bathroom tap").checked).toBe(false);
    expect(section()!.querySelectorAll("[role=status]")).toHaveLength(1);
  });

  it("opens a to-do's row sheet from its title", async () => {
    await open();
    await press(button("Viva Viagem cards"));
    expect(document.querySelector('[role="dialog"][aria-label="Edit"]')).not.toBeNull();
  });

  it("is not drawn on another day, when nothing is open, or when the layout has it off", async () => {
    await open();
    await press(dayCell("2026-09-30"));
    expect(section()).toBeNull();
    act(() => root.unmount());

    openRead = { pages: [], count: 0 };
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    expect(section()).toBeNull();
    act(() => root.unmount());

    calls = [];
    openRead = fullOpen();
    me = { ...baseMe(), todayLayoutV2: { ...DEFAULT_LAYOUT, sections: [...DEFAULT_LAYOUT.sections.slice(0, 2), { kind: "open_threads", on: false }] } };
    await refreshMe();
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    expect(section()).toBeNull();
    expect(calls.some((one) => one.path === "/v1/today/threads")).toBe(false);
  });
});


const switchFor = (name: string) =>
  [...host.querySelectorAll("label")].find((one) => one.textContent?.includes(name))!.querySelector('input[role="switch"]') as HTMLInputElement;

describe("027 AC-27 Customize Today", () => {
  it("is a second pane beside Today, with four kinds under Needs you, then Your day and Open in your threads, each with a switch", async () => {
    await open("customize=1");
    expect(text()).toContain("Customize Today");
    expect(text()).toContain("Drag to reorder. Switch off to hide.");
    for (const name of ["Account issues", "People", "Questions", "Tips", "Your day", "Open in your threads"]) expect(switchFor(name).checked).toBe(true);
    expect(host.querySelectorAll('input[role="switch"]')).toHaveLength(6);
    expect(text()).toContain("To-dos with no date, a thread at a time");
    expect(button("Move Needs you")).toBeDefined();
    expect(button("Move Your day")).toBeDefined();
    expect(button("Move Open in your threads")).toBeDefined();
    expect(button("Previous week")).toBeDefined();
  });

  it("writes one change per switch, and Today changes behind it", async () => {
    needs = [card.request("r1", "Ana Duarte")];
    await open("customize=1");
    expect(text()).toContain("Ana Duarte wants to connect");
    await press(switchFor("People"));
    const patches = writes("PATCH", "/api/me");
    expect(patches).toHaveLength(1);
    const sent = (patches[0]!.body as { todayLayout: typeof DEFAULT_LAYOUT }).todayLayout;
    expect(sent.sections[0]!.parts!.find((part) => part.kind === "people")!.on).toBe(false);
    expect(text()).not.toContain("Ana Duarte wants to connect");
  });

  it("will not switch off the last switch on", async () => {
    me = {
      ...baseMe(),
      todayLayoutV2: {
        version: 1,
        sections: [
          { kind: "needs_you", parts: DEFAULT_LAYOUT.sections[0]!.parts!.map((part) => ({ ...part, on: false })) },
          DEFAULT_LAYOUT.sections[1],
          { kind: "open_threads", on: false },
        ],
      },
    };
    await refreshMe();
    await open("customize=1");
    expect(switchFor("Your day").disabled).toBe(true);
    expect(switchFor("People").disabled).toBe(false);
  });

  it("moves a section with the arrow keys on its grip, in one write", async () => {
    needs = [card.request("r1", "Ana Duarte")];
    await open("customize=1");
    const grip = button("Move Needs you")!;
    grip.focus();
    await act(async () => void grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await settle();
    const patches = writes("PATCH", "/api/me");
    expect(patches).toHaveLength(1);
    expect((patches[0]!.body as { todayLayout: typeof DEFAULT_LAYOUT }).todayLayout.sections.map((one) => one.kind)).toEqual(["day", "needs_you", "open_threads"]);
    expect(before(button("Previous week")!, needsYou()!)).toBe(true);
  });

  it("moves a section by dragging it, in one write on the drop", async () => {
    await open("customize=1");
    const grip = button("Move Your day")!;
    const target = button("Move Needs you")!.closest("[data-section]")!;
    await act(async () => void grip.dispatchEvent(new Event("dragstart", { bubbles: true })));
    await act(async () => void target.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true })));
    expect(writes("PATCH", "/api/me")).toHaveLength(0);
    await act(async () => void target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true })));
    await settle();
    const patches = writes("PATCH", "/api/me");
    expect(patches).toHaveLength(1);
    expect((patches[0]!.body as { todayLayout: typeof DEFAULT_LAYOUT }).todayLayout.sections.map((one) => one.kind)).toEqual(["day", "needs_you", "open_threads"]);
  });

  it("resets to the defaults", async () => {
    me = { ...baseMe(), todayLayoutV2: { version: 1, sections: [DEFAULT_LAYOUT.sections[1], DEFAULT_LAYOUT.sections[0], DEFAULT_LAYOUT.sections[2]] } };
    await refreshMe();
    await open("customize=1");
    await press(button("Reset"));
    // 042: the defaults carry Reminders, between Your day and Open in your threads.
    expect((writes("PATCH", "/api/me")[0]!.body as { todayLayout: unknown }).todayLayout).toEqual(LAYOUT_V3);
  });

  it("puts the switch back and says so when the write fails", async () => {
    overrides["PATCH /api/me"] = () => json({ error: "bad_layout" }, 400);
    await open("customize=1");
    await press(switchFor("Tips"));
    expect(switchFor("Tips").checked).toBe(true);
    expect(text()).toContain("Couldn't save that");
    delete overrides["PATCH /api/me"];
    await press(button("Try again"));
    expect(switchFor("Tips").checked).toBe(false);
  });

  it("keeps a second change when the first one's write fails after it", async () => {
    // The first write is held open until the second has been pressed and has
    // landed, then refused: the order is the test's, not the runner's speed.
    let failFirst: () => void = () => undefined;
    let first = true;
    overrides["PATCH /api/me"] = (call) => {
      if (first) {
        first = false;
        return new Promise<Response>((resolve) => {
          failFirst = () => resolve(json({ error: "bad_layout" }, 400));
        });
      }
      return json({ ...me, todayLayoutV2: (call.body as { todayLayout: unknown }).todayLayout });
    };
    await open("customize=1");
    await press(switchFor("Tips"));
    await press(switchFor("People"));
    await settle();
    failFirst();
    await settle();
    expect(switchFor("People").checked).toBe(false);
    expect(switchFor("Tips").checked).toBe(false);
    expect(text()).not.toContain("Couldn't save that");
    delete overrides["PATCH /api/me"];
  });

  it("closes with Done", async () => {
    await open("customize=1");
    expect(link("Done")!.getAttribute("href")).toBe("/today");
  });
});

// ------------------------------------------------------------------ 042

const remindersSection = () => (host.querySelector("#reminders-head")?.closest("section") ?? null) as HTMLElement | null;
const withV3 = async (sections: unknown[] = LAYOUT_V3.sections) => {
  me = { ...baseMe(), todayLayoutV3: { version: 1, sections } };
  await refreshMe();
};

describe("042 AC-26 Today's Reminders section (drawn 2026-10-11)", () => {
  const countdowns = () => [...remindersSection()!.querySelectorAll("[data-countdown]")].map((one) => one.textContent);
  const cards = () => [...remindersSection()!.querySelectorAll("[data-reminder-card]")] as HTMLElement[];
  const entry = (name: string) => [...remindersSection()!.querySelectorAll("[data-reminder]")].find((one) => one.textContent?.includes(name)) as HTMLElement | undefined;

  it("reads todayLayoutV3 before V2, and sits under Your day and above Open in your threads, headed at the band's size", async () => {
    await withV3();
    await open();
    const head = remindersSection()!.querySelector("h3")!;
    expect(head.textContent).toBe("Reminders 4");
    expect(head.dataset["big"]).toBe("true");
    const todo = [...host.querySelectorAll("h3")].find((one) => one.textContent?.startsWith("To do"))!;
    expect(before(todo, head)).toBe(true);
    expect(before(head, section()!)).toBe(true);
  });

  it("one column, nearest first: everything on the day in one card under a single Today, each later thing a card of its own", async () => {
    await withV3();
    await open();
    expect(countdowns()).toEqual(["Today", "In 3 days", "In 15 days"]);
    const [today, task, memory] = cards();
    expect(today!.textContent).toContain("Lisbon flat from the 1st");
    expect(today!.textContent).toContain("Sam's birthday");
    expect(today!.textContent).toContain("Tue 29 Sep");
    expect(task!.textContent).toContain("Pack the adapters");
    expect(task!.textContent).toContain("By Fri 2 Oct");
    expect(memory!.textContent).toContain("Ana's birthday");
    expect(memory!.textContent).toContain("Wed 14 Oct");
    // No tick, no chip, no pill: the row opens, and that is all.
    expect(remindersSection()!.querySelector('input[type="checkbox"]')).toBeNull();
    expect(remindersSection()!.textContent).not.toContain("more");
  });

  it("says where each lives, with its time in the day's colour, and the whole row opens it", async () => {
    await withV3();
    await open();
    const note = entry("Lisbon flat from the 1st")!;
    expect(note.textContent).toContain("Europe, October");
    expect(note.textContent).toContain("21:40");
    expect(note.querySelector("a")!.getAttribute("href")).toBe("/threads/t2");
    const task = entry("Pack the adapters")!;
    expect(task.textContent).toContain("Europe, October");
    expect(task.querySelector("a")!.getAttribute("href")).toBe("/threads/t2");
    const memory = entry("Ana's birthday")!;
    expect(memory.textContent).toContain("Memories");
    expect(memory.querySelector("a")!.getAttribute("href")).toBe("/memories?memory=m1");
  });

  it("says Not in a thread for a row or a note in the default thread, opening what is not in a thread", async () => {
    await withV3();
    const read = fullReminders();
    read.others[0] = { ...read.others[0]!, threadName: null, threadIcon: null, threadHue: null } as (typeof read.others)[0];
    read.rows[0] = { ...read.rows[0]!, threadName: null, threadIcon: null, threadHue: null } as unknown as (typeof read.rows)[0];
    remindersRead = read;
    await open();
    const note = entry("Lisbon flat from the 1st")!;
    expect(note.textContent).toContain("Not in a thread");
    expect(note.textContent).not.toContain("Europe, October");
    expect(note.querySelector("a")!.getAttribute("href")).toBe("/threads/loose");
    expect(entry("Pack the adapters")!.querySelector("a")!.getAttribute("href")).toBe("/threads/loose");
  });

  it("dismiss hides this reminder, says when it comes back, and Undo puts it back", async () => {
    await withV3();
    await open();
    await press(button("Dismiss Ana's birthday"));
    expect(entry("Ana's birthday")).toBeUndefined();
    expect(countdowns()).toEqual(["Today", "In 3 days"]);
    expect(writes("POST", "/v1/today/reminders/dismiss").map((one) => one.body)).toEqual([{ of: "memory", id: "m1", day: "2026-10-14", window: "long" }]);
    expect(text()).toContain("Dismissed until 9 October");
    await press(button("Undo"));
    expect(entry("Ana's birthday")).toBeDefined();
    expect(writes("POST", "/v1/today/reminders/undismiss").map((one) => one.body)).toEqual([{ of: "memory", id: "m1", day: "2026-10-14", window: "long" }]);
  });

  it("a dismiss hides that reminder only: when the next window begins, the thing is back on a screen left open", async () => {
    await withV3();
    await open();
    await press(button("Dismiss Ana's birthday"));
    expect(entry("Ana's birthday")).toBeUndefined();
    // The week out has begun; the server shows the thing as that reminder.
    const read = fullReminders();
    read.others[2] = { ...read.others[2]!, window: "short", next: null } as (typeof read.others)[2];
    remindersRead = read;
    await press(dayCell("2026-09-30"));
    await press(dayCell("2026-09-29"));
    expect(entry("Ana's birthday")).toBeDefined();
    expect(countdowns()).toEqual(["Today", "In 3 days", "In 15 days"]);
  });

  it("dismissing everything on the day takes the shared card with it once its lines end, and the last thing takes the section", async () => {
    await withV3();
    await open();
    await press(button("Dismiss Lisbon flat from the 1st"));
    expect(countdowns()).toEqual(["Today", "In 3 days", "In 15 days"]);
    expect(text()).toContain("Dismissed");
    expect(text()).not.toContain("Dismissed until");
    await press(button("Dismiss Sam's birthday"));
    // 2026-10-18. The card holds its two lines while their windows run.
    expect(countdowns()).toEqual(["Today", "In 3 days", "In 15 days"]);
    expect(remindersSection()!.querySelector("[data-reminder-card]")!.querySelectorAll("[role=status]")).toHaveLength(2);
    act(() => {
      for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
    });
    expect(countdowns()).toEqual(["In 3 days", "In 15 days"]);
    expect(writes("POST", "/v1/today/reminders/dismiss").map((one) => (one.body as { of: string; window: string }).of)).toEqual(["note", "memory"]);
    await press(button("Dismiss Pack the adapters"));
    expect(writes("POST", "/v1/today/reminders/dismiss").at(-1)!.body).toEqual({ of: "content", id: "c20", day: "2026-10-02", window: "short" });
    await press(button("Dismiss Ana's birthday"));
    // The last one's line keeps the section until its window ends.
    expect(remindersSection()!.textContent).toContain("Dismissed");
    act(() => {
      for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
    });
    expect(remindersSection()).toBeNull();
  });

  it("a dismiss the server refuses comes back, with Retry", async () => {
    await withV3();
    overrides["POST /v1/today/reminders/dismiss"] = () => new Response(null, { status: 500 });
    await open();
    await press(button("Dismiss Ana's birthday"));
    expect(entry("Ana's birthday")).toBeDefined();
    expect(text()).toContain("Couldn't dismiss that");
    expect(button("Retry")).toBeDefined();
  });

  it("draws nothing at all when empty", async () => {
    await withV3();
    remindersRead = { rows: [], others: [], more: 0 };
    await open();
    expect(remindersSection()).toBeNull();
    expect([...host.querySelectorAll("h3")].some((one) => one.textContent?.startsWith("Reminders"))).toBe(false);
  });

  it("is drawn on today only, never over the day-one invitation, and not when the layout has it off", async () => {
    await withV3();
    await open();
    await press(dayCell("2026-09-30"));
    expect(remindersSection()).toBeNull();
    act(() => root.unmount());

    days["2026-09-29"] = { ...emptyDay("2026-09-29"), everDumped: false };
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    expect(text()).toContain("Dump anything and offload will sort it.");
    expect(remindersSection()).toBeNull();
    act(() => root.unmount());

    calls = [];
    days = { "2026-09-29": fullToday() };
    await withV3(LAYOUT_V3.sections.map((one) => ((one as { kind: string }).kind === "reminders" ? { kind: "reminders", on: false } : one)));
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await open();
    expect(remindersSection()).toBeNull();
    expect(calls.some((one) => one.path === "/v1/today/reminders")).toBe(false);
  });

  it("draws nothing for a kind it does not know", async () => {
    await withV3([DEFAULT_LAYOUT.sections[0], DEFAULT_LAYOUT.sections[1], { kind: "weather", on: true }]);
    await open();
    expect(section()).toBeNull();
    expect(remindersSection()).toBeNull();
  });
});

describe("046 de-band and the prism field", () => {
  it("draws no alternating bands: nothing carries data-band, and the heads keep their size", async () => {
    await withV3();
    await open();
    // The 11 October bands are gone: sections sit flat on the page.
    expect(host.querySelector("[data-band]")).toBeNull();
    // Open in your threads still heads its section at the big size.
    expect((section()!.querySelector("h3") as HTMLElement).dataset["big"]).toBe("true");
  });

  it("draws the prism field behind the page: four bloom layers from TODAY_FIELD", async () => {
    await withV3();
    await open();
    const blooms = host.querySelectorAll('[style*="p2-bloom"]');
    expect(blooms).toHaveLength(4);
  });
});

describe("042 AC-26 Customize Today", () => {
  it("lists Reminders with its grip, its switch and its line, and writes the whole layout", async () => {
    await withV3();
    overrides["PATCH /api/me"] = (call) => {
      me = { ...me, todayLayoutV3: (call.body as { todayLayout: unknown }).todayLayout };
      return json(me);
    };
    await open("customize=1");
    expect(host.querySelectorAll('input[role="switch"]')).toHaveLength(7);
    expect(button("Move Reminders")).toBeDefined();
    expect(text()).toContain("What offload is reminding you about, nearest first");
    expect(remindersSection()).not.toBeNull();
    await press(switchFor("Reminders"));
    const sent = (writes("PATCH", "/api/me")[0]!.body as { todayLayout: { sections: { kind: string; on?: boolean }[] } }).todayLayout;
    expect(sent.sections.map((one) => one.kind)).toEqual(["needs_you", "day", "reminders", "open_threads"]);
    expect(sent.sections[2]).toEqual({ kind: "reminders", on: false });
    expect(remindersSection()).toBeNull();
  });
});

describe("Undo in place on Today (2026-10-18)", () => {
  const floating = () => document.querySelectorAll("[role=status]").length;

  it("ticks a to-do off with its line in its slot in To do, and Undo puts it back", async () => {
    // The server's day, which does not hold what is done.
    const day = days["2026-09-29"] as ReturnType<typeof fullToday>;
    const timed = day.timed;
    overrides["POST /v1/content/c6/complete"] = (call) => {
      day.timed = (call.body as { done: boolean }).done ? [] : timed;
      return json({ ok: true });
    };
    await open();
    await press(host.querySelector('input[aria-label="Finish Call the letting agent"]') as HTMLInputElement);
    expect(writes("POST", "/v1/content/c6/complete")[0]!.body).toEqual({ done: true });
    expect(text()).not.toContain("Call the letting agent");
    const line = host.querySelector("[role=status]")!;
    expect(line.textContent).toBe("Ticked offUndo");
    // Where the timed row was: after the late rows' fold, before the rest.
    const drawn = [...host.querySelectorAll("[data-row], [role=status]")].map((one) => one.textContent ?? "");
    expect(drawn.findIndex((one) => one === "Ticked offUndo")).toBe(drawn.findIndex((one) => one.includes("Buy Viva Viagem cards")) - 1);
    expect(floating()).toBe(1);
    await press(button("Undo"));
    expect(writes("POST", "/v1/content/c6/complete").map((one) => one.body)).toEqual([{ done: true }, { done: false }]);
    expect(text()).toContain("Call the letting agent");
  });

  it("keeps the To do card for the last to-do's line, rather than calling the day empty", async () => {
    const only = [row("c6", "Call the letting agent", { dueAt: "2026-09-29T10:00:00.000Z" })];
    const day = { ...emptyDay("2026-09-29"), timed: only };
    days["2026-09-29"] = day;
    // The server's day does not hold what is done.
    overrides["POST /v1/content/c6/complete"] = (call) => {
      day.timed = (call.body as { done: boolean }).done ? [] : only;
      return json({ ok: true });
    };
    await open();
    await press(host.querySelector('input[aria-label="Finish Call the letting agent"]') as HTMLInputElement);
    const section = host.querySelector('[data-section="day"]')!;
    expect(section.textContent).not.toContain("Nothing today.");
    expect(section.querySelector("[role=status]")!.textContent).toBe("Ticked offUndo");
  });

  it("dismisses a reminder with its line in its place in the Today card", async () => {
    await withV3();
    await open();
    await press(button("Dismiss Lisbon flat from the 1st"));
    const card = remindersSection()!.querySelector("[data-reminder-card]")!;
    expect(card.querySelector("[role=status]")!.textContent).toBe("DismissedUndo");
    await press(button("Dismiss Ana's birthday"));
    expect(text()).toContain("Dismissed until 9 October");
    expect(floating()).toBe(2);
    expect(text()).not.toContain("remind you about");
  });

  it("answers a Needs you card with its line in the card's place", async () => {
    needs = [card.question()];
    await open();
    await press(button("Saturday"));
    expect(needsYou()).toBeNull();
    const line = host.querySelector("[role=status]")!;
    expect(line.textContent).toBe("Saturday, for Europe, OctoberUndo");
    expect(before(line, button("Previous week")!)).toBe(true);
    await press(button("Undo"));
    expect(writes("POST", "/v1/turns/turn1/undo")).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ 048

const { ThreadsProvider } = await import("../src/components/shell/threads-context");

describe("048 P3 a change while Today is open", () => {
  const provide = (changed: import("@offload/widgets").Changes | null) =>
    act(async () =>
      root.render(
        <ThreadsProvider
          value={{ groups: [], invitations: [], loose: null, order: { sort: "newest", ids: [] }, viewerId: null, ready: true, reload: () => {}, filed: null, turnOut: false, changed: changed && { ...changed, at: Date.now() } }}
        >
          <ToastProvider>
            <TodayRoute />
            <ToastHost />
          </ToastProvider>
        </ThreadsProvider>,
      ),
    );
  const reads = () => ["day", "threads", "reminders", "needs"].map((one) => calls.filter((call) => call.path.startsWith(`/v1/today/${one}`)).length);

  it.each(["thread", "today", "all"] as const)("reads the day, the open threads, the reminders and Needs you again on %s", async (kind) => {
    await withV3();
    await provide(null);
    await settle();
    calls = [];
    needs = [card.request("r1", "Ana Duarte")];
    await provide({ kinds: [kind], threads: ["t9"] });
    await settle();
    expect(reads()).toEqual([1, 1, 1, 1]);
    expect(text()).toContain("Book the Sintra train");
    expect(text()).toContain("Ana Duarte");
  });

  it("does not read again on a memory", async () => {
    await withV3();
    await provide(null);
    await settle();
    calls = [];
    await provide({ kinds: ["memories"] });
    await settle();
    expect(reads()).toEqual([0, 0, 0, 0]);
  });
});
