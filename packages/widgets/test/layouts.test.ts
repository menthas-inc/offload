import { describe, expect, it } from "vitest";
import {
  LAYOUTS,
  LAYOUT_NAMES,
  LAYOUT_LABELS,
  reachesToday,
  labelsToMake,
  labelsToDrop,
  suggestionLine,
  layoutFor,
  type Layout,
} from "../src/layouts.js";
import { widgetsFor } from "../src/index.js";

// A content row for these tests: Sortable plus what layoutFor reads.
function row(
  id: string,
  over: Partial<{
    type: string;
    priority: number;
    doneAt: string | null;
    occursAt: string | null;
    dueAt: string | null;
    labels: string[];
    title: string;
    createdAt: string;
    isReminder: boolean;
  }> = {},
) {
  return {
    id,
    type: over.type ?? "task",
    priority: over.priority ?? 0,
    doneAt: over.doneAt ?? null,
    occursAt: over.occursAt ?? null,
    occursEndAt: null,
    dueAt: over.dueAt ?? null,
    placeId: null,
    isReminder: over.isReminder ?? false,
    labels: over.labels ?? [],
    title: over.title ?? id,
    createdAt: over.createdAt ?? "2026-10-01T00:00:00.000Z",
  };
}
function note(id: string, over: Partial<{ createdAt: string; occursAt: string | null }> = {}) {
  return { id, createdAt: over.createdAt ?? "2026-10-01T00:00:00.000Z", occursAt: over.occursAt ?? null };
}

const NOW = new Date("2026-10-19T12:00:00.000Z");
const base = { notes: [] as ReturnType<typeof note>[], labels: [] as { id: string; name: string }[], preference: {}, now: NOW };

describe("the closed set", () => {
  it("is the six, in order", () => {
    expect(LAYOUTS).toEqual(["default", "todo", "events", "gallery", "project", "timeline"]);
    expect(LAYOUT_NAMES.todo).toBe("Todo list");
    expect(LAYOUT_NAMES.default).toBe("Default");
  });
  it("only Events and Project make labels", () => {
    expect(LAYOUT_LABELS.events).toEqual(["Booked", "Still deciding", "Passed on"]);
    expect(LAYOUT_LABELS.project).toEqual(["Now", "Next", "Later"]);
    expect(LAYOUT_LABELS.todo).toEqual([]);
    expect(LAYOUT_LABELS.gallery).toEqual([]);
    expect(LAYOUT_LABELS.timeline).toEqual([]);
    expect(LAYOUT_LABELS.default).toEqual([]);
  });
});

describe("reachesToday (decision 11)", () => {
  const plain = { dueAt: null, occursAt: null, isReminder: false };
  it("default and project take any open row", () => {
    expect(reachesToday("default", plain)).toBe(true);
    expect(reachesToday("project", plain)).toBe(true);
  });
  it("todo, gallery and timeline take none that is undated", () => {
    expect(reachesToday("todo", plain)).toBe(false);
    expect(reachesToday("gallery", plain)).toBe(false);
    expect(reachesToday("timeline", plain)).toBe(false);
  });
  it("events takes only dated rows", () => {
    expect(reachesToday("events", plain)).toBe(false);
    expect(reachesToday("events", { ...plain, occursAt: "2026-10-20T00:00:00Z" })).toBe(true);
  });
  it("a date or a reminder reaches Today in every layout", () => {
    for (const layout of LAYOUTS) {
      expect(reachesToday(layout, { ...plain, dueAt: "2026-10-20T00:00:00Z" })).toBe(true);
      expect(reachesToday(layout, { ...plain, isReminder: true })).toBe(true);
    }
  });
});

describe("labelsToMake / labelsToDrop (decision 3)", () => {
  it("makes the layout's missing labels, matched by name ignoring case", () => {
    expect(labelsToMake("events", [{ name: "booked" }])).toEqual(["Still deciding", "Passed on"]);
    expect(labelsToMake("project", [])).toEqual(["Now", "Next", "Later"]);
    expect(labelsToMake("todo", [])).toEqual([]);
  });
  it("drops the old layout's empty labels the new one does not use", () => {
    const live = [
      { id: "l1", name: "Booked", count: 0 },
      { id: "l2", name: "Still deciding", count: 2 },
      { id: "l3", name: "Passed on", count: 0 },
      { id: "l4", name: "Mine", count: 0 },
    ];
    // events -> default: drop the empty Events labels, keep the one with rows and the person's own.
    expect(labelsToDrop("events", "default", live).sort()).toEqual(["l1", "l3"]);
    // events -> project keeps nothing of Events but none of project's names overlap, so same.
    expect(labelsToDrop("events", "project", live).sort()).toEqual(["l1", "l3"]);
  });
});

describe("suggestionLine (6.9)", () => {
  it("has a phrase per suggestible layout", () => {
    expect(suggestionLine("todo")).toContain("a list to get through");
    expect(suggestionLine("timeline")).toContain("a diary");
  });
});

