// @vitest-environment happy-dom
//
// 048 W4. A dump sent from another device appears in the conversation open on
// this tab, and its answer follows it there: step lines, the writing
// indicator and Done. The turn belongs to the device that sent it, so this tab
// draws no Stop, Finish, Try again or Undo for it, and its own composer is
// untouched. A conversation not on screen is left alone.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changes } from "@offload/widgets";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const message = (id: string, role: "person" | "offload", text: string, turnId: string, extra: Record<string, unknown> = {}) => ({
  id,
  role,
  text,
  state: role === "person" ? "answered" : "answered",
  turnId,
  found: [],
  waiting: null,
  threads: [],
  sources: [],
  labels: [],
  ...extra,
});
const question = { id: "q1", field: "date", text: "Which Friday?", options: [{ label: "This Friday", kind: "value" }], ordinal: 1 };

let tail: ReturnType<typeof message>[];
const resumed: string[] = [];
/** Holds this tab's own send or answer open until released. */
let gate: Promise<void> | null = null;
vi.stubGlobal("fetch", async (url: string) => {
  if (String(url).endsWith("/v1/questions/q1/answer")) {
    if (gate) await gate;
    return new Response(JSON.stringify({ messageId: "m3", conversationId: "v1", state: "seen", turnId: "t3" }), { status: 200 });
  }
  const resume = /\/v1\/dumps\/([^/]+)\/resume$/.exec(String(url));
  if (resume) {
    resumed.push(resume[1]!);
    return new Response(JSON.stringify({ messageId: resume[1], conversationId: "v1", state: "seen", turnId: "t3" }), { status: 200 });
  }
  if (String(url).endsWith("/v1/conversations/current")) return new Response(JSON.stringify({ conversationId: "v1", messages: tail }), { status: 200 });
  if (String(url).endsWith("/v1/dumps")) {
    if (gate) await gate;
    return new Response(JSON.stringify({ messageId: "m9", conversationId: "v1", state: "seen", turnId: "t9" }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
});

const streams: FakeSource[] = [];
class FakeSource {
  static CLOSED = 2;
  readyState = 1;
  url: string;
  listeners = new Map<string, (event: { data: string }) => void>();
  constructor(url: string) {
    this.url = url;
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

const { Composer } = await import("../src/components/shell/Composer");
const { ToastProvider } = await import("../src/components/shell/Toast");
const { ThreadsProvider } = await import("../src/components/shell/threads-context");
const { undoStore } = await import("../src/lib/undo");

let root: Root;
let host: HTMLElement;
let changed: (Changes & { at: number }) | null;
let filed: string[][];
let out: boolean[];
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  tail = [message("m1", "person", "dentist on friday", "t1"), message("r1", "offload", "Filed it in Health.", "t1")];
  streams.length = 0;
  gate = null;
  changed = null;
  filed = [];
  out = [];
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
      <ThreadsProvider value={{ groups: [], invitations: [], loose: null, order: { sort: "newest", ids: [] }, viewerId: null, ready: true, reload: () => {}, filed: null, turnOut: false, changed }}>
        <ToastProvider>
          <Composer onFiled={(ids) => filed.push(ids)} onTurnOut={(now) => out.push(now)} />
        </ToastProvider>
      </ThreadsProvider>,
    ),
  );
  await settle();
  await settle();
}
async function hear(kinds: Changes["kinds"] = ["conversation"]) {
  vi.setSystemTime(Date.now() + 5_000);
  changed = { kinds, at: Date.now() };
  await draw();
}
const buttons = () => [...document.body.querySelectorAll("button")].map((one) => one.textContent);
const answer = (stream: FakeSource, name: "done" | "failed", body: object) =>
  act(async () => stream.listeners.get(name)!({ data: JSON.stringify(body) }));
const typed = (text: string) =>
  act(async () => {
    const field = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("a dump from another device", () => {
  beforeEach(async () => {
    await draw();
    expect(host.textContent).toContain("dentist on friday");
    tail = [...tail, message("m2", "person", "milk and eggs", "t2", { state: "queued" })];
  });

  it("appears in the conversation on screen, and its answer is waited for", async () => {
    await hear();
    expect(host.textContent).toContain("milk and eggs");
    expect(streams.map((one) => one.url)).toEqual([expect.stringMatching(/\/v1\/messages\/m2\/stream$/)]);
    expect(host.textContent).toContain("offload is thinking");
  });

  it("is appended once, however many times the conversation changes", async () => {
    await hear();
    await hear(["all"]);
    expect(host.textContent!.split("milk and eggs")).toHaveLength(2);
    expect(streams).toHaveLength(1);
  });

  it("draws no Stop, however long it takes", async () => {
    tail = tail.map((one) => (one.id === "m2" ? { ...one, state: "seen" } : one));
    await hear();
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(buttons()).not.toContain("Stop");
  });

  it("draws its answer and Done, offers no Undo, and tells the screens what it changed", async () => {
    await hear();
    await answer(streams[0]!, "done", {
      state: "answered",
      reply: "Added to Groceries.",
      threads: [{ id: "th2", name: "Groceries", icon: "cart", hue: 2 }],
      changed: ["th2"],
      sources: [],
      found: [],
    });
    await settle();
    expect(host.textContent).toContain("Added to Groceries.");
    expect(host.textContent).toContain("Done");
    expect(buttons()).not.toContain("Undo");
    expect(filed).toEqual([["th2"]]);
  });

  // Owner, 2026-10-29: a failed or partial turn offers its way forward on
  // every device that draws it, and the one that presses it owns the rest.
  it("offers Try again when it fails and Finish when it stops partway, and a Finish pressed here makes the turn this tab's", async () => {
    tail = [...tail, message("m3", "person", "and bread", "t3", { state: "seen" })];
    await hear();
    await answer(streams[0]!, "failed", {});
    await answer(streams[1]!, "done", { state: "partial", reply: "Added the milk.", threads: [], changed: [], sources: [], found: [] });
    await settle();
    expect(buttons()).toContain("Try again");
    expect(buttons()).toContain("Finish it");

    resumed.length = 0;
    const finishIt = [...document.body.querySelectorAll("button")].find((one) => one.textContent === "Finish it")!;
    await act(async () => finishIt.click());
    await settle();
    expect(resumed).toEqual(["m3"]);
    // Its own now: an answer that filed something offers Undo here.
    await answer(streams.at(-1)!, "done", { state: "answered", reply: "Added the bread.", threads: [{ id: "th2", name: "Groceries" }], changed: ["th2"], sources: [], found: [] });
    await settle();
    expect(buttons()).toContain("Undo");
  });

  it("is a turn out until it settles", async () => {
    await hear();
    expect(out.at(-1)).toBe(true);
    await answer(streams[0]!, "done", { state: "answered", reply: "Done.", threads: [], changed: [], sources: [], found: [] });
    await settle();
    expect(out.at(-1)).toBe(false);
  });

  it("leaves this tab's draft and its send alone", async () => {
    await typed("call the plumber");
    await hear();
    expect(host.querySelector("textarea")!.value).toBe("call the plumber");
    const send = host.querySelector('button[aria-label="Send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });
});

describe("the conversation on screen", () => {
  it("takes a question answered on another device", async () => {
    tail = [message("m1", "person", "dentist on friday", "t1", { question })];
    await draw();
    expect(buttons()).toContain("This Friday");
    tail = [message("m1", "person", "dentist on friday", "t1", { question: null })];
    await hear();
    expect(buttons()).not.toContain("This Friday");
  });

  it("is left alone when the change is to another conversation", async () => {
    await draw();
    tail = [message("m5", "person", "a new subject", "t5", { state: "queued" })];
    await hear();
    expect(host.textContent).toContain("dentist on friday");
    expect(host.textContent).not.toContain("a new subject");
    expect(streams).toHaveLength(0);
  });

  it("takes the whole tail when it holds none, as a reload would, and waits for its answer", async () => {
    tail = [];
    await draw();
    tail = [message("m5", "person", "a new subject", "t5", { state: "queued" })];
    await hear();
    expect(host.textContent).toContain("a new subject");
    expect(streams).toHaveLength(1);
  });

  it("does not read the conversation for a change it does not show", async () => {
    await draw();
    tail = [...tail, message("m2", "person", "milk and eggs", "t2", { state: "queued" })];
    await hear(["memories"]);
    expect(host.textContent).not.toContain("milk and eggs");
  });
});

describe("a change while this tab's own request is out", () => {
  const times = (text: string) => host.textContent!.split(text).length - 1;
  let release: () => void;
  beforeEach(() => {
    gate = new Promise((resolve) => (release = resolve));
  });

  it("waits for a send to land, then takes only what another device sent", async () => {
    await draw();
    await typed("call the plumber");
    await act(async () => host.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await settle();
    // The server has this tab's dump and one from the phone; the send's
    // answer has not come back yet.
    tail = [
      ...tail,
      message("m9", "person", "call the plumber", "t9", { state: "seen" }),
      message("m2", "person", "milk and eggs", "t2", { state: "queued" }),
    ];
    await hear();
    expect(times("call the plumber")).toBe(1);
    expect(host.textContent).not.toContain("milk and eggs");
    await act(async () => release());
    await settle();
    await settle();
    expect(times("call the plumber")).toBe(1);
    expect(times("milk and eggs")).toBe(1);
    expect(streams.map((one) => /messages\/([^/]+)\//.exec(one.url)![1]).sort()).toEqual(["m2", "m9"]);
  });

  it("waits for a tapped answer to land, and never draws it twice", async () => {
    tail = [message("m1", "person", "dentist on friday", "t1", { question })];
    await draw();
    const chip = [...document.body.querySelectorAll("button")].find((one) => one.textContent === "This Friday")!;
    await act(async () => chip.click());
    tail = [message("m1", "person", "dentist on friday", "t1", { question: null }), message("m3", "person", "This Friday", "t3", { state: "seen" })];
    await hear();
    await act(async () => release());
    await settle();
    await settle();
    // Once as the person's bubble; the Undo line under the composer says it too.
    expect([...host.querySelectorAll("div")].filter((one) => one.textContent === "This Friday")).toHaveLength(1);
  });
});
