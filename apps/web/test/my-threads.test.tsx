// @vitest-environment happy-dom
//
// 2026-10-29. My threads as a grid: one tile per thread in the person's order
// (AC-1, AC-2), Not in a thread as one row above it, the order chip, the
// keyboard move with its announcement (AC-8), and the tile's menu (AC-7).

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const puts: unknown[] = [];
let refuse = false;
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (init?.method === "PATCH" && String(url).endsWith("/v1/threads/order")) {
    puts.push(JSON.parse(String(init.body)));
    return new Response(null, { status: refuse ? 500 : 204 });
  }
  return new Response("{}", { status: 200 });
});

const { MyThreads } = await import("../src/components/panes/MyThreads");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { undoStore } = await import("../src/lib/undo");
const { useUnplaced } = await import("../src/components/shell/InPlace");
const { UndoLine } = await import("../src/components/shell/UndoLine");

/** The composer's plate, where an Undo with no place on screen is drawn. */
function Plate() {
  return (
    <>
      {useUnplaced().map((entry) => (
        <UndoLine key={entry.id} entry={entry} />
      ))}
    </>
  );
}
type Group = import("../src/lib/threads").ThreadGroup;
type Order = import("../src/lib/threads").ThreadOrder;
type Summary = import("../src/lib/loose").LooseSummary;

const thread = (id: string, name: string, day: number) => ({
  id,
  name,
  icon: "plane",
  hue: 2,
  count: 3,
  meta: "3 to do",
  isDefault: false,
  others: [] as string[],
  faces: [],
  createdAt: `2026-10-0${day}T10:00:00.000Z`,
});
// Newest made first: Lisbon, Dentist, Berlin.
const groups: Group[] = [{ key: "now", threads: [thread("t3", "Lisbon trip", 3), thread("t2", "Dentist", 2), thread("t1", "Berlin", 1)] }];
const NEWEST: Order = { sort: "newest", ids: [] };
const loose: Summary = { count: 14, byType: { link: 14 }, rows: [] };

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  puts.length = 0;
  refuse = false;
  router.push.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

