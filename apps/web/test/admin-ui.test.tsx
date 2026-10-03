// @vitest-environment happy-dom
//
// 034. The admin panel's shared pieces: the nav, the states every page has,
// and the vocabulary the six sections build their pages from (AC-7, AC-8).
//
// Each section draws its own page from these, so what is asserted here is
// the contract they rely on: one spinner, a failed read that is never an
// empty list, an empty line with no zero, a control that is 44px to the
// finger whatever it is drawn at, and a plot whose every figure is reachable
// as text and by keyboard.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), push: vi.fn() };
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
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

const ui = await import("../src/app/(admin)/ui");
const { PAGES, landingFor, navFor } = await import("../src/app/(admin)/ui/nav");
const { dollars, outOfBounds } = await import("../src/app/(admin)/ui/format");

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(HERE, "../src/app/(admin)");

afterEach(() => {
  document.body.innerHTML = "";
  router.replace.mockClear();
  search = "";
  vi.unstubAllGlobals();
});

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(node));
  return host;
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("AC-8 the nav", () => {
  it("is two blocks: what support sees, then what only an owner does", () => {
    expect(navFor("owner").map((block) => block.map((page) => page.label))).toEqual([
      ["Waitlist", "People"],
      ["Health", "Costs", "Limits", "Staff", "Audit"],
    ]);
    expect(navFor("support").map((block) => block.map((page) => page.label))).toEqual([["Waitlist", "People"]]);
  });

  it("resolves every glyph to a vendored icon", () => {
    expect(PAGES.map((page) => page.icon)).toEqual(["inbox", "users", "monitor", "blend", "lock", "group", "list"]);
    for (const page of PAGES) {
      expect(existsSync(join(HERE, "../public/icons", `${page.icon}.svg`)), page.icon).toBe(true);
    }
  });

  it("has a page behind every entry", () => {
    for (const page of PAGES) {
      expect(existsSync(join(ADMIN, page.href.slice(1), "page.tsx")), page.href).toBe(true);
    }
  });

  it("lands an owner on Health and support on Waitlist", () => {
    expect(landingFor("owner")).toBe("/admin/health");
    expect(landingFor("support")).toBe("/admin/waitlist");
  });

  it("carries the waitlist's count and Health's, and nothing when all is well", () => {
    const [support, owner] = navFor("owner");
    expect(support!.find((page) => page.label === "Waitlist")!.count).toBe("waiting");
    expect(owner!.find((page) => page.label === "Health")!.count).toBe("wrong");
    expect(PAGES.filter((page) => page.count).length).toBe(2);
  });
});

describe("AC-7 the states every page has", () => {
  it("shows one spinner while loading, named for a screen reader", async () => {
    const host = await render(<ui.Loading />);
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.textContent).toBe("Loading");
  });

  it("says a read failed, beside a way to try again", async () => {
    const retry = vi.fn();
    const host = await render(<ui.Failed what="people" onRetry={retry} />);
    expect(host.textContent).toContain("Couldn't load people.");
    const button = host.querySelector("button")!;
    expect(button.textContent).toBe("Try again");
    await click(button);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("says empty in a short line", async () => {
    const host = await render(<ui.Empty>No dead jobs.</ui.Empty>);
    expect(host.textContent).toBe("No dead jobs.");
  });

  it("reads with the session, says when, and reports a failure as a failure", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    let seen: ReturnType<typeof ui.useAdminRead<{ n: number }>> | null = null;
    function Probe({ path }: { path: string }) {
      seen = ui.useAdminRead<{ n: number }>(path);
      return null;
    }
    await render(<Probe path="/people/stats" />);
    await act(async () => {});
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/\/v1\/admin\/people\/stats$/);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
    expect(seen!.state).toBe("ready");
    expect(seen!.data).toEqual({ n: 1 });
    expect(seen!.asOf).toBeInstanceOf(Date);

    fetcher.mockImplementation(async () => new Response("no", { status: 500 }));
    await act(async () => seen!.reload());
    await act(async () => {});
    expect(seen!.state).toBe("failed");
    // What was on screen stays there: a failed refresh is not an empty page.
    expect(seen!.data).toEqual({ n: 1 });
  });
});

