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

/** For every value of the account's: this device only. The store's default
 *  class migrates with an encrypted backup restored onto another phone, and
 *  a thread id is the account's. What the stamp and the session use. */
export const DEVICE_ONLY = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** An empty list is written, never deleted: a delete still out when the next
 *  name is listed would take that name with it. Sign-out deletes it. */
function list(keys: string[]): void {
  try {
    SecureStore.setItem(LIST, JSON.stringify(keys), DEVICE_ONLY);
  } catch {
    // Unlisted, so the value is not kept either: see `keepForAccount`.
  }
}

function held(key: string): boolean {
  try {
    return SecureStore.getItem(key) !== null;
  } catch {
    return true;
  }
}

/** Delete a value, and take its name off the list once the store says it has
 *  gone. A delete that fails leaves the name for the next one, at sign-out
 *  if not before, so a value is never on the phone without its name. */
async function unlist(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    return;
  }
  if (!held(key)) list(accountKeys().filter((k) => k !== key));
}

/** Write a value that belongs to the signed-in account. Listed first, so a
 *  value is never on the phone without its name on the list; the oldest past
 *  `KEPT` go after it, each unlisted once it has. */
export function keepForAccount(key: string, value: string): void {
  const keys = [...accountKeys().filter((k) => k !== key), key];
  list(keys);
  if (!accountKeys().includes(key)) return;
  SecureStore.setItem(key, value, DEVICE_ONLY);
  for (const old of keys.slice(0, Math.max(0, keys.length - KEPT))) void unlist(old);
}

export function dropForAccount(key: string): void {
  void unlist(key);
}

/** Every listed value, then the list once they have all gone. */
export async function forgetAccountKeys(): Promise<void> {
  await Promise.all(accountKeys().map(unlist));
  if (accountKeys().length === 0) await SecureStore.deleteItemAsync(LIST).catch(() => undefined);
}
