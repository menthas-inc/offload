// 025. Labels: the calls the shell makes, and their shapes.
//
// Mirrors apps/core-api/src/routes/labels.ts. A refusal comes back as its code,
// so a screen can put itself back with the one clause that code names; no
// connection is `null`, which the screen treats as "Couldn't save that".

import { timeZoneHeader } from "./time-zone";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const send = { credentials: "include" as const };
const json = { credentials: "include" as const, headers: { "content-type": "application/json" } };

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

type Result<T> = { ok: true; value: T } | { ok: false; error: LabelRefusal | null };

async function call<T>(path: string, init: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...timeZoneHeader() } });
    if (response.ok) return { ok: true, value: (await response.json()) as T };
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const known: LabelRefusal[] = ["bad_label_name", "label_taken", "label_limit", "label_gone", "not_found"];
    return { ok: false, error: known.includes(body?.error as LabelRefusal) ? (body!.error as LabelRefusal) : null };
  } catch {
    return { ok: false, error: null };
  }
}

export const createLabel = (threadId: string, input: { name: string; colour?: number; rows?: Rows }) =>
  call<{ label: Label }>(`/v1/threads/${threadId}/labels`, { ...json, method: "POST", body: JSON.stringify(input) });

export const updateLabel = (id: string, input: { name?: string; colour?: number }) =>
  call<{ label: Label; previous: { name: string; colour: number }; swappedWith: string | null }>(`/v1/labels/${id}`, {
    ...json,
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deleteLabel = (id: string) => call<{ deleted: true }>(`/v1/labels/${id}`, { ...send, method: "DELETE" });

export const restoreLabel = (id: string) => call<{ label: Label }>(`/v1/labels/${id}/restore`, { ...send, method: "POST" });

export interface RowsChanged {
  added: Required<Rows>;
  removed: Required<Rows>;
}

/** The label's list: what was ticked and unticked, and optionally the name
 *  and colour, in one write. Undo sends the change back reversed. */
export const labelRows = (id: string, input: { add: Rows; remove: Rows; name?: string; colour?: number }) =>
  call<{ label: Label; changed: RowsChanged; previous: { name: string; colour: number } | null }>(`/v1/labels/${id}/rows`, {
    ...json,
    method: "POST",
    body: JSON.stringify(input),
  });

/** The words a refusal says, beside the control that was pressed. */
export function refusalLine(error: LabelRefusal | null, name?: string): string {
  if (error === "label_taken") return `${name ?? "That"} is already a label here.`;
  if (error === "label_limit") return "A thread holds ten labels.";
  if (error === "label_gone") return "That label was deleted.";
  if (error === "bad_label_name") return "A label is 24 characters at most.";
  return "Couldn't save that.";
}