describe("the table", () => {
  const cols = [{ label: "Person" }, { label: "Spend, 30d", w: 96, right: true }];

  it("draws a header from its columns and a row to the same widths", async () => {
    const host = await render(
      <ui.Table cols={cols}>
        <ui.Row cols={cols} cells={["Jo Alves", "$4.20"]} last />
      </ui.Table>,
    );
    const head = host.querySelectorAll('[role="columnheader"]');
    expect([...head].map((cell) => cell.textContent)).toEqual(["Person", "Spend, 30d"]);
    const cells = host.querySelectorAll('[role="cell"]');
    expect(parseInt((cells[1] as HTMLElement).style.width, 10)).toBe(96);
    expect((cells[1] as HTMLElement).style.textAlign).toBe("right");
  });

  it("makes a row a link without wrapping its buttons in one", async () => {
    const host = await render(
      <ui.Table cols={cols}>
        <ui.RowLink cols={cols} href="/admin/people/abc" label="Jo Alves" cells={["Jo Alves", <button key="b">Disable</button>]} last />
      </ui.Table>,
    );
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/admin/people/abc");
    expect(link.querySelector("button")).toBeNull();
    expect(host.querySelector("button")!.textContent).toBe("Disable");
  });
});

describe("a stat, a status and a section", () => {
  it("draws a figure, its note, and the attention tone when asked", async () => {
    const host = await render(
      <ui.Stats>
        <ui.Stat label="On pace for" value="$412" note="over budget by $12" tone="attention" />
        <ui.Stat label="Per account" value="$1.20" />
      </ui.Stats>,
    );
    expect(host.textContent).toContain("On pace for$412over budget by $12");
    expect(host.querySelectorAll("[data-tone='attention']")).toHaveLength(1);
  });

  it("maps a state to a tone in one place, and says an unknown one plainly", async () => {
    expect(ui.toneOf("disabled")).toBe("plain");
    expect(ui.toneOf("invited")).toBe("attention");
    expect(ui.toneOf("active")).toBe("accent");
    expect(ui.toneOf("down")).toBe("danger");
    expect(ui.toneOf("dead")).toBe("danger");
    expect(ui.toneOf("late")).toBe("attention");
    expect(ui.toneOf("something-new")).toBe("plain");
    const host = await render(<ui.StatusPill value="accepted" label="signed up" />);
    expect(host.textContent).toBe("signed up");
    expect(host.querySelector("[data-tone='accent']")).not.toBeNull();
  });

  it("labels a section the way the kit does: a title and a quiet note", async () => {
    const host = await render(<ui.Section note="last 30 days">What has been hit</ui.Section>);
    expect(host.querySelector("h2")!.textContent).toBe("What has been hit");
    expect(host.textContent).toBe("What has been hitlast 30 days");
  });
});

