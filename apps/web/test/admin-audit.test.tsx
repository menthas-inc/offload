// @vitest-environment happy-dom
//
// 034 AC-7 and AC-53, on the Audit page: every staff write as a plain phrase,
// who did it and on whom, a setting as old to new, three filters, and a
// deleted account as plain text where a live one is a link.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/audit", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: AuditPage } = await import("../src/app/(admin)/admin/audit/page");
const { KIND_LABELS } = await import("../src/app/(admin)/admin/audit/labels");

const ADA = { id: "0199aaaa-0000-7000-8000-000000000001", name: "Ada Boss", email: "ada@example.test" };
const JO = { id: "0199bbbb-0000-7000-8000-000000000002", name: "Jo Alves", email: "jo@example.test", deleted: false };
const GONE = "0199cccc-0000-7000-8000-000000000003";

const entry = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  at: "2026-10-02T09:30:00.000Z",
  kind: "invited",
  staff: ADA,
  target: null,
  settingKey: null,
  old: null,
  new: null,
  jobId: null,
  ...over,
});

const ROWS = [
  entry({ kind: "disabled", target: JO }),
  entry({ kind: "setting.changed", settingKey: "cap.turns", old: 100, new: 50 }),
  entry({ kind: "setting.changed", settingKey: "platform.spend_micros", old: null, new: 25_000_000 }),
  entry({ kind: "deleted", staff: { id: GONE }, target: { id: GONE, deleted: true } }),
  entry({ kind: "staff.role_changed", target: JO, old: "support", new: "owner" }),
];
const FACETS = { staff: [ADA, { id: GONE }], kinds: ["disabled", "setting.changed"] };

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function api(answers: { list?: number; facets?: number; pages?: Array<{ rows: unknown[]; nextCursor: string | null }> } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      if (path.startsWith("/audit/facets")) return new Response(JSON.stringify(FACETS), { status: answers.facets ?? 200 });
      const query = new URLSearchParams(path.split("?")[1] ?? "");
      const pages = answers.pages ?? [{ rows: ROWS, nextCursor: null }];
      const page = query.get("cursor") ? pages[1]! : query.get("kind") || query.get("staff") || query.get("person") ? { rows: [], nextCursor: null } : pages[0]!;
      return new Response(JSON.stringify(page), { status: answers.list ?? 200 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(host).render(<AuditPage />));
  await settle();
  return host;
}

const settle = (ms = 10) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;
const rows = (host: Element) => [...host.querySelectorAll('[role="table"] [role="row"]')].slice(1);
const lists = () => calls.filter((call) => !call.url.includes("/audit/facets"));

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("AC-7 the states", () => {
  it("shows one spinner while it loads", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<AuditPage />));
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="table"]')).toBeNull();
  });

  it("says a failed read failed, beside Try again, and never as an empty log", async () => {
    api({ list: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the audit log.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.textContent).not.toContain("Nothing recorded yet.");
    expect(host.querySelector('[role="table"]')).toBeNull();
  });

  it("says nothing is recorded yet on day one, and keeps its tools", async () => {
    api({ pages: [{ rows: [], nextCursor: null }] });
    const host = await open();
    expect(host.textContent).toContain("Nothing recorded yet.");
    expect(host.querySelectorAll("select")).toHaveLength(2);
    expect(host.querySelector('[role="table"]')).toBeNull();
  });

  it("says nothing matches when a filter finds nothing", async () => {
    api();
    const host = await open();
    await choose(host.querySelector('select[aria-label="Kind"]')!, "disabled");
    expect(host.textContent).toContain("Nothing matches that.");
    expect(host.textContent).not.toContain("Nothing recorded yet.");
  });

  it("says the filters did not load in their own place, and the log stays", async () => {
    api({ facets: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the filters.");
    expect(rows(host)).toHaveLength(ROWS.length);
  });

  it("says when it was read and offers a refresh", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("As of ");
    expect(button(host, "Refresh")).toBeDefined();
  });
});

