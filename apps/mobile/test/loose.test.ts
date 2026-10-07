// 028 Not in a thread on the phones: the wire and the rules under the screens.
//
// AC-1 the two groups; AC-4 the redirect; AC-6 to AC-8 the group and its
// chips; AC-9 the meta line; AC-11 and AC-32 the moves; AC-16 to AC-26 the
// suggestions and the create sheet; AC-3 the null thread names.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let reply: { status: number; data: unknown } = { status: 200, data: null };

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve(reply);
  },
}));

const threads = await import("../lib/threads");
const loose = await import("../lib/loose");
import type { ThreadGroup } from "../lib/threads";
import type { LooseEntry } from "../lib/loose";

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, data: null };
});

const note = (id: string, createdAt = "2026-10-01T09:00:00.000Z"): LooseEntry => ({
  kind: "note" as const,
  note: { id, text: "Oak brackets, 30cm, matte black", createdAt } as never,
  suggestion: null,
});
const content = (id: string, type: string, createdAt = "2026-10-01T09:00:00.000Z", archivedAt: string | null = null): LooseEntry => ({
  kind: "content" as const,
  row: { id, type, title: "Boiler service receipt", createdAt, archivedAt } as never,
  suggestion: null,
});

describe("T3.1 the threads read has two groups and the loose summary", () => {
  it("hands back the groups, the invitations and what is not in a thread", async () => {
    const summary = { count: 14, byType: { todo: 3, link: 5 }, rows: [note("n1")] };
    reply = { status: 200, data: { groups: [{ key: "now", threads: [] }, { key: "older", threads: [] }], invitations: [], loose: summary } };
    const page = await threads.fetchThreadsAndInvitations();
    expect(page?.loose).toEqual(summary);
    expect(page?.groups.map((g) => g.key)).toEqual(["now", "older"]);
  });

  it("reads a missing summary as nothing to draw", async () => {
    reply = { status: 200, data: { groups: [], invitations: [] } };
    expect((await threads.fetchThreadsAndInvitations())?.loose).toBeNull();
  });

  it("has no Always on group any more", () => {
    // @ts-expect-error "always" is gone from the key (AC-1).
    const group: ThreadGroup = { key: "always", threads: [] };
    expect(group.threads).toEqual([]);
  });
});

describe("T3.2 My threads", () => {
  const row = (id: string) => ({ id, name: id, icon: "lasso", hue: 1, count: 0, meta: "", isDefault: false });

  it("counts the two lists, and is empty only with no threads and nothing loose", () => {
    const groups: ThreadGroup[] = [
      { key: "now", threads: [row("a"), row("b")] },
      { key: "older", threads: [row("c")] },
    ];
    expect(threads.myThreads(groups, null)).toMatchObject({ total: 3, empty: false });
    expect(threads.myThreads([], null).empty).toBe(true);
    expect(threads.myThreads([], { count: 2, byType: { note: 2 }, rows: [] }).empty).toBe(false);
  });
});

