// @vitest-environment happy-dom
//
// 034 section A, a person's page (AC-7, AC-18, AC-19, AC-20, AC-22): one
// account for troubleshooting, with nothing they wrote on it. The sections
// come in a fixed order, a guarded action is not drawn, an owner sets and
// clears an override, the timeline filters and pages, a dead job is retried
// through Health's route, and opening the page is recorded by a POST.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/people/p1",
  useSearchParams: () => new URLSearchParams(search),
  useParams: () => ({ id: "p1" }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: PersonPage } = await import("../src/app/(admin)/admin/people/[id]/page");

const cap = (key: string, used: number, limit: number) => ({ key, used, limit, reached: used >= limit });
const limit = (key: string, kind: string, global: number, min: number, max: number, over: Record<string, unknown> = {}) => ({
  key, kind, global, override: null, min, max, setBy: null, setAt: null, ...over,
});

const PERSON = {
  id: "p1",
  name: "Ana Duarte",
  email: "ana@example.test",
  state: "active",
  joined: "2026-03-04T10:00:00.000Z",
  firstSignedInAt: "2026-03-05T10:00:00.000Z",
  lastActive: "2026-10-02T09:30:00.000Z",
  disabledAt: null,
  providers: ["apple"],
  country: "PT",
  timeZone: "Europe/Lisbon",
  consentVersion: "2026-09-20",
  invitedBy: { id: "s1", name: "Hana Ito" },
  deleteAfter: null,
  can: { disable: true, enable: false, limits: true, delete: false, cancelDelete: false },
  today: {
    caps: [
      cap("cap.spend_micros", 430_000, 5_000_000),
      cap("cap.turns", 7, 7),
      cap("cap.photos", 2, 200),
      cap("cap.photo_bytes", 4 * 1024 * 1024, 500 * 1024 * 1024),
      cap("cap.voice_notes", 2, 100),
      cap("cap.voice_ms", 120_000, 3_600_000),
      cap("cap.mail_day", 5, 100),
      cap("cap.mail_hour", 3, 30),
      cap("cap.storage_bytes", 312 * 1024 * 1024, 1024 * 1024 * 1024),
    ],
    refused: { cap: "cap.turns", scope: "account" },
  },
  limits: [
    limit("cap.spend_micros", "micros", 5_000_000, 100_000, 1_000_000_000),
    limit("cap.turns", "int", 100, 1, 10_000, { override: 7, setBy: { id: "s1", name: "Hana Ito" }, setAt: "2026-10-01T12:00:00.000Z" }),
    limit("cap.photos", "int", 200, 1, 10_000),
    limit("cap.photo_bytes", "int", 500 * 1024 * 1024, 1024 * 1024, 50 * 1024 * 1024 * 1024),
    limit("cap.voice_notes", "int", 100, 1, 10_000),
    limit("cap.voice_ms", "int", 3_600_000, 60_000, 86_400_000),
    limit("cap.mail_day", "int", 100, 1, 10_000),
    limit("cap.mail_hour", "int", 30, 1, 10_000),
  ],
  has: {
    threadsAlone: 9,
    threadsShared: 3,
    dumped: 412,
    notes: 88,
    connections: 4,
    files: 61,
    fileBytes: 12 * 1024 * 1024,
    calendars: 1,
    calendarSync: "failed",
    devices: { ios: 1, android: 2 },
    sessions: 3,
    sessionLastUsed: "2026-10-02T09:30:00.000Z",
  },
};

const USAGE = {
  days: [
    { day: "2026-10-01", costMicros: 120_000, turns: 4, photos: 1, voiceNotes: 0, mail: 2 },
    { day: "2026-10-02", costMicros: 310_000, turns: 3, photos: 1, voiceNotes: 2, mail: 3 },
  ],
};

const job = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "dump.answer", state: "done", attempts: 1, at: "2026-10-02T09:30:00.000Z", durationMs: 3200, errorCode: null, model: null, tokensIn: null, tokensOut: null, costMicros: null, canRetry: false, ...over,
});
const TIMELINE = {
  rows: [job("j1", { model: "claude-haiku-4-5, claude-sonnet-5", tokensIn: 15_200, tokensOut: 310, costMicros: 52_000 }), job("j2", { state: "dead", attempts: 2, errorCode: "model_error", canRetry: true }), job("j3", { kind: "thread.nightly", state: "queued", attempts: 0, durationMs: null })],
  nextCursor: "c2",
};
const HITS = { rows: [{ cap: "cap.turns", scope: "account", day: "2026-10-02", count: 3, lastAt: "2026-10-02T19:10:00.000Z" }, { cap: "platform.spend_micros", scope: "platform", day: "2026-09-30", count: 1, lastAt: "2026-09-30T08:00:00.000Z" }] };

