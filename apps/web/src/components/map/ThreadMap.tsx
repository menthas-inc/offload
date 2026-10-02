"use client";

// 030. A thread's map on the web: Google's map, with offload's own points,
// circles, count dots and callout over it.
//
// **One map per mount.** Google bills a web map per map made, past ten
// thousand a month, so a filter, a hover, a pick, a resize or a move between
// the column and the switch never makes another. A Settings theme change does,
// once: a map's colour scheme is fixed when it is made, so the map is keyed by
// the stored setting, and *Follow the system* is handed to the map as such so
// a device switching scheme under it needs none.
//
// **Nothing Google named is drawn.** The title is the row's, the address an
// event's own words; Google's place id only rides along to Directions.
//
// **Imported lazily** by the thread pane, so the library and Google's script
// load only when a map first shows.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APIProvider,
  Circle,
  ColorScheme,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import {
  CIRCLE_METRES,
  calloutPan,
  cluster,
  fitBounds,
  hitCircle,
  metresPerPixel,
  nameList,
  pointFill,
  pointPasses,
  pointShape,
  panned,
  screenOf,
  splitZoom,
  worldPixel,
  type LabelPick,
} from "@offload/widgets";
import type { Theme } from "../../lib/appearance";
import { MAP_ID, MAPS_KEY } from "../../lib/map-view";
import type { Point } from "../../lib/threads";
import { Callout } from "./Callout";
import { kindWord, PointDot } from "./Point";
import styles from "./map.module.css";

export interface ThreadMapProps {
  points: Point[];
  labels: { id: string; name?: string; colour: number }[];
  pick: LabelPick;
  pickedNames: string[];
  /** The stored theme setting, never the resolved one: see the header. */
  theme: Theme;
  selected: string | null;
  hovered: string | null;
  onSelect: (key: string | null) => void;
  onOpen: (point: Point) => void;
  /** The points read failed. */
  failed: boolean;
  onRetry: () => void;
}

const SCHEME: Record<Theme, ColorScheme> = {
  light: ColorScheme.LIGHT,
  dark: ColorScheme.DARK,
  system: ColorScheme.FOLLOW_SYSTEM,
};

/** The opening fit's padding, from the exploration: 28 at the sides, 70 at the
 *  top for the chips, 40 above the foot. */
const PADDING = { top: 70, right: 28, bottom: 40, left: 28 };

/** Read once: a camera that moves for a pick jumps instead of gliding. */
const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The label colours as Google's circle needs them, values rather than
 *  variables: index 0 the ink of no label. Read once per theme. */
function labelColours(): string[] {
  if (typeof window === "undefined") return [];
  const root = getComputedStyle(document.documentElement);
  return Array.from({ length: 11 }, (_, n) => root.getPropertyValue(n === 0 ? "--text-primary" : `--label-${n}`).trim());
}

export default function ThreadMap(props: ThreadMapProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const areas = useMemo(
    () => props.points.filter((p) => p.approximate && pointPasses(p, props.pick)),
    [props.points, props.pick],
  );

  if (props.failed || loadFailed) {
    return (
      <div className={styles.frame}>
        <div className={styles.failed}>
          <span role="status">Couldn&apos;t load the map</span>
          <button
            type="button"
            className={styles.pill}
            onClick={() => {
              setLoadFailed(false);
              setAttempt((n) => n + 1);
              props.onRetry();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.frame}>
      <APIProvider key={attempt} apiKey={MAPS_KEY} onError={() => setLoadFailed(true)}>
        <Map
          // Keyed by the stored setting: the one change that makes a new map.
          key={props.theme}
          className={styles.map}
          mapId={MAP_ID}
          colorScheme={SCHEME[props.theme]}
          defaultCenter={props.points[0] ? { lat: props.points[0].lat, lng: props.points[0].lng } : { lat: 0, lng: 0 }}
          defaultZoom={3}
          disableDefaultUI
          clickableIcons={false}
          gestureHandling="greedy"
          onZoomChanged={(event) => setZoom(event.detail.zoom)}
          // A tap that lands inside an area picks it; anything else closes the
          // callout. Tested here because neither map makes a circle tappable
          // on every platform, and the phones do the same.
          onClick={(event) => {
            const at = event.detail.latLng;
            if (!at) return props.onSelect(null);
            const scale = metresPerPixel(at.lat, zoom ?? 14);
            props.onSelect(hitCircle(at, areas.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng })), scale));
          }}
        >
          <Drawn {...props} zoom={zoom} onFit={setZoom} />
        </Map>
      </APIProvider>
    </div>
  );
}

