// @vitest-environment happy-dom
//
// 052 T4.1, T4.4, T4.5, T4.6. The composer draws a turn's reply from its
// record: no Done mark, no thread pill and no source pill (AC-1); the undo line
// in its two phases, retired by the next dump, with its failure (AC-17, AC-20);
// no plate line for a dump made here (AC-21); pill taps that send the kind and
// nothing else (AC-12 to AC-16); and the partial, cancelled and offline states
// (AC-25).

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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const row = (contentId: string, title: string) => ({
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
});
const groceries = { id: "th1", name: "Groceries", icon: "shopping-cart", hue: 2 };
const list = { kind: "list", thread: groceries, openCount: 4, rows: [row("c0", "Coffee beans"), row("c1", "Milk"), row("c2", "Eggs")], marked: ["c1", "c2"], notes: [], previous: {}, truncated: false };
const parts = (extra: Record<string, unknown> = {}) => ({ slices: [list], also: [], pills: [], summary: { kind: "new", count: 2 }, resultAt: new Date().toISOString(), ...extra });
const filed = (extra: Record<string, unknown> = {}) => ({
  state: "answered",
  reply: null,
  threads: [groceries],
  changed: ["th1"],
  filed: true,
  sources: [{ domain: "a.com", url: "https://a.com/page" }],
  labels: [],
  found: [],
  parts: parts(),
  ...extra,
});

const message = (id: string, role: "person" | "offload", text: string, turnId: string, extra: Record<string, unknown> = {}) => ({
  id,
  role,
  text,
  state: role === "person" ? "seen" : "answered",
  turnId,
  found: [],
  waiting: null,
  threads: [],
  sources: [],
  labels: [],
  ...extra,
});

let tail: ReturnType<typeof message>[];
type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let answers: Record<string, () => Response | Promise<Response>>;
vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null });
  for (const [pattern, answer] of Object.entries(answers)) if (url.includes(pattern)) return answer();
  if (url.endsWith("/v1/conversations/current")) return new Response(JSON.stringify({ conversationId: "v1", messages: tail }), { status: 200 });
  if (url.endsWith("/v1/dumps")) return new Response(JSON.stringify({ messageId: "m2", conversationId: "v1", state: "seen", turnId: "t2" }), { status: 200 });
  return new Response("{}", { status: 404 });
});

const streams: FakeSource[] = [];
class FakeSource {
  static CLOSED = 2;
  readyState = 1;
  listeners = new Map<string, (event: { data: string }) => void>();
  constructor(readonly url: string) {
    streams.push(this);
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.readyState = 2;
  }
}
vi.stubGlobal("EventSource", FakeSource);
class SeenAtOnce {
  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", SeenAtOnce);

const { Composer } = await import("../src/components/shell/Composer");
const { ToastProvider } = await import("../src/components/shell/Toast");
const { undoStore } = await import("../src/lib/undo");
const { forgetReplyReads } = await import("../src/lib/today");

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  tail = [message("m1", "person", "milk and eggs", "t1")];
  calls = [];
  answers = {};
  streams.length = 0;
  forgetReplyReads();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  for (const id of [...undoStore.entries().keys()]) undoStore.drop(id);
});

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));
async function draw() {
  await act(async () =>
    root.render(
      <ToastProvider>
        <Composer onFiled={() => undefined} />
      </ToastProvider>,
    ),
  );
  await settle();
  await settle();
}
async function answered(answer: object = filed()) {
  await draw();
  await act(async () => streams[0]!.listeners.get("done")!({ data: JSON.stringify(answer) }));
  await settle();
  await settle();
}
const button = (text: string) => [...document.body.querySelectorAll("button")].find((one) => one.textContent === text) as HTMLButtonElement | undefined;
const undoLine = () => host.querySelector('[data-part="undo"]');
const press = async (text: string) => {
  await act(async () => button(text)!.click());
  await settle();
  await settle();
};
const posted = (path: string) => calls.filter((one) => one.method === "POST" && one.url.includes(path));

