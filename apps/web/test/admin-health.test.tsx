// @vitest-environment happy-dom
//
// 034 AC-7 and section 6, on the Health page: three views kept in the
// address, one spinner while a view loads, a failed read that says so in its
// own place and is never an empty list, empty lines with no zero, and the
// two writes a dead job takes.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), push: vi.fn() };
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/admin/health",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: HealthPage } = await import("../src/app/(admin)/admin/health/page");
const { AdminProvider } = await import("../src/app/(admin)/admin-context");

const SERVICES = {
  services: [
    { service: "core-api", status: "up", uptime: 0.99987, startedAt: "2026-10-03T09:00:00.000Z", commit: "abc1234def5678", reportedBy: "itself", migrations: { count: 79, latest: "0079_vendor_costs.sql" } },
    { service: "worker", status: "up", uptime: 1, startedAt: "2026-10-03T09:01:00.000Z", commit: null, reportedBy: "itself", migrations: null },
    { service: "web", status: "up", uptime: 0.5, startedAt: null, commit: "web5678", reportedBy: "core-api", migrations: null },
    { service: "database", status: "none", uptime: null, startedAt: null, commit: null, reportedBy: "core-api", migrations: null },
  ],
};
const INCIDENTS = {
  incidents: [
    { service: "worker", began: "2026-10-02T10:00:00.000Z", ended: "2026-10-02T10:12:00.000Z", seconds: 720 },
    { service: "web", began: "2026-10-03T08:00:00.000Z", ended: null, seconds: 4000 },
  ],
};
const QUEUE = {
  now: {
    waiting: [
      { priority: "interactive", count: 1 },
      { priority: "scheduled", count: 2 },
      { priority: "background", count: 0 },
    ],
    oldestSeconds: 185,
    running: 4,
  },
  points: [
    { at: "2026-10-01T00:00:00.000Z", finished: 10, failed: 1, dead: 0, waitMsSum: 5000, waitMsP95: 900 },
    { at: "2026-10-02T00:00:00.000Z", finished: 0, failed: 0, dead: 0, waitMsSum: 0, waitMsP95: 0 },
    { at: "2026-10-03T00:00:00.000Z", finished: 30, failed: 2, dead: 1, waitMsSum: 60000, waitMsP95: 4000 },
  ],
  historyStarts: "2026-10-02T05:00:00.000Z",
};
// Midday UTC, so it is 3 October wherever the suite runs.
const BACKUPS = { last: { finishedAt: "2026-10-03T12:00:00.000Z", bytes: 1288490189, ok: true }, late: false };
const REVOCATIONS = { unopenable: [] as { since: string }[] };

const SCHEDULED = {
  jobs: [
    {
      kind: "jobs.purge",
      does: "Removes finished jobs past 30 days, and everything else kept on a clock.",
      cadence: "daily",
      runner: "api",
      perAccount: false,
      last: { at: "2026-10-03T02:00:00.000Z", outcome: "done", durationMs: 1200 },
      next: "2026-10-04T02:00:00.000Z",
      runs: 30,
      failures: 1,
      late: false,
    },
    {
      kind: "thread.nightly",
      does: "The nightly pass: keeps one member's notes in one thread true.",
      cadence: "daily",
      runner: "worker",
      perAccount: true,
      last: null,
      next: null,
      runs: 0,
      failures: 0,
      late: true,
    },
  ],
};
const VOLUME = {
  points: [
    { at: "2026-10-02T00:00:00.000Z", runs: 1, failures: 0 },
    { at: "2026-10-03T00:00:00.000Z", runs: 2, failures: 1 },
  ],
  nights: null,
  historyStarts: null,
};
const NIGHTS = {
  points: VOLUME.points,
  nights: [
    { at: "2026-10-02T00:00:00.000Z", booked: 0, finished: 0, failed: 0 },
    { at: "2026-10-03T00:00:00.000Z", booked: 14, finished: 12, failed: 2 },
  ],
  historyStarts: null,
};
const STUCK = { jobs: [{ id: "s1", kind: "dump.answer", since: "2026-10-03T10:00:00.000Z", seconds: 1260, attempts: 1, account: { id: "acc-1", name: "Jo Alves" } }] };
const DEAD = {
  jobs: [
    { id: "d1", kind: "dump.answer", at: "2026-10-03T09:30:00.000Z", attempts: 2, errorCode: "model_error", retried: false, account: { id: "acc-1", name: "Jo Alves" } },
    { id: "d2", kind: "jobs.purge", at: "2026-10-03T02:00:00.000Z", attempts: 3, errorCode: "handler_error", retried: true, account: null },
  ],
  nextCursor: null,
};

