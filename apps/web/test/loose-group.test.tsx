// @vitest-environment happy-dom
//
// 028 T4.3. The Not in a thread group and everything on its rows: the chips
// (AC-7, AC-8), the rows with the thread page's hover tools (AC-9 to AC-11),
// the suggestions and their faces (AC-16, AC-18, AC-23 to AC-25), and the
// create modal (AC-20 to AC-22).
//
// Tuesday 29 September 2026 in Lisbon. Only `Date` is faked.

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
vi.mock("../src/lib/clock", async (actual) => ({
  ...(await actual<typeof import("../src/lib/clock")>()),
  deviceZone: () => "Europe/Lisbon",
}));

// ------------------------------------------------------------------ the server

interface Call {
  method: string;
  path: string;
  body: unknown;
}
let calls: Call[] = [];
let overrides: Record<string, (call: Call) => Response> = {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const row = (id: string, title: string, type = "link", extra: Record<string, unknown> = {}) => ({
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
  labels: ["lb1"],
  place: null,
  location: null,
  placeId: null,
  seriesRef: null,
  allDay: false,
  author: { accountId: "a1", displayName: "Jo", isYou: true },
  canDelete: true,
  canMove: true,
  filingAt: null,
  ...extra,
});

const note = (id: string, text: string) => ({
  id,
  labels: [],
  text,
  body: null,
  origin: "stated",
  authorId: "a1",
  authorIsMember: true,
  muted: false,
  occursAt: null,
  occursEndAt: null,
  dueAt: null,
  placeId: null,
  priority: 50,
  allDay: false,
  rrule: null,
  writtenAt: "2026-09-26T10:00:00Z",
  createdAt: "2026-09-26T10:00:00Z",
  supersededAt: null,
});

const moveTo = (name: string, faces: { accountId: string; initials: string; displayName: string }[] = [], more = 0) => ({
  id: "s1",
  kind: "move",
  thread: { id: "t1", name },
  faces,
  more,
});
const create = { id: "s2", kind: "create", proposal: { id: "p1", name: "Kitchen shelves", count: 3 } };

type Summary = import("../src/lib/loose").LooseSummary;
const summary = (over: Partial<Summary> = {}): Summary =>
  ({
    count: 14,
    byType: { todo: 3, link: 5, photo: 3, note: 3 },
    rows: [
      { kind: "note", note: note("n1", "Oak brackets, 30cm, matte black"), suggestion: create },
      { kind: "content", row: row("c1", "Boiler service receipt", "image"), suggestion: moveTo("Flat admin") },
      { kind: "content", row: row("c2", "Miso aubergine, a recipe"), suggestion: null },
    ],
    ...over,
  }) as Summary;

const links = [
  { kind: "content", row: row("l1", "Miso aubergine, a recipe"), suggestion: null },
  { kind: "content", row: row("l2", "Hotels near Alfama"), suggestion: moveTo("Lisbon trip") },
  { kind: "content", row: row("l3", "Wall plugs for plasterboard"), suggestion: null },
  { kind: "content", row: row("l4", "A podcast on sleep"), suggestion: null },
];

const proposal = {
  id: "p1",
  name: "Kitchen shelves",
  entries: [
    { kind: "note", note: note("n1", "Oak brackets, 30cm, matte black"), suggestion: null },
    { kind: "content", row: row("c7", "Wall plugs for plasterboard"), suggestion: null },
    { kind: "content", row: row("c8", "Photo of the alcove", "image"), suggestion: null },
  ],
};

function serve(call: Call): Response {
  const override = overrides[`${call.method} ${call.path.split("?")[0]}`];
  if (override) return override(call);
  if (call.path.startsWith("/v1/loose?type=link")) return json({ rows: links, nextCursor: null, count: 5, byType: summary().byType, archived: 0 });
  if (call.path === "/v1/threads")
    return json({
      groups: [{ key: "now", threads: [{ id: "t1", name: "Lisbon trip", icon: null, count: 2, meta: "", isDefault: false }] }],
      loose: null,
      invitations: [],
    });
  if (call.path === "/v1/proposals/p1") return json(proposal);
  if (call.path === "/v1/proposals/p1/create") return json({ thread: { id: "t9", name: (call.body as { name: string }).name } });
  if (call.path === "/v1/suggestions/s1/accept") return json({ thread: { id: "t1", name: "Flat admin" } });
  if (call.path === "/v1/content/c1/move") return json({ content: row("c1", "x"), previous: { threadId: "tdefault" } });
  if (call.path.startsWith("/v1/content/") && call.method === "DELETE") return json({ deleted: true });
  return json({ ok: true });
}

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const parsed = new URL(url);
  const call = { method: init?.method ?? "GET", path: parsed.pathname + parsed.search, body: init?.body ? JSON.parse(String(init.body)) : undefined };
  calls.push(call);
  return serve(call);
});

