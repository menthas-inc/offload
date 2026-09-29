// 025. Labels on the phones: the calls, their shapes, and the kept pick.
//
// Mirrors apps/core-api/src/routes/labels.ts. A refusal comes back as its code
// so a sheet can say the one clause it names; no connection is `null`, which a
// screen says as "Couldn't save that".

import * as SecureStore from "expo-secure-store";
import { ALL_LABELS, isAll, type LabelPick } from "@offload/widgets";
import { send } from "./api";

export interface Label {
  id: string;
  name: string;
  /** 1 to 10, reading `--label-N`. */
  colour: number;
  count: number;
}

export type LabelRefusal = "bad_label_name" | "label_taken" | "label_limit" | "label_gone" | "not_found";

export interface Rows {
  content?: string[];
  notes?: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: LabelRefusal | null };

const KNOWN: LabelRefusal[] = ["bad_label_name", "label_taken", "label_limit", "label_gone", "not_found"];

async function call<T>(path: string, init: RequestInit): Promise<Result<T>> {
  const sent = await send<T>(path, init);
  if (sent.status >= 200 && sent.status < 300 && sent.data !== null) return { ok: true, value: sent.data };
  const error = KNOWN.includes(sent.error as LabelRefusal) ? (sent.error as LabelRefusal) : null;
  return { ok: false, error };
}

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

export const createLabel = (threadId: string, input: { name: string; colour?: number; rows?: Rows }) =>
  call<{ label: Label }>(`/v1/threads/${threadId}/labels`, { method: "POST", ...body(input) });

export const updateLabel = (id: string, input: { name?: string; colour?: number }) =>
  call<{ label: Label; previous: { name: string; colour: number }; swappedWith: string | null }>(`/v1/labels/${id}`, {
    method: "PATCH",
    ...body(input),
  });

export const deleteLabel = (id: string) => call<{ deleted: true }>(`/v1/labels/${id}`, { method: "DELETE" });

export const restoreLabel = (id: string) => call<{ label: Label }>(`/v1/labels/${id}/restore`, { method: "POST" });

export interface RowsChanged {
  added: Required<Rows>;
  removed: Required<Rows>;
}

/** The label's list: what was ticked and unticked, and optionally the name and
 *  colour, in one write. Undo sends the change back reversed. */
export const labelRows = (id: string, input: { add: Rows; remove: Rows; name?: string; colour?: number }) =>
  call<{ label: Label; changed: RowsChanged; previous: { name: string; colour: number } | null }>(`/v1/labels/${id}/rows`, {
    method: "POST",
    ...body(input),
  });

/** The words a refusal says, beside the control that was pressed. */
export function refusalLine(error: LabelRefusal | null, name?: string): string {
  if (error === "label_taken") return `${name ?? "That"} is already a label here.`;
  if (error === "label_limit") return "A thread holds ten labels.";
  if (error === "label_gone") return "That label was deleted.";
  return "Couldn't save that.";
}

// ---------------------------------------------------------------- the pick

/** The filter bar's pick, per thread, on this phone and nowhere else. All is
 *  not stored, and anything unreadable reads as All. */
const pickKey = (threadId: string) => `offload_labels_${threadId}`;

export function readPick(threadId: string): LabelPick {
  try {
    const raw = SecureStore.getItem(pickKey(threadId));
    if (!raw) return ALL_LABELS;
    const parsed = JSON.parse(raw) as Partial<LabelPick>;
    return {
      labels: Array.isArray(parsed.labels) ? parsed.labels.filter((id): id is string => typeof id === "string") : [],
      none: parsed.none === true,
    };
  } catch {
    return ALL_LABELS;
  }
}

export function writePick(threadId: string, pick: LabelPick): void {
  try {
    if (isAll(pick)) void SecureStore.deleteItemAsync(pickKey(threadId));
    else SecureStore.setItem(pickKey(threadId), JSON.stringify(pick));
  } catch {
    // A pick that is not kept is still the pick on screen.
  }
}

/** A row's write that makes labels first, then carries them in the edit.
 *
 *  2026-09-29. Whatever this attempt made is taken back when a later step
 *  fails, so a Retry starts clean instead of meeting its own first label as
 *  taken, and nothing is left behind attached to no row. Undo deletes the
 *  made labels only once the row itself is put back. The steps are passed in
 *  so the rule is tested without a network. */
export function withMadeLabels<P extends { labels?: string[] }, S>(
  steps: {
    make: (name: string) => Promise<string | null>;
    edit: (patch: P) => Promise<S | null>;
    /** The patch that puts the row back, from what the edit replaced. */
    undo: (previous: S) => P;
    drop: (id: string) => Promise<unknown>;
  },
  patch: P,
  names: string[],
): { write: () => Promise<boolean>; unwrite: () => Promise<boolean> } {
  let made: string[] = [];
  let previous: S | null = null;
  const takeBack = async (): Promise<false> => {
    for (const id of made) await steps.drop(id);
    made = [];
    return false;
  };
  return {
    write: async () => {
      made = [];
      for (const name of names) {
        const id = await steps.make(name);
        if (id === null) return takeBack();
        made.push(id);
      }
      const result = await steps.edit(made.length > 0 ? { ...patch, labels: [...(patch.labels ?? []), ...made] } : patch);
      if (result === null) return takeBack();
      previous = result;
      return true;
    },
    unwrite: async () => {
      if (previous === null) return false;
      const result = await steps.edit(steps.undo(previous));
      if (result === null) return false;
      for (const id of made) await steps.drop(id);
      made = [];
      return true;
    },
  };
}
