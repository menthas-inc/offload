// 030. A thread's map on the phones: the small rules around it.

import * as SecureStore from "expo-secure-store";

export type MapView = "list" | "map";

/** How many threads left on Map the phone remembers. List is the default and
 *  is not stored, and one value holds them all, most recent last, small enough
 *  for the store's 2048 bytes. */
export const MAP_VIEWS_KEPT = 48;

const KEY = "offload_map_views";

function kept(): string[] {
  try {
    const parsed = JSON.parse(SecureStore.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** The way a thread was left on this phone; List when it never was. */
export function readView(threadId: string): MapView {
  return kept().includes(threadId) ? "map" : "list";
}

export function writeView(threadId: string, view: MapView): void {
  const ids = kept().filter((id) => id !== threadId);
  if (view === "map") ids.push(threadId);
  try {
    SecureStore.setItem(KEY, JSON.stringify(ids.slice(-MAP_VIEWS_KEPT)));
  } catch {
    // Not kept: the thread opens on List next time, which is a fine default.
  }
}

/** Whether the phone may draw a map: the server's switch, a key in this build
 *  for this platform, and a point in the thread. */
export function mapsReady({ serverOn, available, hasPoint }: { serverOn: boolean; available: boolean; hasPoint: boolean }): boolean {
  return serverOn && available && hasPoint;
}

export type BarTool = "labels" | "calendars";

/** What the bar holds beside share and More. With the switch in it the bar is
 *  back, title, switch, share, More, and the label and calendar tools go to
 *  the top of More, in that order. */
export function barTools({ switchShown, labels, calendars }: { switchShown: boolean; labels: boolean; calendars: boolean }): {
  inBar: BarTool[];
  moreFirst: BarTool[];
} {
  const tools: BarTool[] = [...(labels ? (["labels"] as const) : []), ...(calendars ? (["calendars"] as const) : [])];
  return switchShown ? { inBar: [], moreFirst: tools } : { inBar: tools, moreFirst: [] };
}
