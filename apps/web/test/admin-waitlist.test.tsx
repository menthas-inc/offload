// @vitest-environment happy-dom
//
// 034 AC-7, AC-9 and AC-10, on the waitlist page: the stats row and the batch
// come from the API, a failed read says so and is never an empty list, and
// invite by address is a one-field dialog that posts the address.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/waitlist", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: WaitlistPage } = await import("../src/app/(admin)/admin/waitlist/page");

const STATS = { waiting: 1204, oldestWaiting: "2026-06-03T10:00:00.000Z", invitedThisWeek: 25, signedUp: 31, invitedNotSignedUp: 9, batch: 40 };
const ROWS = { rows: [{ id: "a1", email: "w1@example.test", state: "waiting", joined: "3 Jun", source: "waitlist", note: null }], nextCursor: null };

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

const INVITED = { id: "a2", email: "i1@example.test", state: "invited", joined: "1 Jun", source: "thread", note: "invited by Jo" };

function api(answers: { list?: number; stats?: number; invite?: unknown; rows?: unknown[]; batch?: number; resend?: unknown } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (path.startsWith("/waitlist/stats")) return json({ ...STATS, batch: answers.batch ?? STATS.batch }, answers.stats ?? 200);
      if (path.startsWith("/waitlist/invite-address")) return new Response(JSON.stringify(answers.invite ?? { accountId: "x", status: "invited" }), { status: 200 });
      if (path.startsWith("/waitlist/invite-next")) return json({ results: [{ status: "invited" }, { status: "invited" }] });
      if (path.endsWith("/resend")) return json(answers.resend ?? { status: "queued" });
      if (init?.method === "DELETE") return json({ status: "removed" });
      if (answers.rows) return json({ rows: answers.rows, nextCursor: null }, answers.list ?? 200);
      if (path.startsWith("/waitlist")) return new Response(JSON.stringify(ROWS), { status: answers.list ?? 200 });
      return new Response("{}", { status: 404 });
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
  const root = createRoot(host);
  await act(async () => root.render(<WaitlistPage />));
  // The search is debounced, so the first read is 200ms out.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  return host;
}

const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;
const click = (node: Element) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the waitlist page", () => {
  it("draws the stats row and says the batch is set on Limits", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("1,204 waiting · letting 40 in a week, set on Limits");
    expect(host.textContent).toContain("Waiting1,204oldest joined 3 Jun");
    expect(host.textContent).toContain("Invited this week25");
    expect(host.textContent).toContain("Signed up319 invited have not signed in");
    expect(host.textContent).toContain("Weekly batch40set on the Limits page");
    expect(button(host, "Invite the next 40")).toBeDefined();
  });

  it("says a failed read failed, beside Try again, and never draws it as an empty list", async () => {
    api({ list: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the waitlist.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.textContent).not.toContain("Nobody is waiting.");
  });

  it("invites by address from a one-field dialog, and only once it looks like one", async () => {
    api();
    const host = await open();
    await click(button(host, "Invite by address"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    const send = button(dialog, "Invite") as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    await act(async () => type(dialog.querySelector("input")!, "new@example.test"));
    expect(send.disabled).toBe(false);
    await click(send);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const post = calls.find((call) => call.url.endsWith("/v1/admin/waitlist/invite-address"))!;
    expect(post.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(post.init!.body))).toEqual({ email: "new@example.test" });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Invite sent");
  });

  it("says already in for an address that is", async () => {
    api({ invite: { accountId: "x", status: "already-in" } });
    const host = await open();
    await click(button(host, "Invite by address"));
    const dialog = host.querySelector('[role="dialog"]')!;
    await act(async () => type(dialog.querySelector("input")!, "in@example.test"));
    await click(button(dialog, "Invite"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("They are already in");
  });

  // Seen in review: the header row sat above "Couldn't load", which reads as
  // a list with nobody on it.
  it("draws no table at all when the read failed", async () => {
    api({ list: 500 });
    const host = await open();
    expect(host.textContent).not.toContain("Came from");
    expect(host.querySelector('[role="table"]')).toBeNull();
  });

  it("is the one table every page draws, with a column to select by", async () => {
    api({ rows: [...ROWS.rows, INVITED] });
    const host = await open();
    const table = host.querySelector('[role="table"]')!;
    expect([...table.querySelectorAll('[role="columnheader"]')].map((one) => one.textContent)).toEqual(["Select every row on this page", "Email", "Joined", "Came from", "State", ""]);
    const rows = [...table.querySelectorAll('[role="row"]')].slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelectorAll('[role="cell"]')).toHaveLength(6);
    expect(rows[1]!.textContent).toBe("Select i1@example.testi1@example.testinvited by Jo1 JunA shared threadinvitedResend");
    // The page carries no measure of its own: widths are the columns'.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/app/(admin)/admin/waitlist/page.tsx"), "utf8");
    expect(source).not.toContain("style={{");
  });

  it("names each tick box by the label around it, and by nothing else", async () => {
    api();
    const host = await open();
    const box = host.querySelectorAll<HTMLInputElement>('[role="row"] input[type="checkbox"]')[1]!;
    expect(box.closest("label")!.textContent).toBe("Select w1@example.test");
    expect(box.getAttribute("aria-label")).toBeNull();
  });

  it("asks in the dialog before it removes one address, and names it", async () => {
    api();
    const host = await open();
    await click(button(host, "Remove"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Remove w1@example.test?");
    expect(dialog.textContent).toContain("They are not told, and they can join again.");
    expect(calls.some((call) => call.init?.method === "DELETE")).toBe(false);
    await click(button(dialog, "Remove"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(calls.find((call) => call.init?.method === "DELETE")!.url).toMatch(/\/v1\/admin\/waitlist\/a1$/);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Removed from the waitlist");
  });

  it("asks in the dialog before it invites the next batch, and says it cannot be taken back", async () => {
    api();
    const host = await open();
    await click(button(host, "Invite the next 40"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Invite the oldest 40 still waiting?");
    expect(dialog.textContent).toContain("They each get one email, and it cannot be taken back.");
    expect(calls.some((call) => call.url.endsWith("/invite-next"))).toBe(false);
    await click(button(dialog, "Invite 40"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(calls.find((call) => call.url.endsWith("/invite-next"))!.init).toMatchObject({ method: "POST" });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Invited 2");
  });

  it("says when it was read, and reads the list and the figures again on Refresh", async () => {
    api();
    const host = await open();
    expect(host.textContent).toMatch(/As of \d\d:\d\d/);
    const reads = () => calls.filter((call) => !call.init?.method).length;
    const before = reads();
    await click(button(host, "Refresh"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(reads()).toBe(before + 2);
  });

  it("writes the batch as every other count is written", async () => {
    api({ batch: 1200 });
    const host = await open();
    expect(host.textContent).toContain("letting 1,200 in a week");
    expect(host.textContent).toContain("Weekly batch1,200set on the Limits page");
    expect(button(host, "Invite the next 1,200")).toBeDefined();
  });

  it("says there is nothing to resend in two sentences", async () => {
    api({ rows: [INVITED], resend: { status: "not-invited" } });
    const host = await open();
    await click(button(host, "Resend"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Nothing to resend. That account has moved on");
  });
});