const { LooseGroup } = await import("../src/components/loose/LooseGroup");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { undoStore } = await import("../src/lib/undo");

// ------------------------------------------------------------------ the page

let root: Root;
let host: HTMLElement;
const changed = vi.fn();
const settle = async (times = 4) => {
  for (let i = 0; i < times; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T09:30:00Z"));
  calls = [];
  overrides = {};
  router.push.mockClear();
  changed.mockClear();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

async function draw(value: Summary = summary()) {
  await act(async () =>
    root.render(
      <ToastProvider>
        <LooseGroup summary={value} onChanged={changed} />
        <ToastHost />
      </ToastProvider>,
    ),
  );
}

const buttons = () => [...document.querySelectorAll("button")];
const named = (name: string) => buttons().find((one) => one.getAttribute("aria-label") === name || one.textContent === name);
const click = async (element: Element | undefined) => {
  expect(element).toBeTruthy();
  await act(async () => (element as HTMLElement).click());
  await settle();
};
const said = () => document.body.textContent ?? "";
const of = (path: string) => calls.filter((call) => call.path === path);

describe("the chips (AC-7, AC-8)", () => {
  it("are a group named Filter by type: All first, then the types present, each with its count", async () => {
    await draw();
    const group = host.querySelector('[role="group"][aria-label="Filter by type"]')!;
    expect(group).not.toBeNull();
    const chips = [...group.querySelectorAll("button")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["All 14", "To-dos 3", "Links 5", "Photos 3", "Notes 3"]);
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false"]);
  });

  it("are not drawn with one type", async () => {
    await draw(summary({ count: 5, byType: { link: 5 } }));
    expect(host.querySelector('[aria-label="Filter by type"]')).toBeNull();
  });

  it("filter in place to three from the first page of that type, and the link names it", async () => {
    await draw();
    const all = host.querySelector('a[href="/threads/loose?from=threads"]')!;
    expect(all.textContent).toBe("All 14");
    await click(buttons().find((b) => b.textContent === "Links 5"));
    expect(of("/v1/loose?type=link")).toHaveLength(1);
    expect(said()).toContain("Hotels near Alfama");
    expect(said()).toContain("Wall plugs for plasterboard");
    expect(said()).not.toContain("A podcast on sleep");
    expect(said()).not.toContain("Boiler service receipt");
    const link = host.querySelector('a[href="/threads/loose?from=threads&type=link"]')!;
    expect(link.textContent).toBe("All 5 links");
  });

  it("draws no link when the list holds three or fewer", async () => {
    await draw(summary({ count: 3 }));
    expect(host.querySelector('a[href^="/threads/loose"]')).toBeNull();
  });

  it("falls back to All when the picked type empties", async () => {
    await draw();
    await click(buttons().find((b) => b.textContent === "Links 5"));
    await draw(summary({ byType: { todo: 3, photo: 3, note: 3 }, count: 9 }));
    await settle();
    const chips = [...host.querySelector('[aria-label="Filter by type"]')!.querySelectorAll("button")];
    expect(chips[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(said()).toContain("Boiler service receipt");
  });
});

describe("the rows (AC-9 to AC-11)", () => {
  it("draw the tile and the title, with no meta line, no thread and no labels (2026-10-05)", async () => {
    await draw();
    expect(said()).not.toContain("Photo · ");
    expect(said()).not.toContain("Note · ");
    expect([...host.querySelectorAll("button")].some((one) => one.textContent === "Miso aubergine, a recipe")).toBe(true);
    expect(host.querySelector('a[href^="/content/"]')).toBeNull();
    expect(host.querySelector('a[href^="/threads/t"]')).toBeNull();
    expect(host.querySelector('[aria-label^="Label "]')).toBeNull();
  });

  it("draw a to-do's checkbox, and ticking it takes the row out with Undo (2026-10-05)", async () => {
    const todo = { kind: "content", row: row("c3", "Book the boiler service", "task"), suggestion: null };
    await draw(summary({ rows: [todo, ...summary().rows.slice(1)] as Summary["rows"] }));
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"][aria-label="Finish Book the boiler service"]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(false);
    await click(box!);
    expect(of("/v1/content/c3/complete").map((c) => c.body)).toEqual([{ done: true }]);
    expect(said()).not.toContain("Book the boiler service");
    expect(said()).toContain("Ticked off");
    await click(named("Undo"));
    expect(of("/v1/content/c3/complete").map((c) => c.body)).toEqual([{ done: true }, { done: false }]);
    expect(said()).toContain("Book the boiler service");
  });

  it("draw a ticked to-do's line in its slot, and nothing floats (2026-10-18)", async () => {
    const todo = { kind: "content", row: row("c3", "Book the boiler service", "task"), suggestion: null };
    await draw(summary({ rows: [todo, ...summary().rows.slice(1)] as Summary["rows"] }));
    await click(host.querySelector('input[aria-label="Finish Book the boiler service"]')!);
    const drawn = [...host.querySelectorAll("[data-row], [role=status]")];
    expect(drawn[0]?.getAttribute("role")).toBe("status");
    expect(drawn[0]?.textContent).toBe("Ticked offUndo");
    expect(host.querySelectorAll("[role=status]")).toHaveLength(1);
  });

  it("delete with the thread page's question and the eight-second Undo", async () => {
    await draw();
    await click(named("Delete Miso aubergine, a recipe"));
    await click(buttons().find((b) => b.textContent === "Delete"));
    expect(of("/v1/content/c2").map((c) => c.method)).toEqual(["DELETE"]);
    expect(said()).not.toContain("Miso aubergine");
    expect(said()).toContain("Deleted, gone in a moment");
    await click(named("Undo"));
    expect(of("/v1/content/c2/restore")).toHaveLength(1);
    expect(said()).toContain("Miso aubergine");
  });

  it("move from the edit modal, saying where, with Undo", async () => {
    await draw();
    await click(named("Edit Boiler service receipt"));
    await click(named("Move"));
    const sheet = document.querySelector('[aria-label="Move to a thread"]')!;
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent?.includes("Lisbon trip")));
    expect(of("/v1/content/c1/move").map((c) => c.body)).toEqual([{ threadId: "t1" }]);
    expect(said()).not.toContain("Boiler service receipt");
    expect(said()).toContain("Moved to Lisbon trip");
    await click(named("Undo"));
    expect(of("/v1/content/c1/move").map((c) => c.body)).toEqual([{ threadId: "t1" }, { threadId: "tdefault" }]);
  });

  it("open a note in the thread page's editor, with Move", async () => {
    await draw();
    await click(buttons().find((b) => b.textContent?.startsWith("Oak brackets")));
    expect(host.querySelector("textarea")!.value).toBe("Oak brackets, 30cm, matte black");
    expect(host.querySelector("textarea")!.placeholder).toBe("What is worth remembering?");
    expect(named("Move")).toBeTruthy();
  });

  it("say a note is already in the thread with nothing to try again", async () => {
    overrides["POST /v1/notes/n1/move"] = () => json({ error: "duplicate" }, 409);
    await draw();
    await click(buttons().find((b) => b.textContent?.startsWith("Oak brackets")));
    await click(named("Move"));
    const sheet = document.querySelector('[aria-label="Move to a thread"]')!;
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent?.includes("Lisbon trip")));
    expect(said()).toContain("That's already in Lisbon trip");
    expect(said()).toContain("Oak brackets");
    const toast = [...document.querySelectorAll('[role="status"], [role="alert"]')].find((one) =>
      one.textContent?.includes("That's already in"),
    )!;
    expect(toast.querySelector("button")).toBeNull();
  });
});

