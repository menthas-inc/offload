// 049. What both clients draw on the Search page, decided once.

import { describe, expect, it, vi } from "vitest";
import {
  MEANING_IDLE_MS,
  NO_ANSWER,
  ROW_GLYPHS,
  SETTLE_MS,
  searchSession,
  type SearchAnswer,
  type SearchState,
  SEARCH_COPY,
  looseMatches,
  matchSpans,
  nameMatches,
  recentAfter,
  rowLabel,
  searchCount,
  searchLetters,
} from "../src/search.js";

const bold = (spans: { text: string; match: boolean }[]) => spans.filter((s) => s.match).map((s) => s.text);

describe("matchSpans", () => {
  it("marks the start of each word a term begins, for rows, notes and memories", () => {
    expect(bold(matchSpans("Flight to Lisbon", "lisb fl", "word"))).toEqual(["Fl", "Lisb"]);
    expect(bold(matchSpans("Lisbon trip", "bon", "word"))).toEqual([]);
    expect(matchSpans("Flight to Lisbon", "lisb", "word").map((s) => s.text).join("")).toBe("Flight to Lisbon");
  });

  it("marks any run of letters in a thread's name", () => {
    expect(bold(matchSpans("Lisbon trip", "bon", "any"))).toEqual(["bon"]);
    expect(bold(matchSpans("Lisbon trip", "bon t", "any"))).toEqual(["bon t"]);
  });

  it("ignores case and accents, and keeps the original letters", () => {
    expect(bold(matchSpans("Café Lisboa", "cafe", "word"))).toEqual(["Café"]);
    expect(bold(matchSpans("São Paulo", "sao pa", "word"))).toEqual(["São", "Pa"]);
    expect(bold(matchSpans("São Paulo", "SÃO", "any"))).toEqual(["São"]);
  });

  it("draws nothing bold for a query with no letters", () => {
    expect(bold(matchSpans("Lisbon", "&&", "word"))).toEqual([]);
    expect(bold(matchSpans("Lisbon", "", "any"))).toEqual([]);
  });
});

describe("nameMatches", () => {
  const threads = [
    { id: "1", name: "Paris" },
    { id: "2", name: "Lisbon trip" },
    { id: "3", name: "Trip to São Paulo" },
    { id: "4", name: "Spring" },
  ];

  it("finds names by any run, earliest match first, at most five", () => {
    expect(nameMatches(threads, "trip").map((t) => t.id)).toEqual(["3", "2"]);
    expect(nameMatches(threads, "sao").map((t) => t.id)).toEqual(["3"]);
    expect(nameMatches(threads, " ").map((t) => t.id)).toEqual([]);
    expect(nameMatches(Array.from({ length: 9 }, (_, i) => ({ id: String(i), name: `Trip ${i}` })), "trip")).toHaveLength(5);
  });
});

describe("looseMatches", () => {
  it("matches what Not in a thread is called", () => {
    expect(looseMatches("not in")).toBe(true);
    expect(looseMatches("A THR")).toBe(true);
    expect(looseMatches("lisbon")).toBe(false);
    expect(looseMatches("  ")).toBe(false);
  });
});

describe("recentAfter", () => {
  it("puts a search on top, once, and keeps five", () => {
    expect(recentAfter([], "  wifi  password ")).toEqual(["wifi password"]);
    expect(recentAfter(["lisbon", "wifi"], "Wifi")).toEqual(["Wifi", "lisbon"]);
    expect(recentAfter(["a", "b", "c", "d", "e"], "f")).toEqual(["f", "a", "b", "c", "d"]);
    expect(recentAfter(["a"], "   ")).toEqual(["a"]);
  });
});

describe("searchLetters", () => {
  it("counts letters and digits, not spaces or symbols", () => {
    expect(searchLetters("b o i l")).toBe(4);
    expect(searchLetters("tp-1")).toBe(3);
  });
});

