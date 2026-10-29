// @vitest-environment happy-dom
//
// 028 T4.4. The full list as a pane beside My threads: title and line, the
// chips over the whole list with their counts (AC-12), pages newest first
// across a page boundary (AC-13), the archived foot row with Put back
// (AC-14), the four states (AC-15); and the caller's default thread opening
// Not in a thread instead of drawing a thread page (AC-4).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
  usePathname: () => "/threads/loose",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

interface Call {
  method: string;
  path: string;
}
let calls: Call[] = [];
let overrides: Record<string, () => Response | Promise<Response>> = {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const row = (id: string, title: string, type = "link", extra: Record<string, unknown> = {}) => ({
  id,
  type,
  title,
  body: null,
  url: null,
  imageUrl: null,
  photo: null,
  createdAt: "2026-09-28T10:00:00Z",
  archivedAt: null,
  doneAt: null,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  priority: 0,
  priorityPinned: false,
  labels: [],
  place: null,
  location: null,
  placeId: null,
  seriesRef: null,
  allDay: false,
  author: { accountId: "a1", displayName: "Jo", isYou: true },
  canDelete: true,
  canMove: true,
  filingAt: null,
  ...extra,
});
const entry = (id: string, title: string, type = "link") => ({ kind: "content", row: row(id, title, type), suggestion: null });
const noteEntry = (id: string, text: string) => ({
  kind: "note",
  note: { id, labels: [], text, body: null, origin: "stated", authorId: "a1", authorIsMember: true, muted: false, occursAt: null, occursEndAt: null, dueAt: null, placeId: null, priority: 50, allDay: false, rrule: null, writtenAt: "2026-09-27T10:00:00Z", createdAt: "2026-09-27T10:00:00Z", supersededAt: null },
  suggestion: null,
});

const counts = { count: 32, byType: { link: 20, photo: 10, note: 2 }, archived: 3 };
const first = { rows: [entry("c1", "Miso aubergine, a recipe"), noteEntry("n1", "Ana's shoe size is 38"), entry("c2", "Boiler service receipt", "image")], nextCursor: "c2", ...counts };
const second = { rows: [noteEntry("n2", "The landlord's number"), entry("c3", "Hotels near Alfama")], nextCursor: null, ...counts };

function serve(call: Call): Response | Promise<Response> {
  const override = overrides[call.path];
  if (override) return override();
  if (call.path === "/v1/loose") return json(first);
  if (call.path === "/v1/loose?cursor=c2") return json(second);
  if (call.path === "/v1/loose?type=link") return json({ rows: [entry("c1", "Miso aubergine, a recipe")], nextCursor: null, ...counts });
  if (call.path === "/v1/loose?archived=true") return json({ rows: [row("c9", "Old receipt", "image", { archivedAt: "2026-09-01T10:00:00Z" })], nextCursor: null });
  if (call.path === "/v1/threads/tdefault") return json({ id: "tdefault", name: "Miscellaneous", isDefault: true, notes: [], labels: [], members: [], counts: { active: 0, archived: 0, unlabelled: 0 }, preference: {}, noteCounts: { active: 0, folded: 0 }, line: "", standing: null, shareable: false, calendars: null, icon: null, alwaysOn: true });
  if (call.path.startsWith("/v1/threads/tdefault/content")) return json({ rows: [], nextCursor: null });
  return json({ ok: true });
}

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const parsed = new URL(url);
  const call = { method: init?.method ?? "GET", path: parsed.pathname + parsed.search };
  calls.push(call);
  return serve(call);
});

const { LoosePane } = await import("../src/components/loose/LoosePane");
const { default: ThreadRoute } = await import("../src/app/(shell)/threads/[id]/page");
const { default: LooseRoute } = await import("../src/app/(shell)/threads/loose/page");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { ThreadsProvider } = await import("../src/components/shell/threads-context");

