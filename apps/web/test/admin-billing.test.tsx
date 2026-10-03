// @vitest-environment happy-dom
//
// 034 AC-56 to AC-58, on the page. "What offload really costs" at the top of
// Costs: one row per company with where its number came from, the month's
// total, twelve months as bars, and the month in progress marked not final.
// And the subscriptions on Limits, which save themselves.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/costs", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { RealCosts } = await import("../src/app/(admin)/admin/costs/RealCosts");
const { FixedCosts } = await import("../src/app/(admin)/admin/limits/FixedCosts");

const NOT_RECORDED = (vendor: string, name: string, final: boolean) => ({ vendor, name, source: "metered", micros: 0, final, recorded: false });

function monthOf(index: number, rows: unknown[], total: number) {
  // Nov 2025 to Oct 2026.
  const at = new Date(Date.UTC(2025, 10 + index, 1)).toISOString().slice(0, 7);
  return { month: at, final: index < 11, total, rows };
}

const QUIET = (final: boolean) => [NOT_RECORDED("anthropic", "Anthropic", final), NOT_RECORDED("voyage", "Voyage AI", final)];

const BILLING = {
  months: [
    ...Array.from({ length: 10 }, (_, index) => monthOf(index, QUIET(true), 0)),
    monthOf(10, [{ vendor: "anthropic", name: "Anthropic", source: "metered", micros: 30_000_000, final: true, recorded: true }, NOT_RECORDED("voyage", "Voyage AI", true)], 30_000_000),
    monthOf(
      11,
      [
        { vendor: "anthropic", name: "Anthropic", source: "billed", micros: 41_250_000, metered: 40_000_000, difference: 1_250_000, readAt: "2026-10-02T12:00:00.000Z", final: false, recorded: true },
        { vendor: "assemblyai", name: "AssemblyAI", source: "metered", micros: 250_000, final: false, recorded: true },
        { vendor: "resend", name: "Resend", source: "fixed", micros: 20_000_000, final: false, recorded: true },
        NOT_RECORDED("voyage", "Voyage AI", false),
      ],
      61_500_000,
    ),
  ],
};

const NOTHING = { months: Array.from({ length: 12 }, (_, index) => monthOf(index, QUIET(index < 11), 0)) };

