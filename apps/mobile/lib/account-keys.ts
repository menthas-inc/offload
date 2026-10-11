// Secure-storage keys named at runtime, listed so they can be forgotten.
//
// A label pick is kept under its thread's id. Secure storage has no way to
// list what it holds, so a phone that has forgotten the thread could never
// find the key again, and the pick would outlive the account. Every key whose
// name is made at runtime is written through here, which keeps its name in
// one listed value; signing out deletes the list and everything on it.
// Fixed names are listed in `device-data.ts` instead.

import * as SecureStore from "expo-secure-store";

const LIST = "offload_account_keys";

/** Under the store's 2,048 bytes when every name carries a thread id, about
 *  54 bytes each. The oldest goes first, which for a pick reads as All. */
const KEPT = 32;

export function accountKeys(): string[] {
  try {
    const parsed = JSON.parse(SecureStore.getItem(LIST) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function list(keys: string[]): void {
  try {
    if (keys.length === 0) void SecureStore.deleteItemAsync(LIST).catch(() => undefined);
    else SecureStore.setItem(LIST, JSON.stringify(keys));
  } catch {
    // Unlisted, so the value is not kept either: see `keepForAccount`.
  }
}

/** Write a value that belongs to the signed-in account. Listed first, so a
 *  value is never on the phone without its name on the list. */
export function keepForAccount(key: string, value: string): void {
  const keys = [...accountKeys().filter((k) => k !== key), key];
  for (const old of keys.splice(0, Math.max(0, keys.length - KEPT))) {
    void SecureStore.deleteItemAsync(old).catch(() => undefined);
  }
  list(keys);
  if (!accountKeys().includes(key)) return;
  SecureStore.setItem(key, value);
}

export function dropForAccount(key: string): void {
  void SecureStore.deleteItemAsync(key).catch(() => undefined);
  list(accountKeys().filter((k) => k !== key));
}

/** Every listed key and the list itself. */
export async function forgetAccountKeys(): Promise<void> {
  await Promise.all([...accountKeys(), LIST].map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)));
}
