// @vitest-environment happy-dom
//
// 042, AC-19 and AC-20 on the web. Remind me is the settings `Switch` in all
// three editors: the row's edit dialog, where it rides in the one save and
// writes `reminders` for the author and `isReminder` for anybody else; the
// note editor and the memory editor, drawn first and written second through
// PUT /v1/reminders, with the editor's own failure line, and Undo where the
// editor already has one. The date chip's bell is `bellOn`.

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type Sent = { path: string; method: string; body: unknown };
const sent: Sent[] = [];
let putStatus = 200;
let memoriesBody: unknown;

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  const method = init?.method ?? "GET";
  sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === "/v1/reminders") {
    // The server keeps what landed, so a reload after it agrees.
    const body = JSON.parse(String(init!.body)) as { of: string; id: string; on: boolean };
    const held = (memoriesBody as { memories?: { id: string; reminders: string }[] } | undefined)?.memories;
    if (putStatus === 200 && body.of === "memory") held?.forEach((m) => m.id === body.id && (m.reminders = body.on ? "on" : "off"));
    return json(putStatus === 200 ? { ok: true } : { error: "not_found" }, putStatus);
  }
  if (path === "/v1/memories" && method === "GET") return json(memoriesBody);
  if (path === "/v1/content/r1" && method === "PATCH") {
    // The route's Undo snapshot: the author's row that was asked about says
    // "on" even with no label, and a null `reminders` leaves it alone.
    const body = JSON.parse(String(init!.body)) as Partial<ContentRow>;
    const previous = { ...snapshotOf(held), reminders: held.isReminder ? "on" : held.reminders };
    if (body.reminders === "off") held = { ...held, reminders: "off", isReminder: false };
    else if (body.reminders === "on") held = { ...held, reminders: "on" };
    if (body.isReminder !== undefined) held = { ...held, isReminder: body.isReminder };
    return json({ content: held, previous });
  }
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { EditModal } = await import("../src/components/panes/EditModal");
const { DateChip } = await import("../src/components/shell/DateChip");
const { Notes } = await import("../src/components/panes/Notes");
const { MemoriesPane } = await import("../src/components/panes/Memories");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
const { useWrites } = await import("../src/lib/optimistic");
const { useTodayRows } = await import("../src/components/today/useTodayRows");
import type { ContentPatch, ContentRow, Member, Note } from "../src/lib/threads";
import type { AgendaRow } from "../src/lib/today";

// The server's copy of the row the Undo test edits.
let held: ContentRow;
const snapshotOf = (r: ContentRow) => ({
  title: r.title,
  body: r.body,
  dueAt: r.dueAt,
  occursAt: r.occursAt,
  occursEndAt: r.occursEndAt,
  allDay: r.allDay,
  rrule: r.rrule,
  isReminder: r.isReminder,
  labels: r.labels,
});

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sent.length = 0;
  putStatus = 200;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function draw(node: React.ReactNode) {
  await act(async () => root!.render(node));
  await settle();
}

// The dialog draws into a portal, so these look in the whole document.
const remindSwitch = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[role="switch"]')].find((one) => one.closest("label")?.textContent === "Remind me") ?? null;
const checkboxes = () => document.querySelectorAll('input[type="checkbox"]:not([role="switch"])');
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name) as
    | HTMLButtonElement
    | undefined;
async function click(el: Element | undefined | null) {
  if (!el) throw new Error("nothing to click");
  await act(async () => (el as HTMLElement).click());
  await settle();
}

// ------------------------------------------------------------ the dialog

const row = (over: Partial<ContentRow> = {}) =>
  ({
    id: "r1",
    type: "task",
    title: "Renew the visa",
    body: null,
    occursAt: null,
    occursEndAt: null,
    dueAt: "2026-11-02T12:00:00.000Z",
    allDay: true,
    rrule: null,
    isReminder: false,
    reminders: null,
    onCalendar: false,
    labels: [],
    author: { accountId: "me", displayName: "Sam", isYou: true },
    ...over,
  }) as unknown as ContentRow;

async function dialog(r: ContentRow) {
  const saved: ContentPatch[] = [];
  await draw(<EditModal row={r} onClose={() => {}} onSave={(_row, patch) => saved.push(patch)} />);
  return saved;
}

