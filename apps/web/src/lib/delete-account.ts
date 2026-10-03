"use client";

// 035. Deleting the account this browser is signed in to.
//
// The server checks the word; this only carries it. Three answers and no
// guess at why one of them is a failure: the screen says what happened.

import { forgetMe } from "./use-me";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export type DeleteOutcome = "done" | "last_owner" | "failed";

export async function deleteAccount(word: string): Promise<DeleteOutcome> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "DELETE",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: word.trim().toLowerCase() }),
    });
    if (response.status === 409) return "last_owner";
    if (!response.ok) return "failed";
    forgetMe();
    return "done";
  } catch {
    return "failed";
  }
}
