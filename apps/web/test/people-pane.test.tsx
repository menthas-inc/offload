// @vitest-environment happy-dom
//
// 031 My people on the web (T3.8): the five sections in order, Waiting on you
// and Asked by you hidden when empty, and Connect with someone running the
// Share step's lookup inline (AC-8). The found row says Ask to connect (AC-9),
// and a refused lookup says so with no retry (AC-10), on My people and in the
// Share modal's step alike, because the step is one piece.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings/people" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const person = (id: string, name: string) => ({ accountId: id, displayName: name, initials: name.slice(0, 2).toUpperCase() });

interface Page {
  requestsForYou: unknown[];
  connections: unknown[];
  pending: unknown[];
  blocked: unknown[];
  count: number;
}
let page: Page;
let lookupAnswer: { status: number; body: unknown };
const sent: { path: string; method: string; body: unknown }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  const method = init?.method ?? "GET";
  sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === "/v1/people" && method === "GET") return json(page);
  if (path === "/v1/people/lookup") return json(lookupAnswer.body, lookupAnswer.status);
  if (path === "/v1/people/requests" && method === "POST") {
    // The server now holds the request, and the next read lists it.
    page = { ...page, pending: [{ ...person("p9", "Lena Hart"), id: "r9", since: "2026-09-28T10:00:00Z" }] };
    return json({ requestId: "r9", since: "2026-09-28T10:00:00Z" });
  }
  if (path === "/api/me") return json({});
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { PeoplePane } = await import("../src/components/panes/People");
const { NewConnection } = await import("../src/components/people/ShareModal");

const LENA = {
  ...person("p9", "Lena Hart"),
  email: "lena@hart.studio",
  relation: "none",
  requestId: null,
  since: null,
  mark: "",
};

beforeEach(() => {
  sent.length = 0;
  page = { requestsForYou: [], connections: [], pending: [], blocked: [], count: 0 };
  lookupAnswer = { status: 200, body: { found: LENA } };
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(host).render(node));
  await settle();
  return host;
}

const headings = (root: ParentNode) => [...root.querySelectorAll("section h2")].map((h) => h.textContent);
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function find(root: ParentNode, email: string) {
  const field = root.querySelector<HTMLInputElement>('input[placeholder="Their email address"]')!;
  await act(async () => type(field, email));
  await act(async () => field.form!.requestSubmit());
  await settle();
}

describe("My people's sections (AC-8)", () => {
  it("on day one: Connect with someone, Connected with Nobody yet, Blocked", async () => {
    const host = await render(<PeoplePane />);
    expect(headings(host)).toEqual(["Connect with someone", "Connected", "Blocked"]);
    const text = host.textContent ?? "";
    expect(text).toContain("They need to be on offload already. You can also share a thread and ask from there.");
    expect(text).toContain("Nobody yet");
    expect(text).toContain("A connection is somebody already on offload. Find them above, or open a thread and click Share.");
    expect(button(host, "Find")).toBeTruthy();
    expect(host.querySelector("p[class*=paneSub]")).toBeNull();
  });

  it("with everything: the five in order, with counts, and the head's summary", async () => {
    page = {
      requestsForYou: [{ ...person("p1", "Priya Raman"), id: "q1", since: "2026-09-29T10:00:00Z" }],
      connections: [
        { ...person("p2", "Ana Duarte"), threads: [{ id: "t1", name: "Lisbon trip" }], threadCount: 1 },
        { ...person("p3", "Tom Reilly"), threads: [], threadCount: 0 },
        { ...person("p4", "Sam Ibekwe"), threads: [], threadCount: 0 },
      ],
      pending: [{ ...person("p5", "Lena Hart"), id: "r5", since: "2026-09-28T10:00:00Z" }],
      blocked: [],
      count: 3,
    };
    const host = await render(<PeoplePane />);
    expect(headings(host)).toEqual(["Waiting on you1", "Connect with someone", "Connected3", "Asked by you1", "Blocked"]);
    expect(host.textContent).toContain("Who you can share a thread with.");
    expect(host.textContent).toContain("3 connected, 1 waiting on you");
    // The row is the control, the pill says what it does.
    const asked = [...host.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Asked by you1")!;
    expect(asked.querySelector('[role="button"]')?.textContent).toMatch(/Lena HartPending since 28 Sept?Withdraw$/);
  });
});

describe("Connect with someone (AC-8, AC-9)", () => {
  it("looks them up, offers Ask to connect, and the request lands in Asked by you", async () => {
    const host = await render(<PeoplePane />);
    await find(host, "lena@hart.studio");
    expect(sent.find((c) => c.path === "/v1/people/lookup")?.body).toEqual({ email: "lena@hart.studio" });
    expect(host.textContent).toContain("Lena Hart");
    expect(button(host, "Request")).toBeUndefined();

    await act(async () => button(host, "Ask to connect")!.click());
    await settle();
    expect(sent.find((c) => c.path === "/v1/people/requests")?.body).toEqual({ accountId: "p9" });
    expect(headings(host)).toContain("Asked by you1");
  });
});

describe("Find", () => {
  it("waits for an @ before it can be pressed, so a press is never dead", async () => {
    const host = await render(<PeoplePane />);
    const field = host.querySelector<HTMLInputElement>('input[placeholder="Their email address"]')!;
    expect(button(host, "Find")!.disabled).toBe(true);
    await act(async () => type(field, "lena"));
    expect(button(host, "Find")!.disabled).toBe(true);
    await act(async () => field.form!.requestSubmit());
    await settle();
    expect(sent.some((c) => c.path === "/v1/people/lookup")).toBe(false);
    await act(async () => type(field, "lena@hart.studio"));
    expect(button(host, "Find")!.disabled).toBe(false);
  });
});

describe("a refused lookup (AC-10)", () => {
  it("says so on My people, with nothing to try again", async () => {
    lookupAnswer = { status: 429, body: { error: "rate_limited" } };
    const host = await render(<PeoplePane />);
    await find(host, "lena@hart.studio");
    expect(host.textContent).toContain("Too many lookups. Try again in a few minutes.");
    expect(host.textContent).not.toContain("That didn’t go through");
    expect(button(host, "Try again")).toBeUndefined();
  });

  it("says the same in the Share modal's step, whose found row also says Ask to connect", async () => {
    lookupAnswer = { status: 429, body: { error: "rate_limited" } };
    await render(<NewConnection onBack={() => undefined} onClose={() => undefined} />);
    await find(document, "lena@hart.studio");
    expect(document.body.textContent).toContain("Too many lookups. Try again in a few minutes.");
    expect(button(document, "Try again")).toBeUndefined();

    lookupAnswer = { status: 200, body: { found: LENA } };
    await find(document, "lena@hart.studio");
    expect(button(document, "Ask to connect")).toBeTruthy();
  });
});
