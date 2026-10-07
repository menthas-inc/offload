// 040. The Memories tab, from a phone: the wire, and what the screen decides.
//
// Every word the tab says, every kind, hue and cap is `@offload/widgets`'s,
// shared with the web; this file turns them into what a screen draws and
// sends what the editor wrote. The screens render nothing in a test, so each
// decision is a pure function here and the screen draws its answer.
//
// The routes take the account from the session. A refusal is a 200 with
// `ok: false`, which the editor says under its field; anything that never
// lands is the toast's failure form.

import {
  MEMORY_COPY,
  matchesMemory,
  memoryKind,
  memoryRefusal,
  memorySections,
  mixOklch,
  type MemoryKindId,
  type MemoryList,
  type MemoryRefusal,
  type MemorySection,
  type MemoryView,
} from "@offload/widgets";
import { send } from "./api";
import type { Reversible } from "./optimistic";

export type MemoryRead = MemoryList | "failed";

/** Every active memory, or that the read failed. */
export async function fetchMemories(): Promise<MemoryRead> {
  const { status, data } = await send<MemoryList>("/v1/memories");
  return status === 200 && data ? data : "failed";
}

/** A refresh that fails keeps the list already on the screen: the failed
 *  read's line is for a screen that has nothing to show. */
export function nextRead(shown: MemoryRead | null, fetched: MemoryRead): MemoryRead {
  return fetched === "failed" && shown && shown !== "failed" ? shown : fetched;
}

export type MemoriesScreen =
  | { state: "loading" }
  | { state: "failed"; line: string; retry: string }
  | { state: "empty"; line: string }
  | { state: "list"; capLine: string | null };

/** One spinner, the failed line beside Try again, the empty line, or the
 *  list with the cap line while the cap stops anything. */
export function memoriesScreen(read: MemoryRead | null): MemoriesScreen {
  if (read === null) return { state: "loading" };
  if (read === "failed") return { state: "failed", line: MEMORY_COPY.loadFailed, retry: "Try again" };
  if (read.memories.length === 0) return { state: "empty", line: MEMORY_COPY.empty };
  return { state: "list", capLine: read.full ? MEMORY_COPY.full : null };
}

/** The sections for a sort and a query, and the line when the query matches
 *  nothing. Client side, over the list already loaded. */
export function listView(
  memories: MemoryView[],
  sort: "kind" | "new",
  query: string,
  now: Date = new Date(),
): { sections: MemorySection[]; nothing: string | null } {
  const matching = memories.filter((memory) => matchesMemory(memory, query));
  const sections = memorySections(matching, sort, now);
  return { sections, nothing: sections.length === 0 && query.trim() ? MEMORY_COPY.nothingSays(query.trim()) : null };
}

/** The token values a kind's colours are mixed from: `labels[n]` is
 *  `--label-n`, as `useColors()` hands them over. */
export interface KindPalette {
  labels: readonly string[];
  /** `--text-primary`, ink in this theme. */
  ink: string;
  /** `--surface-raised`. */
  raised: string;
  /** `--surface-inverse`, the Rules fill. */
  inverse: string;
  /** `--text-inverse`, the type on it. */
  onSolid: string;
}

export interface KindColors {
  /** The dot, and the hue itself. */
  dot: string;
  /** A picked chip's ground: the hue at 22% into the raised surface. */
  soft: string;
  /** The type and the ring on it: the hue at 78% into ink. */
  ink: string;
  /** Rules: filled ink with inverse type, and no ring. */
  filled: boolean;
}

/** A kind's colours, mixed as the kit's `color-mix(in oklch, ...)` does, for a
 *  platform that has none. Rules are ink, the one kind offload obeys. */
export function kindColors(kind: MemoryKindId, palette: KindPalette): KindColors {
  const hue = memoryKind(kind)?.hue ?? null;
  const n = hue ? Number(hue.replace("label-", "")) : NaN;
  const value = Number.isInteger(n) ? palette.labels[n] : undefined;
  if (!value) return { dot: palette.ink, soft: palette.inverse, ink: palette.onSolid, filled: true };
  return { dot: value, soft: mixOklch(value, palette.raised, 0.22), ink: mixOklch(value, palette.ink, 0.78), filled: false };
}