describe("Remind me in the row's dialog", () => {
  it("is the settings switch, not a checkbox, for the author while offload will remind them", async () => {
    await dialog(row({ reminders: "on" }));
    const control = remindSwitch();
    expect(control).not.toBeNull();
    expect(control!.checked).toBe(true);
    expect(control!.closest("label")?.textContent).toContain("Remind me");
    // All day's checkbox is the only other one.
    expect([...checkboxes()].every((box) => box.closest("label")?.textContent?.includes("All day"))).toBe(true);
  });

  it("writes reminders in the one save for the author", async () => {
    const saved = await dialog(row({ reminders: "on" }));
    await click(remindSwitch());
    await click(button("Save"));
    expect(saved).toEqual([{ reminders: "off" }]);
  });

  it("turns a stopped one back on for the author", async () => {
    const saved = await dialog(row({ reminders: "off" }));
    expect(remindSwitch()!.checked).toBe(false);
    await click(remindSwitch());
    await click(button("Save"));
    expect(saved).toEqual([{ reminders: "on" }]);
  });

  it("keeps isReminder for anybody else, and only while it is on", async () => {
    const theirs = { author: { accountId: "ana", displayName: "Ana", isYou: false } } as Partial<ContentRow>;
    const saved = await dialog(row({ ...theirs, isReminder: true }));
    expect(remindSwitch()!.checked).toBe(true);
    await click(remindSwitch());
    await click(button("Save"));
    expect(saved).toEqual([{ isReminder: false }]);

    await act(async () => root!.unmount());
    root = createRoot(host);
    await dialog(row({ ...theirs, isReminder: false }));
    expect(remindSwitch()).toBeNull();
  });

  it("is not drawn for the author when offload will not remind them", async () => {
    await dialog(row({ reminders: null }));
    expect(remindSwitch()).toBeNull();
  });
});

describe("Undo of a stop", () => {
  // Today's rows, as the thread pane and Not in a thread act too: the row is
  // read from the server again once the writes settle.
  function TodayHarness() {
    const [shownRow, setShownRow] = useState<ContentRow>(held);
    const rows = useTodayRows(async () => setShownRow({ ...held }), new Map());
    const [current] = rows.shown([shownRow as AgendaRow]);
    return (
      <>
        <button type="button" onClick={() => rows.handlers.onEdit(current!)}>
          Open
        </button>
        {rows.overlays}
        <ToastHost />
      </>
    );
  }

  it("on the author's row that was asked about sends reminders on from the snapshot, and the switch is on again", async () => {
    held = row({ isReminder: true, reminders: "on" });
    await draw(
      <ToastProvider>
        <TodayHarness />
      </ToastProvider>,
    );
    await click(button("Open"));
    expect(remindSwitch()!.checked).toBe(true);
    await click(remindSwitch());
    await click(button("Save"));
    const patches = () => sent.filter((s) => s.method === "PATCH").map((s) => s.body as ContentPatch);
    expect(patches()).toEqual([{ reminders: "off" }]);

    await click(button("Undo"));
    expect(patches().at(-1)).toMatchObject({ reminders: "on", isReminder: true });
    await click(button("Open"));
    expect(remindSwitch()!.checked).toBe(true);
  });
});

// ------------------------------------------------------------ the chip

describe("the date chip's bell", () => {
  it("rings on bellOn: offload will remind the author, or somebody asked", async () => {
    await draw(<DateChip row={row({ reminders: "on" })} />);
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("offload will remind you");

    await draw(<DateChip row={row({ reminders: "off" })} />);
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).not.toContain("remind");

    await draw(<DateChip row={row({ reminders: null, isReminder: true })} />);
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("offload will remind you");
  });
});

// ------------------------------------------------------------ the note editor

const ME: Member = { accountId: "me", displayName: "Sam", initials: "SA", isYou: true } as Member;
const ANA: Member = { accountId: "ana", displayName: "Ana", initials: "AN", isYou: false } as Member;

const note = (over: Partial<Note> = {}): Note =>
  ({
    id: "n1",
    labels: [],
    text: "Lisbon flat from the 4th to the 9th",
    body: null,
    origin: "stated",
    authorId: "me",
    authorIsMember: true,
    muted: false,
    occursAt: "2026-11-04T12:00:00.000Z",
    occursEndAt: null,
    dueAt: null,
    placeId: null,
    priority: 50,
    allDay: true,
    rrule: null,
    writtenAt: "2026-10-01T10:00:00.000Z",
    supersededAt: null,
    reminders: "on",
    ...over,
  }) as Note;