const CALLS = {
  kinds: [
    {
      kind: "dump.answer",
      calls: 120,
      failures: 3,
      p50: 850,
      p95: 4200,
      points: [
        { at: "2026-10-02T00:00:00.000Z", calls: 0, failures: 0, p50: null, p95: null },
        { at: "2026-10-03T00:00:00.000Z", calls: 120, failures: 3, p50: 850, p95: 4200 },
      ],
    },
    {
      kind: "thread.nightly",
      calls: 14,
      failures: 0,
      p50: 9000,
      p95: 20000,
      points: [
        { at: "2026-10-02T00:00:00.000Z", calls: 14, failures: 0, p50: 9000, p95: 20000 },
        { at: "2026-10-03T00:00:00.000Z", calls: 0, failures: 0, p50: null, p95: null },
      ],
    },
  ],
};
const VENDORS = {
  vendors: [
    { vendor: "model", recorded: true, calls: 134, failures: 3 },
    { vendor: "mail", recorded: true, calls: 0, failures: 0 },
    { vendor: "maps", recorded: false, calls: null, failures: null },
  ],
};

type Answer = { status?: number; body?: unknown } | "pending";
type Call = { path: string; method: string };
let calls: Call[] = [];

/** Answers by the path's start, most specific first. Anything not named
 *  answers with its fixture. */
function api(overrides: Record<string, Answer> = {}) {
  calls = [];
  const fixtures: Array<[string, unknown]> = [
    ["/health/services", SERVICES],
    ["/health/incidents", INCIDENTS],
    ["/health/queue", QUEUE],
    ["/health/backups", BACKUPS],
    ["/health/revocations", REVOCATIONS],
    ["/health/scheduled/thread.nightly", NIGHTS],
    ["/health/scheduled/", VOLUME],
    ["/health/scheduled", SCHEDULED],
    ["/health/stuck", STUCK],
    ["/health/dead", DEAD],
    ["/health/calls", CALLS],
    ["/health/vendors", VENDORS],
    ["/jobs/", { status: "queued" }],
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      calls.push({ path, method: init?.method ?? "GET" });
      const override = Object.entries(overrides).find(([start]) => path.startsWith(start))?.[1];
      if (override === "pending") return new Promise<Response>(() => {});
      const fixture = fixtures.find(([start]) => path.startsWith(start));
      return new Response(JSON.stringify(override?.body ?? fixture?.[1] ?? {}), { status: override?.status ?? (fixture ? 200 : 404) });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  router.replace.mockClear();
  search = "";
  vi.unstubAllGlobals();
});

async function open(staff: { role: "owner" | "support"; wrong: number } = { role: "owner", wrong: 0 }) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <AdminProvider value={{ staff: { email: "owner@example.test", waiting: 0, ...staff }, refresh: () => {} }}>
        <HealthPage />
      </AdminProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;
const buttons = (host: Element, text: string) => [...host.querySelectorAll("button")].filter((one) => one.textContent === text);
const click = async (node: Element) => {
  await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle();
};
const rows = (host: Element) => [...host.querySelectorAll('[role="row"]')].map((row) => row.textContent ?? "");
const paths = (method = "GET") => calls.filter((call) => call.method === method).map((call) => call.path);

