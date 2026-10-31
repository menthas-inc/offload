// @vitest-environment happy-dom
//
// 049 W5. The thread page opened from Search, at one row or one note.
//
// AC-8   it reads back to the row, puts it on screen and marks it.
// AC-9   an archived row opens with archived rows shown.
// AC-11  a note is marked and its section kept open.
// AC-12  a row that is not there opens the page as it is, nothing marked.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRow, ThreadBundle } from "../src/lib/threads";

const data = vi.hoisted(() => ({
  rows: [] as unknown[],
  reads: [] as { archived?: boolean; through?: string; labels?: string[] }[],
  notesProps: null as { reveal?: string | null; arrived?: Set<string> } | null,
  widgetsHandlers: null as { reveal?: string | null; arrived: Set<string> } | null,
  scrolled: [] as string[],
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/threads/t1" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../src/components/shell/Toast", () => ({ useToast: () => ({ show: () => undefined }) }));
vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-07" }) }));
vi.mock("../src/components/shell/PaneHead", () => ({ PaneHead: ({ lead }: { lead: React.ReactNode }) => <>{lead}</> }));
vi.mock("../src/components/panes/Timeline", () => ({ Timeline: () => null }));
vi.mock("../src/components/panes/Widgets", () => ({
  Widgets: (props: { handlers: { reveal?: string | null; arrived: Set<string> } }) => {
    data.widgetsHandlers = props.handlers;
    return null;
  },
}));
vi.mock("../src/components/panes/Notes", () => ({
  Notes: (props: { reveal?: string | null; arrived?: Set<string> }) => {
    data.notesProps = props;
    return null;
  },
}));
vi.mock("../src/components/labels/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("../src/components/map/MapFrame", () => ({
  MapFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MapSwitch: () => null,
  useThreadMap: () => ({ layout: "list", points: [], showSwitch: false, selected: null, hovered: null, open: null }),
}));
vi.mock("../src/lib/threads", async (original) => ({
  ...(await original<typeof import("../src/lib/threads")>()),
  fetchThread: async (): Promise<ThreadBundle | null> =>
    ({
      id: "t1",
      name: "Lisbon trip",
      layout: "default",
      layoutSetBy: "offload",
      layoutSuggestion: null,
      layoutChange: null,
      icon: "plane",
      hue: 3,
      iconSetBy: "offload",
      alwaysOn: false,
      isDefault: false,
      hasPoint: false,
      counts: { active: 1, archived: 0, unlabelled: 1 },
      members: [{ accountId: "a1", displayName: "Jun", initials: "JU", isYou: true }] as never,
      labels: [],
      preference: {},
      notes: [] as never,
      noteCounts: { active: 1, folded: 0 },
      line: "",
      standing: null,
      shareable: true,
      calendars: null,
    }) as ThreadBundle,
  fetchContent: async (_id: string, options: { archived?: boolean; through?: string; labels?: string[] }) => {
    data.reads.push(options);
    return { rows: data.rows, nextCursor: null };
  },
}));

const { Thread } = await import("../src/components/panes/Thread");
const { ThreadsProvider } = await import("../src/components/shell/threads-context");

const row = (id: string): ContentRow =>
  ({
    id,
    type: "note",
    title: id,
    body: null,
    url: null,
    imageUrl: null,
    photo: null,
    createdAt: "2026-10-01T09:00:00Z",
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
    author: { accountId: "a1", displayName: "Jun", isYou: true },
    canDelete: true,
    canMove: true,
    filingAt: null,
  }) as ContentRow;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  data.rows = [row("r1"), row("r2")];
  data.reads = [];
  data.notesProps = null;
  data.widgetsHandlers = null;
  data.scrolled = [];
  window.localStorage.setItem("offload.labels.t1", JSON.stringify({ labels: ["l1"], none: false }));
  Element.prototype.scrollIntoView = function (this: Element) {
    data.scrolled.push(this.getAttribute("data-row-id") ?? this.getAttribute("data-note-id") ?? "?");
  };
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  window.localStorage.clear();
});

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
async function open(at?: { row?: string | null; note?: string | null; archived?: boolean }) {
  await act(async () =>
    root.render(
      <ThreadsProvider value={{ groups: [], invitations: [], loose: null, order: { sort: "newest", ids: [] }, viewerId: null, ready: true, reload: () => {}, filed: null, changed: null, turnOut: false }}>
        <Thread id="t1" onChanged={() => undefined} {...(at ? { at: { row: at.row ?? null, note: at.note ?? null, archived: at.archived === true } } : {})} />
      </ThreadsProvider>,
    ),
  );
  await settle();
}

describe("the thread page opened at a row", () => {
  it("reads through the row with no label filter, marks it and reveals it", async () => {
    await open({ row: "r2" });
    expect(data.reads[0]).toMatchObject({ through: "r2" });
    expect(data.reads.every((read) => !read.labels)).toBe(true);
    // The kept pick is left for the next visit.
    expect(JSON.parse(window.localStorage.getItem("offload.labels.t1")!)).toEqual({ labels: ["l1"], none: false });
    expect(data.widgetsHandlers?.reveal).toBe("r2");
    expect(data.widgetsHandlers?.arrived.has("r2")).toBe(true);
  });

  it("opens an archived row with archived rows shown", async () => {
    await open({ row: "r2", archived: true });
    expect(data.reads[0]).toMatchObject({ through: "r2", archived: true });
  });

  it("marks a note and keeps its section open", async () => {
    await open({ note: "n1" });
    expect(data.notesProps?.reveal).toBe("n1");
    expect(data.notesProps?.arrived?.has("n1")).toBe(true);
  });

  it("marks nothing for a row that is not in the read", async () => {
    await open({ row: "gone" });
    expect(data.widgetsHandlers?.arrived.size).toBe(0);
  });

  it("reads as it always has with nothing to open at", async () => {
    await open();
    expect(data.reads[0]?.through).toBeUndefined();
    expect(data.widgetsHandlers?.reveal ?? null).toBeNull();
  });
});

describe("the thread route", () => {
  it("hands ?row=, ?note= and ?archived= to the pane", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(`${process.cwd()}/src/app/(shell)/threads/[id]/page.tsx`, "utf8");
    expect(route).toMatch(/search\.get\(ROW_PARAM\)/);
    expect(route).toMatch(/search\.get\(NOTE_PARAM\)/);
    expect(route).toMatch(/search\.get\(ARCHIVED_PARAM\) === "1"/);
    expect(route).toMatch(/<Thread key=\{`\$\{id\}:/);
  });
});