describe("layoutFor: Default pins the page as built", () => {
  it("gives the same widgets, notes and rest as the page computes today", () => {
    const rows = [
      row("t1", { type: "task", priority: 2 }),
      row("t2", { type: "task", priority: 1, doneAt: "2026-10-18T00:00:00Z" }),
      row("img", { type: "image" }),
      row("link", { type: "link" }),
      row("ev", { type: "event", occursAt: "2026-10-25T00:00:00Z" }),
    ];
    const notes = [note("n1")];
    const page = layoutFor({ ...base, layout: "default", rows, notes });
    expect(page.rail).toBe(true);
    const widgets = page.sections.filter((s) => s.kind === "widget").map((s) => (s as any).widget);
    expect(widgets).toEqual(widgetsFor(rows));
    const notesSection = page.sections.find((s) => s.kind === "notes") as any;
    expect(notesSection.notes).toEqual(notes);
    const restSection = page.sections.find((s) => s.kind === "rest") as any;
    // the link is undated and not a widget row -> rest; the event is dated -> rail, not rest.
    expect(restSection.rows.map((r: any) => r.id)).toEqual(["link"]);
    expect(restSection.heading).toBe("Everything else");
    expect(page.others).toEqual({ rows: [], notes: [] });
  });
});

describe("layoutFor: todo", () => {
  it("draws tasks big with add, removes done to the week fold, rail off", () => {
    const rows = [
      row("a", { type: "task", priority: 1 }),
      row("b", { type: "task", priority: 2, doneAt: "2026-10-18T00:00:00Z" }),
      row("old", { type: "task", doneAt: "2026-10-01T00:00:00Z" }),
      row("link", { type: "link" }),
    ];
    const notes = [note("n1")];
    const page = layoutFor({ ...base, layout: "todo", rows, notes });
    expect(page.rail).toBe(false);
    const list = page.sections.find((s) => s.kind === "list") as any;
    expect(list.form).toBe("big");
    expect(list.add).toBe(true);
    expect(list.rows.map((r: any) => r.id)).toEqual(["a"]);
    const week = page.sections.find((s) => s.kind === "done" && s.key === "week") as any;
    expect(week.rows.map((r: any) => r.id)).toEqual(["b"]);
    // non-task rows and the week-expired tick are reachable via others.
    expect(page.others.rows.map((r: any) => r.id).sort()).toEqual(["link", "old"]);
    expect(page.others.notes).toEqual(notes);
  });
});

describe("layoutFor: events", () => {
  it("sections by its labels, Passed on folded, files and notes to others", () => {
    const labels = [
      { id: "lb", name: "Booked" },
      { id: "ls", name: "Still deciding" },
      { id: "lp", name: "Passed on" },
    ];
    const rows = [
      row("b1", { type: "event", labels: ["lb"] }),
      row("s1", { type: "event", labels: ["ls"] }),
      row("plain", { type: "event" }),
      row("img", { type: "image" }),
    ];
    const page = layoutFor({ ...base, layout: "events", rows, labels });
    expect(page.rail).toBe(true);
    const lists = page.sections.filter((s) => s.kind === "list") as any[];
    const booked = lists.find((s) => s.labelId === "lb");
    expect(booked.form).toBe("card");
    expect(lists.find((s) => s.labelId === "ls").form).toBe("draft");
    const passed = lists.find((s) => s.labelId === "lp");
    expect(passed.foldedAtFirst).toBe(true);
    // No label section last, holds the plain event.
    const noLabel = lists[lists.length - 1];
    expect(noLabel.labelId).toBeNull();
    expect(noLabel.rows.map((r: any) => r.id)).toEqual(["plain"]);
    expect(page.others.rows.map((r: any) => r.id)).toEqual(["img"]);
  });
});

describe("layoutFor: gallery and timeline", () => {
  it("gallery draws link and task tiles with a done fold, rail off", () => {
    const rows = [
      row("l1", { type: "link" }),
      row("t1", { type: "task" }),
      row("done", { type: "link", doneAt: "2026-10-18T00:00:00Z" }),
      row("img", { type: "image" }),
    ];
    const page = layoutFor({ ...base, layout: "gallery", rows });
    expect(page.rail).toBe(false);
    const grid = page.sections.find((s) => s.kind === "list") as any;
    expect(grid.form).toBe("tile");
    expect(grid.rows.map((r: any) => r.id).sort()).toEqual(["l1", "t1"]);
    expect((page.sections.find((s) => s.kind === "done") as any).rows.map((r: any) => r.id)).toEqual(["done"]);
    expect(page.others.rows.map((r: any) => r.id)).toEqual(["img"]);
  });
  it("timeline draws a day per row and note, newest first, nothing to others", () => {
    const rows = [
      row("r1", { type: "link", occursAt: "2026-10-18T09:00:00Z" }),
      row("r2", { type: "task", createdAt: "2026-10-19T09:00:00Z" }),
    ];
    const notes = [note("n1", { createdAt: "2026-10-17T09:00:00Z" })];
    const page = layoutFor({ ...base, layout: "timeline", rows, notes });
    expect(page.rail).toBe(false);
    const days = page.sections.filter((s) => s.kind === "day") as any[];
    expect(days.map((d) => d.day)).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
    expect(page.others).toEqual({ rows: [], notes: [] });
  });
});