describe("the log", () => {
  it("writes each entry as when, who, what and on whom", async () => {
    api();
    const host = await open();
    const [disabled] = rows(host);
    expect(disabled!.textContent).toContain("2 Oct");
    expect(disabled!.textContent).toContain("Ada Boss");
    expect(disabled!.textContent).toContain("Disabled the account");
    expect(disabled!.textContent).toContain("Jo Alves");
    expect(disabled!.textContent).not.toContain("disabled.");
  });

  it("links a live account to its page, and writes a deleted one as plain text", async () => {
    api();
    const host = await open();
    const [disabled, , , deleted] = rows(host);
    const link = disabled!.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(`/admin/people/${JO.id}`);
    expect(link.textContent).toContain("Jo Alves");

    expect(deleted!.querySelector("a")).toBeNull();
    // Both the staff member and the person have gone, and read as ids.
    expect(deleted!.textContent!.match(/deleted account 0199cccc/g)).toHaveLength(2);
  });

  it("shows a setting as old to new, in the setting's own words and units", async () => {
    api();
    const host = await open();
    const [, turns, platform, , role] = rows(host);
    expect(turns!.textContent).toContain("Changed a setting");
    // Limits' own name for it: one set of words across the panel.
    expect(turns!.textContent).toContain("Turns");
    expect(turns!.textContent).not.toContain("Turns per person");
    expect(turns!.textContent).toMatch(/100\s*to\s*50/);
    expect(platform!.textContent).toContain("Platform spend cap");
    expect(platform!.textContent).toMatch(/off\s*to\s*\$25\.00/);
    expect(role!.textContent).toMatch(/support\s*to\s*owner/);
    expect(host.textContent).not.toContain("cap.turns");
  });

  it("has a phrase for every kind the log can hold", () => {
    for (const kind of ["invited", "resent", "waitlist.removed", "disabled", "enabled", "deletion.scheduled", "deletion.cancelled", "deleted", "signed_out", "override.set", "override.cleared", "setting.changed", "job.retried", "job.dismissed", "staff.added", "staff.role_changed", "staff.removed", "person.viewed"]) {
      expect(KIND_LABELS[kind], kind).toBeTruthy();
    }
  });
});

describe("the filters", () => {
  it("offers the staff members and kinds the log holds, by name", async () => {
    api();
    const host = await open();
    const staff = host.querySelector('select[aria-label="Staff member"]')!;
    expect([...staff.querySelectorAll("option")].map((one) => one.textContent)).toEqual(["Everyone", "Ada Boss", "deleted account 0199cccc"]);
    const kind = host.querySelector('select[aria-label="Kind"]')!;
    expect([...kind.querySelectorAll("option")].map((one) => one.textContent)).toEqual(["Every kind", "Disabled the account", "Changed a setting"]);
  });

  it("asks the API for what was chosen", async () => {
    api();
    const host = await open();
    await choose(host.querySelector('select[aria-label="Staff member"]')!, ADA.id);
    expect(lists().at(-1)!.url).toContain(`staff=${ADA.id}`);
    await choose(host.querySelector('select[aria-label="Kind"]')!, "setting.changed");
    expect(lists().at(-1)!.url).toContain("kind=setting.changed");
    expect(lists().at(-1)!.url).toContain(`staff=${ADA.id}`);
  });

  it("finds a person by a pasted address, once the typing stops", async () => {
    api();
    const host = await open();
    const input = host.querySelector('input[aria-label="Person, by address or id"]') as HTMLInputElement;
    const before = lists().length;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, " jo@example.test ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(50);
    expect(lists()).toHaveLength(before);
    await settle(400);
    expect(lists().at(-1)!.url).toContain(`person=${encodeURIComponent("jo@example.test")}`);
  });
});

describe("load more", () => {
  it("adds the next page under the first, by its cursor, and stops offering when there is none", async () => {
    const more = [entry({ kind: "enabled", target: JO })];
    api({ pages: [{ rows: ROWS, nextCursor: "abc" }, { rows: more, nextCursor: null }] });
    const host = await open();
    expect(rows(host)).toHaveLength(ROWS.length);
    await act(async () => button(host, "Load more").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(lists().at(-1)!.url).toContain("cursor=abc");
    expect(rows(host)).toHaveLength(ROWS.length + 1);
    expect(rows(host).at(-1)!.textContent).toContain("Enabled the account");
    expect(button(host, "Load more")).toBeUndefined();
  });
});
