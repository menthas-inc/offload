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
  cluster,
  fitBounds,
  hitCircle,
  pointFill,
  pointPasses,
  pointShape,
  splitZoom,
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
  threadName: string;
}

const SCHEME: Record<Theme, ColorScheme> = {
  light: ColorScheme.LIGHT,
  dark: ColorScheme.DARK,
  system: ColorScheme.FOLLOW_SYSTEM,
};

/** The opening fit's padding, from the exploration: 28 at the sides, 70 at the
 *  top for the chips, 40 above the foot. */
const PADDING = { top: 70, right: 28, bottom: 40, left: 28 };

const TILE = 256;

/** A point's position in world pixels at a zoom, on Web Mercator as Google
 *  draws it: enough to group points that overlap on screen without asking the
 *  map for a projection. */
function worldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  const scale = TILE * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function metresPerPixel(lat: number, zoom: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** A label's colour as Google's circle needs it: a value, not a variable. */
function labelColour(colour: number | null): string {
  if (typeof window === "undefined") return "";
  const name = colour === null ? "--text-primary" : `--label-${colour}`;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
        <div className={styles.failed} role="status">
          <span>Couldn&apos;t load the map</span>
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
}: ThreadMapProps & { zoom: number | null; onFit: (zoom: number) => void }) {
  const map = useMap();
  const fitted = useRef(false);

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

  const spots = shown.filter((p) => !p.approximate);
  const areas = shown.filter((p) => p.approximate);
  const groups = useMemo(() => {
    if (zoom === null) return spots.map((p) => ({ keys: [p.key], x: 0, y: 0 }));
    return cluster(spots.map((p) => ({ key: p.key, ...worldPixel(p.lat, p.lng, zoom) })));
  }, [spots, zoom]);
  const byKey = useMemo(() => new globalThis.Map(points.map((p) => [p.key, p])), [points]);
  const picked = selected ? byKey.get(selected) ?? null : null;

  return (
    <>
      {areas.map((p) => {
        const fill = pointFill(p.labelIds, order);
        const colour = labelColour(fill.a);
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
              <span className={styles.count}>{members.length}</span>
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
        >
          <Callout point={picked} labels={labels} onOpen={onOpen} />
        </AdvancedMarker>
      ) : null}

      {shown.length === 0 && points.length > 0 ? (
        <p className={styles.nothing}>Nothing under {pickedNames.join(", ") || "that"} on the map.</p>
      ) : null}
    </>
  );
}
