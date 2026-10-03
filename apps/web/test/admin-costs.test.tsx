// @vitest-environment happy-dom
//
// 034 AC-7, on the Costs page, and the page itself: the kit's stats row and
// daily bars, where the money goes by job, model and vendor, trends, usage,
// the heaviest accounts, and the export.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/costs",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: CostsPage } = await import("../src/app/(admin)/admin/costs/page");

const SUMMARY = {
  monthStart: "2026-08-01T00:00:00.000Z",
  monthMicros: 1_842_600_000,
  lastMonthMicros: 1_613_200_000,
  accounts: 1297,
  perAccountMicros: 1_420_000,
  tooEarly: false,
  onPaceMicros: 2_284_820_000,
  budgetMicros: 2_500_000_000 as number | null,
  platformCapMicros: 120_000_000 as number | null,
};

const days = (n: number) => Array.from({ length: n }, (_, index) => new Date(Date.UTC(2026, 7, 1 + index)).toISOString());

const DAILY = {
  unit: "day",
  totalMicros: 300_000_000,
  totalCalls: 30,
  points: days(3).map((at, index) => ({ at, micros: (index + 1) * 50_000_000, calls: 10, capReached: index === 1 })),
};

const BY = {
  job: {
    dim: "job",
    totalMicros: 300_000_000,
    totalCalls: 30,
    rows: [
      { key: "dump.answer", name: "Filing and answering", recorded: true, micros: 200_000_000, calls: 20 },
      { key: "thread.nightly", name: "Nightly pass", recorded: true, micros: 90_000_000, calls: 9 },
      { key: "mystery.kind", name: "mystery.kind", recorded: true, micros: 10_000_000, calls: 1 },
    ],
  },
  model: {
    dim: "model",
    totalMicros: 300_000_000,
    totalCalls: 30,
    rows: [{ key: "claude-sonnet-5", name: "claude-sonnet-5", recorded: true, micros: 300_000_000, calls: 30 }],
  },
  vendor: {
    dim: "vendor",
    totalMicros: 300_000_000,
    totalCalls: 30,
    rows: [
      { key: "model", name: "The model", recorded: true, micros: 300_000_000, calls: 30 },
      { key: "embeddings", name: "Embeddings", recorded: false, micros: null, calls: null },
    ],
  },
};

const trendPoints = (micros: number) => days(3).map((at) => ({ at, micros, calls: 2, input: 1200, output: 80, cacheRead: 900, cacheWrite: 30 }));
const TRENDS = {
  job: {
    unit: "day",
    dim: "job",
    total: { key: "all", name: "Everything", points: trendPoints(100_000_000) },
    series: [
      { key: "dump.answer", name: "Filing and answering", points: trendPoints(70_000_000) },
      { key: "thread.nightly", name: "Nightly pass", points: trendPoints(30_000_000) },
    ],
  },
  model: {
    unit: "day",
    dim: "model",
    total: { key: "all", name: "Everything", points: trendPoints(100_000_000) },
    series: [{ key: "claude-sonnet-5", name: "claude-sonnet-5", points: trendPoints(100_000_000) }],
  },
};

const USAGE = {
  unit: "day",
  turnsFrom: null as string | null,
  points: days(3).map((at, index) => ({ at, accounts: 4 + index, turns: 40, photos: 7, voiceNotes: 2, mailIn: 1 })),
};

const HEAVIEST = {
  rows: [
    { id: "u8", name: "Owen Pryce", email: "owen.pryce@example.test", micros: 38_170_000 },
    { id: "u4", name: null, email: "jo@example.test", micros: 11_400_000 },
  ],
};

/** Twelve months of what the companies charged, one row in the newest. */
const BILLING = {
  months: Array.from({ length: 12 }, (_, index) => ({
    month: new Date(Date.UTC(2025, 9 + index, 1)).toISOString().slice(0, 7),
    final: index < 11,
    total: index === 11 ? 20_000_000 : 0,
    rows: index === 11 ? [{ vendor: "resend", name: "Resend", source: "fixed", micros: 20_000_000, final: false, recorded: true }] : [],
  })),
};

