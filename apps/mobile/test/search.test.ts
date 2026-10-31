// 049 Search on the phones. The screens are read from their source, since
// these tests render nothing; the read and the recent list are run.
//
// AC-1  the tabs: Today, Threads, Search, Memories.  AC-2 no My threads.
// AC-3  tapping Search focuses the field; again keeps the query.
// AC-8  to AC-12  a thread opens at a row or note.  AC-13 Ask fills the draft.
// AC-15, AC-16, AC-26  recent searches on this phone, per account.
// AC-19 the keyboard never hides Ask.  AC-29 the count is announced.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let reply: { status: number; data: unknown } = { status: 200, data: null };
vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve(reply);
  },
}));
const kept = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  deleteItemAsync: async (key: string) => void kept.delete(key),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
}));

const search = await import("../lib/search");

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const code = (path: string) => read(path).replace(/\/\/.*$/gm, "");

beforeEach(() => {
  calls.length = 0;
  kept.clear();
});

describe("the read", () => {
  it("posts the query in the body, never the address", async () => {
    reply = { status: 200, data: { threads: [], loose: false, rows: [], notes: [], memories: [] } };
    await search.searchFor("lisb", true);
    expect(calls[0]!.path).toBe("/v1/search");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ q: "lisb", meaning: true });
  });

  it("is null when it did not answer", async () => {
    reply = { status: 500, data: null };
    expect(await search.searchFor("lisb", false)).toBeNull();
  });
});

describe("recent searches", () => {
  it("are kept on this phone under an account key, newest first, five at most, removable", () => {
    expect(read("../lib/device-data.ts")).toMatch(new RegExp(`ACCOUNT_KEYS = \\[[^\\]]*"${search.RECENT_KEY}"`));
    for (const q of ["a", "b", "c", "d", "e", "f"]) search.keepRecent(q);
    expect(search.readRecent()).toEqual(["f", "e", "d", "c", "b"]);
    search.keepRecent("c");
    expect(search.readRecent()[0]).toBe("c");
    expect(search.dropRecent("c")).toEqual(["f", "e", "d", "b"]);
  });
});

describe("the tabs", () => {
  const shell = code("../components/shell/Shell.tsx");
  it("are Today, Threads, Search, Memories, with the glyphs", () => {
    const order = ["key: \"today\"", "key: \"threads\"", "key: \"search\"", "key: \"memories\""].map((k) => shell.indexOf(k));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(shell).toMatch(/label: "Threads"/);
    expect(shell).toMatch(/label: "Search",\s*icon: "search"/);
    expect(shell).toMatch(/const TABS = \["\/today", "\/threads", "\/search", "\/memories"\]/);
    expect(shell).not.toMatch(/"My threads"/);
    const layout = read("../app/(tabs)/_layout.tsx");
    expect(layout.indexOf('name="threads"')).toBeLessThan(layout.indexOf('name="search"'));
    expect(layout.indexOf('name="search"')).toBeLessThan(layout.indexOf('name="memories"'));
    expect(read("../app/(tabs)/search.tsx")).toMatch(/export \{ default \} from "\.\.\/\.\.\/components\/screens\/Search";/);
  });

  it("focus the field again when Search is tapped on Search", () => {
    expect(shell).toMatch(/pathname === "\/search" \? focusSearch\(\) : go\("\/search"\)/);
    expect(code("../components/screens/Search.tsx")).toMatch(/onSearchFocus\(/);
  });

  it("say Threads where they said My threads", () => {
    expect(code("../components/screens/MyThreads.tsx")).not.toMatch(/My threads/);
  });
});

describe("the page", () => {
  const screen = code("../components/screens/Search.tsx");
  it("is Memories' field, focused, with the shared words and a search key", () => {
    expect(screen).toMatch(/<SearchField/);
    expect(screen).toMatch(/placeholder=\{SEARCH_COPY\.placeholder\}/);
    expect(screen).toMatch(/maxLength=\{QUERY_CHARS\}/);
    expect(screen).toMatch(/autoFocus|\.focus\(\)/);
  });

  it("reads through the shared session and draws the shared groups", () => {
    expect(screen).toMatch(/searchSession\(searchFor,/);
    for (const heading of ["threads", "rows", "notes", "memories", "recent"]) expect(screen).toContain(`SEARCH_COPY.headings.${heading}`);
    expect(screen).toMatch(/nameMatches\(/);
    expect(screen).toMatch(/matchSpans\(/);
    expect(screen).toMatch(/SEARCH_COPY\.failed/);
    expect(screen).toMatch(/SEARCH_COPY\.nothing\(/);
  });

  it("asks offload by filling the draft, unsent, and putting the keyboard away", () => {
    expect(screen).toMatch(/setDraft\(/);
    expect(screen).toMatch(/Keyboard\.dismiss\(\)/);
    expect(screen).not.toMatch(/\bsend\(/);
  });

  it("keeps Ask above the keyboard and puts the keyboard away on a scroll", () => {
    expect(screen).toMatch(/keyboardDismissMode="on-drag"/);
    expect(screen).toMatch(/useReanimatedKeyboardAnimation|useKeyboardHandler/);
  });

  it("opens a thread at a row, a note, Not in a thread and a memory", () => {
    expect(screen).toMatch(/\[ROW_PARAM\]/);
    expect(screen).toMatch(/\[NOTE_PARAM\]/);
    expect(screen).toMatch(/\[ARCHIVED_PARAM\]/);
    expect(screen).toMatch(/\/threads\/loose/);
    expect(screen).toMatch(/\[MEMORY_PARAM\]/);
  });

  it("announces the count once typing pauses", () => {
    expect(screen).toMatch(/announceForAccessibility\(searchCount\(/);
    expect(screen).toMatch(/accessibilityLiveRegion="polite"/);
  });
});

describe("a thread opened at a row", () => {
  const thread = code("../components/screens/Thread.tsx");
  const loose = code("../components/screens/Loose.tsx");
  it("reads through it, opens on All and with archived when asked, and scrolls to it", () => {
    expect(thread).toMatch(/\[ROW_PARAM\]/);
    expect(thread).toMatch(/through/);
    expect(thread).toMatch(/ARCHIVED_PARAM\] === "1"/);
    expect(thread).toMatch(/<Reveal\.Provider/);
    expect(thread).toMatch(/measureLayout\(/);
    expect(read("../lib/threads.ts")).toMatch(/query\.set\("through", options\.through\)/);
  });
  it("Not in a thread does too", () => {
    expect(loose).toMatch(/\[ROW_PARAM\]/);
    expect(loose).toMatch(/through/);
    expect(read("../lib/loose.ts")).toMatch(/query\.set\("through", options\.through\)/);
  });
});
