// @vitest-environment happy-dom
//
// 052 T4.0, T4.2, T4.5. A turn's reply drawn from its record: slices, the Also
// line, pills, the source line and the undo line, in that order, every word
// from code (AC-23).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const fetched: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  fetched.push(String(url));
  if (String(url).endsWith("/v1/content/c9"))
    return new Response(JSON.stringify({ id: "c9", title: "Dentist", place: { id: "p1", lat: 51.5, lng: -0.12, approximate: false } }), { status: 200 });
  return new Response("{}", { status: 404 });
});

const { ReplyParts } = await import("../src/components/shell/ReplyParts");
const { AnswerResult } = await import("../src/components/shell/AnswerResult");
type Parts = import("../src/lib/dump").Parts;
type Slice = import("../src/lib/dump").Slice;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  fetched.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const row = (contentId: string, title: string, extra: Record<string, unknown> = {}) => ({
  contentId,
  threadId: "th1",
  threadName: "Groceries",
  type: "task",
  title,
  body: null,
  done: false,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  allDay: false,
  rrule: null,
  photo: null,
  ...extra,
});
const groceries = { id: "th1", name: "Groceries", icon: "shopping-cart", hue: 2 };
const list = (extra: Record<string, unknown> = {}): Slice =>
  ({
    kind: "list",
    thread: groceries,
    openCount: 6,
    rows: [row("c0", "Coffee beans"), row("c1", "Milk"), row("c2", "Eggs")],
    marked: ["c1", "c2"],
    notes: [],
    previous: {},
    truncated: false,
    ...extra,
  }) as Slice;
const parts = (extra: Partial<Parts> = {}): Parts => ({
  slices: [list()],
  also: [],
  pills: [],
  summary: { kind: "new", count: 2 },
  resultAt: new Date().toISOString(),
  ...extra,
});

const noop = () => undefined;
const open = { open: true, since: Date.now() };
async function draw(node: React.ReactNode) {
  await act(async () => root.render(node));
}
const reply = (p: Parts, more: Record<string, unknown> = {}) => (
  <ReplyParts turnId="t1" parts={p} undo={open} onUndo={noop} onAsk={noop} onPill={async () => true} {...more} />
);
const partsOrder = () => [...host.querySelectorAll("[data-part]")].map((one) => one.getAttribute("data-part"));
const buttons = () => [...host.querySelectorAll("button")].map((one) => one.textContent);

describe("the order of a reply's parts", () => {
  it("is slices, the Also line, pills, the source line, then the undo line", async () => {
    await draw(
      reply(
        parts({
          also: [{ id: "th4", name: "Bookshelf", icon: "book-open", hue: 3 }],
          pills: [{ kind: "date", rowId: "c1" }],
        }),
        { sources: [{ domain: "timeanddate.com", url: "https://www.timeanddate.com/x" }] },
      ),
    );
    expect(partsOrder()).toEqual(["slice", "also", "pills", "sources", "undo"]);
  });

  it("draws only its slices and its undo line for a plain filing turn, with no Done", async () => {
    await draw(reply(parts()));
    expect(partsOrder()).toEqual(["slice", "undo"]);
    expect(host.textContent).not.toContain("Done");
  });

  it("draws at most three slices", async () => {
    const four = ["a", "b", "c", "d"].map((id) => list({ thread: { ...groceries, id } }));
    await draw(reply(parts({ slices: four })));
    expect(partsOrder().filter((one) => one === "slice")).toHaveLength(3);
  });
});

