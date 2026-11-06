"use client";

// 049. Search on the web: the read, the event that opens the window, and the
// recent list this browser keeps per account.
//
// The query goes in a POST body, never an address: the window has no route,
// so it is in no history and no Referer either.

import { recentAfter, type SearchAnswer } from "@offload/widgets";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

/** The sidebar's Search and the keys open the window through this. */
export const OPEN_SEARCH = "offload:open-search";

export function openSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH));
}

/** One read, or null when it did not answer. */
export async function searchFor(q: string, meaning: boolean): Promise<SearchAnswer | null> {
  try {
    const response = await fetch(`${API}/v1/search`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, meaning }),
    });
    return response.ok ? ((await response.json()) as SearchAnswer) : null;
  } catch {
    return null;
  }
}

const PREFIX = "offload.search.recent.";
const keyOf = (accountId: string) => `${PREFIX}${accountId}`;

/** Per account, so another account on this browser never reads them. Storage
 *  can be missing or refuse, and then there is no recent list. */
export function readRecent(accountId: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(keyOf(accountId)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(accountId: string, list: string[]): string[] {
  try {
    window.localStorage.setItem(keyOf(accountId), JSON.stringify(list));
  } catch {
    // Not kept is still the list on screen.
  }
  return list;
}

export const keepRecent = (accountId: string, q: string): string[] => writeRecent(accountId, recentAfter(readRecent(accountId), q));
export const dropRecent = (accountId: string, q: string): string[] =>
  writeRecent(accountId, readRecent(accountId).filter((r) => r !== q));

/** Signing out forgets every account's recent searches on this browser. */
export function forgetRecent(): void {
  try {
    const store = window.localStorage;
    for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key);
  } catch {
    // Nothing to forget where storage refuses.
  }
}
