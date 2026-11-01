// @vitest-environment happy-dom
//
// 048 W2 on the thread page. A live change reads the page again through
// `load()`, which does not mark, except while a turn of this account is out,
// from this tab or another device: then through `catchUp()`, so the turn's
// rows still take the change mark when they land ahead of the turn settling.
// Taken out of the thread elsewhere, the page leaves for My threads with no
// Undo, and waits for an open editor to close first.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changes } from "@offload/widgets";
import type { ContentRow, ThreadBundle } from "../src/lib/threads";

const data = vi.hoisted(() => ({
  rows: [] as unknown[],
  onNoteEditing: null as ((open: boolean) => void) | null,
  reads: 0,
  toasts: [] as string[],
  deleted: 0,
  archived: null as Promise<boolean> | null,
  /** Which read fails: the bundle, the rows, or neither. */
  failing: null as "bundle" | "rows" | null,
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/threads/t1" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
// Every word said is counted; one with a place is drawn in it, as the real
// toast does.
vi.mock("../src/components/shell/Toast", async () => {
  const { undoStore } = await import("../src/lib/undo");
  return {
    useToast: () => ({
      show: (message: string, action?: { label: string; onPress: () => void }, place?: { id: string; icon: string; form: "slot" | "under" | "plate" }) => {
        data.toasts.push(message);
        if (place) undoStore.put(place, message, action);
      },
    }),
  };
});
vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-07" }) }));
// The head's More menu as plain buttons, and Edit thread as one control that
// closes it: the pane's own state is what is under test.
vi.mock("../src/components/shell/PaneHead", () => ({
  PaneHead: ({ lead, more }: { lead: React.ReactNode; more: { label: string; onSelect: () => void }[] }) => (
    <>
      {lead}
      {more.map((one) => (
        <button key={one.label} type="button" onClick={one.onSelect}>
          {one.label}
        </button>
      ))}
    </>
  ),
}));
vi.mock("../src/components/panes/EditThread", () => ({
  EditThread: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      Close editor
    </button>
  ),
}));
vi.mock("../src/components/panes/Timeline", () => ({ Timeline: () => null }));
vi.mock("../src/components/panes/Widgets", () => ({ Widgets: () => null }));
// Drawn as nothing; its props are kept so a test can open its editor.
vi.mock("../src/components/panes/Notes", () => ({
  useNoteActions: () => ({}),
  Notes: (props: { onEditing?: (open: boolean) => void }) => {
    data.onNoteEditing = props.onEditing ?? null;
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
  fetchThread: async (): Promise<ThreadBundle | null> => data.failing === "bundle" ? null : ({
    id: "t1",
    name: "Busan trip",
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
    counts: { active: data.rows.length, archived: 0, unlabelled: data.rows.length },
    members: [
      { accountId: "a1", displayName: "Jun", initials: "JU", isYou: true },
      { accountId: "a2", displayName: "Sam", initials: "SA", isYou: false },
    ] as never,
    labels: [],
    preference: {},
    notes: [],
    noteCounts: { active: 0, folded: 0 },
    line: "",
    standing: null,
    shareable: true,
    calendars: null,
  }),
  fetchContent: async () => {
    data.reads += 1;
    return data.failing === "rows" ? null : { rows: data.rows, nextCursor: null };
  },
  setArchived: async () => data.archived ?? true,
  deleteThread: async () => {
    data.deleted += 1;
    return { deleted: false };
  },
}));

const { Thread } = await import("../src/components/panes/Thread");
const { ThreadsProvider } = await import("../src/components/shell/threads-context");
const { undoStore } = await import("../src/lib/undo");

const row = (id: string, title: string): ContentRow =>
  ({
    id,
    type: "note",
    title,
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
let turnOut = false;
let changed: (Changes & { at: number }) | null = null;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  data.rows = [row("r1", "Ferry")];
  data.toasts = [];
  data.deleted = 0;
  data.archived = null;
  data.failing = null;
  turnOut = false;
  changed = null;
  router.push.mockClear();
  router.replace.mockClear();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await draw();
  data.reads = 0;
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

const settle = async () => {
  for (let i = 0; i < 4; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
async function draw() {
  await act(async () =>
    root.render(
      <ThreadsProvider value={{ groups: [], invitations: [], loose: null, order: { sort: "newest", ids: [] }, viewerId: null, ready: true, reload: () => {}, filed: null, changed, turnOut }}>
        <Thread id="t1" onChanged={() => undefined} />
      </ThreadsProvider>,
    ),
  );
  await settle();
}
async function hear(changes: Changes) {
  // Each past the last one's two seconds, so the floor reads it at once.
  vi.setSystemTime(Date.now() + 5_000);
  changed = { ...changes, at: Date.now() };
  await draw();
}
const press = async (label: string) => {
  const one = [...document.body.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(one, label).toBeDefined();
  await act(async () => one!.click());
  await settle();
};
const marked = () => [...host.querySelectorAll("[data-arrived]")].length;

describe("a live change on the thread page", () => {
  it("reads again on its own thread, without the mark when no turn is out", async () => {
    data.rows = [row("r1", "Ferry"), row("r2", "Hotel")];
    await hear({ kinds: ["thread"], threads: ["t1"] });
    expect(data.reads).toBe(1);
    expect(host.textContent).toContain("Hotel");
    expect(marked()).toBe(0);
  });

  it("marks what a turn filed when its rows land before it settles", async () => {
    turnOut = true;
    data.rows = [row("r1", "Ferry"), row("r2", "Hotel")];
    await hear({ kinds: ["thread"], threads: ["t1"] });
    expect(host.textContent).toContain("Hotel");
    expect(marked()).toBe(1);
  });

  it("reads again on today and on everything", async () => {
    await hear({ kinds: ["today"] });
    await hear({ kinds: ["all"] });
    expect(data.reads).toBe(2);
  });

  it("does not read again for another thread or a kind it does not show", async () => {
    await hear({ kinds: ["thread"], threads: ["t2"] });
    await hear({ kinds: ["memories"] });
    await hear({ kinds: ["removed"], removed: ["t2"] });
    expect(data.reads).toBe(0);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("a live read that fails", () => {
  it.each(["bundle", "rows"] as const)("keeps the page as drawn when the %s read fails", async (which) => {
    data.failing = which;
    data.rows = [];
    await hear({ kinds: ["thread"], threads: ["t1"] });
    turnOut = true;
    await hear({ kinds: ["thread"], threads: ["t1"] });
    expect(host.textContent).toContain("Ferry");
    expect(host.textContent).toContain("Edit thread");
  });
});

describe("taken out of the thread elsewhere", () => {
  it("does not act on a removal heard before the page opened", async () => {
    act(() => root.unmount());
    changed = { kinds: ["removed"], removed: ["t1"], at: Date.now() };
    root = createRoot(host);
    await draw();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("acts only on a removal, not on an id under another kind", async () => {
    await hear({ kinds: ["thread"], threads: ["t1"], removed: ["t1"] });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("leaves for My threads with no Undo when nothing is open", async () => {
    await hear({ kinds: ["removed"], removed: ["t1"] });
    expect(router.push).toHaveBeenCalledWith("/threads");
    expect(data.toasts).toEqual([]);
  });

  it("waits for an open editor to close, then leaves", async () => {
    await press("Edit thread");
    await hear({ kinds: ["removed"], removed: ["t1"] });
    expect(router.push).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Close editor");
    await press("Close editor");
    expect(router.push).toHaveBeenCalledWith("/threads");
    expect(data.toasts).toEqual([]);
  });

  it("waits for a note being edited, then leaves", async () => {
    expect(data.onNoteEditing).toBeTypeOf("function");
    await act(async () => data.onNoteEditing!(true));
    await hear({ kinds: ["removed"], removed: ["t1"] });
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => data.onNoteEditing!(false));
    await settle();
    expect(router.push).toHaveBeenCalledWith("/threads");
  });

  it("does nothing more when it was left from here", async () => {
    await press("Leave this thread");
    await press("Leave");
    expect(data.deleted).toBe(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(data.toasts).toEqual(["You left the thread"]);
    await hear({ kinds: ["removed"], removed: ["t1"] });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(data.toasts).toEqual(["You left the thread"]);
  });
});

describe("048 P6 a live change while a write is out", () => {
  /** The rows and lines in the order they are drawn, by their words. */
  const drawn = () =>
    [...host.querySelectorAll("[data-row], [role=status]")].map((one) =>
      one.matches("[data-row]")
        ? ([...one.querySelectorAll("button, a")].find((title) => title.textContent)?.textContent ?? "")
        : `line: ${one.textContent}`,
    );

  it("is applied by the read the write runs when it settles, and the Undo line survives it", async () => {
    data.rows = [row("r1", "Ferry"), row("r2", "Hotel")];
    await hear({ kinds: ["all"] });
    let land!: (ok: boolean) => void;
    data.archived = new Promise((resolve) => (land = resolve));
    await act(async () => (host.querySelector('button[aria-label="Archive Hotel"]') as HTMLButtonElement).click());
    // A shared thread asks first.
    await press("Archive");
    expect(drawn()).toEqual(["Ferry", "line: ArchivedUndo"]);

    // Somebody else adds a row while the archive is travelling. The read it
    // causes lands first and is dropped, or it would put Hotel back.
    data.rows = [row("r1", "Ferry"), row("r3", "Visa")];
    const server = data.rows;
    data.rows = [row("r1", "Ferry"), row("r2", "Hotel"), row("r3", "Visa")];
    await hear({ kinds: ["thread"], threads: ["t1"] });
    expect(data.reads).toBeGreaterThan(1);
    expect(drawn()).toEqual(["Ferry", "line: ArchivedUndo"]);

    data.rows = server;
    await act(async () => land(true));
    await settle();
    expect(drawn()).toEqual(["Ferry", "line: ArchivedUndo", "Visa"]);

    // And a catch-up after it keeps the line in its slot.
    await hear({ kinds: ["thread"], threads: ["t1"] });
    expect(drawn()).toEqual(["Ferry", "line: ArchivedUndo", "Visa"]);
  });
});