describe("a filing turn (AC-1)", () => {
  it("draws its slices and its undo line, with no Done, no thread pill and no source pill", async () => {
    await answered();
    expect(host.textContent).not.toContain("Done");
    expect(host.querySelector("[data-size]")).toBeNull();
    expect(host.querySelector('a[href="/threads/th1"]')!.textContent).toBe("Groceries4");
    expect(host.querySelector('[data-part="sources"] a')!.textContent).toBe("a.com");
    expect(undoLine()!.textContent).toBe("2 newUndo");
  });

  it("draws the parts after offload's sentence when there is one, and an answer's rows once", async () => {
    await answered(filed({ reply: "Added to Groceries.", found: [{ threadId: "th1", threadName: "Groceries", threadIcon: "x", threadHue: 1, truncated: false, rows: [row("c0", "Coffee beans")] }] }));
    const sentence = [...host.querySelectorAll("*")].find((one) => one.textContent === "Added to Groceries.")!;
    const slice = host.querySelector('[data-part="slice"]')!;
    expect(sentence.compareDocumentPosition(slice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelectorAll('a[href="/threads/th1"]')).toHaveLength(1);
  });

  it("marks the turn's rows when the result arrives live, and none on a load", async () => {
    await answered();
    expect([...host.querySelectorAll("[data-marked]")].map((one) => one.textContent)).toEqual(["Milk", "Eggs"]);
    act(() => root.unmount());
    root = createRoot(host);
    streams.length = 0;
    tail = [message("m1", "person", "milk and eggs", "t1", { state: "answered", parts: parts() })];
    await draw();
    expect(host.querySelector('[data-part="slice"]')).not.toBeNull();
    expect(host.querySelectorAll("[data-marked]")).toHaveLength(0);
  });
});

describe("no plate line for a dump made in the conversation (AC-21)", () => {
  it("offers the turn's Undo on its reply and nowhere else", async () => {
    await answered(filed({ reply: "Added to Groceries." }));
    expect(document.body.textContent).not.toContain("Saved to");
    const undos = [...document.body.querySelectorAll("button")].filter((one) => one.textContent === "Undo");
    expect(undos).toHaveLength(1);
    expect(undoLine()!.contains(undos[0]!)).toBe(true);
  });
});

describe("the undo line (AC-17, AC-20)", () => {
  it("carries the clock for eight seconds, and Undo then takes the whole turn back", async () => {
    answers["/v1/turns/t1/undo"] = () => new Response(JSON.stringify({ undone: true }), { status: 200 });
    await answered();
    expect(undoLine()!.querySelector("[data-clock]")).not.toBeNull();
    await press("Undo");
    expect(posted("/v1/turns/t1/undo").map((one) => one.url)).toEqual([expect.not.stringContaining("confirmed")]);
    expect(host.textContent).not.toContain("milk and eggs");
  });

  it("keeps Undo without the clock after eight seconds, and a late Undo keeps the dump and names what changed since", async () => {
    answers["/v1/turns/t1/undo"] = () => new Response(JSON.stringify({ undone: true, changed: ["Pay rent"] }), { status: 200 });
    await answered();
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(undoLine()!.querySelector("[data-clock]")).toBeNull();
    expect(undoLine()!.textContent).toBe("2 newUndo");
    await press("Undo");
    expect(host.textContent).toContain("milk and eggs");
    expect(host.querySelector('[data-part="slice"]')).toBeNull();
    expect(host.querySelector('[data-part="undone"]')!.textContent).toBe("Undone, except Pay rent, which changed since");
  });

  it("asks first when a late Undo would take an event off a calendar others see", async () => {
    let asked = false;
    answers["/v1/turns/t1/undo"] = () => {
      const first = !asked;
      asked = true;
      return new Response(JSON.stringify(first ? { undone: false, confirm: "Ana will be told." } : { undone: true, changed: [] }), { status: 200 });
    };
    await answered();
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    await press("Undo");
    expect(undoLine()!.textContent).toContain("Ana will be told.");
    await press("Remove it");
    expect(posted("/v1/turns/t1/undo").map((one) => one.url)).toEqual([expect.not.stringContaining("confirmed"), expect.stringContaining("?confirmed=1")]);
    expect(host.querySelector('[data-part="undone"]')!.textContent).toBe("Undone");
  });

  it("puts the turn back with the failure and Retry when the server refuses", async () => {
    answers["/v1/turns/t1/undo"] = () => new Response("{}", { status: 500 });
    await answered();
    await press("Undo");
    expect(host.textContent).toContain("milk and eggs");
    expect(undoLine()!.textContent).toBe("Couldn't put that backRetry");
    expect(document.body.textContent!.split("Couldn't put that back")).toHaveLength(2);
  });

  it("is retired by the next dump, keeping its summary", async () => {
    await answered();
    const field = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "and bread");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (host.querySelector('button[aria-label="Send"]') as HTMLButtonElement).click());
    await settle();
    await settle();
    expect(host.textContent).toContain("and bread");
    expect(undoLine()!.textContent).toBe("2 new");
    expect(button("Undo")).toBeUndefined();
  });
});

