// @vitest-environment happy-dom
//
// 028 T4.2. My threads: two groups and no Always on (AC-1), the default thread
// in neither and no disabled delete for it (AC-2), the subtitle counting
// threads only, and the Not in a thread group between the two lists, with the
// neutral count, not drawn when there is nothing in it (AC-6).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 }), { status: 200 }));

const { MyThreads } = await import("../src/components/panes/MyThreads");
const { ToastProvider } = await import("../src/components/shell/Toast");
type Summary = import("../src/lib/loose").LooseSummary;
type Group = import("../src/lib/threads").ThreadGroup;

const thread = (id: string, name: string) => ({ id, name, icon: "lasso", hue: 1, count: 3, meta: "3 to do", isDefault: false });
const groups: Group[] = [
  { key: "now", threads: [thread("t1", "Lisbon trip"), thread("t2", "Flat admin")] },
  { key: "older", threads: [thread("t3", "Berlin, March")] },
];

const row = (id: string, title: string, type = "link") => ({
  kind: "content" as const,
  row: {
    id,
    type,
    title,
    body: null,
    url: null,
    imageUrl: null,
    photo: null,
    createdAt: "2026-09-28T10:00:00Z",
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
  },
  suggestion: null,
});

const loose: Summary = {
  count: 14,
  byType: { link: 9, photo: 5 },
  rows: [row("c1", "Miso aubergine, a recipe"), row("c2", "Hotels near Alfama"), row("c3", "Boiler service receipt", "image")],
};

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

async function draw(props: { groups: Group[]; loose: Summary | null }) {
  await act(async () =>
    root.render(
      <ToastProvider>
        <MyThreads groups={props.groups} loose={props.loose} loading={false} />
      </ToastProvider>,
    ),
  );
}

const headings = () => [...host.querySelectorAll("h2")].map((h) => h.textContent);

describe("028 My threads", () => {
  it("draws Not in a thread between the first list and Older threads, with a neutral count", async () => {
    await draw({ groups, loose });
    expect(headings()).toEqual(["Not in a thread14", "Older threads1"]);
    expect(host.textContent).not.toContain("Always on");
    const count = host.querySelectorAll("h2")[0]!.querySelector("em")!;
    expect(count.getAttribute("data-tone")).toBe("neutral");

    const text = host.textContent!;
    const flat = text.indexOf("Flat admin");
    const loose_ = text.indexOf("Miso aubergine, a recipe");
    const berlin = text.indexOf("Berlin, March");
    expect(flat).toBeLessThan(loose_);
    expect(loose_).toBeLessThan(berlin);
  });

  it("counts threads only in the subtitle", async () => {
    await draw({ groups, loose });
    expect(host.querySelector("p")!.textContent).toBe("3 in here, 2 live");
  });

  it("has no disabled delete and never says default thread", async () => {
    // Even from a server that still marks one: the branch is gone.
    const marked: Group[] = [{ key: "now", threads: [{ ...thread("t9", "Anything"), isDefault: true }] }];
    await draw({ groups: marked, loose });
    const deletes = [...host.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label")?.startsWith("Delete"));
    expect(deletes.length).toBeGreaterThan(0);
    expect(deletes.every((b) => !b.disabled)).toBe(true);
    expect(host.innerHTML).not.toMatch(/default thread/i);
  });

  it("draws no group when there is nothing in it", async () => {
    await draw({ groups, loose: null });
    expect(headings()).toEqual(["Older threads1"]);
  });

  it("draws the group, not the empty state, with no threads and things not in one", async () => {
    await draw({ groups: [], loose });
    expect(host.textContent).not.toContain("Threads appear here on their own");
    expect(headings()[0]).toBe("Not in a thread14");
  });

  it("draws the empty state with no threads and nothing loose", async () => {
    await draw({ groups: [], loose: null });
    expect(host.textContent).toContain("Threads appear here on their own");
  });
});
