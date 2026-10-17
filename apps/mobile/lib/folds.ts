// A thread's sections fold, kept on the phone for the account (the owner,
// 2026-10-17). The defaults and the shape are the widgets package's; this is
// the store, one value in secure storage, forgotten at sign-out with the
// account's other keys (`device-data.ts`).

import { useCallback, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { foldsFrom, foldsWith, type FoldSection, type Folds } from "@offload/widgets";
import { DEVICE_ONLY } from "./account-keys";

export const FOLDS_KEY = "offload_section_folds";

let cachedRaw: string | null | undefined;
let cached: Folds = foldsFrom(null);
const listeners = new Set<() => void>();

/** The keychain is read once, on the first heading drawn; after that this
 *  module is the one writer, so the cache is the truth. React reads a store's
 *  snapshot several times a render. */
export function readFolds(): Folds {
  if (cachedRaw === undefined) {
    try {
      cachedRaw = SecureStore.getItem(FOLDS_KEY);
    } catch {
      cachedRaw = null;
    }
    cached = foldsFrom(cachedRaw);
  }
  return cached;
}

export function writeFold(section: FoldSection, folded: boolean): void {
  cachedRaw = foldsWith(readFolds(), section, folded);
  cached = foldsFrom(cachedRaw);
  try {
    SecureStore.setItem(FOLDS_KEY, cachedRaw, DEVICE_ONLY);
  } catch {
    // Not kept: it holds until the app closes, and the defaults come back.
  }
  for (const listener of listeners) listener();
}

/** Sign-out deletes the key; the next account reads it afresh. */
export function forgetFolds(): void {
  cachedRaw = undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFolds(): [Folds, (section: FoldSection, folded: boolean) => void] {
  const folds = useSyncExternalStore(subscribe, readFolds, readFolds);
  return [folds, useCallback(writeFold, [])];
}