const settings = (fixed: Record<string, number>) => ({
  settings: [
    { key: "cap.turns", kind: "int", value: 100, default: 100, min: 1, max: 10_000, nullable: false, malformed: false, updatedAt: null },
    { key: "costs.fixed", kind: "money-map", value: fixed, default: {}, min: 0, max: 100_000_000_000, nullable: false, malformed: false, updatedAt: null },
  ],
});

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function api(answers: { billing?: unknown; billingStatus?: number; settings?: unknown[]; settingsStatus?: number; save?: { status: number; body?: unknown } } = {}) {
  calls = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      if (path.startsWith("/billing")) return new Response(JSON.stringify(answers.billing ?? BILLING), { status: answers.billingStatus ?? 200 });
      if (path === "/settings" && init?.method === "PATCH") return new Response(JSON.stringify(answers.save?.body ?? settings({})), { status: answers.save?.status ?? 200 });
      if (path === "/settings") {
        const list = answers.settings ?? [settings({ resend: 20_000_000 })];
        const body = list[Math.min(reads, list.length - 1)];
        reads += 1;
        return new Response(JSON.stringify(body), { status: answers.settingsStatus ?? 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function open(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(node));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text) as HTMLButtonElement;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const rows = (host: Element) => [...host.querySelectorAll('[role="row"]')].map((row) => [...row.querySelectorAll('[role="cell"], [role="columnheader"]')].map((cell) => cell.textContent));
const field = (host: Element, label: string) => [...host.querySelectorAll("label")].find((one) => one.textContent === label)!.closest("span")!.parentElement!.querySelector("input")!;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("what offload really costs", () => {
  it("asks for twelve months and draws one row per company, with its source", async () => {
    api();
    const host = await open(<RealCosts />);
    expect(calls.map((call) => call.url.replace(/^.*\/v1\/admin/, ""))).toEqual(["/billing?months=12"]);
    expect(host.querySelector("h2")!.textContent).toBe("What offload really costs");

    const table = rows(host);
    expect(table[0]).toEqual(["Company", "Source", "This month", "Ledger", "Difference", "Read"]);
    expect(table[1]!.slice(0, 5)).toEqual(["Anthropic", "billed", "$41.25", "$40.00", "+$1.25"]);
    expect(table[1]![5]).toContain("2 Oct");
    expect(table[2]).toEqual(["AssemblyAI", "metered", "$0.25", "", "", ""]);
    expect(table[3]).toEqual(["Resend", "fixed", "$20.00", "", "", ""]);
    expect(table[4]).toEqual(["Voyage AI", "metered", "not recorded", "", "", ""]);
    // Billed is the one source in the accent tone.
    expect([...host.querySelectorAll("[data-tone]")].filter((one) => one.getAttribute("data-tone") === "accent").map((one) => one.textContent)).toEqual(["billed"]);
  });

  it("gives the month's total, marked not final, and last month's beside it", async () => {
    api();
    const host = await open(<RealCosts />);
    expect(host.textContent).toContain("Oct 2026$61.50not final");
    expect(host.textContent).toContain("Sep 2026$30.00");
  });

  it("draws twelve months as bars, each reachable as text, the last one not final", async () => {
    api();
    const host = await open(<RealCosts />);
    const points = [...host.querySelectorAll("[data-point]")];
    expect(points).toHaveLength(12);
    expect(points[0]!.getAttribute("aria-label")).toBe("Nov 2025: $0.00");
    expect(points[10]!.getAttribute("aria-label")).toBe("Sep 2026: $30.00");
    expect(points[11]!.getAttribute("aria-label")).toBe("Oct 2026, not final: $61.50");
    expect(host.querySelectorAll("polyline")).toHaveLength(0);
  });

  it("writes a bill under the ledger as a minus, in plain characters", async () => {
    const months = structuredClone(BILLING.months);
    Object.assign(months[11]!.rows[0]!, { micros: 39_000_000, difference: -1_000_000 });
    api({ billing: { months } });
    const host = await open(<RealCosts />);
    expect(rows(host)[1]![4]).toBe("-$1.00");
    expect(host.textContent).not.toMatch(/[‒-―−]/);
  });

  it("says a failed read failed, beside Try again, and never draws it as an empty table", async () => {
    api({ billingStatus: 500 });
    const host = await open(<RealCosts />);
    expect(host.querySelector("h2")!.textContent).toBe("What offload really costs");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Couldn't load the bills.");
    expect(host.querySelector('[role="table"]')).toBeNull();
    expect(host.textContent).not.toContain("Nothing recorded yet.");

    api();
    await click(button(host, "Try again"));
    await settle();
    expect(rows(host)).toHaveLength(5);
  });

  it("says nothing is recorded with one line and no zero", async () => {
    api({ billing: NOTHING });
    const host = await open(<RealCosts />);
    expect(host.textContent).toContain("Nothing recorded yet.");
    expect(host.querySelector('[role="table"]')).toBeNull();
    expect(host.textContent).not.toContain("$0.00");
  });

  it("reads again on Refresh", async () => {
    api();
    const host = await open(<RealCosts />);
    await click(button(host, "Refresh"));
    await settle();
    expect(calls).toHaveLength(2);
  });
});

describe("subscriptions, on Limits", () => {
  it("has a field per subscription in dollars a month, with what is stored", async () => {
    api();
    const host = await open(<FixedCosts />);
    expect(host.querySelector("h2")!.textContent).toBe("Subscriptions");
    expect([...host.querySelectorAll("label")].map((one) => one.textContent)).toEqual([
      "Voyage AI",
      "Google Maps Platform",
      "Google Workspace",
      "Resend",
      "Expo",
      "Railway",
      "Cloudflare",
      "Apple Developer",
      "Google Play",
    ]);
    expect(field(host, "Resend").value).toBe("20");
    expect(field(host, "Expo").value).toBe("0");
    expect(button(host, "Save subscriptions").disabled).toBe(true);
  });

  it("saves the map itself, with what the page showed as expected", async () => {
    api({ settings: [settings({ resend: 20_000_000 }), settings({ resend: 35_500_000, expo: 99_000_000 })] });
    const host = await open(<FixedCosts />);
    await act(async () => type(field(host, "Resend"), "35.50"));
    await act(async () => type(field(host, "Expo"), "99"));
    await click(button(host, "Save subscriptions"));
    await settle();

    const save = calls.find((call) => call.init?.method === "PATCH")!;
    expect(save.url).toMatch(/\/v1\/admin\/settings$/);
    expect(save.init).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(JSON.parse(String(save.init!.body))).toEqual({
      changes: { "costs.fixed": { resend: 35_500_000, expo: 99_000_000 } },
      expected: { "costs.fixed": { resend: 20_000_000 } },
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Saved");
    // Read again, and nothing left to save.
    expect(calls.filter((call) => !call.init?.method)).toHaveLength(2);
    expect(button(host, "Save subscriptions").disabled).toBe(true);
  });

  it("takes an amount away by saving it as nothing, and keeps one it has no field for", async () => {
    api({ settings: [settings({ resend: 20_000_000, "status-page": 9_000_000 })] });
    const host = await open(<FixedCosts />);
    expect(field(host, "status-page").value).toBe("9");
    await act(async () => type(field(host, "Resend"), "0"));
    await click(button(host, "Save subscriptions"));
    await settle();
    const save = calls.find((call) => call.init?.method === "PATCH")!;
    expect(JSON.parse(String(save.init!.body)).changes).toEqual({ "costs.fixed": { "status-page": 9_000_000 } });
  });

  it("refuses an amount outside the bounds on the field and offers no save", async () => {
    api();
    const host = await open(<FixedCosts />);
    await act(async () => type(field(host, "Resend"), "-5"));
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Between 0 and 100,000.");
    expect(button(host, "Save subscriptions").disabled).toBe(true);
    await act(async () => type(field(host, "Resend"), "abc"));
    expect(button(host, "Save subscriptions").disabled).toBe(true);
  });

  it("says someone else changed this on a conflict, shows what is there now and overwrites nothing", async () => {
    api({ settings: [settings({ resend: 20_000_000 }), settings({ resend: 50_000_000 })], save: { status: 409, body: { error: "conflict", key: "costs.fixed", ...settings({ resend: 50_000_000 }) } } });
    const host = await open(<FixedCosts />);
    await act(async () => type(field(host, "Resend"), "35"));
    await click(button(host, "Save subscriptions"));
    await settle();
    expect(host.textContent).toContain("Someone else changed this");
    expect(field(host, "Resend").value).toBe("50");
    expect(calls.filter((call) => call.init?.method === "PATCH")).toHaveLength(1);
    expect(calls.filter((call) => !call.init?.method)).toHaveLength(2);
  });

  it("says a save that failed did not happen, and keeps what was typed", async () => {
    api({ save: { status: 500 } });
    const host = await open(<FixedCosts />);
    await act(async () => type(field(host, "Resend"), "35"));
    await click(button(host, "Save subscriptions"));
    await settle();
    expect(host.textContent).toContain("Couldn't save.");
    expect(field(host, "Resend").value).toBe("35");
  });

  it("says a failed read failed, and draws no fields", async () => {
    api({ settingsStatus: 500 });
    const host = await open(<FixedCosts />);
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Couldn't load subscriptions.");
    expect(host.querySelectorAll("input")).toHaveLength(0);
  });
});
