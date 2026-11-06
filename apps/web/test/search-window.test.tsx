// @vitest-environment happy-dom
//
// 049 W1 to W4. The sidebar's Search and the window it opens.
//
// AC-1   the sidebar reads Today, Threads, Search, Memories, Search with a key.
// AC-4   names held here draw at once, the server's rows follow.
// AC-13  Ask fills the composer, unsent, and closes.
// AC-15  an empty field: recent, removable, then the threads as chips.
// AC-16  a search is kept when a result is opened, Ask runs or Return is pressed.
// AC-17  a failed read keeps the names and says so beside Retry.
// AC-23  ⌘K, Ctrl K and / open it; / typed in a field is typed.
// AC-24  arrows, Return, ⌘Return, Escape; Escape closes nothing under it.
// AC-25  a combobox over a list box of named groups.
// AC-26  recent searches are per account, and sign-out forgets them.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchAnswer } from "@offload/widgets";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/today" }));
vi.mock("../src/lib/clock", () => ({ useClock: () => ({ zone: "UTC", today: "2026-10-30" }) }));

const server = vi.hoisted(() => ({ answer: null as SearchAnswer | null, status: 200, bodies: [] as { q: string; meaning: boolean }[] }));
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (new URL(url).pathname !== "/v1/search") return new Response("{}", { status: 404 });
  server.bodies.push(JSON.parse(String(init?.body)) as { q: string; meaning: boolean });
  return new Response(JSON.stringify(server.answer), { status: server.status });
});

const { SearchWindow } = await import("../src/components/shell/SearchWindow");
const { Sidebar } = await import("../src/components/shell/Sidebar");
const { ThreadsProvider } = await import("../src/components/shell/threads-context");
const { FILL_COMPOSER } = await import("../src/lib/composer-fill");
const { forgetRecent } = await import("../src/lib/search");

const lisbon = { id: "t1", name: "Lisbon trip", icon: "plane", hue: 3, count: 3, meta: "3 to do", isDefault: false };
const paris = { id: "t2", name: "Paris", icon: "lasso", hue: 5, count: 1, meta: "1 link", isDefault: false };
const answer: SearchAnswer = {
  threads: [{ id: "t1", name: "Lisbon trip" }],
  loose: false,
  rows: [{ id: "r1", threadId: "t1", loose: false, type: "event", title: "Flight to Lisbon", dueAt: null, occursAt: null, occursEndAt: null, allDay: false, rrule: null, archived: false }],
  notes: [],
  memories: [{ id: "m1", kind: "about", text: "Lisbon is home" }],
};

let root: Root;
let host: HTMLElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  server.answer = answer;
  server.status = 200;
  server.bodies = [];
  router.push.mockClear();
  window.localStorage.clear();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ThreadsProvider value={{ groups: [{ key: "now", threads: [lisbon, paris] }] as never, invitations: [], loose: null, order: { sort: "newest", ids: [] }, viewerId: "a1", ready: true, reload: () => {}, filed: null, changed: null, turnOut: false }}>
        <textarea data-composer />
        <Sidebar threads={[]} threadCount={0} />
        <SearchWindow />
      </ThreadsProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const field = () => document.querySelector<HTMLInputElement>('[role="combobox"]');
const press = async (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
};
async function type(text: string) {
  const input = field()!;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.getAttribute("aria-label"));

describe("the sidebar", () => {
  it("reads Today, Threads, Search, Memories, with the key on Search", () => {
    const labels = [...document.querySelectorAll("nav [class*=navLabel]")].map((e) => e.textContent);
    expect(labels.slice(0, 4)).toEqual(["Today", "Threads", "Search", "Memories"]);
    expect(document.body.textContent).toMatch(/(⌘|Ctrl )K/);
    expect(document.body.textContent).not.toContain("My threads");
  });

  it("opens the window from its Search", async () => {
    const button = [...document.querySelectorAll("nav button")].find((b) => b.textContent?.includes("Search")) as HTMLButtonElement;
    await act(async () => button.click());
    expect(field()).not.toBeNull();
  });
});

