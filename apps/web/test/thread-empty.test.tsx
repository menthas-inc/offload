// @vitest-environment happy-dom
//
// Sweep 2026-10-07, F-W2. A thread that holds something never says it is
// empty. Its one event lives on the rail, on a day other than the one picked,
// and the list under it has nothing left to show: that is not an empty thread.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRow, ThreadBundle } from "../src/lib/threads";

const data = vi.hoisted(() => ({ rows: [] as unknown[], notes: [] as unknown[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../src/components/shell/threads-context", () => ({ useThreads: () => ({ filed: null }) }));
vi.mock("../src/components/shell/Toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-07" }) }));
vi.mock("../src/components/shell/PaneHead", () => ({ PaneHead: () => null }));
vi.mock("../src/components/panes/Timeline", () => ({ Timeline: () => <div data-rail /> }));
vi.mock("../src/components/panes/Widgets", () => ({ Widgets: () => null }));
vi.mock("../src/components/panes/Notes", () => ({ Notes: () => null }));
vi.mock("../src/components/labels/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("../src/components/map/MapFrame", () => ({
  MapFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MapSwitch: () => null,
  useThreadMap: () => ({ layout: "list", points: [], showSwitch: false, selected: null, hovered: null, open: null }),
}));
vi.mock("../src/lib/threads", async (original) => ({
  ...(await original<typeof import("../src/lib/threads")>()),
  fetchThread: async (): Promise<ThreadBundle> => ({
    id: "t1",
    name: "Busan trip",
    icon: "plane",
    hue: 3,
    iconSetBy: "offload",
    alwaysOn: false,
    isDefault: false,
    hasPoint: false,
    counts: { active: data.rows.length, archived: 0, unlabelled: data.rows.length },
    members: [],
    labels: [],
    preference: {},
    notes: data.notes as ThreadBundle["notes"],
    noteCounts: { active: data.notes.length, folded: 0 },
    line: "1 event",
    standing: null,
    shareable: true,
    calendars: null,
  }),
  fetchContent: async () => ({ rows: data.rows, nextCursor: null }),
}));

const { Thread } = await import("../src/components/panes/Thread");

const EMPTY = "Nothing in this one yet.";

const event = (over: Partial<ContentRow> = {}): ContentRow => ({
  id: "r1",
  type: "event",
  title: "Flight to Busan",
  body: null,
  url: null,
  imageUrl: null,
  photo: null,
  createdAt: "2026-10-01T09:00:00Z",
  archivedAt: null,
  doneAt: null,
  dueAt: null,
  // Not today, the day the rail opens on.
  occursAt: "2026-10-20T10:00:00Z",
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
  author: { accountId: "a1", displayName: "Jun", isYou: true },
  canDelete: true,
  canMove: true,
  filingAt: null,
  ...over,
});

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const open = async () => act(async () => root.render(<Thread id="t1" onChanged={() => undefined} />));

describe("the thread pane's empty line", () => {
  it("is absent on a thread whose one event is on another day", async () => {
    data.rows = [event()];
    data.notes = [];
    await open();
    expect(host.querySelector("[data-rail]")).not.toBeNull();
    expect(host.textContent).not.toContain(EMPTY);
  });

  it("is absent on a thread that holds only a repeating series", async () => {
    // Undated occurrences of a series, so they reach the list rather than the
    // rail, and the list draws them as one row.
    data.rows = [
      event({ id: "s1", title: "Swim", type: "note", occursAt: null, seriesRef: "swim" }),
      event({ id: "s2", title: "Swim", type: "note", occursAt: null, seriesRef: "swim" }),
    ];
    data.notes = [];
    await open();
    expect(host.textContent).not.toContain(EMPTY);
  });

  it("is there on a thread that holds nothing", async () => {
    data.rows = [];
    data.notes = [];
    await open();
    expect(host.textContent).toContain(EMPTY);
  });
});
