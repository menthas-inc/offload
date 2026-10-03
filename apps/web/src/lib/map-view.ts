// 030. A thread's map on the web: the small rules around it.

/** How many threads' List or Map choice the device keeps. One key holds them,
 *  most recent last, so it cannot grow without bound. */
export const MAP_VIEWS_KEPT = 100;

const KEY = "offload:map-view";

export type MapView = "list" | "map";

function read(store: Storage): Record<string, MapView> {
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, MapView>) : {};
  } catch {
    return {};
  }
}

/** The way a thread was left on this device; List when it never was. */
export function readView(threadId: string, store: Storage | null = storage()): MapView {
  if (!store) return "list";
  return read(store)[threadId] === "map" ? "map" : "list";
}

/** Keep a thread's choice, moving it to the most recent end and dropping the
 *  oldest past the limit. A device that refuses storage keeps nothing. */
export function writeView(threadId: string, view: MapView, store: Storage | null = storage()): void {
  if (!store) return;
  try {
    const all = read(store);
    delete all[threadId];
    all[threadId] = view;
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAP_VIEWS_KEPT))) delete all[old];
    store.setItem(KEY, JSON.stringify(all));
  } catch {
    // A private window or blocked storage: the choice is not kept, and the
    // thread opens on List next time, which is a fine default.
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The thread pane's width at which the map becomes a column beside the list:
 *  the width the pane has in a 1200px window beside the sidebar and nothing
 *  else, rounded to 1000, with 16px of give either way so a resize across it
 *  does not flicker. */
export const SPLIT_AT = 1000;
const GIVE = 16;

export function splitFor(width: number, wasSplit: boolean): boolean {
  return wasSplit ? width >= SPLIT_AT - GIVE : width >= SPLIT_AT + GIVE;
}

/** Whether the web may draw a map at all: the server's switch, and the public
 *  key and map id this build was made with. Either missing draws the thread as
 *  it was before the map. */
export function webMapReady(serverOn: boolean, key: string | undefined, mapId: string | undefined): boolean {
  return serverOn && Boolean(key) && Boolean(mapId);
}

export const MAPS_KEY = process.env["NEXT_PUBLIC_GOOGLE_MAPS_KEY"] ?? "";
export const MAP_ID = process.env["NEXT_PUBLIC_GOOGLE_MAP_ID"] ?? "";