let root: Root;
let host: HTMLElement;
const settle = async (times = 4) => {
  for (let i = 0; i < times; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  overrides = {};
  search = new URLSearchParams();
  router.replace.mockClear();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

async function draw(node: React.ReactNode) {
  await act(async () =>
    root.render(
      <ToastProvider>
        {node}
        <ToastHost />
      </ToastProvider>,
    ),
  );
  await settle();
}

const said = () => host.textContent ?? "";
const buttons = () => [...host.querySelectorAll("button")];
const press = async (text: string) => {
  const one = buttons().find((b) => b.textContent === text || b.textContent?.startsWith(text));
  expect(one).toBeTruthy();
  await act(async () => one!.click());
  await settle();
};

describe("the full list (AC-12 to AC-15)", () => {
  it("is titled, says what it is, and draws the chips over the whole list", async () => {
    await draw(<LoosePane type={null} />);
    expect(host.querySelector("h1")!.textContent).toBe("Not in a thread");
    expect(said()).toContain("Put down without a thread, newest first.");
    const chips = [...host.querySelector('[aria-label="Filter by type"]')!.querySelectorAll("button")];
    expect(chips.map((c) => c.textContent)).toEqual(["All 32", "Links 20", "Photos 10", "Notes 2"]);
  });

  it("reads a page at a time, content and notes interleaved, newest first", async () => {
    await draw(<LoosePane type={null} />);
    expect(said()).toContain("Ana's shoe size is 38");
    expect(said()).not.toContain("Hotels near Alfama");
    await press("Show more");
    expect(calls.map((c) => c.path)).toContain("/v1/loose?cursor=c2");
    const text = said();
    expect(text.indexOf("Boiler service receipt")).toBeLessThan(text.indexOf("The landlord's number"));
    expect(text.indexOf("The landlord's number")).toBeLessThan(text.indexOf("Hotels near Alfama"));
    expect(buttons().some((b) => b.textContent === "Show more")).toBe(false);
  });

  it("filters the whole list by a chip, and opens on the chip it was given", async () => {
    await draw(<LoosePane type={null} />);
    await press("Links");
    expect(calls.at(-1)!.path).toBe("/v1/loose?type=link");
    expect(said()).not.toContain("Boiler service receipt");
    calls = [];
    await act(async () => root.unmount());
    root = createRoot(host);
    await draw(<LoosePane type="link" />);
    expect(calls[0]!.path).toBe("/v1/loose?type=link");
  });

  it("is one spinner while loading", async () => {
    let release: (value: Response) => void = () => undefined;
    overrides["/v1/loose"] = () => new Promise<Response>((resolve) => (release = resolve));
    await draw(<LoosePane type={null} />);
    expect(host.querySelectorAll('[role="status"][aria-label="loading"]')).toHaveLength(1);
    await act(async () => release(json(first)));
    await settle();
    expect(host.querySelector('[aria-label="loading"]')).toBeNull();
  });

  it("says Couldn't load these with Try again when the read fails", async () => {
    overrides["/v1/loose"] = () => json({ error: "nope" }, 500);
    await draw(<LoosePane type={null} />);
    expect(said()).toContain("Couldn't load these");
    delete overrides["/v1/loose"];
    await press("Try again");
    expect(said()).toContain("Miso aubergine, a recipe");
  });

  it("says a next page failed under the last row", async () => {
    overrides["/v1/loose?cursor=c2"] = () => json({ error: "nope" }, 500);
    await draw(<LoosePane type={null} />);
    await press("Show more");
    const text = said();
    expect(text).toContain("Couldn't load these");
    expect(text.indexOf("Boiler service receipt")).toBeLessThan(text.indexOf("Couldn't load these"));
    delete overrides["/v1/loose?cursor=c2"];
    await press("Try again");
    expect(said()).toContain("Hotels near Alfama");
  });

  it("is the title Nothing in here yet alone when empty, with no mark", async () => {
    overrides["/v1/loose"] = () => json({ rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 });
    await draw(<LoosePane type={null} />);
    expect(said()).toContain("Nothing in here yet");
    // The lasso is a thread's mark, and this is not a thread.
    expect(host.querySelector('[style*="lasso"]')).toBeNull();
  });

  it("ends with the archived foot row, which opens them with Put back", async () => {
    await draw(<LoosePane type={null} />);
    await press("Show more");
    await press("3 archived");
    expect(calls.at(-1)!.path).toBe("/v1/loose?archived=true");
    expect(said()).toContain("Old receipt");
    const back = host.querySelector('[aria-label="Put Old receipt back in the list"]') as HTMLButtonElement;
    // As the server has it once the row is back.
    overrides["/v1/loose?archived=true"] = () => json({ rows: [], nextCursor: null });
    await act(async () => back.click());
    await settle();
    expect(calls.some((c) => c.path === "/v1/content/c9/restore" && c.method === "POST")).toBe(true);
    expect(said()).not.toContain("Old receipt");
  });
});

describe("the routes (AC-4, AC-12)", () => {
  const threads = { groups: [], invitations: [], loose: null, ready: true, reload: () => undefined, filed: null, changed: null, turnOut: false };

  it("send the caller's default thread to Not in a thread, never drawing it", async () => {
    await draw(
      <ThreadsProvider value={threads}>
        <ThreadRoute params={Promise.resolve({ id: "tdefault" })} />
      </ThreadsProvider>,
    );
    await settle(6);
    expect(router.replace).toHaveBeenCalledWith("/threads/loose");
    expect(document.body.textContent).not.toContain("Miscellaneous");
  });

  it("open the full list beside My threads, on the chip in the link", async () => {
    search = new URLSearchParams("from=threads&type=link");
    await draw(
      <ThreadsProvider value={threads}>
        <LooseRoute />
      </ThreadsProvider>,
    );
    expect(calls.some((c) => c.path === "/v1/loose?type=link")).toBe(true);
    const crumbs = [...host.querySelectorAll("a")].map((a) => a.textContent);
    expect(crumbs).toContain("My threads");
    expect(crumbs).toContain("Not in a thread");
    expect(said()).toContain("Put down without a thread, newest first.");
  });
});
