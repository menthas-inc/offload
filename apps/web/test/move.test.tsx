// @vitest-environment happy-dom
//
// 028 T4.5. Move on the web: the edit modal carries it for every row that can
// move, in any thread (AC-33), opening the move sheet, whose list comes from
// /v1/threads and so never holds the default thread (AC-11); and a note's
// author moves a note from its editor, *Moved to Lisbon trip* with Undo, and
// *That's already in Lisbon trip* on a duplicate (AC-32).

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

interface Call {
  method: string;
  path: string;
  body: unknown;
}
let calls: Call[] = [];
let moveAnswer: () => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const parsed = new URL(url);
  const call = { method: init?.method ?? "GET", path: parsed.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined };
  calls.push(call);
  if (call.path === "/v1/threads") {
    return json({
      groups: [{ key: "now", threads: [{ id: "t0", name: "Flat admin", icon: null, count: 1, meta: "", isDefault: false }, { id: "t1", name: "Lisbon trip", icon: null, count: 2, meta: "", isDefault: false }] }],
      loose: null,
      invitations: [],
    });
  }
  if (call.path.endsWith("/move")) return moveAnswer();
  return json({ ok: true });
});

const { EditModal } = await import("../src/components/panes/EditModal");
const { Notes } = await import("../src/components/panes/Notes");
const { ToastProvider, ToastHost } = await import("../src/components/shell/Toast");
type Row = import("../src/lib/threads").ContentRow;
type Note = import("../src/lib/threads").Note;

const row = {
  id: "c1",
  type: "link",
  title: "Hotels near Alfama",
  body: null,
  occursAt: null,
  occursEndAt: null,
  dueAt: null,
  allDay: false,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  canMove: true,
} as unknown as Row;

const note: Note = {
  id: "n1",
  labels: [],
  text: "Ana's shoe size is 38",
  body: null,
  origin: "stated",
  authorId: "a1",
  authorIsMember: true,
  muted: false,
  occursAt: null,
  occursEndAt: null,
  dueAt: null,
  placeId: null,
  priority: 50,
  allDay: false,
  rrule: null,
  writtenAt: "2026-09-28T10:00:00Z",
  supersededAt: null,
};

let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  moveAnswer = () => json({ note, previous: { threadId: "t0" } });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 4; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((one) => one.textContent === name || one.getAttribute("aria-label") === name);

describe("028 the edit modal's Move (AC-11, AC-33)", () => {
  it("opens the move sheet and moves to the picked thread", async () => {
    const moved: [string, string][] = [];
    await act(async () =>
      root.render(<EditModal row={row} threadId="t0" onClose={() => {}} onSave={() => {}} onMove={(r, t) => moved.push([r.id, t.name])} />),
    );
    await act(async () => button("Move")!.click());
    await settle();
    const sheet = document.querySelector('[aria-label="Move to a thread"]')!;
    expect(sheet).not.toBeNull();
    // The thread the row is in is not offered.
    expect(sheet.textContent).not.toContain("Flat admin");
    await act(async () => [...sheet.querySelectorAll("button")].find((b) => b.textContent?.includes("Lisbon trip"))!.click());
    expect(moved).toEqual([["c1", "Lisbon trip"]]);
  });

  it("is not drawn for a row that cannot move", async () => {
    await act(async () =>
      root.render(<EditModal row={{ ...row, canMove: false }} threadId="t0" onClose={() => {}} onSave={() => {}} onMove={() => {}} />),
    );
    expect(button("Move")).toBeUndefined();
  });
});

function NotesHost() {
  const [notes, setNotes] = useState<Note[]>([note]);
  const writes = { track: async (write: Promise<boolean>) => write, idle: () => true };
  return (
    <ToastProvider>
      <Notes
        threadId="t0"
        notes={notes}
        counts={{ active: notes.length, folded: 0 }}
        members={[{ accountId: "a1", displayName: "Jo", initials: "JO", isYou: true }]}
        adding={false}
        onAdding={() => {}}
        onNotes={(update) => setNotes(update)}
        writes={writes}
      />
      <ToastHost />
    </ToastProvider>
  );
}

async function moveTheNote() {
  await act(async () => root.render(<NotesHost />));
  await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Ana's shoe size"))!.click());
  await act(async () => button("Move")!.click());
  await settle();
  const sheet = document.querySelector('[aria-label="Move to a thread"]')!;
  await act(async () => [...sheet.querySelectorAll("button")].find((b) => b.textContent?.includes("Lisbon trip"))!.click());
  await settle();
}

describe("028 a note's Move (AC-32)", () => {
  it("moves it, says where, and Undo moves it back", async () => {
    await moveTheNote();
    expect(calls.filter((c) => c.path === "/v1/notes/n1/move").map((c) => c.body)).toEqual([{ threadId: "t1" }]);
    expect(document.body.textContent).not.toContain("Ana's shoe size");
    expect(document.body.textContent).toContain("Moved to Lisbon trip");
    await act(async () => button("Undo")!.click());
    await settle();
    expect(calls.filter((c) => c.path === "/v1/notes/n1/move").map((c) => c.body)).toEqual([{ threadId: "t1" }, { threadId: "t0" }]);
    expect(document.body.textContent).toContain("Ana's shoe size");
  });

  it("says when the thread already holds it", async () => {
    moveAnswer = () => json({ error: "duplicate" }, 409);
    await moveTheNote();
    expect(document.body.textContent).toContain("That's already in Lisbon trip");
    expect(document.body.textContent).toContain("Ana's shoe size");
  });
});
