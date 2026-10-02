"use client";

// 030. Where a thread's map sits in its pane on the web.
//
// **A top pane 1000px or wider splits**: the list without its width cap, and a
// 460px map column with no switch and no chips of its own, the list's filter
// bar filtering both. **A narrower one draws the List | Map switch**, and Map
// replaces the body with the map, the label chips floating over it and its
// foot stopping above the composer. **A pane behind draws neither.**
//
// **The map element is made once and never moved.** It sits in the same place
// in the tree whatever the layout and only its grid area changes, so neither a
// resize across the width nor the switch makes another map, which Google would
// bill. Under List it keeps its box, hidden and inert, since a map with no size
// draws grey and mis-centred when it comes back. It is not made at all until
// the thread is first shown on a map, so a thread opened on List costs nothing.

import { useContext, useEffect, useRef, useState } from "react";
import { useAppearance, type Theme } from "../../lib/appearance";
import { currentMe, onMe } from "../../lib/use-me";
import { MAP_ID, MAPS_KEY, readView, splitFor, webMapReady, writeView, type MapView } from "../../lib/map-view";
import { fetchPoints, type Point } from "../../lib/threads";
import { PaneTop } from "../shell/Panes";
import { MapColumnContext } from "../shell/map-column";
import { Icon } from "../Icon";
import styles from "./map.module.css";

export type MapLayout = "list" | "map" | "split";

/** One re-read, this long after a read that said places were being fetched
 *  again, so a point whose coordinates had aged out arrives without a reload. */
const PENDING_REREAD_MS = 3000;

export interface ThreadMapState {
  layout: MapLayout;
  showSwitch: boolean;
  view: MapView;
  setView: (view: MapView) => void;
  frame: React.RefObject<HTMLDivElement | null>;
  /** The map has been shown in this pane, so it exists from here on. */
  made: boolean;
  points: Point[];
  failed: boolean;
  retry: () => void;
  theme: Theme;
  selected: string | null;
  setSelected: (key: string | null) => void;
  hovered: string | null;
  setHovered: (key: string | null) => void;
  /** The point whose place sheet is open. */
  open: Point | null;
  setOpen: (point: Point | null) => void;
}

/** `version` changes whenever the thread is read again, so the points follow a
 *  change while the map is on screen. */
export function useThreadMap({ threadId, hasPoint, version }: { threadId: string; hasPoint: boolean; version: unknown }): ThreadMapState {
  const top = useContext(PaneTop);
  const { theme, read } = useAppearance();
  const [serverOn, setServerOn] = useState(currentMe()?.maps === true);
  useEffect(() => onMe((me) => setServerOn(me.maps === true)), []);
  const ready = top && hasPoint && read && webMapReady(serverOn, MAPS_KEY, MAP_ID);

  const [view, setViewState] = useState<MapView>(() => readView(threadId));
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visited, setVisited] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen] = useState<Point | null>(null);

  useEffect(() => {
    const node = frame.current;
    if (!ready || !node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSplit((was) => splitFor(entry.contentRect.width, was));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  const layout: MapLayout = !ready ? "list" : split ? "split" : view;
  const shown = layout !== "list";

  useEffect(() => {
    if (shown) setVisited(true);
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const readPoints = async (again: boolean): Promise<void> => {
      const got = await fetchPoints(threadId);
      if (!live) return;
      if (!got) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setPoints(got.points);
      if (again && got.pending > 0) timer = setTimeout(() => void readPoints(false), PENDING_REREAD_MS);
    };
    void readPoints(true);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [shown, threadId, version, attempt]);

  // A sheet is reached from the map, so it goes when the map does.
  useEffect(() => {
    if (!shown) setOpen(null);
  }, [shown]);

  return {
    layout,
    showSwitch: ready && !split,
    view,
    setView: (next) => {
      writeView(threadId, next);
      setViewState(next);
    },
    frame,
    made: ready && visited && (points !== null || failed),
    points: points ?? [],
    failed,
    retry: () => setAttempt((n) => n + 1),
    theme,
    selected,
    setSelected,
    hovered,
    setHovered,
    open,
    setOpen,
  };
}

/** The switch: `SegmentedControl`'s icon variant, from the exploration. */
export function MapSwitch({ view, onChange }: { view: MapView; onChange: (view: MapView) => void }) {
  return (
    <div className={styles.switch} role="group" aria-label="Show as">
      {(["list", "map"] as const).map((one) => (
        <button
          key={one}
          type="button"
          className={styles.switchSegment}
          aria-pressed={view === one}
          aria-label={one === "list" ? "List" : "Map"}
          title={one === "list" ? "List" : "Map"}
          onClick={() => onChange(one)}
        >
          <Icon name={one === "list" ? "list" : "map-pin"} size={16} />
        </button>
      ))}
    </div>
  );
}

export function MapFrame({
  state,
  children,
  map,
  chips,
  sheet,
}: {
  state: ThreadMapState;
  /** The list: the pane's body. */
  children: React.ReactNode;
  /** The map, called once it may exist. */
  map: () => React.ReactNode;
  /** The label chips, floated over the map on Map. */
  chips?: React.ReactNode;
  sheet?: React.ReactNode;
}) {
  const setColumn = useContext(MapColumnContext);
  const { layout } = state;
  useEffect(() => {
    setColumn(layout === "split");
    return () => setColumn(false);
  }, [layout, setColumn]);

  const hidden = layout === "list";
  return (
    <div ref={state.frame} className={styles.split} data-map-frame data-layout={layout} data-sheet={sheet ? true : undefined}>
      <div className={styles.list} inert={layout === "map"} data-hidden={layout === "map" ? true : undefined}>
        {children}
      </div>
      {state.made ? (
        <div className={styles.column} data-map-column inert={hidden} data-hidden={hidden ? "true" : undefined}>
          {map()}
          {layout === "map" && chips ? <div className={styles.chips}>{chips}</div> : null}
        </div>
      ) : null}
      {sheet}
    </div>
  );
}
