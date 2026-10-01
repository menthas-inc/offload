// 028 T4.1. Not in a thread, the logic under the screens: the wire shapes, the
// chip table, the words a person reads, and the calls the screens make.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadGroup, ThreadBundle } from "../src/lib/threads";
import {
  CHIPS,
  acceptSuggestion,
  allLabel,
  chipOf,
  chipsShown,
  countInWords,
  createFromProposal,
  dismissSuggestion,
  fetchLoose,
  fetchLooseArchived,
  fetchProposal,
  entryTitle,
  metaLine,
  moveNote,
  sharedHint,
  suggestionName,
  undoProposal,
  undoSuggestion,
  validThreadName,
  withEntry,
  withoutEntry,
  type LooseEntry,
  type LooseSummary,
} from "../src/lib/loose";
import { fetchThreadsAndInvitations } from "../src/lib/threads";

const content = (id: string, type: string, createdAt = "2026-09-28T10:00:00Z"): LooseEntry =>
  ({
    kind: "content",
    row: { id, type, title: `Row ${id}`, createdAt, labels: [], canMove: true, canDelete: true },
    suggestion: null,
  }) as unknown as LooseEntry;

const note = (id: string, text: string, createdAt = "2026-09-28T10:00:00Z"): LooseEntry =>
  ({
    kind: "note",
    note: { id, text, createdAt, writtenAt: createdAt, labels: [], muted: false, origin: "stated" },
    suggestion: null,
  }) as unknown as LooseEntry;

describe("the wire (AC-1, AC-6)", () => {
  it("has two groups, and Always on is not one of them", () => {
    const groups: ThreadGroup[] = [
      { key: "now", threads: [] },
      { key: "older", threads: [] },
    ];
    expect(groups).toHaveLength(2);
    // @ts-expect-error 028: "always" is gone from the group keys.
    const always: ThreadGroup = { key: "always", threads: [] };
    expect(always.key).toBe("always");
  });

  it("says when a bundle is the default thread", () => {
    const bundle = { isDefault: true } as Pick<ThreadBundle, "isDefault">;
    expect(bundle.isDefault).toBe(true);
  });
});

describe("the chips (AC-7)", () => {
  it("are the table's eight, in its order, with its words and glyphs", () => {
    expect(CHIPS.map((chip) => [chip.key, chip.label, chip.singular])).toEqual([
      ["todo", "To-dos", "To-do"],
      ["link", "Links", "Link"],
      ["photo", "Photos", "Photo"],
      ["note", "Notes", "Note"],
      ["event", "Events", "Event"],
      ["place", "Places", "Place"],
      ["voice", "Voice notes", "Voice note"],
      ["file", "Files", "File"],
    ]);
    expect(CHIPS.map((chip) => chip.icon)).toEqual([
      "square-check-big",
      "link",
      "image",
      "text-quote",
      "calendar",
      "map-pin",
      "mic",
      "paperclip",
    ]);
  });

  it("put images and screenshots together, and a note under Notes", () => {
    expect(chipOf(content("a", "image"))).toBe("photo");
    expect(chipOf(content("b", "screenshot"))).toBe("photo");
    expect(chipOf(content("c", "task"))).toBe("todo");
    expect(chipOf(content("d", "location"))).toBe("place");
    expect(chipOf(note("n", "Ana's shoe size is 38"))).toBe("note");
  });

  it("are drawn only with two types present, in the table's order", () => {
    expect(chipsShown({ link: 5 })).toEqual([]);
    expect(chipsShown({})).toEqual([]);
    expect(chipsShown({ note: 2, todo: 3, link: 5 })).toEqual(["todo", "link", "note"]);
    expect(chipsShown({ link: 0, note: 2 })).toEqual([]);
  });
});

