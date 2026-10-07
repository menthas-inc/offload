// 040 the Memories tab on the phones: the wire, the list, the editor's writes
// and the forget with Undo. The screens render nothing in these tests, so what
// a screen decides is a pure function here and the screen draws its answer.
//
// AC-11 the states; AC-12 the list; AC-13 search; AC-14 the editor; AC-15
// forget and the failure toast.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEMORY_COPY, memoryRefusal, mixOklch, type MemoryList, type MemoryView } from "@offload/widgets";
import { resolved } from "@offload/tokens";
import { perform, type ToastAction, type Writes } from "../lib/optimistic";

const calls: { path: string; init: RequestInit }[] = [];
let reply: { status: number; data: unknown } = { status: 200, data: null };

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve(reply);
  },
}));

const memories = await import("../lib/memories");

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, data: null };
});

const NOW = new Date(2026, 9, 6, 12);
const daysAgo = (n: number): string => new Date(2026, 9, 6 - n, 9).toISOString();

const memory = (over: Partial<MemoryView> & Pick<MemoryView, "id">): MemoryView => ({
  kind: "about",
  text: "They are allergic to nuts.",
  origin: "stated",
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1),
  changed: false,
  source: { type: "none" },
  place: null,
  ...over,
});

const list = (rows: MemoryView[], full = false): MemoryList => ({ memories: rows, kinds: [], full, rulesFull: false });

describe("the read (AC-11)", () => {
  it("asks for every memory and hands back the list", async () => {
    reply = { status: 200, data: list([memory({ id: "m1" })]) };
    const read = await memories.fetchMemories();
    expect(calls[0]?.path).toBe("/v1/memories");
    expect(calls[0]?.init.method ?? "GET").toBe("GET");
    expect(read).toEqual(list([memory({ id: "m1" })]));
  });

  it("calls anything else a failed read", async () => {
    reply = { status: 0, data: null };
    expect(await memories.fetchMemories()).toBe("failed");
    reply = { status: 500, data: null };
    expect(await memories.fetchMemories()).toBe("failed");
  });

  it("keeps a list it already shows when a refresh fails", () => {
    const shown = list([memory({ id: "m1" })]);
    expect(memories.nextRead(shown, "failed")).toBe(shown);
    expect(memories.nextRead(null, "failed")).toBe("failed");
    const fresh = list([]);
    expect(memories.nextRead(shown, fresh)).toBe(fresh);
  });
});

describe("what the screen draws (AC-11, AC-12)", () => {
  it("is one spinner while loading", () => {
    expect(memories.memoriesScreen(null)).toEqual({ state: "loading" });
  });

  it("says a failed read beside Try again", () => {
    expect(memories.memoriesScreen("failed")).toEqual({ state: "failed", line: MEMORY_COPY.loadFailed, retry: "Try again" });
  });

  it("is the empty line when nothing is kept", () => {
    expect(memories.memoriesScreen(list([]))).toEqual({ state: "empty", line: MEMORY_COPY.empty });
  });

  it("carries the cap line at the top while the cap stops anything", () => {
    expect(memories.memoriesScreen(list([memory({ id: "m1" })], true))).toEqual({ state: "list", capLine: MEMORY_COPY.full });
    expect(memories.memoriesScreen(list([memory({ id: "m1" })], false))).toEqual({ state: "list", capLine: null });
  });
});

describe("the list (AC-12, AC-13)", () => {
  const rows = [
    memory({ id: "a", kind: "about", createdAt: daysAgo(2) }),
    memory({ id: "p", kind: "people", text: "Their wife is Meera.", createdAt: daysAgo(3) }),
    memory({ id: "r", kind: "rules", text: "They write dates day first.", createdAt: daysAgo(28) }),
    memory({ id: "p2", kind: "people", text: "Their brother is Arjun.", createdAt: daysAgo(1) }),
  ];

  it("draws By kind in the kind order, with no empty kind and newest first inside", () => {
    const view = memories.listView(rows, "kind", "", NOW);
    expect(view.sections.map((s) => [s.title, s.kind, s.rows.map((r) => r.id)])).toEqual([
      ["People", "people", ["p2", "p"]],
      ["About", "about", ["a"]],
      ["Rules", "rules", ["r"]],
    ]);
    expect(view.nothing).toBeNull();
  });

  it("draws Newest as This week and Earlier", () => {
    const view = memories.listView(rows, "new", "", NOW);
    expect(view.sections.map((s) => [s.title, s.rows.map((r) => r.id)])).toEqual([
      ["This week", ["p2", "a", "p"]],
      ["Earlier", ["r"]],
    ]);
  });

  it("filters as you type, over the sentence, whatever its case", () => {
    const view = memories.listView(rows, "kind", "meera", NOW);
    expect(view.sections.flatMap((s) => s.rows.map((r) => r.id))).toEqual(["p"]);
  });

  it("says so when nothing matches", () => {
    const view = memories.listView(rows, "kind", "zebra", NOW);
    expect(view.sections).toEqual([]);
    expect(view.nothing).toBe(MEMORY_COPY.nothingSays("zebra"));
  });
});