type Call = { path: string; init?: RequestInit };
let calls: Call[] = [];

interface Answers {
  person?: unknown;
  /** The 410 a deleted account's page answers with. */
  gone?: { error: "deleted"; deletedAt: string };
  audit?: { status?: number; rows?: unknown[] };
  status?: Partial<Record<"person" | "usage" | "timeline" | "hits" | "write", number>>;
  timeline?: (path: string) => unknown;
  hits?: unknown;
  /** A 409 with this reason, for every write. */
  refused?: string;
}

function api(answers: Answers = {}) {
  calls = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      calls.push({ path, init });
      if (init?.method && init.method !== "GET") {
        if (answers.refused) return json({ error: "refused", reason: answers.refused }, 409);
        return json({ status: "ok" }, answers.status?.write ?? 200);
      }
      if (path.startsWith("/people/p1/usage")) return json(USAGE, answers.status?.usage ?? 200);
      if (path.startsWith("/people/p1/timeline")) return json(answers.timeline ? answers.timeline(path) : TIMELINE, answers.status?.timeline ?? 200);
      if (path.startsWith("/people/p1/hits")) return json(answers.hits ?? HITS, answers.status?.hits ?? 200);
      if (path === "/people/p1" && answers.gone) return json(answers.gone, 410);
      if (path === "/people/p1") return json(answers.person ?? PERSON, answers.status?.person ?? 200);
      if (path.startsWith("/audit")) return json({ rows: answers.audit?.rows ?? [], nextCursor: null }, answers.audit?.status ?? 200);
      return json({}, 404);
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  search = "";
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<PersonPage />));
  await settle();
  await settle();
  return host;
}