describe("the three views", () => {
  it("offers Now, Jobs and Calls beside the range, and opens on Now", async () => {
    api();
    const host = await open();
    const view = host.querySelector('[role="radiogroup"][aria-label="View"]')!;
    expect([...view.querySelectorAll('[role="radio"]')].map((one) => one.textContent)).toEqual(["Now", "Jobs", "Calls"]);
    expect(view.querySelector('[aria-checked="true"]')!.textContent).toBe("Now");
    expect(host.querySelector('[role="radiogroup"][aria-label="Range"]')).not.toBeNull();
    expect(host.querySelector("h1")!.textContent).toBe("Health");
  });

  it("keeps the view in the address, beside the range", async () => {
    search = "range=7d";
    api();
    const host = await open();
    await click(button(host, "Jobs"));
    expect(router.replace).toHaveBeenCalledWith("/admin/health?range=7d&view=jobs");
  });

  it("reads the view and the range back from the address", async () => {
    search = "view=calls&range=90d";
    api();
    const host = await open();
    expect(host.querySelector('[aria-label="View"] [aria-checked="true"]')!.textContent).toBe("Calls");
    expect(paths()).toEqual(["/health/calls?range=90d", "/health/vendors?range=90d"]);
  });

  it("reads only the view that is open", async () => {
    api();
    await open();
    expect(paths()).toEqual(["/health/services?range=30d", "/health/incidents?range=30d", "/health/queue?range=30d", "/health/backups", "/health/revocations"]);
  });
});

