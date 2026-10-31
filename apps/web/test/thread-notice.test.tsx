// @vitest-environment happy-dom
//
// The thread notice (2026-10-31): one strip for what a thread tells you.
// offload's layout suggestion in moss, a member's switch in ink, each with one
// word to act on and an x, and the switch's Undo in the strip's place.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRow, Note, ThreadBundle } from "../src/lib/threads";

const data = vi.hoisted(() => ({
  rows: [] as unknown[],
  archive: true,
  toasts: [] as string[],
  suggestion: null as string | null,
  change: null as unknown,
  edits: [] as unknown[],
  dismissed: [] as string[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../src/components/shell/threads-context", () => ({ useThreads: () => ({ filed: null }), useChanged: () => undefined }));
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
// The head carries Edit thread, so its lead is drawn.
vi.mock("../src/components/shell/PaneHead", () => ({ PaneHead: ({ lead, title }: { lead: React.ReactNode; title: React.ReactNode }) => <>{lead}{title}</> }));
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
    layout: "default",
    layoutSetBy: "offload",
    layoutSuggestion: data.suggestion as ThreadBundle["layoutSuggestion"],
    layoutChange: data.change as ThreadBundle["layoutChange"],
    icon: "plane",
    hue: 3,
    iconSetBy: "offload",
    alwaysOn: false,
    isDefault: false,
    hasPoint: false,
    counts: { active: data.rows.length, archived: 0, unlabelled: data.rows.length },
    members: [{ accountId: "a2", displayName: "Sam", initials: "SK", isYou: false }],
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
  editThread: async (_id: string, change: { layout?: string }) => {
    data.edits.push(change);
    data.suggestion = null;
    const mark = { name: "Busan trip", icon: "plane", hue: 3, iconSetBy: "offload" };
    return {
      thread: { ...mark, id: "t1" },
      previous: mark,
      layout: { previous: { layout: "default", layoutSetBy: "offload" }, made: [], dropped: [] },
    };
  },
  dismissLayoutSuggestion: async (id: string) => {
    data.dismissed.push(id);
    return true;
  },
  markLayoutSeen: async () => true,
  setArchived: async (id: string) => {
    if (!data.archive) return false;
    data.rows = data.rows.filter((row) => (row as ContentRow).id !== id);
    return true;
  },
}));

const { Thread } = await import("../src/components/panes/Thread");
const { undoStore } = await import("../src/lib/undo");

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  Object.assign(data, { rows: [], toasts: [], suggestion: null, change: null, edits: [], dismissed: [] });
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

const open = () => act(async () => root.render(<Thread id="t1" onChanged={() => undefined} />));
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const button = (label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const press = (label: string) => act(async () => button(label)!.click());
const notice = () => host.querySelector("[data-notice]");
/** The x lets the strip leave first; happy-dom runs no animation, so its end is sent. */
const left = () => act(async () => void notice()!.dispatchEvent(new Event("animationend", { bubbles: true })));

const readCss = () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/components/panes/ThreadNotice.module.css"), "utf8");
const css = readCss;

describe("the strip's type", () => {
  it("grows with the large text setting, as every other label does", async () => {
    const css = readCss();
    expect(css.match(/calc\(16px \* var\(--type-scale\)\)/g)).toHaveLength(2);
    expect(css).not.toMatch(/ 16px\//);
  });

  // Three, not the handoff's two: at 375 three of the five suggestions need a third line.
  it("clamps at three lines, and not at all with Larger text", () => {
    expect(css()).toMatch(/-webkit-line-clamp: 3;/);
    expect(css()).toMatch(/:root\[data-type="large"\] \.message \{\s*-webkit-line-clamp: none;/);
  });
});

describe("the thread notice", () => {
  it("AC-1 draws offload's suggestion as the moss strip, naming the layout, with Switch", async () => {
    data.suggestion = "events";
    await open();
    expect(notice()?.getAttribute("data-notice")).toBe("offload");
    expect(notice()?.textContent).toContain("Looks like a trip or event, switch to the Events layout?");
    expect(button("Switch this thread to the Events layout")?.textContent).toBe("Switch");
    expect(button("Dismiss suggestion")).not.toBeNull();
  });

  it("AC-2 switches, and says where to change it later with Undo, in the strip's place", async () => {
    data.suggestion = "events";
    await open();
    await press("Switch this thread to the Events layout");
    await settle();
    expect(data.edits).toEqual([{ layout: "events" }]);
    expect(notice()).toBeNull();
    const line = host.querySelector("[role=status]");
    expect(line?.textContent).toContain("Showing as Events. You can always change this in thread settings.");
    expect(line?.textContent).toContain("Undo");
    expect(undoStore.entries().get("thread:t1")?.wrap).toBe(true);
  });

  it("AC-3 x dismisses it on the server and at once here", async () => {
    data.suggestion = "todo";
    await open();
    // Written at the press, so leaving within the animation cannot lose it.
    await press("Dismiss suggestion");
    expect(data.dismissed).toEqual(["t1"]);
    await left();
    expect(notice()).toBeNull();
  });

  it("AC-4 a member's switch is the ink strip with their face, and Change opens Edit thread at Layout", async () => {
    data.change = { by: { accountId: "a2", displayName: "Sam" }, layout: "events", at: "2026-10-31T10:00:00Z" };
    await open();
    expect(notice()?.getAttribute("data-notice")).toBe("person");
    expect(notice()?.textContent).toContain("Sam switched this to the Events layout");
    expect(notice()?.textContent).toContain("SK");
    // The face is not read: the line already names them.
    expect(notice()?.querySelector('[aria-hidden="true"] [role=img]')).not.toBeNull();
    await press("Change this thread's layout");
    const dialog = host.querySelector('[role=dialog][aria-label="Edit thread"]');
    expect(dialog).not.toBeNull();
    expect(document.activeElement?.closest('[role=radiogroup][aria-label="Layout"]')).not.toBeNull();
    await press("Dismiss");
    await left();
    expect(notice()).toBeNull();
  });

  it("Edit thread's own switch keeps the short line", async () => {
    await open();
    await act(async () => (host.querySelector('button[title="Edit thread"]') as HTMLButtonElement).click());
    await act(async () => (host.querySelector('[role=radio][aria-label="Events"]') as HTMLButtonElement).click());
    await act(async () => ([...host.querySelectorAll("button")].find((one) => one.textContent === "Save") as HTMLButtonElement).click());
    await settle();
    expect(undoStore.entries().get("thread:t1")).toMatchObject({ message: "Showing as Events" });
    expect(undoStore.entries().get("thread:t1")?.wrap).toBeUndefined();
  });
});