describe("T3.3 the chips and the All link", () => {
  it("draws chips only for two types or more, in the table's order, with counts", () => {
    expect(loose.chipsFor({ link: 5 })).toEqual([]);
    const chips = loose.chipsFor({ note: 2, todo: 3, photo: 3, link: 5 });
    expect(chips.map((c) => c.key)).toEqual(["todo", "link", "photo", "note"]);
    expect(chips.map((c) => `${c.label} ${c.count}`)).toEqual(["To-dos 3", "Links 5", "Photos 3", "Notes 2"]);
  });

  it("names every glyph from the icon set the phones draw", async () => {
    const { ICONS } = await import("../components/icons.generated");
    for (const chip of loose.CHIPS) expect(ICONS[chip.glyph as keyof typeof ICONS], chip.key).toBeDefined();
  });

  it("reads All N, or the type in lower case, and nothing at three or fewer", () => {
    expect(loose.allLink(14, null)).toBe("All 14");
    expect(loose.allLink(5, "link")).toBe("All 5 links");
    expect(loose.allLink(4, "voice")).toBe("All 4 voice notes");
    expect(loose.allLink(3, null)).toBeNull();
    expect(loose.allLink(3, "link")).toBeNull();
  });

  it("falls back to All when the picked type empties or the chips go", () => {
    expect(loose.keepChip("link", { link: 2, note: 1 })).toBe("link");
    expect(loose.keepChip("link", { note: 1, todo: 2 })).toBeNull();
    expect(loose.keepChip("link", { link: 4 })).toBeNull();
    expect(loose.keepChip(null, { link: 4, note: 1 })).toBeNull();
  });

  it("draws the summary's three on All and the first page's three on a chip", () => {
    const summary = { count: 9, byType: { link: 5, note: 4 }, rows: [note("n1"), content("c1", "link"), note("n2")] };
    const page = [content("c1", "link"), content("c2", "link"), content("c3", "link"), content("c4", "link")];
    expect(loose.groupRows(summary, null, null).map(loose.keyOf)).toEqual(["n:n1", "c:c1", "n:n2"]);
    expect(loose.groupRows(summary, "link", page).map(loose.keyOf)).toEqual(["c:c1", "c:c2", "c:c3"]);
    // The page by type has not come back, or failed: the rows in hand of
    // that type, rather than emptying.
    expect(loose.groupRows(summary, "link", null).map(loose.keyOf)).toEqual(["c:c1"]);
    expect(loose.listCount(summary, "link")).toBe(5);
    expect(loose.listCount(summary, null)).toBe(9);
  });
});

describe("T3.4 a row's meta line", () => {
  const dayOf = (iso: string) => iso.slice(0, 10);

  it("is not drawn for a live row: the tile says the type (2026-10-05)", () => {
    expect(loose.metaOf(content("c", "task", "2026-10-02T08:00:00.000Z"), dayOf)).toBeUndefined();
    expect(loose.metaOf(note("n", "2026-10-02T08:00:00.000Z"), dayOf)).toBeUndefined();
  });

  it("says when an archived row was archived, as the thread page does", () => {
    const row = content("c", "link", "2026-09-01T08:00:00.000Z", "2026-10-03T08:00:00.000Z");
    expect(loose.metaOf(row, dayOf)).toMatch(/^archived (3 Oct|Oct 3)$/);
  });
});

describe("T3.3 what left takes its counts with it", () => {
  it("subtracts from the count and each type, dropping a type it empties", () => {
    const counts = { count: 9, byType: { link: 5, note: 4 } };
    const less = loose.withoutEntries(counts, [content("c1", "link"), note("n1")]);
    expect(less).toEqual({ count: 7, byType: { link: 4, note: 3 } });
    expect(loose.withoutEntries({ count: 2, byType: { link: 1, note: 1 } }, [content("c1", "link")]).byType).toEqual({ note: 1 });
    expect(loose.withoutEntries(counts, [])).toBe(counts);
    expect(loose.withoutEntries({ count: 0, byType: {} }, [note("n1")]).count).toBe(0);
  });
});