describe("AC-7 the states, on each view", () => {
  for (const view of ["now", "jobs", "calls"]) {
    it(`shows one spinner while ${view} loads, and no table`, async () => {
      search = `view=${view}`;
      api({ "/health/": "pending" });
      const host = await open();
      expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(host.querySelector('[role="table"]')).toBeNull();
      // The page keeps its tools.
      expect(host.querySelector('[aria-label="View"]')).not.toBeNull();
    });
  }

  it("says a section failed in its own place, and the rest stays", async () => {
    api({ "/health/incidents": { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the incidents.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.textContent).not.toContain("No incidents");
    expect(rows(host).some((row) => row.includes("Core API"))).toBe(true);
  });

  it("tries a failed section again", async () => {
    api({ "/health/dead": { status: 500 } });
    search = "view=jobs";
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the dead jobs.");
    expect(host.textContent).not.toContain("No dead jobs.");
    api();
    await click(button(host, "Try again"));
    expect(host.textContent).not.toContain("Couldn't load");
    expect(rows(host).some((row) => row.includes("model_error"))).toBe(true);
  });

  it("says empty in a short line with no zero", async () => {
    api({ "/health/incidents": { body: { incidents: [] } } });
    const host = await open();
    expect(host.textContent).toContain("No incidents in 30 days.");

    search = "view=jobs";
    api({ "/health/stuck": { body: { jobs: [] } }, "/health/dead": { body: { jobs: [], nextCursor: null } } });
    const jobs = await open();
    expect(jobs.textContent).toContain("No stuck jobs.");
    expect(jobs.textContent).toContain("No dead jobs.");

    search = "view=calls";
    api({ "/health/calls": { body: { kinds: [] } } });
    const none = await open();
    expect(none.textContent).toContain("No model calls in 30 days.");
  });

  it("says when it was read, and refreshes every read of the view", async () => {
    api();
    const host = await open();
    expect(host.textContent).toMatch(/As of \d\d:\d\d/);
    const before = paths().length;
    await click(button(host, "Refresh"));
    expect(paths().length).toBe(before + 5);
  });
});

describe("Now", () => {
  it("draws each service with its state, uptime, start and commit", async () => {
    api();
    const host = await open();
    const all = rows(host);
    const api_ = all.find((row) => row.startsWith("Core API"))!;
    expect(api_).toContain("79 migrations, latest 0079_vendor_costs.sql");
    expect(api_).toContain("up");
    expect(api_).toContain("99.98%");
    expect(api_).toContain("abc1234");
    expect(api_).not.toContain("abc1234def5678");
    expect(all.find((row) => row.startsWith("The worker"))).toContain("unknown");
    expect(all.find((row) => row.startsWith("The web"))).toContain("checked by the Core API");
    const database = all.find((row) => row.startsWith("The database"))!;
    expect(database).toContain("no heartbeat yet");
    expect(database).not.toContain("down");
  });

  it("lists incidents with how long each lasted, and the one still open", async () => {
    api();
    const host = await open();
    const all = rows(host);
    expect(all.some((row) => row.includes("The worker") && row.includes("12 min"))).toBe(true);
    expect(all.some((row) => row.includes("The web") && row.includes("still down"))).toBe(true);
  });

  it("gives the queue now and over the range, and plots the wait", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("Waiting3");
    expect(host.textContent).toContain("1 interactive · 2 scheduled");
    expect(host.textContent).toContain("oldest due 3 min ago");
    expect(host.textContent).toContain("Running4");
    expect(host.textContent).toContain("Finished40");
    expect(host.textContent).toContain("Failed or died4");
    const plot = host.querySelector('svg[aria-label="Mean wait per day"]')!;
    const marks = [...plot.querySelectorAll("[data-point]")].map((mark) => mark.getAttribute("aria-label"));
    expect(marks).toEqual(["1 Oct: 500 ms", "2 Oct: 0 ms", "3 Oct: 2.0 s"]);
    expect(host.textContent).toContain("History starts 2 Oct.");
  });

  it("says none where nothing is waiting, not a zero", async () => {
    api({ "/health/queue": { body: { ...QUEUE, now: { waiting: QUEUE.now.waiting.map((one) => ({ ...one, count: 0 })), oldestSeconds: null, running: 0 } } } });
    const host = await open();
    expect(host.textContent).toContain("WaitingNone");
    expect(host.textContent).toContain("RunningNone");
  });

  it("gives the last backup's finish and size", async () => {
    api();
    const host = await open();
    const row = rows(host).find((one) => one.includes("1.2 GB"))!;
    expect(row).toContain("3 Oct");
    expect(row).toContain("ok");
    expect(row).not.toContain("late");
  });

  it("marks the backup late, and says so when none was ever recorded", async () => {
    api({ "/health/backups": { body: { last: null, late: true } } });
    const host = await open({ role: "owner", wrong: 1 });
    expect(host.textContent).toContain("No backup has been recorded.");
    expect(host.textContent).toContain("late");
  });

  it("lists each calendar grant kept for a revoke by hand, with its age, and is not well while one is", async () => {
    // S27. A rotated vault key left a grant live at Google.
    const since = new Date(Date.now() - 3 * 86_400_000 - 2 * 3_600_000).toISOString();
    api({ "/health/incidents": { body: { incidents: [] } }, "/health/revocations": { body: { unopenable: [{ since }] } } });
    const host = await open();
    expect(host.textContent).toContain("Calendar grants");
    expect(rows(host).find((one) => one.includes("3 d 2 h"))).toBeDefined();
    expect(host.textContent).not.toContain("All is well.");

    api();
    expect((await open()).textContent).toContain("None to revoke by hand.");
  });

  it("says all is well in one line at the top when nothing is wrong", async () => {
    api({ "/health/incidents": { body: { incidents: [] } } });
    const host = await open({ role: "owner", wrong: 0 });
    expect(host.textContent).toContain("All is well.");
  });

  it("does not say so with a service down, a late backup, or anything counted wrong", async () => {
    api({ "/health/incidents": { body: { incidents: [] } }, "/health/services": { body: { services: SERVICES.services.map((one) => (one.service === "worker" ? { ...one, status: "down" } : one)) } } });
    expect((await open()).textContent).not.toContain("All is well.");

    api({ "/health/incidents": { body: { incidents: [] } }, "/health/backups": { body: { ...BACKUPS, late: true } } });
    expect((await open()).textContent).not.toContain("All is well.");

    api({ "/health/incidents": { body: { incidents: [] } } });
    expect((await open({ role: "owner", wrong: 2 })).textContent).not.toContain("All is well.");
  });
});

describe("Jobs", () => {
  it("lists every scheduled job with what it does, its schedule, last and next run and counts", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    const purge = rows(host).find((row) => row.startsWith("The daily purge"))!;
    expect(purge).toContain("Removes finished jobs past 30 days");
    expect(purge).toContain("daily");
    expect(purge).toContain("done");
    expect(purge).toContain("301");
    const nightly = rows(host).find((row) => row.startsWith("The nightly pass"))!;
    expect(nightly).toContain("late");
    expect(nightly).toContain("not yet");
    expect(nightly).toContain("nothing booked");
  });

  it("opens a row to its volume per day", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    expect(host.querySelector("svg")).toBeNull();
    const open_ = buttons(host, "Volume")[0]!;
    expect(open_.getAttribute("aria-expanded")).toBe("false");
    await click(open_);
    expect(paths()).toContain("/health/scheduled/jobs.purge?range=30d");
    const plot = host.querySelector('svg[aria-label="Runs per day, The daily purge"]')!;
    expect([...plot.querySelectorAll("[data-point]")].map((mark) => mark.getAttribute("aria-label"))).toEqual(["2 Oct: 1", "3 Oct: 2"]);
    expect(button(host, "Hide").getAttribute("aria-expanded")).toBe("true");
    // What opened is a row of the table with one cell, and the button says
    // which it controls.
    const opened = host.querySelector(`[id="${button(host, "Hide").getAttribute("aria-controls")}"]`)!;
    expect(opened.getAttribute("role")).toBe("row");
    expect(opened.querySelectorAll(':scope > [role="cell"]')).toHaveLength(1);
    expect(opened.querySelector("svg")).toBe(plot);
    await click(button(host, "Hide"));
    expect(host.querySelector("svg")).toBeNull();
  });

  it("shows the nightly pass per night: booked, finished and failed", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    await click(buttons(host, "Volume")[1]!);
    const night = rows(host).find((row) => row.startsWith("3 Oct") && row.includes("14"))!;
    expect(night).toBe("3 Oct14122");
    // A night with nothing booked is not a row of the nights table, which
    // sits inside the opened row's one cell.
    const nights = [...host.querySelectorAll('[role="cell"] [role="table"] [role="row"]')].map((row) => row.textContent ?? "");
    expect(nights).toContain("3 Oct14122");
    expect(nights.some((row) => row.startsWith("2 Oct"))).toBe(false);
  });

  it("lists what is stuck, with the person as a link", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    const stuck = rows(host).find((row) => row.includes("21 min"))!;
    expect(stuck).toContain("Answering a dump");
    expect(host.querySelector('a[href="/admin/people/acc-1"]')!.textContent).toBe("Jo Alves");
  });

  it("lists dead jobs with their error code, and offers Retry once", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    const dead = rows(host).filter((row) => row.includes("_error"));
    expect(dead[0]).toContain("Answering a dump");
    expect(dead[0]).toContain("model_error");
    expect(dead[0]).toContain("Jo Alves");
    expect(dead[1]).toContain("handler_error");
    expect(dead[1]).toContain("retried once");
    expect(buttons(host, "Retry")).toHaveLength(1);
    expect(buttons(host, "Dismiss")).toHaveLength(2);
  });

  it("retries a dead job and says so", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    await click(button(host, "Retry"));
    // It can send mail or a push to a real person again, so it asks first.
    expect(paths("POST")).toEqual([]);
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Answering a dump, died 3 Oct");
    expect(dialog.textContent).toContain("It gets one more attempt, and may send again what it sends.");
    await click(button(dialog, "Retry"));
    expect(paths("POST")).toEqual(["/jobs/d1/retry"]);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("Retrying");
    // The list is read again.
    expect(paths().filter((path) => path.startsWith("/health/dead"))).toHaveLength(2);
  });

  it("says what did not happen when a retry is refused", async () => {
    search = "view=jobs";
    api({ "/jobs/": { status: 409, body: { error: "at_limit" } } });
    const retry = async (page: Element) => {
      await click(button(page, "Retry"));
      await click(button(page.querySelector('[role="dialog"]')!, "Retry"));
    };
    let host = await open();
    await retry(host);
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("Not retried. That account is at its limit");

    api({ "/jobs/": { status: 409, body: { error: "account_off" } } });
    host = await open();
    await retry(host);
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("Not retried. That account is disabled");

    api({ "/jobs/": { status: 500 } });
    host = await open();
    await retry(host);
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("That did not go through. The job was not retried");
  });

  it("asks before it dismisses, and says what dismissing does", async () => {
    search = "view=jobs";
    api();
    const host = await open();
    await click(buttons(host, "Dismiss")[0]!);
    expect(paths("POST")).toEqual([]);
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("It leaves this list. Its record is kept");
    await click(button(dialog, "Dismiss"));
    expect(paths("POST")).toEqual(["/jobs/d1/dismiss"]);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("Dismissed");
  });

  it("says why a dismiss was refused, one line a reason", async () => {
    const dismiss = async (page: Element) => {
      await click(buttons(page, "Dismiss")[0]!);
      await click(button(page.querySelector('[role="dialog"]')!, "Dismiss"));
    };
    search = "view=jobs";
    api({ "/jobs/": { status: 409, body: { error: "not_dead" } } });
    let host = await open();
    await dismiss(host);
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("Not dismissed. That job is no longer dead");

    api({ "/jobs/": { status: 409, body: { error: "already_dismissed" } } });
    host = await open();
    await dismiss(host);
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("Not dismissed. It was dismissed already");

    api({ "/jobs/": { status: 500 } });
    host = await open();
    await dismiss(host);
    expect(host.querySelector('p[role="status"]')!.textContent).toBe("That did not go through. The job was not dismissed");
  });

  it("does not draw Dismiss for anybody but an owner", async () => {
    search = "view=jobs";
    api();
    const host = await open({ role: "support", wrong: 0 });
    expect(buttons(host, "Dismiss")).toHaveLength(0);
    expect(buttons(host, "Retry")).toHaveLength(1);
  });

  it("loads more dead jobs by cursor, and keeps the ones it had", async () => {
    search = "view=jobs";
    api({ "/health/dead": { body: { jobs: [DEAD.jobs[0]], nextCursor: "abc" } } });
    const host = await open();
    api({ "/health/dead": { body: { jobs: [DEAD.jobs[1]], nextCursor: null } } });
    await click(button(host, "Load more"));
    expect(paths()).toContain("/health/dead?cursor=abc");
    expect(rows(host).filter((row) => row.includes("_error"))).toHaveLength(2);
    expect(button(host, "Load more")).toBeUndefined();
  });
});

