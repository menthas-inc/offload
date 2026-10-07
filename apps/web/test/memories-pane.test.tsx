// @vitest-environment happy-dom
//
// 040 part B on the web: the Memories pane (AC-10 to AC-15). The list By kind
// and Newest, search, the states the design does not draw (loading, a failed
// read, empty, the cap line), the editor as the right-hand pane with its
// refusals and the severing line, and forget with eight seconds of Undo.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/memories",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const memory = (id: string, kind: string, text: string, over: Record<string, unknown> = {}) => ({
  id,
  kind,
  text,
  origin: "stated",
  createdAt: at(2),
  updatedAt: at(2),
  changed: false,
  source: { type: "message", thread: { id: "t1", name: "Lisbon trip", notInAThread: false } },
  place: null,
  ...over,
});

let list: { status: number; body: unknown };
let writeAnswer: { status: number; body: unknown };
const sent: { path: string; method: string; body: unknown }[] = [];
const forgotten: { id: string }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  const method = init?.method ?? "GET";
  sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === "/v1/memories" && method === "GET") return json(list.body, list.status);
  // The server forgets and puts back, so a reload after either agrees.
  const held = (list.body as { memories?: { id: string }[] }).memories;
  const id = path.split("/")[3];
  if (writeAnswer.status === 200 && held && method === "DELETE") {
    forgotten.push(...held.filter((m) => m.id === id));
    (list.body as { memories: unknown[] }).memories = held.filter((m) => m.id !== id);
  }
  if (writeAnswer.status === 200 && held && path.endsWith("/restore")) {
    (list.body as { memories: unknown[] }).memories = [...held, ...forgotten.filter((m) => m.id === id)];
  }
  if (path.startsWith("/v1/memories")) return json(writeAnswer.body, writeAnswer.status);
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { MemoriesPane } = await import("../src/components/panes/Memories");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  sent.length = 0;
  list = {
    status: 200,
    body: {
      full: false,
      rulesFull: false,
      memories: [
        memory("m1", "people", "Their wife is Meera."),
        memory("m2", "about", "They work at Shopify as a designer.", { createdAt: at(20), updatedAt: at(20) }),
        memory("m3", "people", "They call their mother Maman.", { origin: "learned", createdAt: at(1), source: { type: "message", thread: null } }),
        memory("m4", "things", "They share a calendar with Meera.", { origin: "answered", source: { type: "answer", question: "Which calendar is shared with Meera?" } }),
      ],
    },
  };
  writeAnswer = { status: 200, body: { ok: true, id: "m9" } };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <MemoriesPane />
        <ToastHost />
      </ToastProvider>,
    );
  });
  await settle();
}

const text = () => host.textContent ?? "";
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name) as HTMLButtonElement | undefined;
async function click(el: Element | undefined | null) {
  if (!el) throw new Error("nothing to click");
  await act(async () => (el as HTMLElement).click());
  await settle();
}
async function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}
async function key(el: Element, name: string, shift = false) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: name, shiftKey: shift, bubbles: true, cancelable: true }));
  });
  await settle();
}
const field = () => host.querySelector("textarea") as HTMLTextAreaElement;