describe("T3.5 suggestions", () => {
  const move = { id: "s1", kind: "move" as const, thread: { id: "t1", name: "Flat admin", icon: "lasso", hue: 1 }, faces: [], more: 0 };
  const create = { id: "s2", kind: "create" as const, proposal: { id: "p1", name: "Kitchen shelves", count: 3 } };

  it("names the action, never the thread as a link", () => {
    expect(loose.suggestionName("Boiler service receipt", move)).toBe("Move Boiler service receipt to Flat admin");
    expect(loose.suggestionName("Oak brackets", create)).toBe("Create Kitchen shelves and move 3 into it");
  });

  it("draws two faces at most, then the rest as a count", () => {
    const face = (n: number) => ({ accountId: `a${n}`, initials: `A${n}`, displayName: `Ana ${n}` });
    expect(loose.facesOf({ ...move, faces: [] })).toEqual({ faces: [], more: null });
    expect(loose.facesOf({ ...move, faces: [face(1), face(2)], more: 3 })).toEqual({ faces: [face(1), face(2)], more: "+3" });
    expect(loose.facesOf({ ...move, faces: [face(1)], more: 0 })).toEqual({ faces: [face(1)], more: null });
  });

  it("accepts, undoes and dismisses through their own routes", async () => {
    reply = { status: 200, data: { thread: { id: "t1", name: "Flat admin", icon: "lasso", hue: 1 } } };
    expect(await loose.acceptSuggestion("s1")).toEqual({ id: "t1", name: "Flat admin", icon: "lasso", hue: 1 });
    expect(calls[0]).toMatchObject({ path: "/v1/suggestions/s1/accept", init: { method: "POST" } });
    expect(calls[0]?.init.body).toBeUndefined();

    reply = { status: 404, data: null };
    expect(await loose.acceptSuggestion("s1")).toBeNull();

    reply = { status: 200, data: { ok: true } };
    expect(await loose.undoSuggestion("s1")).toBe("ok");
    reply = { status: 409, data: { error: "too_late" } };
    expect(await loose.undoSuggestion("s1")).toBe("too_late");
    reply = { status: 500, data: null };
    expect(await loose.undoSuggestion("s1")).toBe("failed");

    reply = { status: 200, data: { ok: true } };
    expect(await loose.dismissSuggestion("s1")).toBe(true);
    expect(calls.at(-1)).toMatchObject({ path: "/v1/suggestions/s1", init: { method: "DELETE" } });
    reply = { status: 500, data: null };
    expect(await loose.dismissSuggestion("s1")).toBe(false);
  });
});

describe("T3.6 the create sheet", () => {
  it("counts in words from two to ten", () => {
    expect([2, 3, 10].map(loose.countInWords)).toEqual(["two", "three", "ten"]);
    expect(loose.countInWords(11)).toBe("11");
    expect(loose.createLine(3)).toBe("These three look like they belong together.");
    expect(loose.createLine(2)).toBe("These two look like they belong together.");
  });

  it("takes a name of 1 to 60 once trimmed, on one line", () => {
    expect(loose.nameOk("  Kitchen shelves ")).toBe(true);
    expect(loose.nameOk("   ")).toBe(false);
    expect(loose.nameOk("x".repeat(60))).toBe(true);
    expect(loose.nameOk("x".repeat(61))).toBe(false);
    expect(loose.nameOk("Kitchen\nshelves")).toBe(false);
    // Every control character, as the server and the web refuse them.
    for (const c of ["\t", "\u0000", "\u001b", "\u001f", "\u007f"]) expect(loose.nameOk(`Kitchen${c}shelves`), JSON.stringify(c)).toBe(false);
  });

  it("will not untick the last ticked thing", () => {
    const ticked = new Set(["c:1", "n:2"]);
    const one = loose.toggleTick(ticked, "c:1");
    expect([...one]).toEqual(["n:2"]);
    expect(loose.toggleTick(one, "n:2")).toBe(one);
    expect([...loose.toggleTick(one, "c:1")].sort()).toEqual(["c:1", "n:2"]);
  });

  it("reads the proposal and creates with the ticked ids split by kind", async () => {
    reply = { status: 200, data: { id: "p1", name: "Kitchen shelves", entries: [note("n1")] } };
    const proposal = await loose.fetchProposal("p1");
    expect(proposal?.name).toBe("Kitchen shelves");
    expect(proposal?.entries.map(loose.keyOf)).toEqual(["n:n1"]);
    expect(calls[0]?.path).toBe("/v1/proposals/p1");

    reply = { status: 200, data: { thread: { id: "t9", name: "Kitchen shelves", icon: "lasso", hue: 1 } } };
    const made = await loose.createFromProposal("p1", "Kitchen shelves", new Set(["c:1", "n:2", "c:3"]));
    expect(made).toEqual({ ok: true, thread: { id: "t9", name: "Kitchen shelves", icon: "lasso", hue: 1 } });
    expect(calls.at(-1)?.path).toBe("/v1/proposals/p1/create");
    expect(JSON.parse(String(calls.at(-1)?.init.body))).toEqual({ name: "Kitchen shelves", contentIds: ["1", "3"], noteIds: ["2"] });

    reply = { status: 400, data: { error: "bad_name" } };
    expect(await loose.createFromProposal("p1", "x", new Set(["c:1"]))).toEqual({ ok: false });
    reply = { status: 500, data: null };
    expect(await loose.createFromProposal("p1", "x", new Set(["c:1"]))).toEqual({ ok: false });
  });

  it("undoes a create, and says when it is too late or the thread changed", async () => {
    reply = { status: 200, data: { ok: true } };
    expect(await loose.undoProposal("p1")).toBe("ok");
    expect(calls[0]).toMatchObject({ path: "/v1/proposals/p1/undo", init: { method: "POST" } });
    reply = { status: 409, data: { error: "changed" } };
    expect(await loose.undoProposal("p1")).toBe("refused");
    reply = { status: 409, data: { error: "too_late" } };
    expect(await loose.undoProposal("p1")).toBe("refused");
    reply = { status: 502, data: null };
    expect(await loose.undoProposal("p1")).toBe("failed");
  });
});