describe("words a person reads", () => {
  it("labels a row as one sentence", () => {
    expect(rowLabel({ title: "Flight to Lisbon, TP1351", kind: "event", date: "Fri 7 Nov", threadName: "Lisbon trip", archived: false })).toBe(
      "Flight to Lisbon, TP1351, event, Fri 7 Nov, in Lisbon trip",
    );
    expect(rowLabel({ title: "Old ticket", kind: "link", date: null, threadName: "Not in a thread", archived: true })).toBe(
      "Old ticket, link, in Not in a thread, archived",
    );
  });

  it("counts results and says the rest in the house style", () => {
    expect(searchCount(0)).toBe("No results");
    expect(searchCount(1)).toBe("1 result");
    expect(searchCount(4)).toBe("4 results");
    expect(SEARCH_COPY.ask("lisb")).toBe('Ask offload about "lisb"');
    expect(SEARCH_COPY.nothing("lisb")).toBe('Nothing matches "lisb".');
    expect(SEARCH_COPY.placeholder).toBe("Search everything");
    expect(SEARCH_COPY.headings.rows).toBe("In your threads");
    const all = JSON.stringify(SEARCH_COPY) + SEARCH_COPY.ask("x") + SEARCH_COPY.nothing("x") + SEARCH_COPY.remove("x");
    expect(all).not.toMatch(/[–—]/);
    expect(all.toLowerCase()).not.toMatch(/\b(thing|things|item|items)\b/);
  });

  it("has a glyph for every kind of row", () => {
    for (const type of ["task", "event", "link", "image", "screenshot", "voice", "file", "location"]) expect(ROW_GLYPHS[type]).toBeTruthy();
  });
});

describe("searchSession", () => {
  const answer = (name: string): SearchAnswer => ({ ...NO_ANSWER, threads: [{ id: name, name }] });

  it("reads once keystrokes settle, by meaning after a pause from four letters, and keeps the newest", async () => {
    vi.useFakeTimers();
    const asked: [string, boolean][] = [];
    const replies = new Map<string, (a: SearchAnswer | null) => void>();
    const states: SearchState[] = [];
    const session = searchSession(
      (q, meaning) => {
        asked.push([q, meaning]);
        return new Promise((resolve) => replies.set(`${q}/${meaning}`, resolve));
      },
      (state) => states.push(state),
    );
    session.type("l");
    session.type("li");
    session.type("lis");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(asked).toEqual([["lis", false]]);
    session.type("lisb");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    await vi.advanceTimersByTimeAsync(MEANING_IDLE_MS);
    expect(asked).toEqual([["lis", false], ["lisb", false], ["lisb", true]]);
    replies.get("lisb/true")!(answer("meaning"));
    await vi.advanceTimersByTimeAsync(0);
    replies.get("lis/false")!(answer("old"));
    replies.get("lisb/false")!(answer("words"));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)!.answer?.threads[0]!.name).toBe("meaning");
    vi.useRealTimers();
  });

  it("asks nothing under two letters, and a failure is said, a failed meaning read is not", async () => {
    vi.useFakeTimers();
    const asked: string[] = [];
    let fail = false;
    const states: SearchState[] = [];
    const session = searchSession(async (q, meaning) => {
      asked.push(`${q}/${meaning}`);
      return fail ? null : answer(q);
    }, (state) => states.push(state));
    session.type("l");
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toEqual([]);
    session.type("lisbon");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    fail = true;
    await vi.advanceTimersByTimeAsync(MEANING_IDLE_MS);
    expect(states.at(-1)).toMatchObject({ failed: false, answer: { threads: [{ name: "lisbon" }] } });
    session.type("paris");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(states.at(-1)).toMatchObject({ failed: true, answer: null });
    fail = false;
    session.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ failed: false, answer: { threads: [{ name: "paris" }] } });
    session.type("");
    expect(states.at(-1)).toMatchObject({ q: "", failed: false, answer: null });
    session.dispose();
    vi.useRealTimers();
  });
});