describe("the list", () => {
  it("is By kind first: a section per kind in the kind order, each with its count", async () => {
    await mount();
    const heads = [...host.querySelectorAll("h2")].map((h) => h.textContent);
    expect(heads).toEqual(["People2", "Things1", "About1"]);
    expect(text()).toContain("You said");
    expect(text()).toContain("Learned");
    expect(text()).toContain("Your answer");
  });

  it("Newest is This week and Earlier", async () => {
    await mount();
    await click(button("Newest"));
    expect([...host.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["This week3", "Earlier1"]);
  });

  it("search filters as you type, and says when nothing is kept", async () => {
    await mount();
    await click(button("Search"));
    const input = host.querySelector("input[type=search]") as HTMLInputElement;
    await type(input, "meera");
    expect(text()).toContain("Your wife is Meera.");
    expect(text()).not.toContain("Shopify");
    await type(input, "zebra");
    expect(text()).toContain("Nothing kept says “zebra”.");
  });

  it("loads with one spinner, and a failed read offers Try again", async () => {
    list = { status: 500, body: {} };
    await mount();
    expect(text()).toContain("Couldn't load your memories.");
    list.status = 200;
    list.body = { memories: [memory("m1", "people", "Their wife is Meera.")], full: false, rulesFull: false };
    await click(button("Try again"));
    expect(text()).toContain("Your wife is Meera.");
  });

  it("is quiet when empty, with the plus and no switch or search", async () => {
    list.body = { memories: [], full: false, rulesFull: false };
    await mount();
    expect(text()).toContain("Nothing kept yet. Tell offload something to remember, or add it here.");
    expect(button("New memory")).toBeTruthy();
    expect(button("Search")).toBeUndefined();
    expect(button("Map")).toBeUndefined();
  });

  it("says when Memories are full", async () => {
    (list.body as { full: boolean }).full = true;
    await mount();
    expect(text()).toContain("Memories are full, so offload has stopped learning new ones.");
  });
});

describe("the editor", () => {
  it("adds one as About unless another kind is picked, and Enter saves", async () => {
    await mount();
    await click(button("New memory"));
    expect(text()).toContain("A rule is followed in every thread.");
    expect(host.querySelector('[role=radio][aria-checked=true]')?.textContent).toBe("About");
    await type(field(), "My sister is Rina.");
    await key(field(), "Enter");
    expect(sent.find((s) => s.method === "POST" && s.path === "/v1/memories")?.body).toEqual({ text: "My sister is Rina.", kind: "about" });
    expect(text()).toContain("Remembered");
  });

  it("never takes a newline, and Escape closes it", async () => {
    await mount();
    await click(button("New memory"));
    await type(field(), "Two");
    await key(field(), "Enter", true);
    expect(sent.some((s) => s.method === "POST")).toBe(false);
    await key(field(), "Escape");
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("keeps the pane open with the reason when a change is refused", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    expect(text()).toContain("You asked offload to remember this");
    expect(text()).toContain("Said in Lisbon trip.");
    writeAnswer = { status: 200, body: { ok: false, error: "duplicate" } };
    await type(field(), "They call their mother Maman.");
    await click(button("Save"));
    expect(sent.find((s) => s.method === "PATCH")).toMatchObject({ path: "/v1/memories/m1", body: { text: "They call their mother Maman." } });
    expect(text()).toContain("That's already a memory.");
    expect(field()).toBeTruthy();
  });

  it("says before Save that new words on an answer unlink its calendar, and never names a calendar", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("share a calendar")));
    expect(text()).toContain("Your answer to “Which calendar is shared with Meera?”");
    expect(text()).not.toContain("Changing the words means offload asks which calendar again.");
    await type(field(), "They share a calendar with Meera Sen.");
    expect(text()).toContain("Changing the words means offload asks which calendar again.");
  });

  it("forgets with eight seconds of Undo, which puts it back", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    await click(button("Forget"));
    expect(sent.find((s) => s.method === "DELETE")?.path).toBe("/v1/memories/m1");
    expect(text()).toContain("Memory forgotten");
    expect([...host.querySelectorAll("[data-memory]")].some((r) => r.textContent?.includes("Your wife is Meera."))).toBe(false);
    await click(button("Undo"));
    expect(sent.find((s) => s.method === "POST" && s.path === "/v1/memories/m1/restore")).toBeTruthy();
    expect([...host.querySelectorAll("[data-memory]")].some((r) => r.textContent?.includes("Your wife is Meera."))).toBe(true);
  });

  it("a write that fails says so with Retry", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    writeAnswer = { status: 500, body: {} };
    await click(button("Forget"));
    expect(text()).toContain("Couldn't save that");
    expect(button("Retry")).toBeTruthy();
  });
});