describe("a list slice (T4.0)", () => {
  it("is headed by the thread's icon, its name and its open count, linking to the thread", async () => {
    await draw(reply(parts()));
    const head = host.querySelector('a[href="/threads/th1"]')!;
    expect(head.textContent).toBe("Groceries6");
  });

  it("draws no count at zero", async () => {
    await draw(reply(parts({ slices: [list({ openCount: 0 })] })));
    expect(host.querySelector('a[href="/threads/th1"]')!.textContent).toBe("Groceries");
  });

  it("heads rows in no thread Not in a thread, linking to that page", async () => {
    await draw(reply(parts({ slices: [list({ thread: { id: "td", name: null, icon: null, hue: null } })] })));
    expect(host.querySelector('a[href="/threads/loose"]')!.textContent).toContain("Not in a thread");
  });

  it("marks the turn's rows when the result arrived live, and none on a load", async () => {
    await draw(reply(parts(), { live: true }));
    const marked = () => [...host.querySelectorAll("[data-marked]")].map((one) => one.textContent);
    expect(marked()).toEqual(["Milk", "Eggs"]);
    await draw(reply(parts(), { live: false }));
    expect(marked()).toEqual([]);
  });

  it("keeps rows tickable", async () => {
    const ticked: string[] = [];
    await draw(reply(parts(), { onToggle: (r: { contentId: string }) => ticked.push(r.contentId) }));
    const box = host.querySelector('[role="checkbox"][aria-label="Milk, Groceries"]') as HTMLButtonElement;
    await act(async () => box.click());
    expect(ticked).toEqual(["c1"]);
  });

  it("draws the turn's notes under Notes", async () => {
    await draw(reply(parts({ slices: [list({ notes: [{ id: "n1", text: "Oat milk only", marked: true }] })] })));
    const notes = host.querySelector("[data-notes]")!;
    expect(notes.textContent).toBe("NotesOat milk only");
  });

  it("is AnswerResult itself, with count, marked and notes", async () => {
    await draw(
      <AnswerResult
        result={{ threadId: "th1", threadName: "Groceries", threadIcon: "shopping-cart", threadHue: 2, truncated: false, rows: [row("c1", "Milk")] }}
        count={0}
        marked={new Set(["c1"])}
        notes={[{ id: "n1", text: "Oat milk only", marked: false }]}
      />,
    );
    expect(host.querySelector('a[href="/threads/th1"]')!.textContent).toBe("Groceries");
    expect(host.querySelector("[data-marked]")!.textContent).toBe("Milk");
    expect(host.querySelector("[data-notes]")!.textContent).toContain("Oat milk only");
  });
});