describe("the window", () => {
  it("opens on ⌘K, Ctrl K and /, and / typed in a field stays typed", async () => {
    await press("k", { metaKey: true }, document.body);
    expect(field()).not.toBeNull();
    await press("Escape");
    expect(field()).toBeNull();
    await press("k", { ctrlKey: true }, document.body);
    expect(field()).not.toBeNull();
    await press("Escape");
    await press("/", {}, document.querySelector("[data-composer]")!);
    expect(field()).toBeNull();
    await press("/", {}, document.body);
    expect(field()).not.toBeNull();
  });

  it("draws names held here at once, then the server's groups, as a combobox over a list box", async () => {
    await press("k", { metaKey: true }, document.body);
    await type("lisb");
    expect(options()).toEqual(["Lisbon trip", 'Ask offload about "lisb"']);
    await wait(200);
    expect(server.bodies[0]).toEqual({ q: "lisb", meaning: false });
    expect(options()).toEqual(["Lisbon trip", "Flight to Lisbon, event, in Lisbon trip", "Lisbon is home, memory", 'Ask offload about "lisb"']);
    const groups = [...document.querySelectorAll('[role="listbox"] [role="group"]')];
    expect(groups.slice(0, 3).map((g) => document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Threads", "In your threads", "Memories"]);
    expect(field()!.getAttribute("aria-activedescendant")).toBe("search-thread-t1");
    expect(document.querySelector('[role="option"] b')?.textContent).toBe("Lisb");
    await wait(400);
    expect(server.bodies.at(-1)).toEqual({ q: "lisb", meaning: true });
  });

  it("moves with the arrows, opens with Return at the row, and keeps the search", async () => {
    await press("k", { metaKey: true }, document.body);
    await type("lisb");
    await wait(200);
    await press("ArrowDown");
    await press("Enter");
    expect(router.push).toHaveBeenCalledWith("/threads/t1?row=r1");
    expect(field()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("offload.search.recent.a1")!)).toEqual(["lisb"]);
  });

  it("asks offload with ⌘Return: the words in the composer, unsent, and the window closed", async () => {
    const filled: string[] = [];
    window.addEventListener(FILL_COMPOSER, (event) => filled.push((event as CustomEvent<string>).detail));
    await press("k", { metaKey: true }, document.body);
    await type("lisb ");
    expect(field()!.getAttribute("aria-activedescendant")).toBe("search-thread-t1");
    await press("Enter", { metaKey: true });
    expect(filled).toEqual(["lisb"]);
    expect(router.push).not.toHaveBeenCalled();
    expect(field()).toBeNull();
  });

  it("closes on Escape without reaching what is under it, and gives focus back", async () => {
    const composer = document.querySelector<HTMLTextAreaElement>("[data-composer]")!;
    composer.focus();
    const heard: string[] = [];
    document.addEventListener("keydown", (event) => heard.push(event.key));
    await press("k", { metaKey: true }, composer);
    heard.length = 0;
    await press("Escape");
    expect(field()).toBeNull();
    expect(heard).not.toContain("Escape");
    expect(document.activeElement).toBe(composer);
  });

  it("keeps focus in the field on Tab, and ⌘K again does not lose where focus came from", async () => {
    const composer = document.querySelector<HTMLTextAreaElement>("[data-composer]")!;
    composer.focus();
    await press("k", { metaKey: true }, composer);
    await press("k", { metaKey: true });
    await press("Tab");
    expect(document.activeElement).toBe(field());
    await press("Escape");
    expect(document.activeElement).toBe(composer);
  });

  it("shows recent searches and the threads when empty, and a recent one can go", async () => {
    window.localStorage.setItem("offload.search.recent.a1", JSON.stringify(["wifi password", "lisbon"]));
    window.localStorage.setItem("offload.search.recent.a2", JSON.stringify(["theirs"]));
    await press("k", { metaKey: true }, document.body);
    expect(options()).toEqual(["wifi password", "lisbon", "Lisbon trip", "Paris"]);
    const remove = document.querySelector<HTMLButtonElement>('[aria-label="Remove wifi password"]')!;
    await act(async () => remove.click());
    expect(options()).toEqual(["lisbon", "Lisbon trip", "Paris"]);
    forgetRecent();
    expect(window.localStorage.getItem("offload.search.recent.a1")).toBeNull();
    expect(window.localStorage.getItem("offload.search.recent.a2")).toBeNull();
  });

  it("keeps the names and says so beside Retry when the read fails", async () => {
    server.status = 500;
    await press("k", { metaKey: true }, document.body);
    await type("lisb");
    await wait(200);
    expect(document.body.textContent).toContain("Couldn't search.");
    expect(options()).toEqual(["Lisbon trip", 'Ask offload about "lisb"']);
    server.status = 200;
    const retry = [...document.querySelectorAll("button")].find((b) => b.textContent === "Retry")!;
    await act(async () => retry.click());
    await wait(50);
    expect(document.body.textContent).not.toContain("Couldn't search.");
    expect(options()).toContain("Flight to Lisbon, event, in Lisbon trip");
  });

  it("says when nothing matches, and still offers Ask", async () => {
    server.answer = { threads: [], loose: false, rows: [], notes: [], memories: [] };
    await press("k", { metaKey: true }, document.body);
    await type("zzz");
    await wait(200);
    expect(document.body.textContent).toContain('Nothing matches "zzz".');
    expect(options()).toEqual(['Ask offload about "zzz"']);
  });
});
