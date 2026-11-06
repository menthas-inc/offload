// @vitest-environment happy-dom
//
// Sweep 2026-10-07, F-W2. A thread that holds something never says it is
// empty. Its one event lives on the rail, on a day other than the one picked,
// and the list under it has nothing left to show: that is not an empty thread.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRow, ThreadBundle } from "../src/lib/threads";

type Props = Record<string, unknown>;
const data = vi.hoisted(() => ({ rows: [] as unknown[], notes: [] as unknown[], head: {} as Props, widgets: {} as Props, notesProps: {} as Props, layout: "default", newNote: null as Props | null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../src/components/shell/threads-context", () => ({ useThreads: () => ({ filed: null }), useChanged: () => undefined }));
vi.mock("../src/components/shell/Toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-07" }) }));
vi.mock("../src/components/shell/PaneHead", () => ({
  PaneHead: (props: Props) => {
    data.head = props;
    return null;
  },
}));
vi.mock("../src/components/panes/Timeline", () => ({ Timeline: () => <div data-rail /> }));
vi.mock("../src/components/panes/Widgets", () => ({
  Widgets: (props: Props) => {
    data.widgets = props;
    return null;
  },
}));
vi.mock("../src/components/panes/Notes", () => ({
  Notes: (props: Props) => {
    data.notesProps = props;
    return null;
  },
  useNoteActions: () => ({}),
  NewNote: (props: Props) => {
    data.newNote = props;
    return <div data-new-note />;
  },
}));
vi.mock("../src/components/panes/LayoutSections", () => ({ LayoutSections: () => <div data-layout /> }));
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
    layout: data.layout as ThreadBundle["layout"],
    layoutSetBy: "offload",
    layoutSuggestion: null,
    layoutChange: null,
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

// 2026-10-31. A new thread had no way to start a to do: Add a note was in the
// More menu and nothing else was. Both are in the menu, and an empty thread
// offers both in the middle of the page.
describe("an empty thread's ways in", () => {
  const press = (label: string) => {
    const button = [...host.querySelectorAll("button")].find((one) => one.textContent === label);
    expect(button, label).toBeDefined();
    act(() => button!.click());
  };

  it("offers Add a to do and Add a note on the page, which open their sections", async () => {
    data.rows = [];
    data.notes = [];
    await open();
    press("Add a to do");
    expect(data.widgets.addingTodo).toBe(true);
    // The page stops offering while one is open, so it does not sit under it.
    expect(host.textContent).not.toContain(EMPTY);
    act(() => (data.widgets.onAddingTodo as (adding: boolean) => void)(false));
    press("Add a note");
    expect(data.notesProps.adding).toBe(true);
  });

  it("puts Add a to do in the More menu beside Add a note", async () => {
    data.rows = [event()];
    data.notes = [];
    await open();
    const more = data.head.more as { label: string; onSelect: () => void }[];
    expect(more.map((item) => item.label)).toEqual(expect.arrayContaining(["Add a to do", "Add a note"]));
    act(() => more.find((item) => item.label === "Add a to do")!.onSelect());
    expect(data.widgets.addingTodo).toBe(true);
  });

  it("does not offer them on a thread that holds something", async () => {
    data.rows = [event({ occursAt: null })];
    data.notes = [];
    await open();
    expect([...host.querySelectorAll("button")].map((one) => one.textContent)).not.toContain("Add a to do");
  });
});

// 2026-10-31. Add a note in the More menu set the open flag and nothing drew
// it on any layout but Default, which is the only one that draws Notes.
describe("Add a note on a layout", () => {
  afterEach(() => {
    data.layout = "default";
    data.newNote = null;
  });

  it("draws a new note's editor above the layout's sections, and closes it", async () => {
    data.layout = "timeline";
    data.rows = [event()];
    data.notes = [];
    await open();
    expect(host.querySelector("[data-layout]")).not.toBeNull();
    expect(host.querySelector("[data-new-note]")).toBeNull();
    const more = data.head.more as { label: string; onSelect: () => void }[];
    expect(more.map((item) => item.label)).not.toContain("Add a to do");
    act(() => more.find((item) => item.label === "Add a note")!.onSelect());
    expect(host.querySelector("[data-new-note]")).not.toBeNull();
    act(() => (data.newNote!.onClose as () => void)());
    expect(host.querySelector("[data-new-note]")).toBeNull();
  });
});