describe("T3.7 the full list's reads", () => {
  it("pages by cursor and filters by chip", async () => {
    reply = { status: 200, data: { rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 } };
    await loose.fetchLoose({});
    await loose.fetchLoose({ type: "link", cursor: "c30" });
    expect(calls.map((c) => c.path)).toEqual(["/v1/loose", "/v1/loose?type=link&cursor=c30"]);
  });

  it("gives the content row its place id, as the thread page's read does", async () => {
    reply = { status: 200, data: { rows: [{ kind: "content", row: { id: "c1", place: { id: "p1" } }, suggestion: null }], nextCursor: null, count: 1, byType: {}, archived: 0 } };
    const page = await loose.fetchLoose({});
    expect(page?.rows[0]?.kind === "content" && page.rows[0].row.placeId).toBe("p1");
  });

  it("reads the archived rows in the thread page's shape", async () => {
    reply = { status: 200, data: { rows: [{ id: "c1", place: null }], nextCursor: "c1" } };
    const page = await loose.fetchLooseArchived("c0");
    expect(calls[0]?.path).toBe("/v1/loose?archived=true&cursor=c0");
    expect(page?.rows[0]?.placeId).toBeNull();
    expect(page?.nextCursor).toBe("c1");
  });

  it("says nothing came back as null, so the screen can offer Try again", async () => {
    reply = { status: 500, data: null };
    expect(await loose.fetchLoose({})).toBeNull();
  });
});

describe("T3.8 the default thread opens Not in a thread", () => {
  it("replaces the route only for the caller's own default thread", () => {
    expect(loose.redirectFor({ isDefault: true })).toBe("/threads/loose");
    expect(loose.redirectFor({ isDefault: false })).toBeNull();
    expect(loose.redirectFor(null)).toBeNull();
  });
});