type Answer = { status?: number; body?: unknown };
type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function api(over: Record<string, Answer> = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      // 034 section C renders at the top of this page and makes its own read.
      if (String(url).includes("/v1/admin/billing")) return new Response(JSON.stringify(over["/billing"]?.body ?? BILLING), { status: over["/billing"]?.status ?? 200 });
      const path = String(url).replace(/^.*\/v1\/admin\/costs/, "");
      const name = path.split("?")[0]!;
      const dim = new URLSearchParams(path.split("?")[1] ?? "").get("dim") as "job" | "model" | "vendor" | null;
      if (name === "/export.csv") return new Response("day,job\r\n", { status: over[name]?.status ?? 200 });
      const bodies: Record<string, unknown> = {
        "/summary": SUMMARY,
        "/daily": DAILY,
        "/by": BY[dim ?? "job"],
        "/trends": TRENDS[(dim ?? "job") as "job" | "model"],
        "/usage": USAGE,
        "/heaviest": HEAVIEST,
      };
      const answer = over[name] ?? {};
      return new Response(JSON.stringify(answer.body ?? bodies[name] ?? {}), { status: answer.status ?? 200 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  search = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<CostsPage />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const plot = (host: Element, label: string) => host.querySelector(`svg[aria-label="${label}"]`)!;
const paths = () => calls.map((call) => call.url.replace(/^.*\/v1\/admin/, ""));
/** The ledger's tables. The bill's own table is the first on the page. */
const ledgerTables = (host: Element) => [...host.querySelectorAll('[role="table"]')].slice(1);

describe("AC-7 the states", () => {
  it("shows one spinner while loading, and nothing else", async () => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const host = await open();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="table"]')).toBeNull();
    expect(host.querySelector("svg")).toBeNull();
    expect(host.textContent).toContain("Costs");
  });

  it("says a failed read failed, beside Try again, and draws no figure", async () => {
    api({ "/summary": { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load costs.");
    expect(host.querySelector('[role="table"]')).toBeNull();
    expect(host.textContent).not.toContain("$0.00");

    api();
    await click(button(host, "Try again"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("Spent this month$1,842.60");
  });

  it("says a section failed in its own place, and the rest stays", async () => {
    api({ "/heaviest": { status: 500 }, "/usage": { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the heaviest accounts.");
    expect(host.textContent).toContain("Couldn't load usage.");
    expect(host.textContent).toContain("Spent this month$1,842.60");
    expect(host.textContent).toContain("Filing and answering");
    expect(host.textContent).not.toContain("Nobody spent anything");
  });

  it("says empty in a line with no zero, and keeps its tools", async () => {
    api({
      "/by": { body: { dim: "job", totalMicros: 0, totalCalls: 0, rows: [] } },
      "/heaviest": { body: { rows: [] } },
    });
    const host = await open();
    expect(host.textContent).toContain("Nothing was spent in this range.");
    expect(host.textContent).toContain("Nobody spent anything in this range.");
    expect(button(host, "Export CSV")).toBeDefined();
    expect(host.querySelector('[role="radiogroup"][aria-label="Range"]')).not.toBeNull();
  });

  it("says when it was read, and reads everything again on refresh", async () => {
    api();
    const host = await open();
    expect(host.textContent).toMatch(/As of \d\d:\d\d/);
    // The bill has its own as-of and its own refresh.
    const costs = () => paths().filter((path) => path.startsWith("/costs/")).length;
    const before = costs();
    await click(button(host, "Refresh"));
    expect(costs()).toBe(before * 2);
  });
});

describe("a refresh that fails", () => {
  const refresh = async (host: Element) => {
    await click(button(host, "Refresh"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it("keeps each section it had, and says in that section's place what did not load", async () => {
    api();
    const host = await open();
    api({ "/heaviest": { status: 500 }, "/by": { status: 500 }, "/daily": { status: 500 }, "/trends": { status: 500 }, "/usage": { status: 500 } });
    await refresh(host);
    for (const what of ["the heaviest accounts", "spend by job", "spend by model", "spend by vendor", "daily spend", "trends", "usage"]) {
      expect(host.textContent, what).toContain(`Couldn't load ${what}.`);
    }
    // What was there is still there.
    expect(host.querySelector('a[href="/admin/people/u8"]')).not.toBeNull();
    expect(host.textContent).toContain("Filing and answering");
    expect(plot(host, "Daily spend")).not.toBeNull();
    expect(plot(host, "Turns")).not.toBeNull();
    expect(plot(host, "Spend, Everything")).not.toBeNull();
  });

  it("keeps the whole page when it is the summary that failed", async () => {
    api();
    const host = await open();
    api({ "/summary": { status: 500 } });
    await refresh(host);
    expect(host.textContent).toContain("Spent this month$1,842.60");
    expect(host.textContent).toContain("Couldn't load the summary.");
    expect(host.textContent).not.toContain("Couldn't load costs.");
    expect(host.textContent).toContain("Filing and answering");
  });
});

describe("what offload really costs, at the top", () => {
  it("draws the bill above the stats row, from its own read", async () => {
    api();
    const host = await open();
    expect(paths()).toContain("/billing?months=12");
    const text = host.textContent!;
    expect(text).toContain("What offload really costs");
    expect(text).toContain("Resend");
    expect(text.indexOf("What offload really costs")).toBeLessThan(text.indexOf("Spent this month"));
  });

  it("says the bill failed in its own place, and the ledger's figures stay", async () => {
    api({ "/billing": { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the bills.");
    expect(host.textContent).toContain("Spent this month$1,842.60");
  });
});

describe("the stats row", () => {
  it("draws the month, the pace against the budget, per account and last month", async () => {
    api();
    const host = await open();
    // The month so far, in UTC: "1 to 25 August", or "1 August" on the first.
    expect(host.textContent).toMatch(/Costs1 (to \d+ )?[A-Z][a-z]+ · everything the ledger records per call, not hosting/);
    expect(host.textContent).toContain("Spent this month$1,842.60budget $2,500.00");
    expect(host.textContent).toContain("On pace for$2,284.82inside budget");
    expect(host.textContent).toContain("Per account$1.42all 1,297 accounts, not just active");
    expect(host.textContent).toContain("Last month$1,613.20");
    expect(host.querySelector('[data-tone="attention"]')?.textContent).not.toBe("$2,284.82");
  });

  it("puts the pace in the attention tone when it is over the budget", async () => {
    api({ "/summary": { body: { ...SUMMARY, budgetMicros: 2_000_000_000 } } });
    const host = await open();
    expect(host.textContent).toContain("On pace for$2,284.82over budget by $284.82");
    const loud = [...host.querySelectorAll('[data-tone="attention"]')].map((node) => node.textContent);
    expect(loud).toContain("$2,284.82");
  });

  it("leaves the budget notes out when no budget is set, and says too early in the first two days", async () => {
    api({ "/summary": { body: { ...SUMMARY, budgetMicros: null, tooEarly: true, onPaceMicros: null } } });
    const host = await open();
    expect(host.textContent).toContain("Spent this month$1,842.60On pace for");
    expect(host.textContent).toContain("On pace forToo early to sayPer account");
    expect(host.textContent).not.toContain("budget");
  });
});

describe("daily spend", () => {
  it("draws one bar a day, marks a day the platform cap was reached, and says the cap", async () => {
    api();
    const host = await open();
    const daily = plot(host, "Daily spend");
    const points = [...daily.querySelectorAll("[data-point]")];
    expect(points.map((point) => point.getAttribute("aria-label"))).toEqual(["1 Aug: $50.00", "2 Aug: $100.00", "3 Aug: $150.00"]);
    expect(points.map((point) => point.getAttribute("data-tone"))).toEqual([null, "attention", null]);
    expect(host.textContent).toContain("Marked days reached the platform cap of $120.00");
    expect(host.textContent).toContain("UTC days");
  });

  it("says the cap is off when no cap is set", async () => {
    api({ "/summary": { body: { ...SUMMARY, platformCapMicros: null } } });
    const host = await open();
    expect(host.textContent).toContain("The platform cap is off");
    expect(host.textContent).not.toContain("Marked days");
  });
});

describe("where it goes", () => {
  it("lists spend and calls by job, by model and by vendor, with a kind it has no name for as itself", async () => {
    api();
    const host = await open();
    const tables = ledgerTables(host);
    expect(tables[0]!.textContent).toContain("What it pays forCallsSpendShare");
    expect(tables[0]!.textContent).toContain("Filing and answeringdump.answer20$200.00");
    expect(tables[0]!.textContent).toContain("mystery.kind1$10.00");
    expect(tables[1]!.textContent).toContain("ModelCallsSpendShare");
    expect(tables[1]!.textContent).toContain("claude-sonnet-530$300.00");
    expect(tables[2]!.textContent).toContain("VendorCallsSpendShare");
    expect(tables[2]!.textContent).toContain("The model30$300.00");
  });

  it("says not recorded for a vendor the ledger never hears from, never a zero", async () => {
    api();
    const host = await open();
    const vendors = ledgerTables(host)[2]!;
    const row = [...vendors.querySelectorAll('[role="row"]')].find((one) => one.textContent!.includes("Embeddings"))!;
    expect(row.textContent).toBe("Embeddingsnot recorded");
  });
});

describe("trends", () => {
  it("draws each figure as small multiples, one plot per series", async () => {
    api();
    const host = await open();
    for (const metric of ["Spend", "Calls", "Input tokens", "Output tokens", "Cache read tokens", "Cache write tokens"]) {
      for (const series of ["Everything", "Filing and answering", "Nightly pass"]) {
        expect(plot(host, `${metric}, ${series}`), `${metric}, ${series}`).not.toBeNull();
      }
    }
    const spend = plot(host, "Spend, Filing and answering").querySelector("[data-point]")!;
    expect(spend.getAttribute("aria-label")).toBe("1 Aug: $70.00");
    const input = plot(host, "Input tokens, Everything").querySelector("[data-point]")!;
    expect(input.getAttribute("aria-label")).toBe("1 Aug: 1,200");
  });

  it("splits by model when asked", async () => {
    api();
    const host = await open();
    expect(paths()).toContain("/costs/trends?dim=job&range=30d");
    const split = host.querySelector('[role="radiogroup"][aria-label="Split trends by"]')!;
    await click([...split.querySelectorAll("button")].find((one) => one.textContent === "Model")!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(paths()).toContain("/costs/trends?dim=model&range=30d");
    expect(plot(host, "Spend, claude-sonnet-5")).not.toBeNull();
    expect(plot(host, "Spend, Nightly pass")).toBeNull();
  });
});

describe("usage", () => {
  it("draws accounts active, turns, photos, voice notes and mail in", async () => {
    api();
    const host = await open();
    for (const label of ["Accounts active", "Turns", "Photos", "Voice notes", "Mail in"]) expect(plot(host, label), label).not.toBeNull();
    expect(plot(host, "Accounts active").querySelector("[data-point]")!.getAttribute("aria-label")).toBe("1 Aug: 4");
    expect(host.textContent).not.toContain("Turns start");
  });

  it("says where turns start when the range reaches past what is kept", async () => {
    api({ "/usage": { body: { ...USAGE, turnsFrom: "2026-08-02T00:00:00.000Z" } } });
    const host = await open();
    expect(host.textContent).toContain("Turns start on 2 Aug.");
  });
});

describe("heaviest accounts", () => {
  it("lists them by spend, each a link to the person", async () => {
    api();
    const host = await open();
    const table = ledgerTables(host)[3]!;
    const links = [...table.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/admin/people/u8", "/admin/people/u4"]);
    expect(table.textContent).toContain("Owen Pryceowen.pryce@example.test$38.17");
    expect(table.textContent).toContain("jo@example.test$11.40");
  });
});

describe("the range and the export", () => {
  it("reads the range from the address for every figure", async () => {
    search = "range=7d";
    api();
    await open();
    expect(paths().sort()).toEqual(
      [
        // The bill is by month, whatever the range.
        "/billing?months=12",
        "/costs/summary",
        "/costs/daily?range=7d",
        "/costs/by?dim=job&range=7d",
        "/costs/by?dim=model&range=7d",
        "/costs/by?dim=vendor&range=7d",
        "/costs/trends?dim=job&range=7d",
        "/costs/usage?range=7d",
        "/costs/heaviest?range=7d",
      ].sort(),
    );
  });

  it("fetches the CSV with the session and saves it", async () => {
    search = "range=90d";
    api();
    const host = await open();
    const made = vi.fn(() => "blob:costs");
    const dropped = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: made, revokeObjectURL: dropped }));
    const saved: Array<{ href: string; download: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ href: this.href, download: this.download });
    });

    await click(button(host, "Export CSV"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const call = calls.find((one) => one.url.includes("/costs/export.csv"))!;
    expect(call.url).toMatch(/\/v1\/admin\/costs\/export\.csv\?range=90d$/);
    expect(call.init).toMatchObject({ credentials: "include" });
    expect(made).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([{ href: "blob:costs", download: "offload-costs-90d.csv" }]);
    expect(dropped).toHaveBeenCalledWith("blob:costs");
  });

  it("says the export did not happen when it fails, and saves nothing", async () => {
    api({ "/export.csv": { status: 500 } });
    const host = await open();
    const click_ = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await click(button(host, "Export CSV"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(click_).not.toHaveBeenCalled();
    const said = [...host.querySelectorAll('[role="status"]')].map((node) => node.textContent);
    expect(said).toContain("That did not go through. Nothing was exported");
  });
});
