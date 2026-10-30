// 049. The Search page, decided once for the phones and the web: its numbers,
// its words, the letters drawn semibold, the thread names matched on the
// device before the server answers, and the recent list.

/** What each group shows at most; the server keeps the same numbers. */
export const SEARCH_LIMITS = { threads: 5, rows: 6, notes: 3, memories: 3 } as const;
/** Letters before the query is also read by meaning, once typing pauses. */
export const MEANING_FROM = 4;
/** Keystrokes closer together than this are one read. */
export const SETTLE_MS = 120;
/** The pause before a meaning read. */
export const MEANING_IDLE_MS = 350;
/** The pause before the count is announced. */
export const ANNOUNCE_MS = 700;
export const RECENT_MAX = 5;
export const QUERY_CHARS = 128;

/** Open a thread page at one row or one note, with archived rows shown. */
export const ROW_PARAM = "row";
export const NOTE_PARAM = "note";
export const ARCHIVED_PARAM = "archived";

export interface SearchRow {
  id: string;
  threadId: string;
  loose: boolean;
  type: string;
  title: string;
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
  archived: boolean;
}

export interface SearchAnswer {
  threads: { id: string; name: string }[];
  loose: boolean;
  rows: SearchRow[];
  notes: { id: string; threadId: string; loose: boolean; text: string }[];
  memories: { id: string; kind: string; text: string }[];
}

export const NO_ANSWER: SearchAnswer = { threads: [], loose: false, rows: [], notes: [], memories: [] };

export const SEARCH_COPY = {
  title: "Search",
  placeholder: "Search everything",
  headings: { recent: "Recent", threads: "Threads", rows: "In your threads", notes: "Notes", memories: "Memories" },
  loose: "Not in a thread",
  archived: "Archived",
  memory: "Memory",
  failed: "Couldn't search.",
  retry: "Retry",
  keys: { move: "move", open: "open", ask: "ask offload", close: "close" },
  ask: (q: string) => `Ask offload about "${q}"`,
  nothing: (q: string) => `Nothing matches "${q}".`,
  remove: (q: string) => `Remove ${q}`,
};

export function searchCount(n: number): string {
  return n === 0 ? "No results" : n === 1 ? "1 result" : `${n} results`;
}

/** The glyph a row is drawn with, by its type, as answers draw them. */
export const ROW_GLYPHS: Record<string, string> = {
  task: "square-check-big",
  event: "calendar",
  link: "link",
  image: "image",
  screenshot: "image",
  voice: "mic",
  file: "paperclip",
  location: "map-pin",
};
export const NOTE_GLYPH = "text-quote";

/** A row's kind in the words a person reads, where its date would go. */
export const KIND_WORDS: Record<string, string> = {
  task: "to-do",
  event: "event",
  link: "link",
  image: "photo",
  screenshot: "screenshot",
  voice: "voice note",
  file: "file",
  location: "place",
};