const buttons = (host: Element, text: string) => [...host.querySelectorAll("button")].filter((one) => one.textContent === text);
const button = (host: Element, text: string) => buttons(host, text)[0]!;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const writes = () => calls.filter((call) => call.init?.method && call.init.method !== "GET");

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("a person's page", () => {
  it("sits under one back link that says People, with the name, the address and the state", async () => {
    api();
    const host = await open();
    const back = host.querySelector('a[href="/admin/people"]')!;
    expect(back.textContent).toBe("People");
    expect(host.querySelector("h1")!.textContent).toBe("Ana Duarte");
    expect(host.textContent).toContain("ana@example.test");
    expect(host.textContent).toContain("active");
    // The plots' range is in the pane head.
    expect(host.querySelector('[role="radiogroup"][aria-label="Range"]')).not.toBeNull();
  });

  it("draws its sections in order", async () => {
    api();
    const host = await open();
    expect([...host.querySelectorAll("h2")].map((one) => one.textContent)).toEqual([
      "Who", "Today", "Limits", "Cost per day", "Activity per day", "What they have", "What happened", "Limit hits",
    ]);
  });

  it("says who they are, and who invited them by name", async () => {
    api();
    const host = await open();
    const who = host.querySelector('[data-section="who"]')!.textContent!;
    for (const fact of ["NameAna Duarte", "Addressana@example.test", "Joined4 Mar", "Invited byHana Ito", "First signed in5 Mar", "Signs in withApple", "CountryPT", "Time zoneEurope/Lisbon", "Consent2026-09-20"]) {
      expect(who).toContain(fact);
    }
    expect(who).toContain("Last active");
  });

  it("says somebody invited them when that staff account is gone", async () => {
    api({ person: { ...PERSON, invitedBy: { id: "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000", name: null } } });
    const host = await open();
    expect(host.querySelector('[data-section="who"]')!.textContent).toContain("Invited bydeleted account");
  });

  it("rounds what is kept down, as the person's own Settings does", async () => {
    api({ person: { ...PERSON, has: { ...PERSON.has, fileBytes: 12 * 1024 * 1024 + 900 * 1024 } } });
    const host = await open();
    expect(host.querySelector('[data-section="has"]')!.textContent).toContain("Files6112 MB");
  });

  it("leaves the inviter out when the log does not know", async () => {
    api({ person: { ...PERSON, invitedBy: null } });
    const host = await open();
    expect(host.querySelector('[data-section="who"]')!.textContent).not.toContain("Invited by");
  });

  it("measures today against each cap, in the cap's own unit, and says which is refusing them", async () => {
    api();
    const host = await open();
    const today = host.querySelector('[data-section="today"]')!;
    // The caps are named as Limits names them: one set of words.
    expect(today.textContent).not.toContain("Model spend");
    expect(today.textContent).toContain("Spend$0.43of $5.00");
    expect(today.textContent).toContain("Turns7of 7");
    expect(today.textContent).toContain("Photos2of 200 · 4 MB of 500 MB");
    expect(today.textContent).toContain("Voice notes2of 100 · 2 min of 60 min");
    expect(today.textContent).toContain("Mail in5of 100 · 3 of 30 this hour");
    expect(today.querySelectorAll('[data-tone="attention"]')).toHaveLength(1);
    expect(host.textContent).toContain("At a limit now: turns.");
  });

  it("says when it is the platform's cap refusing them", async () => {
    api({ person: { ...PERSON, today: { ...PERSON.today, refused: { cap: "platform.spend_micros", scope: "platform" } } } });
    const host = await open();
    expect(host.textContent).toContain("The platform's cap is refusing everybody now.");
  });

  it("lists each cap with the global value, the override, who set it and when", async () => {
    api();
    const host = await open();
    const table = host.querySelector('[data-section="limits"]')!;
    expect([...table.querySelectorAll('[role="columnheader"]')].map((one) => one.textContent)).toEqual(["Cap", "Global", "Override", "Set by", "When", ""]);
    const rows = [...table.querySelectorAll('[role="row"]')].slice(1);
    expect(rows).toHaveLength(8);
    expect(rows[0]!.textContent).toContain("Spend$5.00");
    expect(rows[1]!.textContent).toContain("Turns1007Hana Ito1 Oct");
    expect(rows[3]!.textContent).toContain("Photo megabytes500 MB");
    expect(rows[5]!.textContent).toContain("Voice minutes60 min");
    // An owner sets one, and clears the one that is set.
    expect(buttons(table, "Set")).toHaveLength(8);
    expect(buttons(table, "Clear")).toHaveLength(1);
  });

  it("shows support the limits and no way to change them", async () => {
    api({ person: { ...PERSON, can: { ...PERSON.can, limits: false } } });
    const host = await open();
    const table = host.querySelector('[data-section="limits"]')!;
    expect(table.textContent).toContain("Turns1007Hana Ito");
    expect(table.querySelectorAll("button")).toHaveLength(0);
  });

  it("sets an override in the cap's unit, inside its bounds, and reads the page again", async () => {
    api();
    const host = await open();
    await click(button(host.querySelector('[data-section="limits"]')!, "Set"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Spend for Ana Duarte");
    const input = dialog.querySelector("input")!;
    const save = button(dialog, "Set") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await act(async () => type(input, "5000"));
    expect(dialog.textContent).toContain("Between 0.1 and 1,000.");
    expect(save.disabled).toBe(true);

    await act(async () => type(input, "12.5"));
    expect(save.disabled).toBe(false);
    const reads = calls.filter((call) => call.path === "/people/p1").length;
    await click(save);
    await settle();
    const patch = writes().find((call) => call.init?.method === "PATCH")!;
    expect(patch.path).toBe("/people/p1/limits");
    expect(JSON.parse(String(patch.init!.body))).toEqual({ key: "cap.spend_micros", value: 12_500_000 });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Override set");
    expect(calls.filter((call) => call.path === "/people/p1").length).toBe(reads + 1);
  });

  it("clears an override with a null", async () => {
    api();
    const host = await open();
    await click(button(host, "Clear"));
    await settle();
    const patch = writes().find((call) => call.init?.method === "PATCH")!;
    expect(JSON.parse(String(patch.init!.body))).toEqual({ key: "cap.turns", value: null });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Override cleared");
  });

  it("says what did not happen when an override is refused", async () => {
    api({ status: { write: 400 } });
    const host = await open();
    await click(button(host, "Clear"));
    await settle();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("That did not go through. The override was not changed");
  });

  it("plots cost and each kind of activity per UTC day, one series each, over the range in the address", async () => {
    search = "range=7d";
    api();
    const host = await open();
    expect(calls.some((call) => call.path === "/people/p1/usage?range=7d")).toBe(true);
    const plots = [...host.querySelectorAll('svg[role="img"]')];
    expect(plots.map((plot) => plot.getAttribute("aria-label"))).toEqual(["Cost per day", "Turns per day", "Photos per day", "Voice notes per day", "Mail in per day"]);
    expect(plots[0]!.querySelectorAll("[data-point]")).toHaveLength(2);
    expect(plots[0]!.querySelector("[data-point]")!.getAttribute("aria-label")).toBe("1 Oct: $0.12");
    expect(plots[1]!.querySelectorAll("[data-point]")[1]!.getAttribute("aria-label")).toBe("2 Oct: 3");
    expect(host.textContent).toContain("UTC days");
  });

  it("says turns go back 30 days when the range is longer", async () => {
    search = "range=90d";
    api();
    const host = await open();
    expect(host.textContent).toContain("Turns are kept for 30 days.");
  });

  it("counts what they have and names none of it", async () => {
    api();
    const host = await open();
    const has = host.querySelector('[data-section="has"]')!;
    expect(has.textContent).toContain("Threads129 alone, 3 shared");
    expect(has.textContent).toContain("Dumped412");
    expect(has.textContent).toContain("Notes88");
    expect(has.textContent).toContain("Connections4");
    expect(has.textContent).toContain("Files6112 MB");
    // 036. Everything kept against its cap, beside the files, not under Today.
    expect(has.textContent).toContain("Storage312 MBof 1,024 MB, less what they left in threads");
    expect(host.querySelector('[data-section="today"]')!.textContent).not.toContain("Storage");
    expect(has.textContent).toContain("Calendars1last sync failed");
    expect(has.textContent).toContain("Devices31 iOS, 2 Android");
    expect(has.textContent).toContain("Sessions3last used");
    expect(has.querySelectorAll('[data-tone="attention"]')).toHaveLength(1);
  });

  it("lists what happened with the code, filters to failures, and loads more", async () => {
    api({ timeline: (path) => (path.includes("cursor=c2") ? { rows: [job("j9", { kind: "account.digest" })], nextCursor: null } : path.includes("failed=1") ? { rows: [TIMELINE.rows[1]], nextCursor: null } : TIMELINE) });
    const host = await open();
    const section = host.querySelector('[data-section="happened"]')!;
    expect([...section.querySelectorAll('[role="columnheader"]')].map((one) => one.textContent)).toEqual(["When", "Kind", "State", "Attempts", "Took", "Model", "Cost", ""]);
    const rows = [...section.querySelectorAll('[role="row"]')].slice(1);
    expect(rows).toHaveLength(3);
    // What the job cost, from the ledger rows that name it: models, tokens in and out, spend.
    expect(rows[0]!.textContent).toContain("dump.answerdone13.2sclaude-haiku-4-5, claude-sonnet-515,200 in, 310 out$0.05");
    // A job that called no model says nothing there, and never a zero.
    expect(rows[2]!.textContent).not.toContain("$");
    expect(rows[2]!.textContent).not.toContain(" in, ");
    expect(rows[1]!.textContent).toContain("dead2");
    expect(rows[1]!.textContent).toContain("model_error");
    expect(buttons(section, "Retry")).toHaveLength(1);
    expect(host.textContent).toContain("30 days, which is how long jobs are kept");

    await click(button(section, "Load more"));
    await settle();
    expect(calls.at(-1)!.path).toBe("/people/p1/timeline?cursor=c2");
    expect(section.querySelectorAll('[role="row"]')).toHaveLength(1 + 4);
    expect(section.textContent).toContain("account.digest");

    await click(button(section, "Failures"));
    await settle();
    expect(calls.at(-1)!.path).toBe("/people/p1/timeline?failed=1");
    expect(section.querySelectorAll('[role="row"]')).toHaveLength(1 + 1);
  });

  it("retries a dead job through Health's route, once, and reads the timeline again", async () => {
    api();
    const host = await open();
    const before = calls.filter((call) => call.path.startsWith("/people/p1/timeline")).length;
    await click(button(host, "Retry"));
    // It can send mail or a push to a real person again, so it asks first.
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(writes().some((call) => call.path === "/jobs/j2/retry")).toBe(false);
    expect(dialog.textContent).toContain("dump.answer, died 2 Oct");
    expect(dialog.textContent).toContain("It gets one more attempt, and may send again what it sends.");
    await click(button(dialog, "Retry"));
    await settle();
    const post = writes().find((call) => call.path === "/jobs/j2/retry")!;
    expect(post.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Retrying");
    expect(calls.filter((call) => call.path.startsWith("/people/p1/timeline")).length).toBe(before + 1);
  });

  it("says a retry that was refused, in one clause", async () => {
    api({ status: { write: 409 } });
    const host = await open();
    await click(button(host, "Retry"));
    await click(button(host.querySelector('[role="dialog"]')!, "Retry"));
    await settle();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("That did not go through. Nothing was retried");
  });

  it("lists each time a cap refused them, and whose cap it was", async () => {
    api();
    const host = await open();
    const section = host.querySelector('[data-section="hits"]')!;
    expect([...section.querySelectorAll('[role="columnheader"]')].map((one) => one.textContent)).toEqual(["Day", "Cap", "Whose", "Times"]);
    const rows = [...section.querySelectorAll('[role="row"]')].slice(1);
    expect(rows[0]!.textContent).toBe("2 OctTurnstheirs3");
    expect(rows[1]!.textContent).toBe("30 SeptPlatform spendthe platform's1");
  });

  it("says empty sections in a line with no zero", async () => {
    api({ timeline: () => ({ rows: [], nextCursor: null }), hits: { rows: [] } });
    const host = await open();
    expect(host.textContent).toContain("Nothing has run for them in 30 days.");
    expect(host.textContent).toContain("No cap has refused them in 30 days.");
  });

  it("records nothing when the person did not load", async () => {
    api({ status: { person: 404 } });
    await open();
    expect(writes()).toHaveLength(0);
  });

  it("shows one spinner while loading", async () => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const host = await open();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('a[href="/admin/people"]')).not.toBeNull();
  });

  it("says a failed read failed, beside Try again, under the same back link", async () => {
    api({ status: { person: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load this person.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.querySelector('a[href="/admin/people"]')).not.toBeNull();
    expect(host.querySelectorAll("h2")).toHaveLength(0);
  });

  // A 404 is nobody, not a fault: trying again cannot bring them back.
  it("says nobody is here for an id with no account, under the back link, with no retry", async () => {
    api({ status: { person: 404 } });
    const host = await open();
    expect(host.textContent).toContain("Nobody here.");
    expect(host.textContent).not.toContain("Couldn't load");
    expect(buttons(host, "Try again")).toHaveLength(0);
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('a[href="/admin/people"]')).not.toBeNull();
  });

  it("says why a sign out was refused", async () => {
    api({ refused: "staff" });
    const host = await open();
    await click(button(host, "Sign out everywhere"));
    await click(button(host.querySelector('[role="dialog"]')!, "Sign out"));
    await settle();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Not signed out. That account is staff");
  });

  it("says an account being deleted cannot be enabled", async () => {
    api({ refused: "deleting", person: { ...PERSON, state: "disabled", can: { disable: false, enable: true, limits: true } } });
    const host = await open();
    await click(button(host, "Enable"));
    await settle();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Not enabled. That account is being deleted");
  });

  it("says a section that failed in its own place, and keeps the rest", async () => {
    api({ status: { usage: 500, timeline: 500, hits: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the plots.");
    expect(host.textContent).toContain("Couldn't load what happened.");
    expect(host.textContent).toContain("Couldn't load the limit hits.");
    expect(host.querySelector('[data-section="who"]')!.textContent).toContain("Ana Duarte");
    expect(host.querySelectorAll("h2")).toHaveLength(8);
  });

  it("signs them out everywhere after asking, and leaves the rest alone", async () => {
    api();
    const host = await open();
    await click(button(host, "Sign out everywhere"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Every session of theirs ends now. The account stays active and they can sign in again.");
    await click(button(dialog, "Sign out"));
    await settle();
    expect(writes().some((call) => call.path === "/people/p1/sign-out")).toBe(true);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Signed out everywhere");
  });

  it("disables after asking, and offers Enable on a disabled account", async () => {
    api();
    const host = await open();
    await click(button(host, "Disable"));
    await click(button(host.querySelector('[role="dialog"]')!, "Disable"));
    await settle();
    expect(writes().some((call) => call.path === "/people/p1/disable")).toBe(true);

    document.body.innerHTML = "";
    api({ person: { ...PERSON, state: "disabled", disabledAt: "2026-10-01T10:00:00.000Z", can: { disable: false, enable: true, limits: true } } });
    const disabled = await open();
    expect(buttons(disabled, "Disable")).toHaveLength(0);
    await click(button(disabled, "Enable"));
    await settle();
    expect(writes().some((call) => call.path === "/people/p1/enable")).toBe(true);
  });

  it("does not draw a guarded action, and never Delete", async () => {
    api({ person: { ...PERSON, can: { disable: false, enable: false, limits: false } } });
    const host = await open();
    expect(buttons(host, "Disable")).toHaveLength(0);
    expect(buttons(host, "Enable")).toHaveLength(0);
    expect(buttons(host, "Delete")).toHaveLength(0);
    expect(buttons(host, "Cancel deletion")).toHaveLength(0);
  });

  it("shows nothing a session, a device or a calendar is called", async () => {
    api();
    const host = await open();
    for (const word of ["IP", "User agent", "user agent"]) expect(host.textContent).not.toContain(word);
  });

  // 034 section G.
  const OWNED = { ...PERSON, can: { ...PERSON.can, delete: true } };
  const MARKED = {
    ...PERSON,
    state: "disabled",
    disabledAt: "2026-10-03T14:05:00.000Z",
    deleteAfter: "2026-10-04T14:05:00.000Z",
    can: { disable: false, enable: false, limits: true, delete: false, cancelDelete: true },
  };

  it("deletes once the address is typed back, and posts it", async () => {
    api({ person: OWNED });
    const host = await open();
    const actions = [...host.querySelector('[data-section="actions"]')!.querySelectorAll("button")].map((one) => one.textContent);
    expect(actions).toEqual(["Sign out everywhere", "Disable", "Delete"]);
    await click(button(host, "Delete"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Delete Ana Duarte?");
    expect(dialog.textContent).toContain("its threads, its notes and every conversation");
    expect(dialog.textContent).toContain("24 hours");
    const go = button(dialog, "Delete account") as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await act(async () => type(dialog.querySelector("input")!, "ana@example.test"));
    await click(go);
    await settle();
    const post = writes().find((call) => call.path === "/people/p1/delete")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ email: "ana@example.test" });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Ana Duarte will be deleted in 24 hours");
  });

  it("says when a marked account goes, and cancels", async () => {
    api({ person: MARKED });
    const host = await open();
    expect(host.querySelector('[data-section="who"]')!.textContent).toMatch(/To be deleted 4 Oct, \d\d:05/);
    expect(buttons(host, "Delete")).toHaveLength(0);
    await click(button(host, "Cancel deletion"));
    await settle();
    expect(writes().some((call) => call.path === "/people/p1/delete/cancel")).toBe(true);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Deletion cancelled. Ana Duarte stays disabled");
  });

  it("draws a deleted account as its head, the day it went and its audit entries, and nothing else", async () => {
    api({
      gone: { error: "deleted", deletedAt: "2026-09-12T08:00:00.000Z" },
      audit: {
        rows: [
          { id: "a2", at: "2026-09-12T08:00:00.000Z", kind: "deleted", staff: { id: "s1", name: "Hana Ito", email: "hana@example.test" }, target: { id: "p1", deleted: true }, settingKey: null, old: null, new: null, jobId: null },
          { id: "a1", at: "2026-09-11T08:00:00.000Z", kind: "deletion.scheduled", staff: { id: "s1", name: "Hana Ito", email: "hana@example.test" }, target: { id: "p1", deleted: true }, settingKey: null, old: null, new: null, jobId: null },
        ],
      },
    });
    const host = await open();
    expect(host.querySelector('a[href="/admin/people"]')).not.toBeNull();
    expect(host.textContent).toContain("This account was deleted on 12 September 2026.");
    expect(host.textContent).not.toContain("Nobody here.");
    expect(calls.some((call) => call.path === "/audit?person=p1")).toBe(true);
    const rows = [...host.querySelectorAll('[role="row"]')].slice(1);
    expect(rows.map((one) => one.textContent)).toEqual([expect.stringContaining("Deleted the account"), expect.stringContaining("Scheduled deletion")]);
    expect(rows[0]!.textContent).toContain("Hana Ito");
    // Nothing of the page it was: no section, no action, no other read.
    expect(host.querySelectorAll("[data-section]")).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(calls.some((call) => /usage|timeline|hits/.test(call.path))).toBe(false);
  });

  it("draws the deleted head alone for support, who cannot read the audit log", async () => {
    api({ gone: { error: "deleted", deletedAt: "2026-09-12T08:00:00.000Z" }, audit: { status: 404 } });
    const host = await open();
    expect(host.textContent).toContain("This account was deleted on 12 September 2026.");
    expect(host.querySelectorAll('[role="row"]')).toHaveLength(0);
    expect(host.textContent).not.toContain("Couldn't load");
  });
});
