"use client";

// The one reader of the reduced-motion preference on the web. Live: turning it
// on with a tab open stops what moves without a reload. False on the server and
// through hydration, so the markup a server sends is the markup that hydrates.

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribe(changed: () => void): () => void {
  const list = query();
  list?.addEventListener("change", changed);
  return () => list?.removeEventListener("change", changed);
}

const current = () => query()?.matches === true;
const onServer = () => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, current, onServer);
}
