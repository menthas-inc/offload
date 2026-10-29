// @vitest-environment happy-dom
//
// 048 P3. Memories, People, Activity and Not in a thread read themselves again
// on a change they show, at most once every two seconds, and not on a change
// they do not show. A live read draws no spinner and never empties the screen
// while it reads.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changes } from "@offload/widgets";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const memories = {
  full: false,
  rulesFull: false,
  kinds: [],
  memories: [
    {
      id: "m1",
      kind: "people",
      text: "Their wife is Meera.",
      origin: "stated",
      createdAt: "2026-10-20T10:00:00Z",
      updatedAt: "2026-10-20T10:00:00Z",
      changed: false,
      source: { type: "message", thread: null },
      place: null,
    },
  ],
};
const people = { requestsForYou: [], connections: [], pending: [], blocked: [], count: 0 };
const activity = { rows: [], next: null };
const loose = { rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 };

const reads: string[] = [];
/** A read held open, to look at the screen while it is out. */
let hold: Promise<void> | null = null;
/** A path whose read fails. */
let failing: string | null = null;
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  if ((init?.method ?? "GET") !== "GET") return json({ ok: true });
  reads.push(path);
  if (hold) await hold;
  if (path === failing) return new Response("{}", { status: 502 });
  if (path === "/v1/memories") return json(memories);
  if (path === "/v1/people") return json(people);
  if (path === "/v1/activity") return json(activity);
  if (path === "/v1/loose") return json(loose);
  return json({});
});

const { ThreadsProvider } = await import("../src/components/shell/threads-context");
const { MemoriesPane } = await import("../src/components/panes/Memories");
const { PeoplePane } = await import("../src/components/panes/People");
const { ActivityPane } = await import("../src/components/panes/Activity");
const { LoosePane } = await import("../src/components/loose/LoosePane");
const { ToastProvider } = await import("../src/components/shell/Toast");

let root: Root;
let host: HTMLElement;
let screen: () => React.ReactNode;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  reads.length = 0;
  hold = null;
  failing = null;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
const draw = async (changes: Changes | null) => {
  await act(async () =>
    root.render(
      <ThreadsProvider
        value={{ groups: [], invitations: [], loose: null, ready: true, reload: () => {}, filed: null, turnOut: false, changed: changes && { ...changes, at: Date.now() } }}
      >
        <ToastProvider>{screen()}</ToastProvider>
      </ThreadsProvider>,
    ),
  );
  await settle();
};
const count = (path: string) => reads.filter((one) => one === path).length;

const screens = [
  { name: "Memories", path: "/v1/memories", draw: () => <MemoriesPane />, kinds: ["memories"], not: "people" },
  { name: "People", path: "/v1/people", draw: () => <PeoplePane />, kinds: ["people", "invitation"], not: "memories" },
  { name: "Activity", path: "/v1/activity", draw: () => <ActivityPane />, kinds: ["activity"], not: "thread" },
  { name: "Not in a thread", path: "/v1/loose", draw: () => <LoosePane type={null} />, kinds: ["thread"], not: "memories" },
] as const;

describe.each(screens)("$name", ({ path, draw: drawScreen, kinds, not }) => {
  beforeEach(async () => {
    screen = drawScreen;
    await draw(null);
    reads.length = 0;
  });

  it.each([...kinds, "all"])("reads again on %s", async (kind) => {
    await draw({ kinds: [kind as Changes["kinds"][number]], threads: ["t1"] });
    expect(count(path)).toBe(1);
  });

  it(`does not read again on ${not}`, async () => {
    await draw({ kinds: [not], threads: ["t1"] });
    expect(count(path)).toBe(0);
  });

  it("reads a burst once at once and once at its end", async () => {
    await draw({ kinds: ["all"] });
    await draw({ kinds: ["all"] });
    await draw({ kinds: ["all"] });
    expect(count(path)).toBe(1);
    vi.useRealTimers();
    await act(() => new Promise((resolve) => setTimeout(resolve, 2_100)));
    await settle();
    expect(count(path)).toBe(2);
  });
});

describe("a live read", () => {
  it("keeps the screen drawn while it is out", async () => {
    screen = () => <MemoriesPane />;
    await draw(null);
    expect(host.textContent).toContain("Meera");
    let release!: () => void;
    hold = new Promise((resolve) => (release = resolve));
    await draw({ kinds: ["memories"] });
    expect(count("/v1/memories")).toBe(2);
    expect(host.textContent).toContain("Meera");
    expect(host.querySelector('[role="status"][aria-label="loading"]')).toBeNull();
    hold = null;
    release();
    await settle();
  });
});

describe("a live read that fails", () => {
  it("keeps Not in a thread as drawn, with no failure in its place", async () => {
    screen = () => <LoosePane type={null} />;
    await draw(null);
    const before = host.textContent;
    failing = "/v1/loose";
    await draw({ kinds: ["thread"], threads: ["t1"] });
    expect(count("/v1/loose")).toBe(2);
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(host.textContent).toBe(before);
  });
});
