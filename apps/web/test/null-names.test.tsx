// @vitest-environment happy-dom
//
// 028 T4.6. The default thread is named nowhere (AC-3): a Today row not in a
// thread draws no thread pill, an answer's result reads *Not in a thread*
// without the lasso and opens the full list, with *N more not in a thread.*,
// and the content detail's crumb and chip say *Not in a thread* and lead to
// the pane, which stands beside it instead of a thread page.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams("from=thread"),
  usePathname: () => "/content/c1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let calls: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "task",
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

vi.stubGlobal("fetch", async (url: string) => {
  const parsed = new URL(url);
  const path = parsed.pathname + parsed.search;
  calls.push(path);
  if (path === "/v1/content/c1") return json({ ...row("c1", "Renew passport"), threadId: "tdefault", threadName: null, from: null });
  if (path.startsWith("/v1/loose")) return json({ rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 });
  return json({ ok: true });
});

const { TodoCard } = await import("../src/components/today/TodoCard");
const { AnswerResults } = await import("../src/components/shell/AnswerResult");
const { default: ContentRoute } = await import("../src/app/(shell)/content/[id]/page");
const { ToastProvider } = await import("../src/components/shell/Toast");
type TodayRows = import("../src/components/today/useTodayRows").TodayRows;
type AgendaRow = import("../src/lib/today").AgendaRow;
type Found = import("../src/lib/dump").FoundResult;

let root: Root;
let host: HTMLElement;
const settle = async (times = 4) => {
  for (let i = 0; i < times; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const handlers = {
  editing: null,
  draft: "",
  asking: null,
  arrived: new Set<string>(),
  onDraft: () => undefined,
  onEdit: () => undefined,
  onSaveTitle: () => undefined,
  onStopEditing: () => undefined,
  onArchive: () => undefined,
  onAsk: () => undefined,
  onDelete: () => undefined,
};
const rows = { handlers, lead: () => null, take: () => undefined } as unknown as TodayRows;

describe("a Today row not in a thread", () => {
  it("draws no thread pill, where a row in one draws its own", async () => {
    const loose = { ...row("c1", "Renew passport"), threadId: "tdefault", threadName: null } as AgendaRow;
    const filed = { ...row("c2", "Call the letting agent"), threadId: "t1", threadName: "Flat" } as AgendaRow;
    await act(async () => root.render(<TodoCard late={[]} lateMore={0} timed={[]} rest={[loose, filed]} notDrawn={0} rows={rows} zone={null} />));
    expect(host.querySelector('a[href="/threads/t1"]')!.textContent).toBe("Flat");
    expect(host.querySelector('a[href="/threads/tdefault"]')).toBeNull();
    expect([...host.querySelectorAll('a[href^="/threads/"]')]).toHaveLength(1);
  });
});

describe("an answer's result not in a thread", () => {
  const found = (extra: Partial<Found> = {}): Found =>
    ({
      threadId: "tdefault",
      threadName: null,
      truncated: false,
      rows: Array.from({ length: 11 }, (_, i) => ({
        contentId: `c${i}`,
        threadId: "tdefault",
        threadName: null,
        type: "link",
        title: `Link ${i}`,
        body: null,
        done: false,
        photo: null,
      })),
      ...extra,
    }) as Found;

  it("reads Not in a thread without the lasso, opening the full list", async () => {
    await act(async () => root.render(<AnswerResults found={[found()]} />));
    const head = host.querySelector('a[href="/threads/loose"]')!;
    expect(head.textContent).toContain("Not in a thread");
    expect(head.querySelector('[style*="lasso"]')).toBeNull();
    expect(host.querySelector('a[href="/threads/tdefault"]')).toBeNull();
  });

  it("says the rest of the answer is in the list when the read was cut short", async () => {
    await act(async () => root.render(<AnswerResults found={[found({ truncated: true })]} />));
    const links = [...host.querySelectorAll('a[href="/threads/loose"]')];
    expect(links.map((a) => a.textContent)).toContain("The rest of the answer is in the list.");
  });

  it("names a row's tick with Not in a thread, capitalised, as the header reads", async () => {
    const tasks = found({
      rows: [{ contentId: "c1", threadId: "tdefault", threadName: null, type: "task", title: "Renew passport", body: null, done: false, photo: null }],
    } as Partial<Found>);
    await act(async () => root.render(<AnswerResults found={[tasks]} onToggle={() => undefined} />));
    expect(host.querySelector('[role="checkbox"]')!.getAttribute("aria-label")).toBe("Renew passport, Not in a thread");
  });

  it("ends with N more not in a thread.", async () => {
    await act(async () => root.render(<AnswerResults found={[found()]} />));
    const links = [...host.querySelectorAll('a[href="/threads/loose"]')];
    expect(links.map((a) => a.textContent)).toContain("3 more not in a thread.");
  });
});

describe("the content detail of a row not in a thread", () => {
  it("crumbs and chips Not in a thread to the pane, which stands beside it", async () => {
    await act(async () =>
      root.render(
        <ToastProvider>
          <ContentRoute params={Promise.resolve({ id: "c1" })} />
        </ToastProvider>,
      ),
    );
    await settle(6);
    const crumbs = [...host.querySelectorAll('a[href="/threads/loose"]')].map((a) => a.textContent);
    expect(crumbs.filter((text) => text?.includes("Not in a thread")).length).toBeGreaterThanOrEqual(2);
    expect(host.querySelector('a[href="/threads/tdefault"]')).toBeNull();
    expect(calls.some((path) => path.startsWith("/v1/threads/tdefault"))).toBe(false);
    expect(calls.some((path) => path.startsWith("/v1/loose"))).toBe(true);
  });
});
