// 052. A turn's reply on the phones, apart from its drawing: which slices and
// pills a turn draws, where its undo line is in its life, what an entry under
// a calendar says when it opens, and the session's reads behind a calendar.
// Every word is `@offload/widgets`' or comes from the row as stored.

import {
  UNDO_MS,
  dayTitle,
  directionsUrl,
  eventRange,
  memoryKind,
  timeIn,
  type MonthCount,
  type Pill,
} from "@offload/widgets";
import { token } from "@offload/tokens";
import type { FoundResult, MessageState, Reply, ReplyThread, Slice } from "./dump";
import { fetchDay, fetchMonth, type Day, type TodayEvent, type TodayRow } from "./today";
import { onSignedOut } from "./session-end";

const MAX_SLICES = 3;
const MAX_PILLS = 2;
/** The readme's `--duration-mark`, from the tokens. */
export const MARK_MS = parseFloat(token("duration-mark"));

/** What these rules read of a turn. */
interface ReplyTurn {
  id: string;
  from: "you" | "offload";
  state?: MessageState | undefined;
  parts?: Reply | null | undefined;
  question?: unknown;
  /** When the result arrived on this phone, live. Never set from a load. */
  arrivedAt?: number | undefined;
}

/** The slices a turn draws: three at most, and only on a turn that answered
 *  or half did. A cancelled or failed turn draws none (AC-25). */
export function slicesOf(turn: ReplyTurn): Slice[] {
  if (!turn.parts || (turn.state !== "answered" && turn.state !== "partial")) return [];
  return turn.parts.slices.slice(0, MAX_SLICES);
}

/** The pills: none on a turn that asks, since a pill beside a question's
 *  answers reads as one of them, and none on a turn that did not finish. */
export function pillsOf(turn: ReplyTurn): Pill[] {
  if (!turn.parts || turn.state !== "answered" || turn.question) return [];
  return turn.parts.pills.slice(0, MAX_PILLS);
}

/** The slice header's count: the thread's open rows, none at zero. */
export function headCount(count: number): number | null {
  return count > 0 ? count : null;
}

export function memoriesHead(kind: string): string {
  const name = memoryKind(kind)?.name;
  return name ? `Memories, ${name}` : "Memories";
}

/** A list or new thread slice as the answer card's result. */
export function asResult(slice: Extract<Slice, { kind: "list" | "newThread" }>): FoundResult {
  return {
    threadId: slice.thread.id,
    threadName: slice.thread.name,
    threadIcon: slice.thread.icon,
    threadHue: slice.thread.hue,
    truncated: slice.kind === "list" ? slice.truncated : false,
    rows: slice.rows,
  };
}

/** The thread a pill's row sits in, from the slices that drew it. */
export function threadOfRow(parts: Reply, rowId: string): { id: string; name: string | null } | null {
  for (const slice of parts.slices) {
    if (slice.kind !== "list" && slice.kind !== "newThread") continue;
    const row = slice.rows.find((one) => one.contentId === rowId);
    if (row) return { id: row.threadId, name: row.threadName };
  }
  return null;
}

/** A row ticked where a slice draws it. */
export function withRowDone(parts: Reply, contentId: string, done: boolean): Reply {
  return {
    ...parts,
    slices: parts.slices.map((slice) =>
      slice.kind === "list" || slice.kind === "newThread"
        ? { ...slice, rows: slice.rows.map((row) => (row.contentId === contentId ? { ...row, done } : row)) }
        : slice,
    ),
  };
}

/** How long the change mark has left: only for a result that arrived live on
 *  this phone, so a reopened conversation shows its rows plainly. */
export function markLeft(turn: ReplyTurn, now: number): number {
  return turn.arrivedAt === undefined ? 0 : Math.max(0, MARK_MS - (now - turn.arrivedAt));
}

/** When the line's clock started: the arrival on this phone when there was
 *  one, which no clock skew can move, and the server's otherwise. */
export function clockStart(turn: ReplyTurn): number | null {
  if (turn.arrivedAt !== undefined) return turn.arrivedAt;
  return turn.parts?.resultAt ? Date.parse(turn.parts.resultAt) : null;
}

/** Where a turn's undo line is. **early**: 043's clock, and Undo takes the
 *  whole turn. **late**: no clock, and Undo keeps the dump. **retired**: the
 *  next dump was sent, so the summary stands alone. Null when the turn wrote
 *  nothing, or did not finish and Finish is the way on. The server decides early or late for itself; this decides only
 *  what is drawn. */