describe("a field with bounds", () => {
  it("refuses a value outside its bounds on the field itself, and names them", async () => {
    const host = await render(<ui.Field label="Turns" value="0" onChange={() => {}} min={1} max={10000} />);
    expect(host.querySelector("input")!.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Between 1 and 10,000.");
    const fine = await render(<ui.Field label="Turns" value="50" onChange={() => {}} min={1} max={10000} />);
    expect(fine.querySelector('[role="alert"]')).toBeNull();
    expect(outOfBounds("abc", 1, 10)).toBe(true);
    expect(outOfBounds("", 1, 10)).toBe(true);
    expect(outOfBounds("10", 1, 10)).toBe(false);
  });

  it("shows an error it was given, and offers the default back", async () => {
    const reset = vi.fn();
    const change = vi.fn();
    const host = await render(<ui.Field label="Turns" value="50" onChange={change} error="Someone else changed this." onReset={reset} />);
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Someone else changed this.");
    await act(async () => type(host.querySelector("input")!, "60"));
    expect(change).toHaveBeenCalledWith("60");
    const button = [...host.querySelectorAll("button")].find((one) => one.textContent === "Reset")!;
    await click(button);
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("a change, old to new", () => {
  it("lists each one as text", async () => {
    const host = await render(<ui.Diff changes={[{ label: "Turns", from: "100", to: "50" }]} />);
    expect(host.textContent).toBe("Turns100to50");
  });
});

describe("the confirm dialog", () => {
  it("asks first, and does nothing on Cancel", async () => {
    const confirm = vi.fn();
    const close = vi.fn();
    const host = await render(<ui.Confirm title="Disable Jo Alves?" body="Nothing is deleted." confirmLabel="Disable" onConfirm={confirm} onClose={close} />);
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("Disable Jo Alves?");
    await click([...host.querySelectorAll("button")].find((one) => one.textContent === "Cancel")!);
    expect(close).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("needs the word typed back before it will act", async () => {
    const confirm = vi.fn();
    const host = await render(
      <ui.Confirm danger title="Delete Jo Alves?" body="This cannot be undone." confirmWord="jo@example.test" confirmLabel="Delete account" onConfirm={confirm} onClose={() => {}} />,
    );
    const act1 = [...host.querySelectorAll("button")].find((one) => one.textContent === "Delete account")! as HTMLButtonElement;
    expect(act1.disabled).toBe(true);
    await act(async () => type(host.querySelector("input")!, "jo@example.test"));
    expect(act1.disabled).toBe(false);
    await click(act1);
    expect(confirm).toHaveBeenCalledOnce();
  });
});

describe("a plot", () => {
  const points = [
    { label: "1 Oct", value: 2 },
    { label: "2 Oct", value: 0 },
    { label: "3 Oct", value: 5, tone: "attention" as const },
  ];

  it("draws one series, and every figure is reachable as text and by keyboard", async () => {
    const host = await render(<ui.Plot label="Daily spend" points={points} format={(n) => `$${n}`} />);
    const svg = host.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Daily spend");
    const marks = [...host.querySelectorAll("[data-point]")];
    expect(marks).toHaveLength(3);
    expect(marks.map((mark) => mark.getAttribute("tabindex"))).toEqual(["0", "0", "0"]);
    expect(marks.map((mark) => mark.getAttribute("aria-label"))).toEqual(["1 Oct: $2", "2 Oct: $0", "3 Oct: $5"]);
    expect(host.querySelectorAll("[data-tone='attention']")).toHaveLength(1);
    // No legend and no second series.
    expect(host.querySelectorAll("svg")).toHaveLength(1);
  });

  it("draws a line when asked, on the same points", async () => {
    const host = await render(<ui.Plot label="Calls" kind="line" points={points} />);
    expect(host.querySelector("polyline")).not.toBeNull();
    expect(host.querySelectorAll("[data-point]")).toHaveLength(3);
  });

  it("says an empty range in a line, and when history starts", async () => {
    const empty = await render(<ui.Plot label="Daily spend" points={[]} empty="Nothing spent in this range." />);
    expect(empty.querySelector("svg")).toBeNull();
    expect(empty.textContent).toBe("Nothing spent in this range.");
    const short = await render(<ui.Plot label="Jobs" points={points} startsAt="History starts 12 September." />);
    expect(short.textContent).toContain("History starts 12 September.");
  });
});

describe("the range", () => {
  it("offers 24 hours, 7, 30 and 90 days, and keeps the choice in the address", async () => {
    search = "dim=model";
    const host = await render(<ui.RangePicker />);
    const options = [...host.querySelectorAll('[role="radio"]')];
    expect(options.map((one) => one.textContent)).toEqual(["24 hours", "7 days", "30 days", "90 days"]);
    expect(options.find((one) => one.getAttribute("aria-checked") === "true")!.textContent).toBe("30 days");
    await click(options[0]!);
    expect(router.replace).toHaveBeenCalledWith("/admin/costs?dim=model&range=24h");
  });

  it("reads the choice back from the address, and anything else as 30 days", async () => {
    search = "range=90d";
    let host = await render(<ui.RangePicker />);
    expect(host.querySelector('[aria-checked="true"]')!.textContent).toBe("90 days");
    search = "range=forever";
    host = await render(<ui.RangePicker />);
    expect(host.querySelector('[aria-checked="true"]')!.textContent).toBe("30 days");
  });
});

describe("money", () => {
  it("is dollars, to the cent", () => {
    expect(dollars(5_000_000)).toBe("$5.00");
    expect(dollars(1_234_567)).toBe("$1.23");
    expect(dollars(0)).toBe("$0.00");
    expect(dollars(1_234_560_000)).toBe("$1,234.56");
  });
});

describe("the stylesheet and the pages", () => {
  const css = readFileSync(join(ADMIN, "admin.module.css"), "utf8");

  function pages(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? pages(path) : name === "page.tsx" ? [path] : [];
    });
  }

  it("declares .note once", () => {
    expect(css.match(/^\.note\s*\{/gm)).toHaveLength(1);
  });

  it("gives a control drawn at 32 a hit area of 44", () => {
    // The ::after reaches past the box it sits on, above and below.
    expect(css).toMatch(/\.ghost::after[^{]*\{[^}]*inset:\s*-\d/);
  });

  it("names colours by what they are for, with the nav's moss the one ramp", () => {
    const ramps = css.match(/var\(--(?:ink|moss|clay|blue|amber)-\d+\)/g) ?? [];
    expect(ramps).toEqual(["var(--moss-700)"]);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
  });

  it("keeps every colour out of the page files", () => {
    const found = pages(join(ADMIN, "admin"));
    expect(found.length).toBeGreaterThanOrEqual(7);
    for (const path of found) {
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toMatch(/var\(--(?!space-|radius-)/);
      expect(text, path).not.toMatch(/#[0-9a-fA-F]{6}\b|rgba?\(/);
    }
  });

  it("pins the panel to light", () => {
    expect(readFileSync(join(ADMIN, "layout.tsx"), "utf8")).toContain('data-theme="light"');
  });
});
