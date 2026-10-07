// 040. The Memories tab over the wire.
//
// The session's account only; nothing here names one. A refusal is a 200 the
// editor shows under the field, and a write that did not land is `failed`,
// which the pane answers with the toast's Retry.

import type { MemoryKindId, MemoryList, MemoryRefusal } from "@offload/widgets";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const send = { credentials: "include" as const };
const json = { credentials: "include" as const, headers: { "content-type": "application/json" } };

export type Read = { kind: "ok"; list: MemoryList } | { kind: "failed" };
export type Written =
  | { kind: "ok"; id: string }
  | { kind: "refused"; error: MemoryRefusal }
  /** Not found: forgotten in another window. A Retry could never succeed. */
  | { kind: "gone" }
  | { kind: "failed" };

export async function readMemories(): Promise<Read> {
  try {
    const response = await fetch(`${API}/v1/memories`, send);
    if (!response.ok) return { kind: "failed" };
    return { kind: "ok", list: (await response.json()) as MemoryList };
  } catch {
    return { kind: "failed" };
  }
}

async function written(request: Promise<Response>): Promise<Written> {
  try {
    const response = await request;
    if (response.status === 404) return { kind: "gone" };
    if (!response.ok) return { kind: "failed" };
    const body = (await response.json()) as { ok: true; id: string } | { ok: false; error: MemoryRefusal };
    return body.ok ? { kind: "ok", id: body.id } : { kind: "refused", error: body.error };
  } catch {
    return { kind: "failed" };
  }
}

export function addMemory(text: string, kind: MemoryKindId): Promise<Written> {
  return written(fetch(`${API}/v1/memories`, { ...json, method: "POST", body: JSON.stringify({ text, kind }) }));
}

export function changeMemory(id: string, change: { text?: string; kind?: MemoryKindId }): Promise<Written> {
  return written(fetch(`${API}/v1/memories/${id}`, { ...json, method: "PATCH", body: JSON.stringify(change) }));
}

/** Forget, and its Undo. True when it landed. A memory already gone, forgotten
 *  in another window, is forgotten: a Retry could never succeed. */
export async function forgetMemory(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API}/v1/memories/${id}`, { ...send, method: "DELETE" });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function restoreMemory(id: string): Promise<boolean> {
  return (await written(fetch(`${API}/v1/memories/${id}/restore`, { ...send, method: "POST" }))).kind === "ok";
}