/** What offload draws over the map, once the map exists. */
function Drawn({
  points,
  labels,
  pick,
  pickedNames,
  selected,
  hovered,
  onSelect,
  onOpen,
  zoom,
  onFit,
  theme,
}: ThreadMapProps & { zoom: number | null; onFit: (zoom: number) => void }) {
  const map = useMap();
  const fitted = useRef(false);
  const colours = useMemo(labelColours, [theme]);

  const shown = useMemo(() => points.filter((p) => pointPasses(p, pick)), [points, pick]);
  const order = useMemo(() => labels.map((l) => ({ id: l.id, colour: l.colour })), [labels]);

  // The opening fit, once a mount, to every point: never closer than street
  // level, and never again for a point that arrives while the map is open.
  useEffect(() => {
    if (!map || fitted.current || points.length === 0) return;
    const div = map.getDiv() as HTMLElement;
    const fit = fitBounds(points, { width: div.offsetWidth || 460, height: div.offsetHeight || 600 }, PADDING);
    map.moveCamera({ center: fit.center, zoom: fit.zoom });
    onFit(fit.zoom);
    fitted.current = true;
  }, [map, points, onFit]);

  // A picked point's callout is kept inside the frame: the map moves just
  // enough, and only when the pick changes, never because the points were
  // read again.
  const pointsByKey = useRef(new globalThis.Map<string, Point>());
  useEffect(() => {
    pointsByKey.current = new globalThis.Map(points.map((p) => [p.key, p]));
  }, [points]);
  useEffect(() => {
    const p = selected ? pointsByKey.current.get(selected) : undefined;
    const center = map?.getCenter();
    const zoom = map?.getZoom();
    if (!map || !p || !center || zoom === undefined) return;
    const div = map.getDiv() as HTMLElement;
    const view = { width: div.offsetWidth || 460, height: div.offsetHeight || 600 };
    const camera = { center: { lat: center.lat(), lng: center.lng() }, zoom };
    const { dx, dy } = calloutPan(screenOf(p, camera, view), view);
    if (!dx && !dy) return;
    if (REDUCED) map.moveCamera({ center: panned(camera, dx, dy) });
    else map.panBy(dx, dy);
  }, [map, selected]);

  const spots = shown.filter((p) => !p.approximate);
  const areas = shown.filter((p) => p.approximate);
  const groups = useMemo(() => {
    if (zoom === null) return spots.map((p) => ({ keys: [p.key], x: 0, y: 0 }));
    return cluster(spots.map((p) => ({ key: p.key, ...worldPixel(p, zoom) })));
  }, [spots, zoom]);
  const byKey = useMemo(() => new globalThis.Map(points.map((p) => [p.key, p])), [points]);
  const picked = selected ? byKey.get(selected) ?? null : null;

  return (
    <>
      {areas.map((p) => {
        const fill = pointFill(p.labelIds, order);
        const colour = colours[fill.a ?? 0] ?? "";
        const isPicked = p.key === selected;
        return (
          <Circle
            key={p.key}
            center={{ lat: p.lat, lng: p.lng }}
            radius={CIRCLE_METRES}
            clickable={false}
            strokeColor={colour}
            strokeOpacity={isPicked ? 1 : 0.7}
            strokeWeight={isPicked ? 2.5 : 1.5}
            fillColor={colour}
            fillOpacity={isPicked ? 0.26 : p.key === hovered ? 0.3 : 0.16}
          />
        );
      })}

      {/* An area's own target at its centre, named like a point, so a
          keyboard and a screen reader reach it as a pointer does. */}
      {areas.map((p) => (
        <AdvancedMarker
          key={`area:${p.key}`}
          position={{ lat: p.lat, lng: p.lng }}
          anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
          title={`${p.title}, ${kindWord(p.type)}`}
          onClick={() => onSelect(p.key)}
        >
          <span className={styles.target} />
        </AdvancedMarker>
      ))}

      {groups.map((group) => {
        if (group.keys.length > 1) {
          const members = group.keys.map((k) => byKey.get(k)!).filter(Boolean);
          const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
          const lng = members.reduce((s, m) => s + m.lng, 0) / members.length;
          return (
            <AdvancedMarker
              key={group.keys.join("|")}
              position={{ lat, lng }}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={`Zoom in to ${members.length}`}
              onClick={() => {
                if (!map) return;
                const div = map.getDiv() as HTMLElement;
                const split = splitZoom(members, { width: div.offsetWidth || 460, height: div.offsetHeight || 600 }, PADDING);
                map.moveCamera({ center: split.center, zoom: split.zoom });
              }}
            >
              <span className={styles.target}>
                <span className={styles.count}>{members.length}</span>
              </span>
            </AdvancedMarker>
          );
        }
        const p = byKey.get(group.keys[0]!)!;
        const fill = pointFill(p.labelIds, order);
        return (
          <AdvancedMarker
            key={p.key}
            position={{ lat: p.lat, lng: p.lng }}
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
            title={`${p.title}, ${p.source === "calendar" ? "event" : kindWord(p.type)}`}
            zIndex={p.key === selected ? 2 : 1}
            onClick={() => onSelect(p.key)}
          >
            <span className={styles.target}>
              <PointDot
                a={fill.a}
                b={fill.b}
                shape={pointShape(p.type, p.source)}
                picked={p.key === selected}
                hovered={p.key === hovered}
              />
            </span>
          </AdvancedMarker>
        );
      })}

      {picked ? (
        <AdvancedMarker
          key={`callout:${picked.key}`}
          position={{ lat: picked.lat, lng: picked.lng }}
          anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
          zIndex={10}
          // A marker of its own clicks, so Google does not also take a press
          // on Open as a click on the map, which closed the callout before the
          // button heard it (seen in the browser check, T4.8).
          clickable
        >
          <Callout point={picked} labels={labels} onOpen={onOpen} onClose={() => onSelect(null)} />
        </AdvancedMarker>
      ) : null}

      {shown.length === 0 && points.length > 0 ? (
        <p className={styles.nothing}>
          {pickedNames.length > 0 ? `Nothing under ${nameList(pickedNames)} on the map.` : "Nothing without a label on the map."}
        </p>
      ) : null}
    </>
  );
}
