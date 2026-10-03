// @vitest-environment happy-dom
//
// 034, section D. The Limits page (AC-7, AC-33, AC-34, and AC-35's listing):
// the caps in the units a person reads, one save that shows old to new, a
// conflict that overwrites nothing, a value outside its bounds refused on its
// own field, and what has been hit.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/limits", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: LimitsPage } = await import("../src/app/(admin)/admin/limits/page");
const { CAP_LABELS, capLabel } = await import("../src/app/(admin)/admin/limits/labels");

const MB = 1024 * 1024;
const count = { min: 1, max: 10_000 };

interface Setting {
  key: string;
  kind: string;
  value: unknown;
  default: unknown;
  min: number | null;
  max: number | null;
  nullable: boolean;
  malformed: boolean;
  updatedAt: string | null;
}

/** The registry as `GET /settings` answers it, with nothing stored. */
function settings(over: Record<string, Partial<Setting>> = {}): { settings: Setting[] } {
  const one = (key: string, kind: string, value: unknown, bounds: { min?: number; max?: number } = {}, nullable = false): Setting => ({
    key,
    kind,
    value,
    default: value,
    min: bounds.min ?? null,
    max: bounds.max ?? null,
    nullable,
    malformed: false,
    updatedAt: null,
    ...over[key],
  });
  return {
    settings: [
      one("cap.spend_micros", "micros", 5_000_000, { min: 100_000, max: 1_000_000_000 }),
      one("cap.turns", "int", 100, count),
      one("cap.photos", "int", 200, count),
      one("cap.photo_bytes", "int", 500 * MB, { min: MB, max: 50 * 1024 * MB }),
      one("cap.voice_notes", "int", 100, count),
      one("cap.voice_ms", "int", 3_600_000, { min: 60_000, max: 86_400_000 }),
      one("cap.mail_day", "int", 100, count),
      one("cap.mail_hour", "int", 30, count),
      one("cap.storage_bytes", "int", 1024 * MB, { min: MB, max: 1024 * 1024 * MB }),
      one("platform.spend_micros", "micros", null, { min: 1_000_000, max: 100_000_000_000 }, true),
      one("budget.month_micros", "micros", null, { min: 1_000_000, max: 1_000_000_000_000 }, true),
      one("waitlist.batch", "int", 25, { min: 1, max: 100 }),
      one("switch.web_maps", "bool", true),
      one("switch.maps", "bool", true),
      one("switch.web_search", "bool", true),
      one("switch.web_links", "bool", true),
      one("switch.nightly", "bool", true),
      one("costs.fixed", "money-map", {}, { min: 0, max: 100_000_000_000 }),
    ],
  };
}

const NOW = { spentMicros: 1_510_000, capMicros: null, reached: false };
const NO_HITS = { rows: [], nextCursor: null };
const JO = { id: "0199aaaa-0000-7000-8000-000000000001", name: "Jo Alves", email: "jo@example.test" };

type Answer = { status?: number; body?: unknown } | (() => Promise<Response>);
interface Api {
  settings?: Answer;
  now?: Answer;
  hits?: Answer;
  more?: Answer;
  save?: Answer;
}

let calls: Array<{ url: string; init?: RequestInit }> = [];

function respond(answer: Answer | undefined, fallback: unknown): Promise<Response> {
  if (typeof answer === "function") return answer();
  return Promise.resolve(new Response(JSON.stringify(answer?.body ?? fallback), { status: answer?.status ?? 200 }));
}

function api(answers: Api = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      if (path === "/settings" && init?.method === "PATCH") return respond(answers.save, settings());
      if (path === "/settings") return respond(answers.settings, settings());
      if (path === "/limits/now") return respond(answers.now, NOW);
      if (path.startsWith("/limits/hits?cursor=")) return respond(answers.more, NO_HITS);
      if (path === "/limits/hits") return respond(answers.hits, NO_HITS);
      return new Response("{}", { status: 404 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<LimitsPage />));
  await act(async () => {});
  return host;
}

const settle = () => act(async () => {});
const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text) as HTMLButtonElement | undefined;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

