"use client";

// A thread's sections fold, kept in this browser (the owner, 2026-10-17).
// The defaults and the shape are the widgets package's; this is the store.

import { useCallback, useSyncExternalStore } from "react";
import { FOLDED_AT_FIRST, foldsFrom, foldsWith, type FoldSection, type Folds } from "@offload/widgets";

const KEY = "offload:folds";
const EVENT = "offload:folds";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Where storage refuses, the fold is held here until the page goes.
let held: string | null = null;

// One parse per change, so every heading reads the same object.
let cachedRaw: string | null | undefined;
let cached: Folds = FOLDED_AT_FIRST;
function snapshot(): Folds {
  let raw: string | null;
  try {
    const store = storage();
    raw = store ? store.getItem(KEY) : held;
  } catch {
    raw = held;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = foldsFrom(raw);
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFolds(): [Folds, (section: FoldSection, folded: boolean) => void] {
  const folds = useSyncExternalStore(subscribe, snapshot, () => FOLDED_AT_FIRST);
  const set = useCallback((section: FoldSection, folded: boolean) => {
    const next = foldsWith(snapshot(), section, folded);
    held = next;
    try {
      storage()?.setItem(KEY, next);
    } catch {
      // A private window or blocked storage: `held` keeps it until the page
      // goes, and the defaults come back next time.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [folds, set];
}