describe("F-P2 spoken to the person it is about", () => {
  it("reads each row to them, not about them", async () => {
    await mount();
    expect(text()).toContain("You work at Shopify as a designer.");
    expect(text()).toContain("Your wife is Meera.");
    expect(text()).not.toContain("They work at Shopify");
    expect(text()).not.toContain("Their wife");
  });

  it("finds a row by the words it is read in", async () => {
    await mount();
    await click(button("Search"));
    await type(host.querySelector("input[type=search]") as HTMLInputElement, "your wife");
    expect(text()).toContain("Your wife is Meera.");
    expect(text()).not.toContain("Shopify");
  });

  it("opens the editor on the words as read, and saves what is typed in the stored form", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    expect(field().value).toBe("Your wife is Meera.");
    await type(field(), "You call your mother Maman.");
    await click(button("Save"));
    expect(sent.find((s) => s.method === "PATCH")).toMatchObject({ path: "/v1/memories/m1", body: { text: "They call their mother Maman." } });
  });

  it("closes on Save with nothing sent when the words are as shown", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    await click(button("Save"));
    expect(sent.some((s) => s.method === "PATCH")).toBe(false);
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("an answer's words as shown do not unlink its calendar", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("share a calendar")));
    expect(field().value).toBe("You share a calendar with Meera.");
    expect(text()).not.toContain("Changing the words means offload asks which calendar again.");
  });
});

describe("the sidebar", () => {
  it("opens Memories, alive where Notes was drawn inert", async () => {
    const { Sidebar } = await import("../src/components/shell/Sidebar");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<Sidebar threads={[]} threadCount={0} />));
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Memories"));
    expect(link?.getAttribute("href")).toBe("/memories");
    expect(link?.getAttribute("aria-current")).toBe("page");
    expect(host.textContent).not.toContain("Notes");
    expect(host.querySelector("button[disabled]")).toBeNull();
  });
});

describe("040 client review", () => {
  it("the plus on an empty tab keeps the empty screen and opens the editor beside it", async () => {
    list.body = { memories: [], full: false, rulesFull: false };
    await mount();
    await click(button("New memory"));
    expect(field()).toBeTruthy();
    expect(text()).toContain("Nothing kept yet.");
    expect(text()).not.toContain("Nothing kept says");
  });

  it("a refused Undo says it could not put it back", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    await click(button("Forget"));
    writeAnswer = { status: 500, body: {} };
    await click(button("Undo"));
    expect(text()).toContain("Couldn't put that back");
  });

  it("Escape closes the editor from any control in it, not only the field", async () => {
    await mount();
    await click(button("New memory"));
    const radio = host.querySelector("[role=radio]") as HTMLElement;
    radio.focus();
    await key(radio, "Escape");
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("forgetting one already gone elsewhere is done, with no Retry", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    writeAnswer = { status: 404, body: { error: "not_found" } };
    await click(button("Forget"));
    expect(button("Retry")).toBeUndefined();
    expect(text()).not.toContain("Couldn't save that");
  });

  it("names the view switch View, as the phones and the kit do", async () => {
    await mount();
    expect(host.querySelector('[role=group][aria-label="View"]')).toBeTruthy();
    expect(host.querySelector('[role=group][aria-label="Sort"]')).toBeTruthy();
  });
});

describe("040 security review", () => {
  it("making a memory a rule sends its words, so the change shows what becomes an instruction", async () => {
    await mount();
    await click([...host.querySelectorAll("[data-memory]")].find((r) => r.textContent?.includes("Your wife is Meera.")));
    await click([...host.querySelectorAll("[role=radio]")].find((r) => r.textContent === "Rules"));
    await click(button("Save"));
    expect(sent.find((s) => s.method === "PATCH")?.body).toEqual({ text: "Their wife is Meera.", kind: "rules" });
  });
});