/** The input a label names. */
function field(host: Element, label: string): HTMLInputElement {
  const found = [...host.querySelectorAll("label")].find((one) => one.textContent === label);
  if (!found) throw new Error(`no field labelled ${label}`);
  return host.querySelector(`#${CSS.escape(found.getAttribute("for")!)}`) as HTMLInputElement;
}

/** The switch in the row that carries this name. */
function toggle(host: Element, name: string): HTMLInputElement {
  const row = [...host.querySelectorAll("label")].find((one) => one.querySelector('[role="switch"]') && one.textContent!.startsWith(name));
  if (!row) throw new Error(`no switch named ${name}`);
  return row.querySelector('[role="switch"]') as HTMLInputElement;
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const patch = () => calls.filter((call) => call.init?.method === "PATCH");
const sent = () => JSON.parse(String(patch()[0]!.init!.body)) as { changes: Record<string, unknown>; expected: Record<string, unknown> };

async function saveAndConfirm(host: Element) {
  await click(button(host, "Save changes")!);
  const dialog = host.querySelector('[role="dialog"]')!;
  await click(button(dialog, "Save changes")!);
  await settle();
}

describe("subscriptions, mounted on the page", () => {
  it("draws them after the switches and before what has been hit", async () => {
    api();
    const host = await open();
    const heads = [...host.querySelectorAll("h2")].map((one) => one.textContent);
    expect(heads.indexOf("Subscriptions")).toBeGreaterThan(heads.indexOf("Switches"));
    expect(heads.indexOf("Subscriptions")).toBeLessThan(heads.indexOf("What has been hit"));
    expect(field(host, "Resend").value).toBe("0");
  });

  it("draws them from the page's own read, not a second one", async () => {
    api();
    await open();
    expect(calls.filter((call) => call.url.endsWith("/settings") && !call.init?.method)).toHaveLength(1);
  });

  it("says Saved in the page's one toast, and keeps what was typed above it", async () => {
    api();
    const host = await open();
    await type(field(host, "Turns"), "150");
    await type(field(host, "Resend"), "20");
    await click(button(host, "Save subscriptions")!);
    await settle();
    expect([...host.querySelectorAll('p[role="status"]')].map((one) => one.textContent)).toEqual(["Saved"]);
    // The read that followed the save did not take the page's edit with it.
    expect(field(host, "Turns").value).toBe("150");
  });

  it("leaves the page's next save about its own keys after a subscription is saved", async () => {
    api();
    const host = await open();
    await type(field(host, "Resend"), "20");
    await click(button(host, "Save subscriptions")!);
    await settle();
    expect(JSON.parse(String(patch()[0]!.init!.body))).toEqual({ changes: { "costs.fixed": { resend: 20_000_000 } }, expected: { "costs.fixed": {} } });

    await type(field(host, "Turns"), "150");
    await saveAndConfirm(host);
    // Only what this save changes is compared, so the subscription that moved
    // under the page is not a conflict.
    expect(JSON.parse(String(patch()[1]!.init!.body))).toEqual({ changes: { "cap.turns": 150 }, expected: { "cap.turns": 100 } });
  });
});

describe("AC-7 the states", () => {
  it("shows one spinner while it loads", async () => {
    api({ settings: () => new Promise(() => {}) });
    const host = await open();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.textContent).toContain("Loading");
  });

  it("says a failed read failed, beside Try again, and draws no empty list", async () => {
    api({ settings: { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load limits.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.textContent).not.toContain("Nothing has been refused");
    expect(host.querySelectorAll("input")).toHaveLength(0);
  });

  it("keeps the page when only the figures failed, and says so in their place", async () => {
    api({ now: { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the figures.");
    expect(field(host, "Turns").value).toBe("100");
  });

  it("keeps the page when only the refusals failed, and never calls that empty", async () => {
    api({ hits: { status: 500 } });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load what has been hit.");
    expect(host.textContent).not.toContain("Nothing has been refused");
    expect(field(host, "Turns").value).toBe("100");
  });

  it("says nothing has been refused, with no zero", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("Nothing has been refused in 30 days.");
  });
});

describe("the page as loaded", () => {
  it("heads the pane, says the caps are rolling, and reads Saved while clean", async () => {
    api();
    const host = await open();
    expect(host.querySelector("h1")!.textContent).toBe("Limits");
    expect(host.textContent).toContain("Caps are rolling over the last 24 hours, not reset at midnight.");
    expect(host.textContent).toContain("Saved");
    expect(button(host, "Save changes")).toBeUndefined();
    expect(button(host, "Cancel")).toBeUndefined();
  });

  it("draws the stats row, with the cap off said as off", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("Spent in the last 24 hours$1.51the platform cap is off");
    expect(host.textContent).toContain("Platform capOff");
    expect(host.textContent).toContain("Per person, spend$5.00");
    expect(host.textContent).toContain("Per person, turns100");
    expect(host.querySelector('[data-tone="attention"]')).toBeNull();
  });

  it("puts the spend in the attention tone once the platform cap is reached", async () => {
    api({
      now: { body: { spentMicros: 52_000_000, capMicros: 50_000_000, reached: true } },
      settings: { body: settings({ "platform.spend_micros": { value: 50_000_000 } }) },
    });
    const host = await open();
    expect(host.textContent).toContain("Spent in the last 24 hours$52.00104% of the platform cap");
    expect(host.textContent).toContain("Platform cap$50.00");
    expect(host.querySelector('[data-tone="attention"]')!.textContent).toBe("$52.00");
  });

  it("shows each cap in the unit a person reads, with its bounds as the hint", async () => {
    api();
    const host = await open();
    expect(field(host, "Spend").value).toBe("5");
    expect(field(host, "Turns").value).toBe("100");
    expect(field(host, "Photos").value).toBe("200");
    expect(field(host, "Photo megabytes").value).toBe("500");
    expect(field(host, "Voice notes").value).toBe("100");
    expect(field(host, "Voice minutes").value).toBe("60");
    expect(field(host, "Mail in a day").value).toBe("100");
    expect(field(host, "Mail in an hour").value).toBe("30");
    expect(field(host, "Storage").value).toBe("1024");
    // 036. Not a day's figure, so not under the 24 hour heading.
    const groups = [...host.querySelectorAll("h2")].map((h) => [h.textContent, h.parentElement!.textContent]);
    const daily = groups.find(([label]) => label === "Per person, in any 24 hours")!;
    const kept = groups.find(([label]) => label === "Per person, everything kept")!;
    expect(daily[1]).not.toContain("Storage");
    expect(kept[1]).toContain("Storage");
    expect(field(host, "Waitlist batch, per week").value).toBe("25");
    expect(field(host, "Monthly budget").value).toBe("");
    expect(host.textContent).toContain("0.1 to 1,000");
    expect(host.textContent).toContain("1 to 51,200");
    expect(host.textContent).toContain("1 to 1,440");
  });

  it("draws the five switches, each with what off does", async () => {
    api();
    const host = await open();
    for (const name of ["The web's map", "The map", "Web search", "Reading links", "The nightly pass"]) {
      expect(toggle(host, name).checked, name).toBe(true);
    }
    expect(host.textContent!.split("A person's own setting is untouched; this overrides it while off.").length - 1).toBe(2);
  });

  it("shows the default for a stored value that was unreadable, and says so", async () => {
    api({ settings: { body: settings({ "cap.turns": { value: 100, malformed: true } }) } });
    const host = await open();
    expect(field(host, "Turns").value).toBe("100");
    expect(host.textContent).toContain("The stored value was unreadable, so this is the default.");
  });

  it("states what a cap means, at the bottom", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("A cap means stop: the next turn is refused, and what was already dumped is safe.");
    expect(host.textContent).toContain("Work already running finishes.");
    expect(host.textContent).toContain("A change takes effect everywhere within 20 seconds.");
  });
});

describe("the platform cap", () => {
  it("is off until switched on, and off hides the amount", async () => {
    api();
    const host = await open();
    expect(toggle(host, "Platform spend cap").checked).toBe(false);
    expect(() => field(host, "Everyone together")).toThrow();
    await click(toggle(host, "Platform spend cap"));
    expect(field(host, "Everyone together").value).toBe("");
    // On with no amount is not a cap anybody can save.
    expect(button(host, "Save changes")!.disabled).toBe(true);
  });

  it("sends null for off, never zero", async () => {
    api({ settings: { body: settings({ "platform.spend_micros": { value: 50_000_000 } }) } });
    const host = await open();
    expect(field(host, "Everyone together").value).toBe("50");
    await click(toggle(host, "Platform spend cap"));
    await click(button(host, "Save changes")!);
    expect(host.querySelector('[role="dialog"]')!.textContent).toContain("Platform spend cap$50.00toOff");
    await click(button(host.querySelector('[role="dialog"]')!, "Save changes")!);
    await settle();
    expect(sent()).toEqual({ changes: { "platform.spend_micros": null }, expected: { "platform.spend_micros": 50_000_000 } });
  });
});

describe("the save", () => {
  it("offers Cancel and Save changes once something moved, and Cancel puts it back", async () => {
    api();
    const host = await open();
    await type(field(host, "Turns"), "50");
    expect(button(host, "Save changes")).toBeDefined();
    await click(button(host, "Cancel")!);
    expect(field(host, "Turns").value).toBe("100");
    expect(button(host, "Save changes")).toBeUndefined();
    expect(patch()).toHaveLength(0);
  });

  it("shows each change as old to new, then sends one save in the API's units with what was loaded", async () => {
    api({ save: { body: settings({ "cap.spend_micros": { value: 7_500_000 }, "cap.photo_bytes": { value: 250 * MB }, "cap.voice_ms": { value: 1_800_000 }, "switch.web_search": { value: false } }) } });
    const host = await open();
    await type(field(host, "Spend"), "7.5");
    await type(field(host, "Photo megabytes"), "250");
    await type(field(host, "Voice minutes"), "30");
    await click(toggle(host, "Web search"));
    await type(field(host, "Monthly budget"), "400");

    await click(button(host, "Save changes")!);
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(patch()).toHaveLength(0);
    const lines = [...dialog.querySelectorAll("li")].map((line) => line.textContent);
    expect(lines).toEqual(["Spend$5.00to$7.50", "Photo megabytes500 MBto250 MB", "Voice minutes60 minto30 min", "Monthly budgetNot setto$400.00","Web searchOntoOff"]);

    await click(button(dialog, "Save changes")!);
    await settle();
    expect(patch()).toHaveLength(1);
    expect(patch()[0]!.init).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(sent()).toEqual({
      changes: { "cap.spend_micros": 7_500_000, "cap.photo_bytes": 250 * MB, "cap.voice_ms": 1_800_000, "budget.month_micros": 400_000_000, "switch.web_search": false },
      expected: { "cap.spend_micros": 5_000_000, "cap.photo_bytes": 500 * MB, "cap.voice_ms": 3_600_000, "budget.month_micros": null, "switch.web_search": true },
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Limits saved");
    expect(field(host, "Spend").value).toBe("7.5");
    expect(button(host, "Save changes")).toBeUndefined();
  });

  it("AC-33 refuses a value outside its bounds on that field, and will not save", async () => {
    api();
    const host = await open();
    await type(field(host, "Turns"), "0");
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Between 1 and 10,000.");
    expect(field(host, "Turns").getAttribute("aria-invalid")).toBe("true");
    expect(button(host, "Save changes")!.disabled).toBe(true);
    await type(field(host, "Turns"), "2.5");
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("A whole number.");
    expect(button(host, "Save changes")!.disabled).toBe(true);
  });

  it("AC-33 puts the server's refusal on the field it names, and keeps what was typed", async () => {
    api({ save: { status: 400, body: { error: "out_of_bounds", key: "cap.photo_bytes", min: MB, max: 50 * 1024 * MB } } });
    const host = await open();
    await type(field(host, "Photo megabytes"), "900");
    await saveAndConfirm(host);
    expect(field(host, "Photo megabytes").getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Between 1 and 51,200.");
    expect(field(host, "Photo megabytes").value).toBe("900");
    expect(host.textContent).not.toContain("Limits saved");
  });

  it("AC-34 says someone else changed this, shows the values now, and sends nothing more", async () => {
    api({ save: { status: 409, body: { error: "conflict", key: "cap.turns", ...settings({ "cap.turns": { value: 60 } }) } } });
    const host = await open();
    await type(field(host, "Turns"), "80");
    await saveAndConfirm(host);
    expect(host.textContent).toContain("Someone else changed this");
    expect(field(host, "Turns").value).toBe("60");
    expect(button(host, "Save changes")).toBeUndefined();
    expect(patch()).toHaveLength(1);
    expect(host.textContent).not.toContain("Limits saved");
  });

  it("says what did not happen when the save does not go through, and keeps the edit", async () => {
    api({ save: { status: 500 } });
    const host = await open();
    await type(field(host, "Turns"), "80");
    await saveAndConfirm(host);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("That did not go through. Nothing was saved");
    expect(field(host, "Turns").value).toBe("80");
  });

  it("AC-33 puts a setting back to its default with Reset", async () => {
    api({ settings: { body: settings({ "cap.turns": { value: 50, default: 100 } }) } });
    const host = await open();
    expect(field(host, "Turns").value).toBe("50");
    const resets = [...host.querySelectorAll("button")].filter((one) => one.textContent === "Reset");
    // Only a setting that is away from its default offers the way back.
    expect(resets).toHaveLength(1);
    await click(resets[0]!);
    expect(field(host, "Turns").value).toBe("100");
    await saveAndConfirm(host);
    expect(sent()).toEqual({ changes: { "cap.turns": 100 }, expected: { "cap.turns": 50 } });
  });
});

describe("AC-35 what has been hit", () => {
  const HITS = {
    rows: [
      { cap: "platform.spend_micros", scope: "platform", day: "2026-10-02", count: 3, lastAt: "2026-10-02T14:02:00.000Z", account: JO },
      { cap: "cap.turns", scope: "account", day: "2026-10-01", count: 12, lastAt: "2026-10-01T09:30:00.000Z", account: { ...JO, id: "0199aaaa-0000-7000-8000-000000000002", name: null } },
    ],
    nextCursor: "abc",
  };

  it("lists what, who as a link, when, how many and whose cap it was", async () => {
    api({ hits: { body: HITS } });
    const host = await open();
    expect([...host.querySelectorAll('[role="columnheader"]')].map((cell) => cell.textContent)).toEqual(["What", "Who", "When", "How many", "Whose cap"]);
    const rows = [...host.querySelectorAll('[role="row"]')].slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Platform spend");
    expect(rows[0]!.textContent).toContain("Jo Alves");
    expect(rows[0]!.textContent).toContain("2 Oct");
    expect(rows[0]!.textContent).toContain("3");
    expect(rows[0]!.textContent).toContain("The platform's");
    expect(rows[0]!.querySelector("a")!.getAttribute("href")).toBe(`/admin/people/${JO.id}`);
    expect(rows[1]!.textContent).toContain("Turns");
    expect(rows[1]!.textContent).toContain("jo@example.test");
    expect(rows[1]!.textContent).toContain("Their own");
    expect(host.textContent).not.toContain("Nothing has been refused");
  });

  it("loads more by the cursor, and adds to what is there", async () => {
    api({ hits: { body: HITS }, more: { body: { rows: [{ cap: "cap.photos", scope: "account", day: "2026-09-20", count: 1, lastAt: "2026-09-20T10:00:00.000Z", account: JO }], nextCursor: null } } });
    const host = await open();
    await click(button(host, "Load more")!);
    await settle();
    expect(calls.some((call) => call.url.endsWith("/v1/admin/limits/hits?cursor=abc"))).toBe(true);
    expect([...host.querySelectorAll('[role="row"]')].slice(1)).toHaveLength(3);
    expect(button(host, "Load more")).toBeUndefined();
  });
});

describe("the words for a cap", () => {
  it("names every per-person cap and the platform's, and falls back to the key", () => {
    expect(Object.keys(CAP_LABELS).sort()).toEqual(
      ["cap.mail_day", "cap.mail_hour", "cap.photo_bytes", "cap.photos", "cap.spend_micros", "cap.storage_bytes", "cap.turns", "cap.voice_ms", "cap.voice_notes", "platform.spend_micros"].sort(),
    );
    expect(capLabel("cap.voice_ms")).toBe("Voice minutes");
    expect(capLabel("cap.something_new")).toBe("cap.something_new");
  });
});