/** One sentence: a newline, typed or pasted, is refused. */
export function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

/** What the field holds after a change, and whether it was the return key.
 *  A newline at the end is Enter, which on Android's multiline field arrives
 *  as text rather than a submit; one anywhere else was pasted, and folds into
 *  a space. */
export function typedLine(before: string, after: string): { text: string; submit: boolean } {
  const ended = /[\r\n]+$/.exec(after);
  if (ended && after.slice(0, ended.index) === before) return { text: before, submit: true };
  return { text: oneLine(after), submit: false };
}

/** An answered memory whose words have changed loses its calendar, and the
 *  editor says so before Save. */
export function severs(editing: MemoryView | null, draft: string): boolean {
  return editing?.origin === "answered" && draft.trim() !== editing.text;
}

/** What the editor sends for a change: only what changed, or null. */
function memoryChange(memory: MemoryView, text: string, kind: MemoryKindId): { text?: string; kind?: MemoryKindId } | null {
  const change = {
    // A change that makes a rule carries its words: the server refuses one without.
    ...(text !== memory.text || (kind === "rules" && kind !== memory.kind) ? { text } : {}),
    ...(kind !== memory.kind ? { kind } : {}),
  };
  return Object.keys(change).length > 0 ? change : null;
}

export type Submitted =
  | { outcome: "saved"; toast: string }
  | { outcome: "unchanged" }
  | { outcome: "refused"; line: string }
  /** Forgotten elsewhere: no Retry could save it. */
  | { outcome: "gone" }
  | { outcome: "failed" };

type Written = { ok: true; id: string } | { ok: false; error: MemoryRefusal };

/** Add a memory, or change one. A refusal keeps the editor open with its
 *  reason; a write that never lands is the failure toast's. */
export async function submitMemory(editing: MemoryView | null, draft: string, kind: MemoryKindId): Promise<Submitted> {
  const text = oneLine(draft).trim();
  if (!text) return { outcome: "refused", line: memoryRefusal("empty") };

  let sent: { status: number; data: Written | null };
  if (editing) {
    const change = memoryChange(editing, text, kind);
    if (!change) return { outcome: "unchanged" };
    sent = await send<Written>(`/v1/memories/${editing.id}`, { method: "PATCH", body: JSON.stringify(change) });
  } else {
    sent = await send<Written>("/v1/memories", { method: "POST", body: JSON.stringify({ text, kind }) });
  }

  if (editing && sent.status === 404) return { outcome: "gone" };
  if (sent.status !== 200 || !sent.data) return { outcome: "failed" };
  if (!sent.data.ok) return { outcome: "refused", line: memoryRefusal(sent.data.error) };
  return { outcome: "saved", toast: editing ? MEMORY_COPY.saved : MEMORY_COPY.remembered };
}

/** Done when forgotten, and when already gone: a 404 is a forget that
 *  happened elsewhere, which a Retry could never change. */
async function forgetMemory(id: string): Promise<boolean> {
  const { status } = await send(`/v1/memories/${id}`, { method: "DELETE" });
  return status === 200 || status === 404;
}

async function restoreMemory(id: string): Promise<boolean> {
  const { status } = await send(`/v1/memories/${id}/restore`, { method: "POST" });
  return status === 200;
}

/** Forget, drawn first: the row goes at the press, the toast holds Undo for
 *  its eight seconds, and a forget that fails puts the row back with Retry. */
export function forgetOp(memory: MemoryView, draw: { drop: (id: string) => void; put: (memory: MemoryView) => void }): Reversible {
  return {
    apply: () => draw.drop(memory.id),
    revert: () => draw.put(memory),
    write: () => forgetMemory(memory.id),
    unwrite: () => restoreMemory(memory.id),
    did: MEMORY_COPY.forgotten,
    failed: MEMORY_COPY.saveFailed,
    unfailed: MEMORY_COPY.unfailed,
  };
}