describe("a kind's colours", () => {
  // The light scope's own values, as `useColors()` hands them over.
  const t = resolved.light as Record<string, string>;
  const palette = {
    labels: Array.from({ length: 11 }, (_, n) => (n === 0 ? t["text-primary"]! : t[`label-${n}`]!)),
    ink: t["text-primary"]!,
    raised: t["surface-raised"]!,
    inverse: t["surface-inverse"]!,
    onSolid: t["text-inverse"]!,
  };

  it("mixes a hue's soft ground and ink from its label token", () => {
    expect(memories.kindColors("people", palette)).toEqual({
      dot: t["label-2"],
      soft: mixOklch(t["label-2"]!, palette.raised, 0.22),
      ink: mixOklch(t["label-2"]!, palette.ink, 0.78),
      filled: false,
    });
    expect(memories.kindColors("patterns", palette).dot).toBe(t["label-5"]);
  });

  it("draws Rules in ink, filled, with inverse text", () => {
    expect(memories.kindColors("rules", palette)).toEqual({ dot: palette.ink, soft: palette.inverse, ink: palette.onSolid, filled: true });
  });
});

describe("the field (AC-14)", () => {
  it("refuses a newline", () => {
    expect(memories.oneLine("Their wife\nis Meera.")).toBe("Their wife is Meera.");
    expect(memories.oneLine("Two\r\n\nlines")).toBe("Two lines");
  });

  it("says the calendar goes once an answered memory's words change", () => {
    const answered = memory({ id: "m1", origin: "answered", text: "They share a calendar with Meera." });
    expect(memories.severs(answered, "They share a calendar with Meera.")).toBe(false);
    expect(memories.severs(answered, "  They share a calendar with Meera.  ")).toBe(false);
    expect(memories.severs(answered, "They share a calendar with Rina.")).toBe(true);
    expect(memories.severs(memory({ id: "m2", origin: "stated" }), "Changed")).toBe(false);
    expect(memories.severs(null, "New")).toBe(false);
  });
});

describe("adding and changing (AC-14)", () => {
  it("adds the sentence and its kind as JSON and says Remembered", async () => {
    reply = { status: 200, data: { ok: true, id: "m9" } };
    const done = await memories.submitMemory(null, "  My sister is Rina. ", "people");
    expect(calls[0]?.path).toBe("/v1/memories");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ text: "My sister is Rina.", kind: "people" }));
    expect(done).toEqual({ outcome: "saved", toast: MEMORY_COPY.remembered });
  });

  it("changes only what changed, and says Saved", async () => {
    reply = { status: 200, data: { ok: true, id: "m1" } };
    const one = memory({ id: "m1", kind: "about", text: "They are allergic to nuts." });
    expect(await memories.submitMemory(one, "They are allergic to peanuts.", "about")).toEqual({ outcome: "saved", toast: MEMORY_COPY.saved });
    expect(calls[0]?.path).toBe("/v1/memories/m1");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ text: "They are allergic to peanuts." }));

    // Making it a rule carries its words, so the change shows what becomes an instruction.
    await memories.submitMemory(one, "They are allergic to nuts.", "rules");
    expect(calls[1]?.init.body).toBe(JSON.stringify({ text: "They are allergic to nuts.", kind: "rules" }));
    await memories.submitMemory(one, "They are allergic to nuts.", "things");
    expect(calls[2]?.init.body).toBe(JSON.stringify({ kind: "things" }));
  });

  it("sends nothing when nothing changed", async () => {
    const one = memory({ id: "m1" });
    expect(await memories.submitMemory(one, one.text, one.kind)).toEqual({ outcome: "unchanged" });
    expect(calls).toEqual([]);
  });

  it("keeps the editor open with the reason when the server refuses", async () => {
    reply = { status: 200, data: { ok: false, error: "duplicate" } };
    expect(await memories.submitMemory(null, "Their wife is Meera.", "people")).toEqual({ outcome: "refused", line: memoryRefusal("duplicate") });
    reply = { status: 200, data: { ok: false, error: "never_list" } };
    expect(await memories.submitMemory(memory({ id: "m1" }), "Something else", "about")).toEqual({ outcome: "refused", line: memoryRefusal("never_list") });
  });

  it("calls a write that never lands a failure", async () => {
    reply = { status: 0, data: null };
    expect(await memories.submitMemory(null, "Anything", "about")).toEqual({ outcome: "failed" });
    reply = { status: 500, data: null };
    expect(await memories.submitMemory(memory({ id: "m1" }), "Anything", "about")).toEqual({ outcome: "failed" });
  });

  it("calls a change to a memory forgotten elsewhere gone, which no Retry could save", async () => {
    reply = { status: 404, data: null };
    expect(await memories.submitMemory(memory({ id: "m1" }), "Anything", "about")).toEqual({ outcome: "gone" });
  });

  it("refuses to send an empty sentence", async () => {
    expect(await memories.submitMemory(null, "   ", "about")).toEqual({ outcome: "refused", line: memoryRefusal("empty") });
    expect(calls).toEqual([]);
  });
});

