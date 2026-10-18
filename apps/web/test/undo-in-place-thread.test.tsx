// @vitest-environment happy-dom
//
// Undo in place (2026-10-18), on a thread: a row that leaves keeps its slot
// with the line in it, a row that changed carries its line under it, and a
// refused write puts the row back with its failure under it. Nothing floats.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRow, Note, ThreadBundle } from "../src/lib/threads";

const data = vi.hoisted(() => ({ rows: [] as unknown[], archive: true, toasts: [] as string[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../src/components/shell/threads-context", () => ({ useThreads: () => ({ filed: null }) }));
// The real toast's rule: a word with a place is drawn in place, anything else
// is the toast, counted here.
vi.mock("../src/components/shell/Toast", async () => {
  const { undoStore } = await import("../src/lib/undo");
  return {
    useToast: () => ({
      show: (message: string, action?: { label: string; onPress: () => void }, place?: { id: string; icon: string; form: "slot" | "under" | "plate" }) =>
        place ? undoStore.put(place, message, action) : data.toasts.push(message),
    }),
  };
});
vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-07" }) }));
vi.mock("../src/components/shell/PaneHead", () => ({ PaneHead: () => null }));
vi.mock("../src/components/panes/Timeline", () => ({ Timeline: () => null }));
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
    notes: [],
    noteCounts: { active: 0, folded: 0 },
    line: "",
    standing: null,
    shareable: true,
    calendars: null,
  }),
  fetchContent: async () => ({ rows: data.rows, nextCursor: null }),
  setArchived: async (id: string) => {
    if (!data.archive) return false;
    data.rows = data.rows.filter((row) => (row as ContentRow).id !== id);
    return true;
  },
}));

const { Thread } = await import("../src/components/panes/Thread");
const { ContentRowView } = await import("../src/components/panes/ContentRowView");
// Stood in for above so the pane draws its own list alone; the real one here.
const { Notes } = await vi.importActual<typeof import("../src/components/panes/Notes")>("../src/components/panes/Notes");
const { undoStore } = await import("../src/lib/undo");

const row = (id: string, title: string): ContentRow => ({
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
});

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  data.toasts = [];
  data.archive = true;
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const press = (label: string) =>
  act(async () => (host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click());
/** The rows and lines in the order they are drawn, by their words. */
const drawn = () =>
  [...host.querySelectorAll("[data-row], [role=status], [role=alert]")].map((one) =>
    one.matches("[data-row]")
      ? ([...one.querySelectorAll("button, a")].find((title) => title.textContent)?.textContent ?? "")
      : `line: ${one.textContent}`,
  );

describe("a thread's list", () => {
  it("draws an archived row's line in its slot, and no toast", async () => {
    data.rows = [row("r1", "Ferry"), row("r2", "Hotel"), row("r3", "Visa")];
    await act(async () => root.render(<Thread id="t1" onChanged={() => undefined} />));
    await press("Archive Hotel");
    await settle();
    expect(drawn()).toEqual(["Ferry", "line: ArchivedUndo", "Visa"]);
    expect(data.toasts).toEqual([]);
  });

  it("puts a refused row back with its failure under it, as an alert", async () => {
    data.rows = [row("r1", "Ferry"), row("r2", "Hotel")];
    data.archive = false;
    await act(async () => root.render(<Thread id="t1" onChanged={() => undefined} />));
    await press("Archive Hotel");
    await settle();
    expect(drawn()).toEqual(["Ferry", "Hotel", "line: Couldn't archive thatRetry"]);
    expect(host.querySelector("[role=alert]")).not.toBeNull();
  });
});

describe("a row that changed", () => {
  it("carries its line under it, wherever it is drawn", () => {
    act(() => undoStore.put({ id: "r1", icon: "pencil", form: "under" }, "Saved", { label: "Undo", onPress: () => undefined }));
    const handlers = {
      editing: null,
      draft: "",
      asking: null,
      arrived: new Set<string>(),
      onDraft: () => undefined,
      onEdit: () => undefined,
      onSaveTitle: () => undefined,
      onStopEditing: () => undefined,
      onArchive: () => undefined,
      onAsk: () => undefined,
      onDelete: () => undefined,
    };
    act(() => root.render(<ContentRowView row={row("r1", "Ferry")} lead={null} meta={null} handlers={handlers} />));
    expect(drawn()).toEqual(["Ferry", "line: SavedUndo"]);
  });
});

describe("a thread's notes", () => {
  const note = (id: string, text: string): Note =>
    ({
      id,
      text,
      origin: "said",
      muted: false,
      authorId: "a1",
      authorIsMember: true,
      writtenAt: "2026-10-01T09:00:00Z",
      occursAt: null,
      dueAt: null,
      allDay: false,
      priority: 0,
      labels: [],
      reminders: null,
    }) as unknown as Note;

  function Page({ notes }: { notes: Note[] }) {
    return (
      <Notes
        threadId="t1"
        notes={notes}
        counts={{ active: notes.length, folded: 0 }}
        members={[{ accountId: "a1", displayName: "Jun", initials: "J", isYou: true } as never]}
        adding={false}
        onAdding={() => undefined}
        onNotes={() => undefined}
        writes={{ track: (write) => write, idle: () => true }}
      />
    );
  }

  it("keeps a deleted note's slot, even when it was the last one", () => {
    act(() => root.render(<Page notes={[note("n1", "Kim is vegetarian")]} />));
    // In one go, as `perform` draws the change and its line.
    act(() => {
      root.render(<Page notes={[]} />);
      undoStore.put({ id: "n1", icon: "trash-2", form: "slot" }, "Note deleted", { label: "Undo", onPress: () => undefined });
    });
    expect(host.querySelector("[role=status]")?.textContent).toBe("Note deletedUndo");
  });

  it("draws a changed note's line under it", () => {
    act(() => root.render(<Page notes={[note("n1", "Kim is vegetarian"), note("n2", "Book by May")]} />));
    act(() => undoStore.put({ id: "n1", icon: "pencil", form: "under" }, "Note changed", { label: "Undo", onPress: () => undefined }));
    const order = [...host.querySelectorAll("[role=status], button")].map((one) => one.textContent);
    expect(order.indexOf("Note changedUndo")).toBe(order.indexOf("Kim is vegetarian") + 1);
  });
});
