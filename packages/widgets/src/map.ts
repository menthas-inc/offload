// 030. A thread's map: the rules every surface shares.
//
// The phones draw on Google's native map and the web on its JavaScript map,
// but what offload puts on top (the points, their colours, the count dots,
// the framing, the hand-off to Google Maps) is decided here once, so the three
// cannot disagree. The functions work in plain numbers: a client projects its
// own points to pixels and passes them in.

/** A thread's label, as much of it as a point needs. `colour` is the label's
 *  index into `--label-1` to `--label-10`. */
export interface PointLabel {
  id: string;
  colour: number;
}

/** A point's fill: its first label's colour, split with the second's when it
 *  has two or more, ink when it has none. "First" is the thread's label order
 *  (creation order), never the order a row happens to list them, so a row
 *  labelled Stay then Food draws the same as one labelled Food then Stay. */
export function pointFill(
  labelIds: readonly string[],
  threadLabels: readonly PointLabel[],
): { a: number | null; b: number | null } {
  const mine = threadLabels.filter((label) => labelIds.includes(label.id));
  return { a: mine[0]?.colour ?? null, b: mine[1]?.colour ?? null };
}

/** An event is a rounded square, offload's or a calendar's; everything else is
 *  a dot. */
export function pointShape(type: string, _source: "row" | "calendar"): "square" | "dot" {
  return type === "event" ? "square" : "dot";
}

/** Points closer than this, in screen pixels, become one count dot: the size
 *  of a finger's target, so two points never share one tap. */
export const CLUSTER_PX = 44;

export interface ScreenPoint {
  key: string;
  x: number;
  y: number;
}

export interface Cluster {
  keys: string[];
  x: number;
  y: number;
}

/** Overlapping points into count dots.
 *
 *  Greedy over the points in a fixed order (left to right, then top to
 *  bottom, then key), so the same points always make the same groups however
 *  they arrived. A point joins the first group whose centre is less than
 *  `size` away; a group's centre is the mean of its points. */
export function cluster(points: readonly ScreenPoint[], size = CLUSTER_PX): Cluster[] {
  const ordered = [...points].sort((p, q) => p.x - q.x || p.y - q.y || p.key.localeCompare(q.key));
  const groups: { keys: string[]; sx: number; sy: number }[] = [];
  for (const point of ordered) {
    const home = groups.find((group) => {
      const cx = group.sx / group.keys.length;
      const cy = group.sy / group.keys.length;
      return Math.hypot(point.x - cx, point.y - cy) < size;
    });
    if (home) {
      home.keys.push(point.key);
      home.sx += point.x;
      home.sy += point.y;
    } else {
      groups.push({ keys: [point.key], sx: point.x, sy: point.y });
    }
  }
  return groups.map((group) => ({
    keys: group.keys,
    x: group.sx / group.keys.length,
    y: group.sy / group.keys.length,
  }));
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The opening fit never comes closer than this: one point opens at street
 *  level. The map itself zooms further, and a count dot's split may too. */
export const FIT_MAX_ZOOM = 15;

const TILE = 256;

function mercator({ lat, lng }: LatLng): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

function unmercator(x: number, y: number): LatLng {
  const lng = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return { lat, lng };
}

/** The camera that shows every point inside the padding, on Web Mercator as
 *  both of Google's maps use. The points sit in the middle of the padded frame,
 *  not of the whole view, since the padding is uneven (the chips above, the
 *  plate below). */
export function fitBounds(
  points: readonly LatLng[],
  view: { width: number; height: number },
  padding: Padding,
  maxZoom = FIT_MAX_ZOOM,
): { center: LatLng; zoom: number } {
  const projected = points.map(mercator);
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(1, view.width - padding.left - padding.right);
  const height = Math.max(1, view.height - padding.top - padding.bottom);
  const dx = maxX - minX;
  const dy = maxY - minY;
  const fits = Math.min(
    dx > 0 ? width / (dx * TILE) : Number.POSITIVE_INFINITY,
    dy > 0 ? height / (dy * TILE) : Number.POSITIVE_INFINITY,
  );
  const zoom = Math.min(maxZoom, Number.isFinite(fits) ? Math.log2(fits) : maxZoom);

  const world = TILE * 2 ** zoom;
  const cx = (minX + maxX) / 2 - (padding.left - padding.right) / 2 / world;
  const cy = (minY + maxY) / 2 - (padding.top - padding.bottom) / 2 / world;
  return { center: unmercator(cx, cy), zoom };
}

/** How far below the top a picked point has to sit for its callout to fit
 *  above it: 190px, or 40% of the map's height on a short one. */
export function calloutPadding(height: number): number {
  return Math.min(190, Math.round(height * 0.4));
}

/** Google Maps' directions link to a place.
 *
 *  **Always Google Maps**: Google's terms forbid handing its results to another
 *  company's map, so there is no Apple Maps hand-off. The coordinates and, when
 *  Google gave one, its place id, and nothing else: no name, no thread, no
 *  account. On a phone the link opens the Google Maps app when it is installed. */
export function directionsUrl(point: { lat: number; lng: number; googlePlaceId: string | null }): string {
  // Built by hand: this package runs on the phones too and carries no DOM.
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
  if (point.googlePlaceId) url += `&destination_place_id=${encodeURIComponent(point.googlePlaceId)}`;
  return url;
}

/** Google's dark map on Android.
 *
 *  Android's own dark scheme is fixed when the map is made, and the phones
 *  follow the device's theme as it changes, so Android takes a JSON style
 *  that can be swapped in place. Google's own night style, from its styling
 *  documentation. iOS switches scheme in place and does not use this. */
export const ANDROID_DARK_STYLE: { featureType?: string; elementType?: string; stylers: Record<string, string>[] }[] = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
];
