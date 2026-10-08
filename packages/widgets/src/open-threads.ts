// Today, open in your threads (design 2026-10-07): the words both clients
// draw on a page, and the rule that keeps a ticked row in its place.
//
// A tick strikes the row through at once and the row leaves the page the next
// time Today is built, not while it is open. Every write reads Today again, so
// the new read is laid over the pages as drawn: a ticked row the read no
// longer has stays where it was, a page stays where it was, and only rows the
// read dropped for another reason (a date given in the row sheet) give up
// their place.

import type { ChipKey } from "./loose.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** How long a to-do has been open, from when it was put down. */
export function openFor(createdAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS);
  if (days < 1) return "Today";
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

/** Not in a thread's line from offload, when it has a thread in mind for any
 *  of the to-dos the page draws. */
export function inMindLine(inMind: number, drawn: number): string | null {
  if (inMind === 0) return null;
  const which = drawn === 1 ? "this one" : inMind === 1 ? "one of these" : inMind >= drawn ? "all of these" : "some of these";
  return `offload has a thread in mind for ${which}.`;
}

const KIND_WORDS: Record<Exclude<ChipKey, "todo">, [string, string]> = {
  link: ["link", "links"],
  photo: ["photo", "photos"],
  note: ["note", "notes"],
  event: ["event", "events"],
  place: ["place", "places"],
  voice: ["voice note", "voice notes"],
  file: ["file", "files"],
};

/** What else Not in a thread holds: *6 notes and links*. The most common
 *  kind first; past three kinds, *and more*. */
export function holdsLine(holds: Partial<Record<string, number>>): string | null {
  const kinds = Object.entries(holds)
    .filter((entry): entry is [keyof typeof KIND_WORDS, number] => entry[0] in KIND_WORDS && (entry[1] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1]);
  if (kinds.length === 0) return null;
  const total = kinds.reduce((sum, [, n]) => sum + n, 0);
  const words = kinds.map(([kind]) => KIND_WORDS[kind][total === 1 ? 0 : 1]);
  const named = words.length > 3 ? [...words.slice(0, 3), "more"] : words;
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${total} ${list}`;
}

export interface PageLike<Row extends { id: string }> {
  threadId: string;
  todos: Row[];
  count: number;
  /** Set on Not in a thread, which is always last. */
  loose?: unknown;
}

/** The new read laid over the pages as drawn, keeping every row in `struck`
 *  (ticked here) and every page in its place. A kept row the read no longer
 *  counts is added back to its page's count, so no number moves either. */
export function keepInPlace<Row extends { id: string }, Page extends PageLike<Row>>(
  drawn: Page[],
  read: Page[],
  struck: ReadonlySet<string>,
): Page[] {
  if (struck.size === 0) return read;
  const fresh = new Map(read.map((page) => [page.threadId, page]));
  const out: Page[] = [];
  for (const before of drawn) {
    const now = fresh.get(before.threadId);
    const nowRows = new Map((now?.todos ?? []).map((row) => [row.id, row]));
    const todos: Row[] = [];
    let kept = 0;
    for (const row of before.todos) {
      const latest = nowRows.get(row.id);
      if (latest) todos.push(latest);
      else if (struck.has(row.id)) {
        todos.push(row);
        kept += 1;
      }
    }
    if (!now && kept === 0) continue;
    const width = Math.max(before.todos.length, now?.todos.length ?? 0);
    for (const row of now?.todos ?? []) {
      if (todos.length >= width) break;
      if (!todos.some((one) => one.id === row.id)) todos.push(row);
    }
    out.push({ ...(now ?? before), todos, count: (now?.count ?? 0) + kept });
  }
  const placed = new Set(out.map((page) => page.threadId));
  for (const page of read) if (!placed.has(page.threadId)) out.push(page);
  return [...out.filter((page) => !page.loose), ...out.filter((page) => page.loose)];
}