describe("the suggestions (AC-16, AC-18, AC-23 to AC-25)", () => {
  it("are one button named for the action, the name inside hidden, and a cross", async () => {
    await draw();
    const move = named("Move Boiler service receipt to Flat admin")!;
    expect(move.textContent).toContain("Move to");
    expect(move.textContent).toContain("Flat admin");
    expect([...move.querySelectorAll('[aria-hidden="true"]')].some((one) => one.textContent?.includes("Flat admin"))).toBe(true);
    expect(move.querySelector("a")).toBeNull();
    const make = named("Create Kitchen shelves and move 3 into it")!;
    expect(make.getAttribute("data-kind")).toBe("create");
    expect(make.textContent).toContain("new thread");
    expect(buttons().filter((b) => b.getAttribute("aria-label") === "Dismiss suggestion")).toHaveLength(2);
  });

  it("draw faces only for a shared thread, two and then a count", async () => {
    const shared = summary({
      rows: [
        {
          kind: "content",
          row: row("c1", "Boiler service receipt", "image"),
          suggestion: moveTo("Flat admin", [
            { accountId: "p1", initials: "SM", displayName: "Sam" },
            { accountId: "p2", initials: "AD", displayName: "Ana" },
          ], 2),
        },
      ] as Summary["rows"],
    });
    await draw(shared);
    const move = named("Move Boiler service receipt to Flat admin")!;
    expect(move.textContent).toContain("SM");
    expect(move.textContent).toContain("AD");
    expect(move.textContent).toContain("+2");
    await draw();
    expect(named("Move Boiler service receipt to Flat admin")!.textContent).not.toContain("+");
  });

  it("say who will see it when the thread is shared, in the phones' words", async () => {
    const shared = summary({
      rows: [
        {
          kind: "content",
          row: row("c1", "Boiler service receipt", "image"),
          suggestion: moveTo("Flat admin", [
            { accountId: "p1", initials: "SM", displayName: "Sam" },
            { accountId: "p2", initials: "AD", displayName: "Ana" },
          ], 2),
        },
      ] as Summary["rows"],
    });
    await draw(shared);
    const move = named("Move Boiler service receipt to Flat admin")!;
    const hint = document.getElementById(move.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Shared with Sam, Ana and 2 more");
    await draw();
    expect(named("Move Boiler service receipt to Flat admin")!.hasAttribute("aria-describedby")).toBe(false);
  });

  it("draw 32 high in a 44 target, the pill inside the button rather than the button", async () => {
    await draw();
    const move = named("Move Boiler service receipt to Flat admin")!;
    expect(move.children).toHaveLength(1);
    expect(move.firstElementChild!.textContent).toContain("Move to");
    const css = readFileSync(join(process.cwd(), "src/components/loose/loose.module.css"), "utf8");
    const body = (selector: string) => css.match(new RegExp(`(?:^|\\n)\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(body(".suggestHit")).toMatch(/min-height:\s*44px/);
    expect(body(".suggestHit")).not.toMatch(/background:\s*var/);
    expect(body(".suggest")).toMatch(/min-height:\s*32px/);
  });

  it("move at once on Move to, and Undo brings the row back with its suggestion", async () => {
    await draw();
    await click(named("Move Boiler service receipt to Flat admin"));
    expect(of("/v1/suggestions/s1/accept")).toHaveLength(1);
    expect(said()).not.toContain("Boiler service receipt");
    expect(said()).toContain("Moved to Flat admin");
    await click(named("Undo"));
    expect(of("/v1/suggestions/s1/undo")).toHaveLength(1);
    expect(named("Move Boiler service receipt to Flat admin")).toBeTruthy();
  });

  it("put the row back and say so when Move to is refused", async () => {
    overrides["POST /v1/suggestions/s1/accept"] = () => json({ error: "not_found" }, 404);
    await draw();
    await click(named("Move Boiler service receipt to Flat admin"));
    expect(said()).toContain("Couldn't move that");
    expect(named("Move Boiler service receipt to Flat admin")).toBeTruthy();
    // 028's failures offer Try again, and a failure interrupts.
    const toast = document.querySelector('[role="alert"]')!;
    expect(toast.textContent).toContain("Couldn't move that");
    expect(toast.querySelector("button")!.textContent).toBe("Try again");
  });

  it("go at once on the cross, with no toast, and come back when that is refused", async () => {
    await draw();
    const cross = buttons().filter((b) => b.getAttribute("aria-label") === "Dismiss suggestion")[1];
    await click(cross);
    expect(of("/v1/suggestions/s1").map((c) => c.method)).toEqual(["DELETE"]);
    expect(named("Move Boiler service receipt to Flat admin")).toBeUndefined();
    expect(host.parentElement!.querySelector('[role="status"]')).toBeNull();

    overrides["DELETE /v1/suggestions/s2"] = () => json({ error: "not_found" }, 404);
    await click(buttons().filter((b) => b.getAttribute("aria-label") === "Dismiss suggestion")[0]);
    expect(said()).toContain("Couldn't dismiss that");
    expect(named("Create Kitchen shelves and move 3 into it")).toBeTruthy();
  });
});

describe("the create modal (AC-20 to AC-22, AC-25)", () => {
  async function openCreate() {
    await draw();
    await click(named("Create Kitchen shelves and move 3 into it"));
    return document.querySelector('[role="dialog"]') as HTMLElement;
  }
  const field = () => document.querySelector('[role="dialog"] input[aria-label="Name"]') as HTMLInputElement;
  const type = async (value: string) => {
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(field(), value);
      field().dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const createButton = () => buttons().find((b) => b.textContent === "Create thread" || b.textContent === "Try again")!;
  const ticks = () => [...document.querySelectorAll('[role="dialog"] [role="checkbox"]')] as HTMLButtonElement[];

  it("says how many in words, prefills the name and ticks everything", async () => {
    const dialog = await openCreate();
    expect(of("/v1/proposals/p1")).toHaveLength(1);
    expect(dialog.textContent).toContain("Create a thread");
    expect(dialog.textContent).toContain("These three look like they belong together.");
    expect(dialog.textContent).toContain("Moves into it");
    expect(field().value).toBe("Kitchen shelves");
    expect(ticks().map((t) => t.getAttribute("aria-checked"))).toEqual(["true", "true", "true"]);
  });

  it("will not untick the last thing", async () => {
    await openCreate();
    await click(ticks()[0]);
    await click(ticks()[1]);
    expect(ticks().map((t) => t.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    expect(ticks()[2]!.disabled).toBe(true);
  });

  it("disables Create thread for an empty or over-long name", async () => {
    await openCreate();
    await type("   ");
    expect(createButton().disabled).toBe(true);
    await type("x".repeat(61));
    expect(createButton().disabled).toBe(true);
    await type("Shelves");
    expect(createButton().disabled).toBe(false);
  });

  it("says when the name is over 60, under the field", async () => {
    await openCreate();
    expect(said()).not.toContain("A name is 60 characters at most.");
    await type("x".repeat(61));
    expect(said()).toContain("A name is 60 characters at most.");
    await type(` ${"x".repeat(60)} `);
    expect(said()).not.toContain("A name is 60 characters at most.");
  });

  it("heads Moves into it with the kit's semibold section heading, 21 high", () => {
    const css = readFileSync(join(process.cwd(), "src/components/loose/loose.module.css"), "utf8");
    const moves = css.match(/\n\.moves\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(moves).toMatch(/font:\s*var\(--weight-semibold\)\s*calc\(21px/);
  });

  it("creates with what is ticked, opens the thread, and Undo lands on My threads", async () => {
    await openCreate();
    await click(ticks()[1]);
    await type("Shelves");
    await click(createButton());
    expect(of("/v1/proposals/p1/create").map((c) => c.body)).toEqual([{ name: "Shelves", contentIds: ["c8"], noteIds: ["n1"] }]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(router.push).toHaveBeenCalledWith("/threads/t9?from=threads");
    expect(said()).toContain("Created Shelves");
    await click(named("Undo"));
    expect(of("/v1/proposals/p1/undo")).toHaveLength(1);
    expect(router.push).toHaveBeenLastCalledWith("/threads");
  });

  it("says Couldn't undo that once the thread has changed", async () => {
    overrides["POST /v1/proposals/p1/undo"] = () => json({ error: "changed" }, 409);
    await openCreate();
    await click(createButton());
    await click(named("Undo"));
    expect(said()).toContain("Couldn't undo that");
    expect(router.push).toHaveBeenLastCalledWith("/threads/t9?from=threads");
  });

  it("stays open with what was typed when create is refused", async () => {
    overrides["POST /v1/proposals/p1/create"] = () => json({ error: "not_found" }, 404);
    await openCreate();
    await type("Shelves");
    await click(createButton());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(field().value).toBe("Shelves");
    expect(said()).toContain("Couldn't create that");
    expect(createButton().textContent).toBe("Try again");
    expect(router.push).not.toHaveBeenCalled();
  });
});
