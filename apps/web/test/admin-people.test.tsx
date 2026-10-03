// @vitest-environment happy-dom
//
// 034 section A, the People page (AC-7, AC-11, AC-17): the list and its stats
// come from the API, a row opens the person's page while its buttons act
// without opening it, a guarded action is not drawn, and every state in
// section 0.1 is there.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/people",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: PeoplePage } = await import("../src/app/(admin)/admin/people/page");

const STATS = { accounts: 1297, activeThisWeek: 892, disabled: 2, averageSpendMicros: 1_420_000 };

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: "Ana Duarte",
  email: `${id}@example.test`,
  providers: ["apple"],
  threads: 12,
  joined: "2026-03-04T10:00:00.000Z",
  lastActive: "2026-10-02T09:30:00.000Z",
  spendMicros: 4_820_000,
  state: "active",
  can: { disable: true, enable: false },
  ...over,
});

const ROWS = [
  row("u1"),
  row("u2", { name: null, providers: ["google"], state: "disabled", lastActive: null, can: { disable: false, enable: true } }),
  // Staff, seen by support: neither action is drawn.
  row("u3", { name: "Hana Ito", can: { disable: false, enable: false } }),
];

type Call = { url: string; path: string; init?: RequestInit };
let calls: Call[] = [];

function api(answers: { list?: number; stats?: number; write?: number; refused?: string; page?: (path: string) => unknown } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      calls.push({ url: String(url), path, init });
      if (init?.method && init.method !== "GET") {
        if (answers.refused) return new Response(JSON.stringify({ error: "refused", reason: answers.refused }), { status: 409 });
        return new Response(JSON.stringify({ status: "ok" }), { status: answers.write ?? 200 });
      }
      if (path.startsWith("/people/stats")) return new Response(JSON.stringify(STATS), { status: answers.stats ?? 200 });
      if (path.startsWith("/people")) {
        const body = answers.page ? answers.page(path) : { rows: ROWS, nextCursor: null, capped: false };
        return new Response(JSON.stringify(body), { status: answers.list ?? 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<PeoplePage />));
  await settle();
  return host;
}

const buttons = (host: Element, text: string) => [...host.querySelectorAll("button")].filter((one) => one.textContent === text);
const button = (host: Element, text: string) => buttons(host, text)[0]!;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const lists = () => calls.filter((call) => !call.init?.method && call.path.startsWith("/people") && !call.path.startsWith("/people/stats"));

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the People page", () => {
  it("draws the stats row and the kit's columns, in dollars", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("1,297 accounts · 2 disabled");
    expect(host.textContent).toContain("Accounts1,297");
    expect(host.textContent).toContain("Used it this week89269% of accounts");
    expect(host.textContent).toContain("Disabled2");
    expect(host.textContent).toContain("Average spend$1.42per account, last 30 days");
    expect([...host.querySelectorAll('[role="columnheader"]')].map((one) => one.textContent)).toEqual([
      "Person", "Signed in with", "Threads", "Joined", "Last active", "Spend, 30d", "State", "",
    ]);
    const first = host.querySelectorAll('[role="row"]')[1]!;
    expect(first.textContent).toContain("Ana Duarte");
    expect(first.textContent).toContain("u1@example.test");
    expect(first.textContent).toContain("Apple");
    expect(first.textContent).toContain("4 Mar");
    expect(first.textContent).toContain("$4.82");
    expect(first.textContent).toContain("active");
    // Someone with no name is their address.
    expect(host.querySelectorAll('[role="row"]')[2]!.textContent).toContain("u2@example.test");
  });

  it("makes a row a link to the person, and keeps its buttons out of the link", async () => {
    api();
    const host = await open();
    const link = host.querySelector('a[href="/admin/people/u1"]')!;
    expect(link.getAttribute("aria-label")).toBe("Open Ana Duarte");
    expect(link.querySelector("button")).toBeNull();
    expect(host.querySelector('a[href="/admin/people/u2"]')!.getAttribute("aria-label")).toBe("Open u2@example.test");
  });

  it("draws Disable and Enable only where the server allows them, and no Delete", async () => {
    api();
    const host = await open();
    const rows = [...host.querySelectorAll('[role="row"]')].slice(1);
    expect([...rows[0]!.querySelectorAll("button")].map((one) => one.textContent)).toEqual(["Disable"]);
    expect([...rows[1]!.querySelectorAll("button")].map((one) => one.textContent)).toEqual(["Enable"]);
    expect(rows[2]!.querySelectorAll("button")).toHaveLength(0);
    expect(host.textContent).not.toContain("Delete");
  });

  it("shows one spinner while loading", async () => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const host = await open();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("Nobody has signed in yet.");
  });

  it("says a failed read failed, beside Try again, and never draws it as an empty list", async () => {
    api({ list: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load people.");
    expect(host.textContent).not.toContain("Nobody has signed in yet.");
    expect(host.textContent).not.toContain("No account matches that.");
    const before = lists().length;
    await click(button(host, "Try again"));
    await settle();
    expect(lists().length).toBe(before + 1);
  });

  it("says a failed stats row in its own place and keeps the list", async () => {
    api({ stats: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the figures.");
    expect(host.textContent).toContain("Ana Duarte");
  });

  it("says empty in a line with no zero, and keeps its tools", async () => {
    api({ page: () => ({ rows: [], nextCursor: null, capped: false }) });
    const host = await open();
    expect(host.textContent).toContain("Nobody has signed in yet.");
    const search = host.querySelector('input[aria-label="Search name or email"]') as HTMLInputElement;
    await act(async () => type(search, "zz"));
    await settle();
    expect(host.textContent).toContain("No account matches that.");
    expect(host.querySelector('input[aria-label="Search name or email"]')).not.toBeNull();
  });

  it("asks the API for the search, the filter and the sort", async () => {
    api();
    const host = await open();
    expect(lists()[0]!.path).toBe("/people?state=all&sort=joined");

    await act(async () => type(host.querySelector('input[aria-label="Search name or email"]') as HTMLInputElement, "ana d"));
    await settle();
    expect(lists().at(-1)!.path).toBe("/people?state=all&sort=joined&q=ana+d");

    await click(button(host, "Disabled"));
    await settle();
    expect(lists().at(-1)!.path).toBe("/people?state=disabled&sort=joined&q=ana+d");

    await click(button(host, "Spend"));
    await settle();
    expect(lists().at(-1)!.path).toBe("/people?state=disabled&sort=spend&q=ana+d");
  });

  it("says when a sorted list is only the top of it", async () => {
    api({ page: () => ({ rows: ROWS, nextCursor: null, capped: true }) });
    const host = await open();
    await click(button(host, "Spend"));
    await settle();
    expect(host.textContent).toContain("The top 200. Search to find anybody else.");
  });

  it("loads the next page by cursor and adds it to the list", async () => {
    api({
      page: (path) =>
        path.includes("cursor=c2") ? { rows: [row("u9", { name: "Owen Pryce" })], nextCursor: null, capped: false } : { rows: ROWS, nextCursor: "c2", capped: false },
    });
    const host = await open();
    await click(button(host, "Load more"));
    await settle();
    expect(lists().at(-1)!.path).toBe("/people?state=all&sort=joined&cursor=c2");
    expect(host.querySelectorAll('[role="row"]')).toHaveLength(1 + 4);
    expect(host.textContent).toContain("Owen Pryce");
    expect(buttons(host, "Load more")).toHaveLength(0);
  });

  it("asks before disabling, says what happens, then posts and reads again", async () => {
    api();
    const host = await open();
    await click(button(host, "Disable"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Disable Ana Duarte?");
    expect(dialog.textContent).toContain("They are signed out everywhere and cannot sign in again until you enable them. Nothing is deleted.");
    expect(calls.some((call) => call.init?.method === "POST")).toBe(false);

    const before = lists().length;
    await click(button(dialog, "Disable"));
    await settle();
    const post = calls.find((call) => call.init?.method === "POST")!;
    expect(post.path).toBe("/people/u1/disable");
    expect(post.init).toMatchObject({ credentials: "include" });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Ana Duarte is disabled");
    expect(lists().length).toBe(before + 1);
  });

  it("does nothing on Cancel", async () => {
    api();
    const host = await open();
    await click(button(host, "Disable"));
    await click(button(host.querySelector('[role="dialog"]')!, "Cancel"));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("enables from the row, with no dialog", async () => {
    api();
    const host = await open();
    await click(button(host, "Enable"));
    await settle();
    expect(calls.find((call) => call.init?.method === "POST")!.path).toBe("/people/u2/enable");
    expect(host.querySelector('[role="status"]')!.textContent).toBe("u2@example.test is active again");
  });

  it("says an account being deleted cannot be enabled, in its own line", async () => {
    api({ refused: "deleting" });
    const host = await open();
    await click(button(host, "Enable"));
    await settle();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Not enabled. That account is being deleted");
  });

  it("says what did not happen when a write fails, in one clause", async () => {
    api({ write: 409 });
    const host = await open();
    await click(button(host, "Disable"));
    await click(button(host.querySelector('[role="dialog"]')!, "Disable"));
    await settle();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("That did not go through. Nobody was disabled");
    expect(host.textContent).toContain("Ana Duarte");
  });
});
