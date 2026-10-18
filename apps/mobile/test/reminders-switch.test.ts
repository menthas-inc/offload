// 042. Remind me on one thing: what the row sheet writes for the author and
// for anybody else, what is drawn ahead of the server, what Undo sends back,
// the note and memory write, and where the switch and the bell are drawn.
// The drawing is read from the source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let status = 200;
// A write refused by what it is, so one of two can land: "PUT" or "PATCH".
const refused = new Set<string>();

vi.mock("../lib/api", () => ({
  send: async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    const said = refused.has(init.method ?? "GET") ? 500 : status;
    return { status: said, data: said === 200 ? { ok: true } : null };
  },
}));

const { drawnRemind, noteSave, putReminders, remindOf, remindWrite, undoPatch } = await import("../lib/reminders");
const { perform, reverse } = await import("../lib/optimistic");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

beforeEach(() => {
  calls.length = 0;
  status = 200;
  refused.clear();
});

describe("the row sheet's switch", () => {
  it("starts on for the author while offload reminds or somebody asked, and on for anybody else while somebody asked", () => {
    expect(remindOf({ reminders: "on", isReminder: false }, true)).toBe(true);
    expect(remindOf({ reminders: "off", isReminder: false }, true)).toBe(false);
    expect(remindOf({ reminders: null, isReminder: true }, true)).toBe(true);
    expect(remindOf({ reminders: null, isReminder: true }, false)).toBe(true);
  });

  it("writes reminders for the author, both ways, and nothing when unchanged", () => {
    expect(remindWrite({ reminders: "on", isReminder: false }, true, false)).toEqual({ reminders: "off" });
    expect(remindWrite({ reminders: "off", isReminder: false }, true, true)).toEqual({ reminders: "on" });
    // An asked row with no label yet: the author's stop is still for good.
    expect(remindWrite({ reminders: null, isReminder: true }, true, false)).toEqual({ reminders: "off" });
    expect(remindWrite({ reminders: "on", isReminder: false }, true, true)).toEqual({});
  });

  it("keeps 023's way out for anybody else, and never turns isReminder on", () => {
    expect(remindWrite({ reminders: null, isReminder: true }, false, false)).toEqual({ isReminder: false });
    expect(remindWrite({ reminders: null, isReminder: false }, false, true)).toEqual({});
  });

  it("draws a stop as both off, since the server turns isReminder off with it", () => {
    expect(drawnRemind({ reminders: "off" })).toEqual({ reminders: "off", isReminder: false });
    expect(drawnRemind({ reminders: "on" })).toEqual({ reminders: "on" });
    expect(drawnRemind({ isReminder: false })).toEqual({ isReminder: false });
    expect(drawnRemind({ title: "x" })).toEqual({});
  });
});

describe("Undo from the snapshot", () => {
  const snapshot = {
    title: "Pay the rent",
    body: null,
    dueAt: null,
    occursAt: null,
    occursEndAt: null,
    allDay: false,
    rrule: null,
    isReminder: true,
    labels: [],
  };

  it("sends reminders and isReminder back as they were", () => {
    expect(undoPatch({ ...snapshot, reminders: "on" })).toMatchObject({ reminders: "on", isReminder: true });
  });

  it("sends the snapshot back as it is, a null included, which the route leaves alone", () => {
    expect(undoPatch({ ...snapshot, reminders: null })).toEqual({ ...snapshot, reminders: null });
  });
});

describe("a note's and a memory's switch", () => {
  it("is one PUT with the kind, the id and on, true only when it landed", async () => {
    expect(await putReminders("note", "n1", false)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe("/v1/reminders");
    expect(calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ of: "note", id: "n1", on: false });
    status = 404;
    expect(await putReminders("memory", "m1", true)).toBe(false);
  });
});