export function linePhase(turn: ReplyTurn, turns: readonly ReplyTurn[], now: number): "early" | "late" | "retired" | null {
  if (!turn.parts?.summary || turn.state !== "answered") return null;
  const latest = [...turns].reverse().find((one) => one.from === "you");
  if (latest?.id !== turn.id) return "retired";
  const start = clockStart(turn);
  return start !== null && now - start < UNDO_MS ? "early" : "late";
}

// ---------------------------------------------------------------- the calendar

export type Entry = { kind: "event"; id: string; item: TodayEvent } | { kind: "row"; id: string; item: TodayRow };

/** A day's entries as a reply lists them: its events, then its timed rows,
 *  then the rest. Today's late rows belong to Today. */
export function entriesOf(day: Day): Entry[] {
  return [
    ...day.events.map((item): Entry => ({ kind: "event", id: item.id, item })),
    ...[...day.timed, ...day.rest].map((item): Entry => ({ kind: "row", id: item.id, item })),
  ];
}

export interface EntryDetails {
  span: string;
  place: { words: string; url: string | null } | null;
  thread: ReplyThread | null;
  calendar: { name: string; colour: string | null } | null;
  /** Another member's event: its title and its time, nothing else (019). */
  theirs: boolean;
}

/** What an entry says once it is open. */
export function entryDetails(entry: Entry, date: string, zone: string | null): EntryDetails {
  const day = dayTitle(date);
  if (entry.kind === "event") {
    const event = entry.item;
    const span = `${day}, ${eventRange(event, zone)}`;
    // Another member's event, by whose it is (019), the web's rule too.
    if (!event.mine) return { span, place: null, thread: null, calendar: null, theirs: true };
    return {
      span,
      place: placeOf(event.location ?? null, event.place ?? null),
      thread: event.threadId ? { id: event.threadId, name: event.threadName, icon: event.threadIcon, hue: event.threadHue } : null,
      calendar: event.calendar ?? (event.calendarName ? { name: event.calendarName, colour: null } : null),
      theirs: false,
    };
  }
  const row = entry.item;
  return {
    span: row.dueAt && !row.allDay ? `${day}, ${timeIn(new Date(row.dueAt), zone, "en-GB")}` : day,
    place: placeOf(row.location, row.place),
    thread: { id: row.threadId, name: row.threadName, icon: row.threadIcon, hue: row.threadHue },
    calendar: row.calendar ?? null,
    theirs: false,
  };
}

function placeOf(words: string | null, at: { lat: number | null; lng: number | null } | null): EntryDetails["place"] {
  const url = at && at.lat !== null && at.lng !== null ? directionsUrl({ lat: at.lat, lng: at.lng, googlePlaceId: null }) : null;
  if (!words && !url) return null;
  return { words: words ?? "", url };
}

// Each month and day a reply reads, once until something changes, three at a time. A read
// that failed is forgotten, so the next sight of the slice asks again.
const reads = new Map<string, Promise<unknown>>();
// The next account on a shared phone never sees the last one's calendar.
onSignedOut(() => reads.clear());
const IN_FLIGHT = 3;
let out = 0;
const waiting: (() => void)[] = [];

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (out >= IN_FLIGHT) await new Promise<void>((go) => waiting.push(go));
  out += 1;
  try {
    return await run();
  } finally {
    out -= 1;
    waiting.shift()?.();
  }
}

function once<T>(key: string, run: () => Promise<T | null>): Promise<T | null> {
  const held = reads.get(key) as Promise<T | null> | undefined;
  if (held) return held;
  const read = slot(run).then(
    (value) => {
      if (value === null) reads.delete(key);
      return value;
    },
    () => {
      reads.delete(key);
      return null;
    },
  );
  reads.set(key, read);
  return read;
}

/** `fresh` is when the slice last heard something changed: a new value reads
 *  again. shortcut: the old keys stay until sign-out, a few dozen small
 *  promises a session; drop them per change if a long session holds many. */
export const dayOnce = (date: string, past: boolean, fresh = 0): Promise<Day | null> => once(`day:${date}:${past}:${fresh}`, () => fetchDay(date, past));
export const monthOnce = (from: string, to: string, fresh = 0): Promise<MonthCount[] | null> => once(`month:${from}:${to}:${fresh}`, () => fetchMonth(from, to, true));

/** The transcript stopped moving, so a slice not yet read can look again
 *  whether it is on screen. */
const moved = new Set<() => void>();
export function transcriptMoved(): void {
  moved.forEach((listener) => listener());
}
export function onTranscriptMoved(listener: () => void): () => void {
  moved.add(listener);
  return () => {
    moved.delete(listener);
  };
}

/** 052. What a reply opens a thread at: a row's sheet, or its date field
 *  ("when"), and the share sheet with one person picked. Search's `row` names
 *  the row. */
export const EDIT_PARAM = "edit";
export const SHARE_PARAM = "share";