describe("Calls", () => {
  it("lists model calls per job with failures and latency", async () => {
    search = "view=calls";
    api();
    const host = await open();
    const answer = rows(host).find((row) => row.startsWith("Answering a dump"))!;
    expect(answer).toContain("120");
    expect(answer).toContain("850 ms");
    expect(answer).toContain("4.2 s");
  });

  it("plots the latency of the job chosen, the busiest first", async () => {
    search = "view=calls";
    api();
    const host = await open();
    const median = () => host.querySelector('svg[aria-label^="Median latency per day"]')!;
    expect(median().getAttribute("aria-label")).toBe("Median latency per day, Answering a dump");
    expect([...median().querySelectorAll("[data-point]")].map((mark) => mark.getAttribute("aria-label"))).toEqual(["2 Oct: 0 ms", "3 Oct: 850 ms"]);
    expect(host.querySelector('svg[aria-label="95th percentile latency per day, Answering a dump"]')).not.toBeNull();

    const pick = buttons(host, "Plot");
    expect(pick.map((one) => one.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    await click(pick[1]!);
    expect(median().getAttribute("aria-label")).toBe("Median latency per day, The nightly pass");
  });

  it("says not recorded for a company offload records nothing about, never a zero", async () => {
    search = "view=calls";
    api();
    const host = await open();
    expect(rows(host).find((row) => row.startsWith("The model"))).toBe("The model1343");
    expect(rows(host).find((row) => row.startsWith("Mail"))).toBe("Mail00");
    expect(rows(host).find((row) => row.startsWith("Maps"))).toBe("Mapsnot recorded");
  });
});

describe("AC-8 the page's own controls", () => {
  it("gives the link to a person a hit area of 44, as every control here has", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/app/(admin)/admin.module.css"), "utf8");
    expect(css).toMatch(/\.healthLink::after\s*\{[^}]*inset:\s*-\d/);
  });
});
