// 2026-10-29. My threads as a grid: a move by one place or a drop, and the words, so the phones and the web agree.

import { describe, expect, it } from "vitest";
import { moveThread, ORDER_COPY, orderThreads, tileLabel } from "../src/threads-grid.js";

describe("a move", () => {
  const ids = ["a", "b", "c", "d"];
  it("puts the thread at its new place and shifts the others", () => {
    expect(moveThread(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveThread(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
  });
  it("clamps to the ends and leaves an unknown id alone", () => {
    expect(moveThread(ids, "b", -3)).toEqual(["b", "a", "c", "d"]);
    expect(moveThread(ids, "b", 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveThread(ids, "z", 0)).toEqual(ids);
  });
});

describe("the order (AC-2, AC-4)", () => {
  const rows = [
    { id: "b", createdAt: "2026-10-02T00:00:00.000Z" },
    { id: "c", createdAt: "2026-10-03T00:00:00.000Z" },
    { id: "a", createdAt: "2026-10-01T00:00:00.000Z" },
    { id: "d", createdAt: "2026-10-03T00:00:00.000Z" },
  ];
  const ids = (list: { id: string }[]) => list.map((row) => row.id);
  it("is newest made first, a tie by id", () => {
    expect(ids(orderThreads(rows, "newest", ["a", "b"]))).toEqual(["d", "c", "b", "a"]);
  });
  it("is the person's own, with what is not in it first and newest first, skipping ids that are gone", () => {
    expect(ids(orderThreads(rows, "mine", ["gone", "a", "b"]))).toEqual(["d", "c", "a", "b"]);
  });
});

describe("the words", () => {
  it("name the tile with its line, its people and nothing else", () => {
    expect(tileLabel({ name: "Lisbon trip", meta: "3 to dos, with Ana and Tom" })).toBe("Lisbon trip, 3 to dos, with Ana and Tom");
    expect(tileLabel({ name: "Dentist", meta: "" })).toBe("Dentist");
  });
  it("say where a moved thread went", () => {
    expect(ORDER_COPY.moved(3, 10)).toBe("Moved to 3 of 10");
    expect(Object.values(ORDER_COPY).filter((v) => typeof v === "string").join(" ")).not.toMatch(/[\u2013\u2014]/);
  });
});
