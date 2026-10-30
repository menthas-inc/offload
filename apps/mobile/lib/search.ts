// 049. Search on the phones: the read, the recent list kept on this phone,
// and the tab's way of asking the page to focus its field again.
//
// The query goes in a POST body, never an address.

import * as SecureStore from "expo-secure-store";
import { recentAfter, type SearchAnswer } from "@offload/widgets";
import { send } from "./api";
import { DEVICE_ONLY } from "./account-keys";

/** In `ACCOUNT_KEYS`, so signing out and another account signing in clear it. */
export const RECENT_KEY = "offload_recent_searches";

/** One read, or null when it did not answer. */
export async function searchFor(q: string, meaning: boolean): Promise<SearchAnswer | null> {
  const { status, data } = await send<SearchAnswer>("/v1/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q, meaning }),
  });
  return status === 200 && data ? data : null;
}

export function readRecent(): string[] {
  try {
    const parsed = JSON.parse(SecureStore.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): string[] {
  try {
    SecureStore.setItem(RECENT_KEY, JSON.stringify(list), DEVICE_ONLY);
  } catch {
    // Not kept is still the list on screen.
  }
  return list;
}

export const keepRecent = (q: string): string[] => writeRecent(recentAfter(readRecent(), q));
export const dropRecent = (q: string): string[] => writeRecent(readRecent().filter((r) => r !== q));

// The Search tab, tapped while Search shows, focuses the field again.
type Focus = () => void;
const focusers = new Set<Focus>();

export function onSearchFocus(listener: Focus): () => void {
  focusers.add(listener);
  return () => focusers.delete(listener);
}

export function focusSearch(): void {
  for (const listener of focusers) listener();
}
