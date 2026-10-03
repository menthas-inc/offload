"use client";

// 035. A copy of everything the account can read, from the browser.
//
// The row's state is the server's. Asking, and deleting the copy, each have
// two answers that matter here: whether it went through, and whether the
// session ended under the page, where pressing again could never work. The
// file is a plain link, which the session cookie authorises; nothing here
// handles its bytes.

import type { CopyState } from "@offload/widgets";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export const COPY_FILE = `${API}/api/me/export/file`;

const IDLE: CopyState = { state: "idle", readyAt: null, expiresAt: null, nextAt: null };

/** The row, `signed_out` when the session has ended, or null when the call
 *  did not go through. */
export type CopyAnswer = CopyState | "signed_out" | null;

export async function fetchCopy(): Promise<CopyAnswer> {
  try {
    const response = await fetch(`${API}/api/me/export`, { credentials: "include" });
    if (response.status === 401) return "signed_out";
    return response.ok ? ((await response.json()) as CopyState) : null;
  } catch {
    return null;
  }
}

/** Too soon is the server's to say, so the row is read again and says when. */
export async function askForCopy(): Promise<CopyAnswer> {
  try {
    const response = await fetch(`${API}/api/me/export`, { method: "POST", credentials: "include" });
    if (response.status === 401) return "signed_out";
    if (response.status === 409) return fetchCopy();
    return response.ok ? ((await response.json()) as CopyState) : null;
  } catch {
    return null;
  }
}

export async function deleteCopy(): Promise<CopyAnswer> {
  try {
    const response = await fetch(`${API}/api/me/export`, { method: "DELETE", credentials: "include" });
    if (response.status === 401) return "signed_out";
    if (!response.ok) return null;
    // The delete went through. A read that then fails is not a failed delete:
    // the row says there is none, and the next press or read corrects it.
    return (await fetchCopy()) ?? IDLE;
  } catch {
    return null;
  }
}