let shown: Note[] = [];
function NotesHarness({ start, members }: { start: Note[]; members: Member[] }) {
  const [notes, setNotes] = useState(start);
  shown = notes;
  const writes = useWrites(async () => {});
  return (
    <ToastProvider>
      <Notes
        threadId="t1"
        notes={notes}
        counts={{ active: notes.length, folded: 0 }}
        members={members}
        adding={false}
        onAdding={() => {}}
        onNotes={(update) => setNotes(update)}
        writes={writes}
      />
      <ToastHost />
    </ToastProvider>
  );
}

const openNote = async () => click(host.querySelector("button[class*=noteMain]") ?? [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Lisbon flat")));

describe("Remind me in the note editor", () => {
  it("is drawn for the author, drawn first and written second through PUT /v1/reminders, with Undo", async () => {
    await draw(<NotesHarness start={[note()]} members={[ME, ANA]} />);
    await openNote();
    expect(remindSwitch()!.checked).toBe(true);
    await click(remindSwitch());
    expect(shown[0]!.reminders).toBe("off");
    expect(sent.filter((s) => s.method === "PUT")).toEqual([{ path: "/v1/reminders", method: "PUT", body: { of: "note", id: "n1", on: false } }]);

    await click(button("Undo"));
    expect(shown[0]!.reminders).toBe("on");
    expect(sent.filter((s) => s.method === "PUT").at(-1)?.body).toEqual({ of: "note", id: "n1", on: true });
  });

  it("puts it back with the editor's failure line when the write is refused", async () => {
    putStatus = 404;
    await draw(<NotesHarness start={[note()]} members={[ME, ANA]} />);
    await openNote();
    await click(remindSwitch());
    expect(shown[0]!.reminders).toBe("on");
    expect(host.textContent).toContain("Couldn't save that");
  });

  it("is not drawn on somebody else's note, or on one offload will not remind about", async () => {
    await draw(<NotesHarness start={[note({ authorId: "ana", reminders: null })]} members={[ME, ANA]} />);
    await openNote();
    expect(remindSwitch()).toBeNull();

    await act(async () => root!.unmount());
    root = createRoot(host);
    await draw(<NotesHarness start={[note({ reminders: null })]} members={[ME, ANA]} />);
    await openNote();
    expect(remindSwitch()).toBeNull();
  });
});

// ------------------------------------------------------------ the memory editor

const memory = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  kind: "people",
  text: "Their wife's birthday is 14 March.",
  origin: "stated",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  changed: false,
  source: { type: "message", thread: null },
  place: null,
  reminders: "on",
  ...over,
});

async function openMemory(over: Record<string, unknown> = {}) {
  memoriesBody = { memories: [memory(over)], kinds: [], full: false, rulesFull: false };
  await draw(
    <ToastProvider>
      <MemoriesPane />
      <ToastHost />
    </ToastProvider>,
  );
  await click(host.querySelector("[data-memory]"));
}

describe("Remind me in the memory editor", () => {
  it("is drawn while offload will remind, and written through PUT /v1/reminders", async () => {
    await openMemory();
    expect(remindSwitch()!.checked).toBe(true);
    await click(remindSwitch());
    expect(remindSwitch()!.checked).toBe(false);
    expect(sent.filter((s) => s.method === "PUT")).toEqual([{ path: "/v1/reminders", method: "PUT", body: { of: "memory", id: "m1", on: false } }]);
    // No Undo: the memory editor has none.
    expect(button("Undo")).toBeUndefined();
  });

  it("puts it back with the failure line and Retry when the write is refused", async () => {
    putStatus = 500;
    await openMemory();
    await click(remindSwitch());
    expect(remindSwitch()!.checked).toBe(true);
    expect(host.textContent).toContain("Couldn't save that");
    expect(button("Retry")).toBeTruthy();
  });

  it("is not drawn when offload will not remind about it", async () => {
    await openMemory({ reminders: null });
    expect(remindSwitch()).toBeNull();
  });
});

describe("a door into Memories", () => {
  it("opens the memory it names once the list has loaded, as Today's Reminders links it", async () => {
    memoriesBody = { memories: [memory()], kinds: [], full: false, rulesFull: false };
    await draw(
      <ToastProvider>
        <MemoriesPane openId="m1" />
        <ToastHost />
      </ToastProvider>,
    );
    expect(document.querySelector("textarea")?.value).toBe("Your wife's birthday is 14 March.");
  });
});