/** One letter at a time, so the folded text maps back to the original. */
function foldChar(c: string): string {
  return c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function fold(text: string): string {
  return [...text].map(foldChar).join("");
}

export function searchLetters(q: string): number {
  return (q.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

function words(q: string): string[] {
  return fold(q).match(/[\p{L}\p{N}]+/gu) ?? [];
}

const WORD = /[\p{L}\p{N}]/u;

/** The text in runs, the matched ones to draw semibold. `word` marks where a
 *  term begins a word, as rows, notes and memories match; `any` marks the
 *  whole query anywhere, as thread names match. Accents and case are ignored
 *  and the original letters kept. */
export function matchSpans(text: string, query: string, mode: "word" | "any"): { text: string; match: boolean }[] {
  const chars = [...text];
  const folded: string[] = [];
  const owner: number[] = [];
  chars.forEach((c, i) => {
    for (const f of foldChar(c)) {
      folded.push(f);
      owner.push(i);
    }
  });
  const haystack = folded.join("");
  const marked = new Array<boolean>(chars.length).fill(false);
  const mark = (from: number, length: number) => {
    for (let k = from; k < from + length; k++) marked[owner[k]!] = true;
  };
  const needles = mode === "word" ? words(query) : [fold(query.trim().replace(/\s+/g, " "))].filter((n) => searchLetters(n) > 0);
  for (const needle of needles) {
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      if (mode === "any" || at === 0 || !WORD.test(haystack[at - 1]!)) {
        mark(at, needle.length);
        if (mode === "any") break;
      }
      at = haystack.indexOf(needle, at + 1);
    }
  }
  const spans: { text: string; match: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = spans.at(-1);
    if (last && last.match === marked[i]) last.text += c;
    else spans.push({ text: c, match: marked[i]! });
  });
  return spans;
}

/** Thread names held on the device that match, before the server answers. */
export function nameMatches<T extends { name: string }>(threads: readonly T[], q: string): T[] {
  const needle = fold(q.trim().replace(/\s+/g, " "));
  if (!needle) return [];
  return threads
    .map((t) => ({ t, at: fold(t.name).indexOf(needle) }))
    .filter((m) => m.at !== -1)
    .sort((a, b) => a.at - b.at || a.t.name.localeCompare(b.t.name))
    .slice(0, SEARCH_LIMITS.threads)
    .map((m) => m.t);
}

/** Whether Not in a thread matches by what it is called. */
export function looseMatches(q: string): boolean {
  const needle = fold(q.trim().replace(/\s+/g, " "));
  return needle.length > 0 && fold(SEARCH_COPY.loose).includes(needle);
}

/** The recent list after a search is kept: on top, once, five at most. */
export function recentAfter(list: readonly string[], q: string): string[] {
  const kept = q.trim().replace(/\s+/g, " ");
  if (!kept) return [...list];
  return [kept, ...list.filter((r) => fold(r) !== fold(kept))].slice(0, RECENT_MAX);
}

/** A row read as one sentence. */
export function rowLabel(row: { title: string; kind: string | null; date: string | null; threadName: string; archived: boolean }): string {
  return [row.title, row.kind, row.date, `in ${row.threadName}`, row.archived ? "archived" : null].filter(Boolean).join(", ");
}

export interface SearchState {
  q: string;
  /** The newest answer, or null before one and after a failure. */
  answer: SearchAnswer | null;
  /** The newest read failed: the screen keeps its own name matches and says
   *  so in one clause beside Retry. */
  failed: boolean;
}

/** How the field turns keystrokes into reads, on both clients. Keystrokes
 *  close together are one read; from four letters a pause adds a read by
 *  meaning; an answer to an earlier read never replaces a later one; a
 *  failed read by meaning leaves the words answer standing. Under two
 *  letters nothing is asked: the screen's own name matches are enough. */
// The package has no DOM or Node types, so timers are reached as `live.ts` does.
const timers = globalThis as unknown as {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

export function searchSession(
  ask: (q: string, meaning: boolean) => Promise<SearchAnswer | null>,
  onChange: (state: SearchState) => void,
): { type: (q: string) => void; retry: () => void; dispose: () => void } {
  let state: SearchState = { q: "", answer: null, failed: false };
  let sent = 0;
  let shown = 0;
  let pending: unknown[] = [];
  const set = (next: Partial<SearchState>) => {
    state = { ...state, ...next };
    onChange(state);
  };
  const clear = () => {
    pending.forEach((timer) => timers.clearTimeout(timer));
    pending = [];
  };
  async function send(q: string, meaning: boolean): Promise<void> {
    const mine = ++sent;
    let answer: SearchAnswer | null = null;
    try {
      answer = await ask(q, meaning);
    } catch {
      answer = null;
    }
    if (mine < shown) return;
    if (!answer && meaning) return;
    shown = mine;
    set(answer ? { answer, failed: false } : { answer: null, failed: true });
  }
  function type(q: string): void {
    clear();
    const letters = searchLetters(q);
    if (letters < 2) {
      shown = ++sent;
      set({ q, answer: null, failed: false });
      return;
    }
    set({ q });
    pending.push(timers.setTimeout(() => void send(q, false), SETTLE_MS));
    if (letters >= MEANING_FROM) pending.push(timers.setTimeout(() => void send(q, true), MEANING_IDLE_MS));
  }
  return {
    type,
    retry: () => {
      clear();
      if (searchLetters(state.q) >= 2) void send(state.q, false);
    },
    dispose: () => {
      clear();
      sent = Number.MAX_SAFE_INTEGER;
      shown = Number.MAX_SAFE_INTEGER;
    },
  };
}
