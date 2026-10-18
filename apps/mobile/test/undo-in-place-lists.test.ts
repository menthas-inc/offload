// Undo in place on the phones (2026-10-18), list by list: every Undo has a
// place, and every list that shows the thing draws its line. These tests read
// the source, since the screens render nothing here; the store and the slot
// ordering are tested in `@offload/widgets`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/** Each call's argument text, by balanced parentheses from the opening one. */
function calls(source: string, callee: RegExp): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`${callee.source}\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    let depth = 0;
    const start = match.index + match[0].length - 1;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
      if (depth === 0) {
        found.push(source.slice(start + 1, i));
        break;
      }
    }
  }
  return found;
}

const UNDO_FILES = [
  "components/screens/Thread.tsx",
  "components/screens/MyThreads.tsx",
  "components/screens/Memories.tsx",
  "components/shell/Notes.tsx",
  "components/shell/Shell.tsx",
  "components/shell/conversation-context.tsx",
  "components/loose/useLooseRows.tsx",
  "components/today/useTodayRows.tsx",
  "components/today/Reminders.tsx",
  "components/today/OpenThreads.tsx",
  "components/today/NeedsYou.tsx",
];

describe("every Undo has a place", () => {
  it.each(UNDO_FILES)("%s hands each direct Undo a place", (file) => {
    const source = read(file);
    // Discarded is the composer's own and stays a toast: it is not in the handoff's table.
    const direct = calls(source, /(?:toast\.show|notify)/).filter((args) => args.includes('label: "Undo"') && !args.includes('"Discarded"'));
    // Its place inline, or held in a `place` passed last.
    for (const args of direct) expect(args, args).toMatch(/form: |\bplace,?\s*$/);
  });

  it.each(UNDO_FILES)("%s gives each op with an Undo a place", (file) => {
    const source = read(file);
    const ops = calls(source, /perform/).filter((args) => args.includes("unwrite"));
    for (const args of ops) expect(args, args).toMatch(/place: /);
  });

  it("wraps the ops built elsewhere with a place where they are performed", () => {
    expect(read("components/shell/Notes.tsx")).toMatch(/\.\.\.noteSave\([\s\S]*?\),\s*place: \{ id: note\.id, icon: "pencil", form: "under" \}/);
    expect(read("components/screens/Memories.tsx")).toMatch(/place: \{ id: memory\.id, icon: "cloudy", form: view === "map" \? "plate" : "slot" \}/);
  });
});

describe("the thread", () => {
  const source = read("components/screens/Thread.tsx");

  it("gives each row action its glyph, and a row the rail alone draws a plate", () => {
    for (const icon of ["archive", "trash-2", "arrow-up-right", "pencil", "tag"]) expect(source).toContain(`"${icon}"`);
    expect(source).toMatch(/listed\.current\.has\(rowId\) \? form : "plate"/);
  });

  it("draws the rows in place, the list's labelling under the filter bar and the thread's edit under its read", () => {
    expect(source).toMatch(/<InPlace\s/);
    expect(source).toMatch(/<UndoAt id=\{`labels:\$\{thread\.id\}`\} \/>/);
    expect(source).toMatch(/<UndoAt id=\{`thread:\$\{thread\.id\}`\} \/>/);
  });

  it("puts a deleted label's line in its chip, and a left thread's in its row on My threads", () => {
    expect(source).toMatch(/id: `label:\$\{label\.id\}`, icon: "trash-2", form: "slot"/);
    expect(source).toMatch(/router\.dismissTo\("\/threads"\)/);
    expect(source).toMatch(/id: `thread:\$\{id\}`, icon: result\.deleted \? "trash-2" : "log-out", form: "slot"/);
  });

  it("draws the widgets, the notes and the label chips in place", () => {
    expect(read("components/shell/Widgets.tsx")).toMatch(/useInPlace\(shown/);
    expect(read("components/shell/Notes.tsx")).toMatch(/useInPlace\(notes/);
    expect(read("components/labels/FilterBar.tsx")).toMatch(/useInPlace\(labels/);
  });
});

describe("my threads and not in a thread", () => {
  it("draws both thread lists in place, and a line with no row drawn yet at the top", () => {
    const source = read("components/screens/MyThreads.tsx");
    expect(source.match(/<InPlace\s/g)?.length).toBe(2);
    expect(source).toMatch(/id: `thread:\$\{id\}`/);
    expect(source).toMatch(/startsWith\("thread:"\)/);
  });

  it("draws the group and the full list in place, and a made thread's line in its first row", () => {
    expect(read("components/loose/LooseGroup.tsx")).toMatch(/useInPlace\(rows, keyOf\)/);
    expect(read("components/screens/Loose.tsx")).toMatch(/useInPlace\(shown, keyOf\)/);
    expect(read("components/loose/useLooseRows.tsx")).toMatch(/notify\(`Created \$\{thread\.name\}`, \{ label: "Undo", onPress: undo \}, place\)/);
  });
});

describe("today", () => {
  it("takes a ticked to-do out with Undo, as Open in your threads does", () => {
    const source = read("components/today/useTodayRows.tsx");
    expect(source).toMatch(/did: "Ticked off"/);
    expect(source).toMatch(/icon: "check", form: "slot"/);
  });

  it("draws To do, Reminders and Open in your threads in place", () => {
    expect(read("components/today/TodayScreen.tsx")).toMatch(/useInPlace\(lateShown/);
    expect(read("components/today/Reminders.tsx")).toMatch(/useInPlace\(onDay/);
    expect(read("components/today/OpenThreads.tsx")).toMatch(/<InPlace\s/);
  });

  it("keeps the reminders section while a dismissal's line runs", () => {
    expect(read("components/today/TodayScreen.tsx")).toMatch(/\[\.\.\.gone\]\.some\(\(key\) => undoLines\.has\(key\)\)/);
  });

  it("puts an answered card's line in the card's place, saying what it answered for", () => {
    const source = read("components/today/NeedsYou.tsx");
    expect(source).toMatch(/, for \$\{/);
    expect(source).toMatch(/<UndoLine key=\{entry\.id\} entry=\{entry\} radius=\{radius\} \/>/);
  });
});

describe("memories", () => {
  it("draws the list in place, each slot in the section it left", () => {
    const source = read("components/screens/Memories.tsx");
    expect(source).toMatch(/useInPlace\(\s*shown\.sections\.flatMap/);
    expect(source).toMatch(/sectionOf\.current\.get\(one\.entry\.id\)/);
  });
});

describe("the plate", () => {
  it("stacks the lines with nowhere else to go above the composer, inside the plate", () => {
    expect(read("components/shell/Plate.tsx")).toMatch(/<UndoPlates entries=\{plates\} \/>/);
  });

  it("files a dump's Undo above the composer as Saved to, and keeps the conversation's own report a toast", () => {
    const source = read("components/shell/Shell.tsx");
    expect(source).toMatch(/`Saved to \$\{nameList\(/);
    expect(source).toMatch(/form: "plate"/);
    expect(source).toMatch(/conversation\.raised/);
  });

  it("keeps a discarded voice note's Undo in the toast, the composer's own, and a notice can carry a place", () => {
    const source = read("components/shell/conversation-context.tsx");
    expect(source).toMatch(/notify\("Discarded", \{ label: "Undo", onPress: \(\) => setNote\(taken\) \}\);/);
    expect(read("components/shell/Shell.tsx")).toMatch(/toast\.show\(notice\.message, notice\.action, notice\.place\)/);
  });
});