async function draw(props: { groups?: Group[]; loose?: Summary | null; order?: Order } = {}) {
  await act(async () =>
    root.render(
      <ToastProvider>
        <MyThreads groups={props.groups ?? groups} loose={props.loose ?? null} order={props.order ?? NEWEST} loading={false} onChanged={() => undefined} />
        <ToastHost />
        <Plate />
      </ToastProvider>,
    ),
  );
}
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const tiles = () => [...host.querySelectorAll<HTMLButtonElement>("[data-tile]")];
const names = () => tiles().map((tile) => tile.getAttribute("aria-label")!.split(",")[0]);
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((one) => one.textContent?.trim() === text || one.getAttribute("aria-label") === text) as HTMLButtonElement;
const key = (el: Element, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
const tileOf = (name: string) => tiles().find((tile) => tile.getAttribute("aria-label")!.startsWith(name))!;

describe("the grid (AC-1, AC-2)", () => {
  it("draws a tile per thread, newest made first, named with its line", async () => {
    await draw();
    expect(names()).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
    expect(tiles()[0]!.getAttribute("aria-label")).toBe("Lisbon trip, 3 to do");
    expect(tiles()[0]!.style.getPropertyValue("--ground")).toBe("var(--thread-ground-2)");
    expect(host.querySelector("h2")).toBeNull();
  });

  it("draws the person's own order, with a thread not in it first", async () => {
    await draw({ order: { sort: "mine", ids: ["t1", "t3"] } });
    expect(names()).toEqual(["Dentist", "Berlin", "Lisbon trip"]);
    expect(button("Your order")).toBeTruthy();
  });

  it("opens a thread on a click", async () => {
    await draw();
    await act(async () => tiles()[1]!.click());
    expect(router.push).toHaveBeenCalledWith("/threads/t2?from=threads");
  });

  it("draws Not in a thread as one row above the grid, and not when nothing is", async () => {
    await draw({ loose });
    const row = host.querySelector("a[href='/threads/loose']")!;
    expect(row.textContent).toContain("Not in a thread");
    expect(row.textContent).toContain("14");
    expect(row.compareDocumentPosition(tiles()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await draw({ loose: null });
    expect(host.querySelector("a[href='/threads/loose']")).toBeNull();
  });

  it("draws the empty state with no threads and nothing loose", async () => {
    await draw({ groups: [] });
    expect(host.textContent).toContain("Threads appear here on their own");
  });
});

describe("the order chip", () => {
  it("offers Your order only once there is one", async () => {
    await draw();
    await act(async () => button("Newest first").click());
    expect(host.textContent).toContain("Drag a thread to put it where you want it. New threads still start at the top.");
    expect((host.querySelector("[role=menuitemradio][aria-checked=false]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("switches to newest first without sending the list", async () => {
    await draw({ order: { sort: "mine", ids: ["t1", "t2", "t3"] } });
    expect(names()).toEqual(["Berlin", "Dentist", "Lisbon trip"]);
    await act(async () => button("Your order").click());
    await act(async () => (host.querySelector("[role=menuitemradio][aria-checked=false]") as HTMLButtonElement).click());
    await settle();
    expect(puts).toEqual([{ sort: "newest" }]);
    expect(names()).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
  });
});

describe("moving by keyboard (AC-8)", () => {
  it("picks up with Space, moves with the arrows, says where, and drops with Space", async () => {
    await draw();
    await key(tileOf("Lisbon trip"), " ");
    await key(tileOf("Lisbon trip"), "ArrowRight");
    expect(names()).toEqual(["Dentist", "Lisbon trip", "Berlin"]);
    expect(host.querySelector("[aria-live=polite]")!.textContent).toBe("Moved to 2 of 3");
    expect(puts).toEqual([]);
    await key(tileOf("Lisbon trip"), " ");
    await settle();
    expect(puts).toEqual([{ sort: "mine", ids: ["t2", "t3", "t1"] }]);
    expect(names()).toEqual(["Dentist", "Lisbon trip", "Berlin"]);
    expect(button("Your order")).toBeTruthy();
    expect(host.textContent).toContain("Showing your order");
  });

  it("puts it back with Escape", async () => {
    await draw();
    await key(tileOf("Lisbon trip"), " ");
    await key(tileOf("Lisbon trip"), "ArrowRight");
    await key(tileOf("Lisbon trip"), "Escape");
    expect(names()).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
    expect(puts).toEqual([]);
  });

  it("puts the order back when Undo is pressed", async () => {
    await draw();
    await key(tileOf("Lisbon trip"), " ");
    await key(tileOf("Lisbon trip"), "ArrowRight");
    await key(tileOf("Lisbon trip"), " ");
    await settle();
    await act(async () => button("Undo").click());
    await settle();
    expect(names()).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
    expect(puts.at(-1)).toEqual({ sort: "newest", ids: [] });
  });

  it("puts the order back when the write is refused", async () => {
    refuse = true;
    await draw();
    await key(tileOf("Lisbon trip"), " ");
    await key(tileOf("Lisbon trip"), "ArrowRight");
    await key(tileOf("Lisbon trip"), " ");
    await settle();
    expect(names()).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
    expect(host.textContent).toContain("Couldn't keep that order");
  });
});

// 2026-11-17: the owner could not tell tiles apart. The name leads, large, the
// glyph is large at the foot with the people, and the back glyph is gone.
describe("the tile's text and glyph", () => {
  const css = (file: string) => readFileSync(join(process.cwd(), "src/components", file), "utf8");
  const crowd = { ...thread("t9", "Kitchen renovation with the builders", 4), meta: "9 · Tuesday · with Ana, Tom, Sam, Lea, Jo", faces: ["AN", "TO", "SA", "LE", "JO"].map((initials, i) => ({ accountId: `a${i}`, initials })) };

  it("leads with the name and its line, then the people and the glyph at the foot, and no back glyph", async () => {
    await draw({ groups: [{ key: "now", threads: [crowd] }] });
    const tile = tiles()[0]!;
    const [text, foot] = [...tile.children] as HTMLElement[];
    expect(tile.children).toHaveLength(2);
    expect(text!.textContent).toBe("Kitchen renovation with the builders9 · Tuesday · with Ana, Tom, Sam, Lea, Jo");
    expect(foot!.textContent).toBe("ANTO+3");
    expect(foot!.lastElementChild!.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("scales the name and glyph with the tile, clamps the name to two lines and the line to one, and lets the text give way", () => {
    const tile = css("ThreadTile.module.css");
    expect(tile).toMatch(/\.tile \{[^}]*container-type: inline-size/);
    expect(tile).toMatch(/\.name \{[^}]*-webkit-line-clamp: 2[^}]*\}/);
    expect(tile).toMatch(/\.name \{[^}]*font-size: calc\(clamp\(17px, 10cqi, var\(--size-title-1\)\) \* var\(--type-scale\)\)/);
    expect(tile).toMatch(/\.name \{[^}]*hyphens: auto/);
    expect(tile).toMatch(/\.meta \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
    expect(tile).toMatch(/\.glyph \{[^}]*width: clamp\(30px, 22cqi, 60px\);\s*height: clamp\(30px, 22cqi, 60px\)/);
    // The line wraps into a hidden second column, whole, rather than being cut.
    expect(tile).toMatch(/\.text \{[^}]*flex-wrap: wrap[^}]*flex: 1[^}]*min-height: 0[^}]*overflow: hidden/);
    expect(tile).toMatch(/\.text > \* \{\s*flex-shrink: 0;\s*width: 100%;/);
  });

  it("takes fewer columns before a tile is too short for two lines, its line and the glyph", () => {
    const page = css("panes/MyThreads.module.css");
    expect(page).toMatch(/@container \(max-width: 760px\) \{\s*\.grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(page).toMatch(/@container \(max-width: 420px\) \{\s*\.grid \{\s*grid-template-columns: minmax\(0, 1fr\)/);
  });
});

describe("the tile on a touch screen and the chip's target", () => {
  const css = (file: string) => readFileSync(join(process.cwd(), "src/components", file), "utf8");
  it("lets a finger scroll the grid from a tile, and says the tile has a menu", async () => {
    expect(css("ThreadTile.module.css")).toContain("touch-action: pan-y");
    await draw();
    expect(tiles()[0]!.getAttribute("aria-haspopup")).toBe("menu");
  });
  it("puts the chip at the row's end, with a target as tall as a finger needs", () => {
    const page = css("panes/MyThreads.module.css");
    expect(page).toMatch(/\.chipWrap \{[^}]*margin-left: auto/);
    expect(page).toMatch(/\.chip::after \{[^}]*inset: -6px 0/);
  });
});

describe("the others making room", () => {
  // happy-dom lays nothing out: a cell's place is its index, and a box read
  // from the screen moves on every read, as a scrolled or animating one does.
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const saved = ["offsetLeft", "offsetTop", "getBoundingClientRect", "animate"].map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key) ?? Object.getOwnPropertyDescriptor(Element.prototype, key)] as const);
  let slid: string[] = [];
  let drift = 0;
  beforeEach(() => {
    slid = [];
    const place = (el: HTMLElement) => [...(el.parentElement?.children ?? [])].indexOf(el);
    Object.defineProperty(proto, "offsetLeft", { configurable: true, get(this: HTMLElement) { return place(this) * 100; } });
    Object.defineProperty(proto, "offsetTop", { configurable: true, get() { return 0; } });
    Object.defineProperty(proto, "getBoundingClientRect", { configurable: true, value() { drift += 7; return { left: drift, top: drift, width: 100, height: 60, right: 0, bottom: 0, x: 0, y: 0 }; } });
    Object.defineProperty(proto, "animate", { configurable: true, value(this: HTMLElement) { slid.push(this.textContent ?? ""); return { cancel() {} }; } });
  });
  afterEach(() => {
    for (const [key, was] of saved) if (was) Object.defineProperty(proto, key, was);
    else delete proto[key];
  });

  it("does not slide anything while nothing has moved, however the boxes read", async () => {
    await draw();
    await key(tileOf("Lisbon trip"), " ");
    await draw();
    expect(slid).toEqual([]);
  });

  it("slides the tiles whose places changed when the order does", async () => {
    await draw();
    await key(tileOf("Lisbon trip"), " ");
    await key(tileOf("Lisbon trip"), "ArrowRight");
    expect(slid.length).toBe(2);
    expect(slid.join()).toContain("Lisbon trip");
    expect(slid.join()).toContain("Dentist");
  });
});

describe("the card under the pointer", () => {
  // The tile's own sheet sets position: relative at the same specificity, and
  // which sheet wins depends on the bundle's order: on prod the card sat in
  // the flow, pushed off by its own left and top.
  it("is fixed to the window by its own style, whatever order the sheets load in", async () => {
    await draw();
    const tile = tileOf("Lisbon trip");
    const pointer = (type: string, x: number) =>
      act(async () => void tile.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: 10 })));
    await pointer("pointerdown", 10);
    await pointer("pointermove", 60);
    const card = host.querySelector<HTMLElement>('button[aria-hidden="true"][data-lifted]');
    expect(card).not.toBeNull();
    expect(card!.style.position).toBe("fixed");
  });
});

describe("the page's top", () => {
  it("leaves room under the title before what comes first", () => {
    const sheet = readFileSync(join(process.cwd(), "src/components/panes/MyThreads.module.css"), "utf8");
    expect(sheet).toMatch(/\.body \{[^}]*padding-top: var\(--space-6\)/);
    expect(readFileSync(join(process.cwd(), "src/components/panes/MyThreads.tsx"), "utf8")).toMatch(/styles\.paneBody\} \$\{page\.wide\} \$\{page\.body\}/);
  });
});

describe("the tile's menu (AC-7)", () => {
  const menu = () => [...host.querySelectorAll("[role=menuitem]")].map((one) => one.textContent);
  it("opens on a right click with Edit thread, Share and Delete thread", async () => {
    await draw();
    await act(async () => void tiles()[0]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(menu()).toEqual(["Edit thread", "Share", "Delete thread"]);
  });

  it("says Leave thread on a shared thread", async () => {
    await draw({ groups: [{ key: "now", threads: [{ ...thread("t9", "Flat admin", 4), others: ["Sam Reed"] }] }] });
    await act(async () => void tiles()[0]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(menu()).toEqual(["Edit thread", "Share", "Leave thread"]);
  });
});