describe("forget, with Undo (AC-15)", () => {
  function harness() {
    const toasts: { message: string; action?: ToastAction }[] = [];
    const toast = { show: (message: string, action?: ToastAction) => void toasts.push(action ? { message, action } : { message }) };
    const writes: Writes = { track: (write) => write.catch(() => false), idle: () => true };
    const drawn: string[] = [];
    const draw = { drop: (id: string) => drawn.push(`drop ${id}`), put: (m: MemoryView) => drawn.push(`put ${m.id}`) };
    return { toasts, toast, writes, drawn, draw };
  }

  it("takes the row out, forgets it, and offers Undo for the toast's eight seconds", async () => {
    const h = harness();
    reply = { status: 200, data: { ok: true, id: "m1" } };
    expect(await perform(memories.forgetOp(memory({ id: "m1" }), h.draw), h.toast, h.writes)).toBe(true);
    expect(h.drawn).toEqual(["drop m1"]);
    expect(calls[0]?.path).toBe("/v1/memories/m1");
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(h.toasts[0]).toEqual({ message: MEMORY_COPY.forgotten, action: expect.objectContaining({ label: "Undo" }) });
  });

  it("Undo restores it", async () => {
    const h = harness();
    reply = { status: 200, data: { ok: true, id: "m1" } };
    await perform(memories.forgetOp(memory({ id: "m1" }), h.draw), h.toast, h.writes);
    await h.toasts[0]?.action?.onPress();
    expect(calls[1]?.path).toBe("/v1/memories/m1/restore");
    expect(calls[1]?.init.method).toBe("POST");
    expect(calls[1]?.init.body).toBeUndefined();
    expect(h.drawn).toEqual(["drop m1", "put m1"]);
  });

  it("puts it back and says Couldn't save that with Retry when the forget fails", async () => {
    const h = harness();
    reply = { status: 0, data: null };
    expect(await perform(memories.forgetOp(memory({ id: "m1" }), h.draw), h.toast, h.writes)).toBe(false);
    expect(h.drawn).toEqual(["drop m1", "put m1"]);
    expect(h.toasts.at(-1)).toEqual({ message: MEMORY_COPY.saveFailed, action: expect.objectContaining({ label: "Retry" }) });
  });

  it("counts a forget of one already gone as done", async () => {
    const h = harness();
    reply = { status: 404, data: null };
    expect(await perform(memories.forgetOp(memory({ id: "m1" }), h.draw), h.toast, h.writes)).toBe(true);
    expect(h.drawn).toEqual(["drop m1"]);
    expect(h.toasts.at(-1)?.message).toBe(MEMORY_COPY.forgotten);
  });

  it("says Couldn't put that back when the restore is refused", async () => {
    const h = harness();
    reply = { status: 200, data: { ok: true, id: "m1" } };
    await perform(memories.forgetOp(memory({ id: "m1" }), h.draw), h.toast, h.writes);
    reply = { status: 404, data: null };
    await h.toasts[0]?.action?.onPress();
    expect(h.toasts.at(-1)).toEqual({ message: MEMORY_COPY.unfailed, action: expect.objectContaining({ label: "Retry" }) });
  });
});

describe("the return key (AC-14)", () => {
  it("saves when a newline lands at the end, which is Android's Enter on a multiline field", () => {
    expect(memories.typedLine("Their wife is Meera.", "Their wife is Meera.\n")).toEqual({ text: "Their wife is Meera.", submit: true });
    expect(memories.typedLine("Their wife", "Their wife\r\n")).toEqual({ text: "Their wife", submit: true });
  });

  it("folds a newline pasted inside the text into a space, and does not save", () => {
    expect(memories.typedLine("", "Their wife\nis Meera.")).toEqual({ text: "Their wife is Meera.", submit: false });
    expect(memories.typedLine("Their", "Their wife")).toEqual({ text: "Their wife", submit: false });
  });
});