describe("the words (AC-8, AC-9, AC-20, AC-24)", () => {
  it("names the All link by the chip that is on", () => {
    expect(allLabel(14, null)).toBe("All 14");
    expect(allLabel(5, "link")).toBe("All 5 links");
    expect(allLabel(2, "voice")).toBe("All 2 voice notes");
    expect(allLabel(4, "todo")).toBe("All 4 to-dos");
  });

  it("counts two to ten in words", () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map(countInWords)).toEqual([
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
    ]);
    expect(countInWords(11)).toBe("11");
  });

  it("writes the meta as the type's singular and when it was put down", () => {
    // Tuesday 29 September 2026 in Lisbon.
    const today = "2026-09-29";
    const zone = "Europe/Lisbon";
    expect(metaLine(content("a", "image", "2026-09-29T08:00:00Z"), today, zone)).toBe("Photo · today");
    expect(metaLine(content("b", "link", "2026-09-28T08:00:00Z"), today, zone)).toBe("Link · yesterday");
    expect(metaLine(content("c", "image", "2026-09-28T23:30:00Z"), today, zone)).toBe("Photo · today");
    expect(metaLine(content("d", "task", "2026-09-26T08:00:00Z"), today, zone)).toBe("To-do · Saturday");
    expect(metaLine(note("n", "x", "2026-09-23T08:00:00Z"), today, zone)).toBe("Note · Wednesday");
    // A date from a week back, as @offload/widgets' putDown says it on both
    // clients, never "last week".
    expect(metaLine(content("e", "event", "2026-09-20T08:00:00Z"), today, zone)).toMatch(/^Event · (20 Sept?|Sep 20)$/);
    expect(metaLine(content("g", "file", "2026-07-29T08:00:00Z"), today, zone)).toMatch(/^File · (29 Jul|Jul 29)$/);
  });

  it("gives a type it does not know no chip and no singular, as the phones do", () => {
    const odd = content("x", "something-new", "2026-09-29T08:00:00Z");
    expect(chipOf(odd)).toBeNull();
    expect(metaLine(odd, "2026-09-29", "Europe/Lisbon")).toBe("today");
    const summary: LooseSummary = { count: 2, byType: { link: 1 }, rows: [odd, content("a", "link")] };
    const next = withoutEntry(summary, odd);
    expect(next.count).toBe(1);
    expect(next.byType).toEqual({ link: 1 });
    expect(withEntry(next, odd, 0).byType).toEqual({ link: 1 });
  });

  it("titles a note by its text", () => {
    expect(entryTitle(note("n", "Ana's shoe size is 38"))).toBe("Ana's shoe size is 38");
    expect(entryTitle(content("a", "link"))).toBe("Row a");
  });

  it("names the suggestion by what it does", () => {
    expect(
      suggestionName("Boiler service receipt", {
        id: "s1",
        kind: "move",
        thread: { id: "t1", name: "Flat admin" },
        faces: [],
        more: 0,
      }),
    ).toBe("Move Boiler service receipt to Flat admin");
    expect(
      suggestionName("Oak brackets", { id: "s2", kind: "create", proposal: { id: "p1", name: "Kitchen shelves", count: 3 } }),
    ).toBe("Create Kitchen shelves and move 3 into it");
  });

  it("says who will see a move into a shared thread, in the phones' words", () => {
    const move = (faces: string[], more = 0) => ({
      id: "s1",
      kind: "move" as const,
      thread: { id: "t1", name: "Flat admin" },
      faces: faces.map((displayName, i) => ({ accountId: `p${i}`, initials: displayName.slice(0, 2), displayName })),
      more,
    });
    expect(sharedHint(move([]))).toBeUndefined();
    expect(sharedHint(move(["Sam"]))).toBe("Shared with Sam");
    expect(sharedHint(move(["Sam", "Ana"]))).toBe("Shared with Sam and Ana");
    expect(sharedHint(move(["Sam", "Ana"], 2))).toBe("Shared with Sam, Ana and 2 more");
  });

  it("takes a thread name of 1 to 60 characters once trimmed, on one line", () => {
    expect(validThreadName("Kitchen shelves")).toBe(true);
    expect(validThreadName("   ")).toBe(false);
    expect(validThreadName("x".repeat(60))).toBe(true);
    expect(validThreadName(` ${"x".repeat(60)} `)).toBe(true);
    expect(validThreadName("x".repeat(61))).toBe(false);
    expect(validThreadName("Kitchen\nshelves")).toBe(false);
  });

  it("takes a thing out of the summary and its counts with it", () => {
    const summary: LooseSummary = {
      count: 3,
      byType: { link: 2, note: 1 },
      rows: [content("a", "link"), content("b", "link"), note("n", "x")],
    };
    const next = withoutEntry(summary, summary.rows[0]!);
    expect(next.count).toBe(2);
    expect(next.byType).toEqual({ link: 1, note: 1 });
    expect(next.rows.map(entryTitle)).toEqual(["Row b", "x"]);
    const last = withoutEntry(withoutEntry(next, next.rows[0]!), note("n", "x"));
    expect(last.byType).toEqual({});
    expect(last.count).toBe(0);
  });

  it("puts a thing back where it was, and its counts with it", () => {
    const summary: LooseSummary = { count: 1, byType: { note: 1 }, rows: [note("n", "x")] };
    const back = withEntry(summary, content("a", "link"), 0);
    expect(back.count).toBe(2);
    expect(back.byType).toEqual({ link: 1, note: 1 });
    expect(back.rows.map(entryTitle)).toEqual(["Row a", "x"]);
    // Twice is once.
    expect(withEntry(back, content("a", "link"), 0)).toBe(back);
  });
});

// ------------------------------------------------------------------ the calls

const calls: { method: string; url: string; body: unknown }[] = [];
let answer: (url: string, method: string) => Response = () => new Response("{}", { status: 200 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  return answer(url, method);
});

afterEach(() => {
  calls.length = 0;
});

const path = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};