describe("T3.9 a thread name that is not there", () => {
  it("opens Not in a thread where the thread would have opened", () => {
    expect(loose.threadHref("t1", "Lisbon trip")).toEqual({ pathname: "/threads/[id]", params: { id: "t1" } });
    expect(loose.threadHref("t0", null)).toBe("/threads/loose");
  });

  it("offers Today's row its way to the list by name", () => {
    expect(loose.openThreadLabel("Lisbon trip")).toBe("Open the thread");
    expect(loose.openThreadLabel(null)).toBe("Open Not in a thread");
  });

  it("heads and tails an answer's loose result without naming a thread", () => {
    expect(loose.foundHead(null)).toBe("Not in a thread");
    expect(loose.foundHead("Lisbon trip")).toBe("Lisbon trip");
    expect(loose.foundFoot(3, null)).toBe("3 more not in a thread.");
    expect(loose.foundFoot(3, "Lisbon trip")).toBe("3 more in Lisbon trip.");
  });
});

describe("T3.10 a note moves between threads", () => {
  it("posts the destination and hands back where it was", async () => {
    reply = { status: 200, data: { note: {}, previous: { threadId: "t0" } } };
    expect(await loose.moveNote("n1", "t1")).toEqual({ previous: { threadId: "t0" } });
    expect(calls[0]?.path).toBe("/v1/notes/n1/move");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ threadId: "t1" }));
  });

  it("says when the words are already there", async () => {
    reply = { status: 409, data: { error: "duplicate" } };
    expect(await loose.moveNote("n1", "t1")).toBe("duplicate");
    reply = { status: 404, data: { error: "not_found" } };
    expect(await loose.moveNote("n1", "t1")).toBeNull();
    expect(loose.movedCopy("Lisbon trip")).toBe("Moved to Lisbon trip");
    expect(loose.duplicateCopy("Lisbon trip")).toBe("That's already in Lisbon trip");
  });
});

describe("T3.4 a note drawn as a row", () => {
  it("is the content row the list draws, under its own type and words", () => {
    const row = loose.noteRow({
      id: "n1", text: "Ana's shoe size is 38", createdAt: "2026-10-01T09:00:00.000Z", authorId: "a1",
      authorIsMember: true, muted: false, occursAt: null, occursEndAt: null, dueAt: null, placeId: null,
      priority: 50, allDay: false, rrule: null, labels: ["l1"], body: null, origin: "stated",
      writtenAt: "2026-10-01T09:00:00.000Z", supersededAt: null,
    });
    expect(row).toMatchObject({ id: "n1", type: "note", title: "Ana's shoe size is 38", createdAt: "2026-10-01T09:00:00.000Z", canDelete: true });
    // A loose row draws no labels.
    expect(row.labels).toEqual([]);
  });
});

describe("T3.5 who a shared Move to shows it to", () => {
  it("names them for a screen reader, which hears the action and not the marks", () => {
    const face = (name: string) => ({ accountId: name, initials: name[0]!, displayName: name });
    const move = { id: "s1", kind: "move" as const, thread: { id: "t1", name: "Flat admin", icon: "lasso", hue: 1 }, faces: [face("Ana"), face("Tom")], more: 3 };
    expect(loose.sharedHint(move)).toBe("Shared with Ana, Tom and 3 more");
    expect(loose.sharedHint({ ...move, faces: [face("Ana")], more: 0 })).toBe("Shared with Ana");
    expect(loose.sharedHint({ ...move, faces: [], more: 0 })).toBeUndefined();
  });
});

describe("T3.7 the chip a link opens the list on", () => {
  it("takes a chip key from the route and nothing else", () => {
    expect(loose.asChip("link")).toBe("link");
    expect(loose.asChip("always")).toBeNull();
    expect(loose.asChip(undefined)).toBeNull();
    expect(loose.asChip(["link"])).toBeNull();
  });
});

describe("Done for a turn that filed only loose (AC-27)", () => {
  it("comes from what the server says was filed, not from the pills", async () => {
    const { turnDid } = await import("../lib/turn-did");
    expect(turnDid({ threads: [], filed: true })).toBe(true);
    expect(turnDid({ threads: [{ id: "t1", name: "Flat admin" }] })).toBe(true);
    expect(turnDid({ threads: [], filed: false })).toBe(false);
    expect(turnDid({})).toBe(false);
  });
});