describe("pills (AC-12 to AC-16)", () => {
  const calendar = { kind: "calendar", rowId: "c1", calendar: { id: "k1", name: "Personal", colour: "rgb(121, 134, 203)" } };

  it("sends the turn and the kind only, and draws the pill's own Undo under it", async () => {
    answers["/v1/turns/t1/pills"] = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    await answered(filed({ parts: parts({ pills: [calendar] }) }));
    await press("Add to Personal");
    expect(posted("/v1/turns/t1/pills").map((one) => one.body)).toEqual(['{"kind":"calendar"}']);
    const undos = [...document.body.querySelectorAll("button")].filter((one) => one.textContent === "Undo");
    expect(undos).toHaveLength(2);
    await act(async () => undos.find((one) => !undoLine()!.contains(one))!.click());
    await settle();
    expect(posted("/v1/turns/t1/pills").map((one) => one.body)).toEqual(['{"kind":"calendar"}', '{"kind":"calendar","undo":true}']);
  });

  it("switches Remind me on with the kind only", async () => {
    answers["/v1/turns/t1/pills"] = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    await answered(filed({ parts: parts({ pills: [{ kind: "remind", rowId: "c1" }] }) }));
    await press("Remind me");
    expect(posted("/v1/turns/t1/pills").map((one) => one.body)).toEqual(['{"kind":"remind"}']);
  });

  it("shows the pending-write confirm when the calendar asks first", async () => {
    answers["/v1/turns/t1/pills"] = () => new Response(JSON.stringify({ confirm: "Ana will be told.", pendingId: "p1" }), { status: 200 });
    await answered(filed({ parts: parts({ pills: [calendar] }) }));
    await press("Add to Personal");
    expect(host.textContent).toContain("Ana will be told.");
    expect(button("Add it")).toBeDefined();
  });

  it("opens the row's edit modal for Add a date", async () => {
    answers["/v1/content/c1"] = () =>
      new Response(
        JSON.stringify({
          id: "c1",
          type: "task",
          title: "Milk",
          body: null,
          url: null,
          createdAt: "2026-11-17T10:00:00Z",
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
          seriesRef: null,
          allDay: false,
          author: { accountId: "a1", displayName: "You", isYou: true },
          canDelete: true,
          canMove: true,
          filingAt: null,
          threadId: "th1",
          threadName: "Groceries",
          threadIcon: "x",
          threadHue: 1,
        }),
        { status: 200 },
      );
    await answered(filed({ parts: parts({ pills: [{ kind: "date", rowId: "c1" }] }) }));
    await press("Add a date");
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-label")).toBe("Edit");
    expect((dialog.querySelector('input[aria-label="Title"]') as HTMLInputElement).value).toBe("Milk");
  });
});

describe("states (AC-25)", () => {
  it("draws a partial turn's slices beside its partial reply, with no Undo", async () => {
    await answered(filed({ state: "partial", reply: "Added the milk." }));
    expect(host.querySelector('[data-part="slice"]')).not.toBeNull();
    expect(host.textContent).toContain("Didn't finish that one.");
    expect(button("Undo")).toBeUndefined();
  });

  it("draws nothing for a cancelled turn", async () => {
    tail = [message("m1", "person", "milk and eggs", "t1", { state: "cancelled", parts: parts() })];
    await draw();
    expect(host.textContent).toContain("Stopped.");
    expect(host.querySelector("[data-part]")).toBeNull();
  });

  it("draws only the undo line's summary when a reopened reply's calendar cannot be read", async () => {
    answers["/v1/today/"] = () => Promise.reject(new TypeError("offline"));
    const calendarOnly = parts({
      slices: [{ kind: "calendar", period: { from: "2026-11-16", to: "2026-11-29" }, day: "2026-11-20", marked: ["c1"], span: false }],
      summary: { kind: "added", count: 1 },
      resultAt: "2026-11-01T10:00:00Z",
    });
    tail = [message("m1", "person", "dentist friday at 3", "t1", { state: "answered", parts: calendarOnly })];
    await draw();
    await settle();
    expect(host.querySelector('[data-part="slice"]')!.textContent).toBe("");
    expect(undoLine()!.textContent).toBe("AddedUndo");
  });
});