describe("the other slices", () => {
  it("draws a new thread as its inside under New thread, the rows marked", async () => {
    const porto = { id: "th7", name: "Porto", icon: "plane", hue: 4 };
    await draw(
      reply(
        parts({
          slices: [{ kind: "newThread", thread: porto, rows: [row("c5", "Book flights", { threadId: "th7", threadName: "Porto" })], notes: [{ id: "n2", text: "March, with Ana", marked: true }] }],
          summary: { kind: "started", count: 1 },
        }),
        { live: true },
      ),
    );
    const head = host.querySelector('a[href="/threads/th7"]')!;
    expect(head.textContent).toBe("New threadPorto");
    expect([...host.querySelectorAll("[data-marked]")].map((one) => one.textContent)).toEqual(["Book flights", "March, with Ana"]);
    expect(host.textContent).toContain("Started");
  });

  it("draws a remember as the kind's group, linking to Memories, the new one marked", async () => {
    await draw(
      reply(
        parts({
          slices: [{ kind: "memories", memoryKind: "people", memories: [{ id: "m1", text: "Meera is allergic to cashews", marked: true }] }],
          summary: { kind: "remembered", count: 1 },
        }),
        { live: true },
      ),
    );
    expect(host.querySelector('a[href="/memories"]')!.textContent).toContain("Memories, People");
    expect(host.querySelector("[data-marked]")!.textContent).toBe("Meera is allergic to cashews");
    expect(host.textContent).toContain("Remembered");
  });

  it("reads Since removed for a slice with nothing left in it", async () => {
    await draw(reply(parts({ slices: [{ kind: "removed" }] })));
    expect(host.querySelector('[data-part="slice"]')!.textContent).toBe("Since removed");
  });

  it("names the threads past the third as links, after Also in", async () => {
    await draw(reply(parts({ also: [{ id: "th4", name: "Bookshelf", icon: "book-open", hue: 3 }, { id: "th5", name: "Flat admin", icon: "house", hue: 1 }] })));
    const also = host.querySelector('[data-part="also"]')!;
    expect(also.textContent).toBe("Also in Bookshelf, Flat admin");
    expect([...also.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/threads/th4", "/threads/th5"]);
  });
});

describe("pills (T4.2, T4.5)", () => {
  const calendar = { kind: "calendar" as const, rowId: "c1", calendar: { id: "k1", name: "Personal", colour: "rgb(121, 134, 203)" } };

  it("draws at most two, worded by code, each in a 44 target", async () => {
    await draw(reply(parts({ pills: [{ kind: "date", rowId: "c1" }, calendar, { kind: "remind", rowId: "c1" }] })));
    const pills = [...host.querySelectorAll('[data-part="pills"] button')];
    expect(pills.map((one) => one.textContent)).toEqual(["Add a date", "Add to Personal"]);
  });

  it("hands a tap to the composer with the pill, and the pill goes once it worked", async () => {
    const tapped: string[] = [];
    await draw(reply(parts({ pills: [calendar] }), { onPill: async (pill: { kind: string }) => (tapped.push(pill.kind), true) }));
    const pill = [...host.querySelectorAll('[data-part="pills"] button')][0] as HTMLButtonElement;
    await act(async () => pill.click());
    expect(tapped).toEqual(["calendar"]);
    expect(host.querySelector('[data-part="pills"]')).toBeNull();
  });

  it("opens directions as a link to the row's place", async () => {
    await draw(reply(parts({ pills: [{ kind: "directions", rowId: "c9" }] })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const link = host.querySelector('[data-part="pills"] a')!;
    expect(link.textContent).toBe("Directions");
    expect(link.getAttribute("href")).toContain("destination=51.5%2C-0.12");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("the source line (AC-22)", () => {
  const sources = ["a.com", "b.com", "c.com", "d.com", "e.com"].map((domain) => ({ domain, url: `https://${domain}/page` }));

  it("draws three domains as external links, then the rest as a count, and no source as a pill", async () => {
    await draw(reply(parts({ pills: [] }), { sources }));
    const line = host.querySelector('[data-part="sources"]')!;
    expect([...line.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["a.com", "b.com", "c.com"]);
    expect([...line.querySelectorAll("a")].every((a) => a.getAttribute("target") === "_blank")).toBe(true);
    expect(line.textContent).toContain("and 2 more");
    expect(host.querySelector('[data-part="pills"]')).toBeNull();
  });
});

describe("the undo line", () => {
  it("says what the turn did in the record's words, with Undo and the clock in the first eight seconds", async () => {
    await draw(reply(parts()));
    const line = host.querySelector('[data-part="undo"]')!;
    expect(line.textContent).toBe("2 newUndo");
    expect(line.querySelector("[data-clock]")).not.toBeNull();
  });

  it("keeps Undo without the clock after eight seconds", async () => {
    await draw(reply(parts(), { undo: { open: true, since: Date.now() - 9_000 } }));
    const line = host.querySelector('[data-part="undo"]')!;
    expect(line.textContent).toBe("2 newUndo");
    expect(line.querySelector("[data-clock]")).toBeNull();
  });

  it("calls Undo on the press", async () => {
    const pressed: string[] = [];
    await draw(reply(parts(), { onUndo: () => pressed.push("undo") }));
    await act(async () => (host.querySelector('[data-part="undo"] button') as HTMLButtonElement).click());
    expect(pressed).toEqual(["undo"]);
  });

  it("keeps the summary alone once retired", async () => {
    await draw(reply(parts(), { undo: { open: false, since: 0 } }));
    expect(host.querySelector('[data-part="undo"]')!.textContent).toBe("2 new");
  });

  it("draws the failure with Retry", async () => {
    await draw(reply(parts(), { undo: { open: true, since: 0, failed: true } }));
    const line = host.querySelector('[data-part="undo"]')!;
    expect(line.getAttribute("role") ?? line.querySelector("[role]")?.getAttribute("role")).toBe("alert");
    expect(line.textContent).toBe("Couldn't put that backRetry");
  });

  it("folds the slices to one line after a late Undo, naming what changed since", async () => {
    await draw(reply(parts({ pills: [{ kind: "date", rowId: "c1" }] }), { undo: { open: true, since: 0, undone: "Undone, except Pay rent, which changed since" } }));
    expect(partsOrder()).toEqual(["undone"]);
    expect(host.textContent).toBe("Undone, except Pay rent, which changed since");
  });

  it("asks first when a late Undo would take an event off a calendar others see", async () => {
    const answers: boolean[] = [];
    await draw(reply(parts(), { undo: { open: true, since: 0, ask: "Ana will be told." }, onAsk: (yes: boolean) => answers.push(yes) }));
    expect(host.querySelector('[data-part="undo"]')!.textContent).toContain("Ana will be told.");
    const yes = [...host.querySelectorAll("button")].find((one) => one.textContent === "Remove it")!;
    await act(async () => yes.click());
    expect(answers).toEqual([true]);
  });

  it("is not drawn for a turn that wrote nothing", async () => {
    await draw(reply(parts({ summary: null })));
    expect(host.querySelector('[data-part="undo"]')).toBeNull();
    expect(buttons()).not.toContain("Undo");
  });
});