describe("the note editor's Save", () => {
  const note = { id: "n1", text: "Rent is due", reminders: "on" as const };
  const said: string[] = [];
  const toast = { show: (message: string) => void said.push(message) };
  const writes = { track: (write: Promise<boolean>) => write.catch(() => false), idle: () => true };
  const drawing = () => {
    const shown: { text: string; reminders: "on" | "off" | null | undefined } = { text: note.text, reminders: note.reminders };
    return { shown, draw: (fields: { text?: string; reminders?: "on" | "off" | null | undefined }) => Object.assign(shown, fields) };
  };

  beforeEach(() => {
    said.length = 0;
  });

  it("puts back only the words when the switch landed and the words did not", async () => {
    const { shown, draw } = drawing();
    refused.add("PATCH");
    expect(await perform(noteSave(note, "Rent is due Friday", false, draw), toast, writes)).toBe(false);
    expect(shown).toEqual({ text: "Rent is due", reminders: "off" });
    expect(said.at(-1)).toBe("Couldn't change the note");
  });

  it("puts back both when the switch is refused, and the words are never sent", async () => {
    const { shown, draw } = drawing();
    refused.add("PUT");
    expect(await perform(noteSave(note, "Rent is due Friday", false, draw), toast, writes)).toBe(false);
    expect(shown).toEqual({ text: "Rent is due", reminders: "on" });
    expect(calls.map((call) => call.init.method)).toEqual(["PUT"]);
  });

  it("Undo takes both back, and redraws only what it could not take back", async () => {
    const both = drawing();
    const op = noteSave(note, "Rent is due Friday", false, both.draw);
    expect(await perform(op, toast, writes)).toBe(true);
    expect(both.shown).toEqual({ text: "Rent is due Friday", reminders: "off" });
    expect(await reverse(op, toast, writes)).toBe(true);
    expect(both.shown).toEqual({ text: "Rent is due", reminders: "on" });

    const half = drawing();
    const again = noteSave(note, "Rent is due Friday", false, half.draw);
    await perform(again, toast, writes);
    refused.add("PUT");
    expect(await reverse(again, toast, writes)).toBe(false);
    expect(half.shown).toEqual({ text: "Rent is due", reminders: "off" });
  });

  it("writes the switch alone when only the switch moved", async () => {
    const { shown, draw } = drawing();
    expect(await perform(noteSave(note, "Rent is due", false, draw), toast, writes)).toBe(true);
    expect(calls.map((call) => call.init.method)).toEqual(["PUT"]);
    expect(shown).toEqual({ text: "Rent is due", reminders: "off" });
    expect(said[0]).toBe("Saved");
  });

  it("writes the words alone when the editor drew no switch", async () => {
    const { draw } = drawing();
    expect(await perform(noteSave(note, "Rent is due Friday", undefined, draw), toast, writes)).toBe(true);
    expect(calls.map((call) => call.init.method)).toEqual(["PATCH"]);
    expect(said[0]).toBe("Note changed");
  });
});

describe("the screens", () => {
  it("the row sheet draws the switch on the shared rule and folds the write into its one Save", () => {
    const sheet = read("components/shell/RowEditSheet.tsx");
    expect(sheet).toMatch(/remindSwitchShown\(row, row\.author\.isYou\)/);
    expect(sheet).toMatch(/remindWrite\(row, row\.author\.isYou, remind\)/);
    expect(sheet).not.toMatch(/\{row\.isReminder \? \(/);
  });

  it("the date chip draws the bell on the shared rule", () => {
    const chip = read("components/shell/DateChip.tsx");
    expect(chip).toMatch(/bellOn\(row\)/);
    expect(read("components/shell/ContentRow.tsx")).not.toMatch(/isReminder=\{row\.isReminder\}/);
  });

  it("the note editor draws it for the author on a note offload reminds about, and writes it through the thread's helper with Undo", () => {
    const notes = read("components/shell/Notes.tsx");
    expect(notes).toMatch(/remindSwitchShown\(\{ reminders: note\.reminders \}, mine\)/);
    expect(notes).toMatch(/perform\(\s*\{\s*\.\.\.noteSave\(note, text, remind, \(fields\) => patch\(note\.id, fields\)\),[\s\S]*?\},\s*toast,\s*writes,\s*\)/);
  });

  it("the memory editor draws it on a memory offload reminds about, written at the switch, with the editor's own failure line", () => {
    const editor = read("components/memories/MemoryEditor.tsx");
    expect(editor).toMatch(/remindSwitchShown\(held \?\? \{\}, true\)/);
    expect(editor).toMatch(/putReminders\("memory", held\.id, next\)/);
    expect(editor).toMatch(/onFailed\(/);
  });

  it("the memory editor's switch follows the memory it is handed, which Memories reads fresh after a reload", () => {
    const editor = read("components/memories/MemoryEditor.tsx");
    expect(editor).toMatch(/useEffect\(\(\) => setRemind\(heldRemind\), \[heldRemind\]\)/);
    const screen = read("components/screens/Memories.tsx");
    expect(screen).toMatch(/memories\.find\(\(memory\) => memory\.id === editor\.editing\?\.id\) \?\? editor\.editing/);
  });

  it("the plain chip says offload will remind you when it draws the bell", () => {
    const chip = read("components/shell/DateChip.tsx");
    const plain = chip.slice(chip.indexOf("export function PlainChip"), chip.indexOf("export function HourChip"));
    expect(plain).toMatch(/accessibilityLabel=\{bell \? `\$\{label\}, offload will remind you` : label\}/);
  });

  it("the three mergers draw the switch and put back reminders with the rest", () => {
    for (const path of ["components/today/useTodayRows.tsx", "components/loose/useLooseRows.tsx", "components/screens/Thread.tsx"]) {
      const source = read(path);
      expect(source, path).toMatch(/drawnRemind\(/);
      expect(source, path).toMatch(/reminders: row\.reminders/);
      expect(source, path).toMatch(/undoPatch\(/);
    }
  });
});
