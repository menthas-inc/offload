// 030. A thread's map on the phones: whether there is one, the List or Map
// choice, the points, and what is picked and open.

import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import Constants from "expo-constants";
import { useMe } from "../../lib/me";
import { mapsReady, readView, writeView, type MapChoice } from "../../lib/map-view";
import { fetchPoints, type Point } from "../../lib/threads";

/** One re-read, this long after a read that said places were being fetched
 *  again, so a point whose coordinates had aged out arrives without a reload. */
const PENDING_REREAD_MS = 3000;

/** Whether this build was given a map key for this platform. No key, no map:
 *  a keyless iOS build would otherwise draw Apple's. */
function available(): boolean {
  const extra = Constants.expoConfig?.extra as { mapsAvailable?: Record<string, boolean> } | undefined;
  return extra?.mapsAvailable?.[Platform.OS] === true;
}

export interface ThreadMapState {
  /** The switch is drawn. */
  ready: boolean;
  /** What the body shows: Map only while there is a map to show. */
  layout: MapChoice;
  view: MapChoice;
  setView: (view: MapChoice) => void;
  /** Shown on Map at least once this visit, so the map exists from here on. */
  made: boolean;
  points: Point[];
  failed: boolean;
  retry: () => void;
  selected: string | null;
  setSelected: (key: string | null) => void;
  open: Point | null;
  setOpen: (point: Point | null) => void;
  /** What covers the map's foot besides the plate: the keyboard or the sheet. */
  sheetHeight: number;
  setSheetHeight: (height: number) => void;
  keyboard: number;
}

/** `version` changes whenever the thread is read again, so the points follow a
 *  change while the map is on screen. */
export function useThreadMap({ threadId, hasPoint, version }: { threadId: string | undefined; hasPoint: boolean; version: unknown }): ThreadMapState {
  const me = useMe();
  const ready = mapsReady({ serverOn: me?.maps === true, available: available(), hasPoint });
  const [view, setViewState] = useState<MapChoice>(() => (threadId ? readView(threadId) : "list"));
  const [points, setPoints] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visited, setVisited] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Point | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [keyboard, setKeyboard] = useState(0);
  const layout: MapChoice = ready ? view : "list";
  const shown = layout === "map";

  useEffect(() => {
    if (shown) setVisited(true);
    else setOpen(null);
  }, [shown]);

  useEffect(() => {
    const up = Keyboard.addListener("keyboardDidShow", (event) => setKeyboard(event.endCoordinates.height));
    const down = Keyboard.addListener("keyboardDidHide", () => setKeyboard(0));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);

  useEffect(() => {
    if (!shown || !threadId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async (again: boolean): Promise<void> => {
      // A request that never reached the server is a failed read too.
      const got = await fetchPoints(threadId).catch(() => null);
      if (!live) return;
      if (!got) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setPoints(got.points);
      if (again && got.pending > 0) timer = setTimeout(() => void read(false), PENDING_REREAD_MS);
    };
    void read(true);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [shown, threadId, version, attempt]);

  return {
    ready,
    layout,
    view,
    setView: (next) => {
      if (threadId) writeView(threadId, next);
      setViewState(next);
    },
    made: visited && (points !== null || failed),
    points: points ?? [],
    failed,
    retry: () => setAttempt((n) => n + 1),
    selected,
    setSelected,
    open,
    setOpen: (point) => {
      setOpen(point);
      if (!point) setSheetHeight(0);
    },
    sheetHeight,
    setSheetHeight,
    keyboard,
  };
}