describe("the calls (AC-12, AC-16, AC-20 to AC-23, AC-32)", () => {
  it("reads My threads with the loose summary", async () => {
    answer = () => json({ groups: [{ key: "now", threads: [] }], loose: { count: 1, byType: { link: 1 }, rows: [content("a", "link")] }, invitations: [] });
    const page = await fetchThreadsAndInvitations();
    expect(page?.loose?.count).toBe(1);
    answer = () => json({ groups: [], invitations: [], loose: null });
    expect((await fetchThreadsAndInvitations())?.loose).toBeNull();
  });

  it("reads the list a page at a time, by type, and the archived rows", async () => {
    answer = () => json({ rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 });
    await fetchLoose({});
    await fetchLoose({ type: "link", cursor: "c-30" });
    answer = () => json({ rows: [], nextCursor: null });
    await fetchLooseArchived("c-2");
    expect(calls.map((call) => path(call.url))).toEqual([
      "/v1/loose",
      "/v1/loose?type=link&cursor=c-30",
      "/v1/loose?archived=true&cursor=c-2",
    ]);
    answer = () => json({ error: "nope" }, 500);
    expect(await fetchLoose({})).toBeNull();
  });

  it("accepts, undoes and dismisses a suggestion", async () => {
    answer = (url) => (url.endsWith("/accept") ? json({ thread: { id: "t1", name: "Flat admin" } }) : json({ ok: true }));
    expect(await acceptSuggestion("s1")).toEqual({ id: "t1", name: "Flat admin" });
    expect(await undoSuggestion("s1")).toBe(true);
    expect(await dismissSuggestion("s1")).toBe(true);
    expect(calls.map((call) => `${call.method} ${path(call.url)}`)).toEqual([
      "POST /v1/suggestions/s1/accept",
      "POST /v1/suggestions/s1/undo",
      "DELETE /v1/suggestions/s1",
    ]);
    answer = () => json({ error: "not_found" }, 404);
    expect(await acceptSuggestion("s1")).toBeNull();
    answer = () => json({ error: "too_late" }, 409);
    expect(await undoSuggestion("s1")).toBe(false);
  });

  it("reads a proposal and creates from it, and says why it could not", async () => {
    answer = () => json({ id: "p1", name: "Kitchen shelves", entries: [content("a", "link")] });
    const read = await fetchProposal("p1");
    expect(read?.name).toBe("Kitchen shelves");
    expect(read?.entries.map(entryTitle)).toEqual(["Row a"]);
    answer = () => json({ thread: { id: "t9", name: "Kitchen shelves" } });
    expect(await createFromProposal("p1", { name: "Kitchen shelves", contentIds: ["a"], noteIds: ["n"] })).toEqual({
      ok: true,
      thread: { id: "t9", name: "Kitchen shelves" },
    });
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { name: "Kitchen shelves", contentIds: ["a"], noteIds: ["n"] } });
    expect(path(calls.at(-1)!.url)).toBe("/v1/proposals/p1/create");
    answer = () => json({ error: "bad_name" }, 400);
    expect(await createFromProposal("p1", { name: "", contentIds: [], noteIds: [] })).toEqual({ ok: false });
  });

  it("undoes a create, and tells changed from too late", async () => {
    answer = () => json({ ok: true });
    expect(await undoProposal("p1")).toBe("ok");
    expect(path(calls.at(-1)!.url)).toBe("/v1/proposals/p1/undo");
    answer = () => json({ error: "changed" }, 409);
    expect(await undoProposal("p1")).toBe("changed");
    answer = () => json({ error: "too_late" }, 409);
    expect(await undoProposal("p1")).toBe("failed");
  });

  it("moves a note, and tells a duplicate from a failure", async () => {
    answer = () => json({ note: {}, previous: { threadId: "t0" } });
    expect(await moveNote("n1", "t1")).toEqual({ ok: true, previous: { threadId: "t0" } });
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { threadId: "t1" } });
    expect(path(calls.at(-1)!.url)).toBe("/v1/notes/n1/move");
    answer = () => json({ error: "duplicate" }, 409);
    expect(await moveNote("n1", "t1")).toEqual({ ok: false, duplicate: true });
    answer = () => json({ error: "not_found" }, 404);
    expect(await moveNote("n1", "t1")).toEqual({ ok: false, duplicate: false });
  });
});

describe("a turn that filed only where no thread is named (AC-27)", () => {
  it("still draws Done, with no pill", async () => {
    const { turnDid } = await import("../src/lib/dump");
    // 028: Done is what the server says was filed, loose included; a move's
    // source in `changed` alone is not a filing.
    expect(turnDid({ threads: [], changed: ["tdefault"], filed: true })).toBe(true);
    expect(turnDid({ threads: [{ id: "t1", name: "Flat" }], changed: ["t1"] })).toBe(true);
    expect(turnDid({ threads: [], changed: ["tsource"], filed: false })).toBe(false);
    expect(turnDid({ threads: [], changed: [] })).toBe(false);
    expect(turnDid({})).toBe(false);
  });

  it("offers Undo for anything the turn changed, filed or not", async () => {
    const { turnUndoable } = await import("../src/lib/dump");
    // A move out of a thread, or a delete, files nothing and still changed
    // something a person may want back.
    expect(turnUndoable({ threads: [], changed: ["tsource"], filed: false })).toBe(true);
    expect(turnUndoable({ threads: [], changed: ["tdefault"], filed: true })).toBe(true);
    expect(turnUndoable({ threads: [{ id: "t1", name: "Flat" }], changed: [] })).toBe(true);
    expect(turnUndoable({ threads: [], changed: [], filed: false })).toBe(false);
    expect(turnUndoable({})).toBe(false);
  });
});
