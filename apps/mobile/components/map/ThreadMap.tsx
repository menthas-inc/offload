// 030. A thread's map on the phones: Google's map through react-native-maps,
// with offload's own points, circles, count dots and callout over it.
//
// **Google's map on both phones, and no map id.** `PROVIDER_GOOGLE`, so iOS
// draws Google's map rather than Apple's beside Google's places, which the
// terms forbid. A `googleMapId` would make every load on the phones billable,
// so none is passed; a test reads these files for it.
//
// **One map per visit to the thread.** Mounted the first time the thread is
// shown on Map and kept across List and Map, a filter, a pick and a theme
// change, so returning to Map finds the camera where it was. Under List it is
// out of sight, touch and assistive tech: transparent on iOS and moved off the
// screen on Android, whose map surface can draw through an opacity.
//
// **Nothing Google named is drawn.** The title is the row's, the address an
// event's own words; Google's place id only rides along to Directions.

import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useReducedMotion } from "react-native-reanimated";
import { cameraMs } from "../../lib/motion";
import { emptyLine } from "../../lib/map-view";
import { useColorScheme } from "nativewind";
import {
  CIRCLE_METRES,
  calloutPan,
  cluster,
  fitBounds,
  hitCircle,
  kindWord,
  metresPerPixel,
  panned,
  pointFill,
  pointPasses,
  pointShape,
  screenOf,
  splitZoom,
  worldPixel,
  zoomOf,
  type Camera,
  type LabelPick,
} from "@offload/widgets";
import type { Label } from "../../lib/labels";
import type { Point } from "../../lib/threads";
import { atOpacity, useColors } from "../../lib/colors";
import { Callout, CALLOUT_LIFT, CALLOUT_WIDTH } from "./Callout";
import { PointDot } from "./Point";
import darkStyle from "./android-dark-style.json";

const isAndroid = Platform.OS === "android";

/** The opening fit's padding inside the map's own padding: 28 at the sides,
 *  70 at the top for the floating chips, 40 above the foot. */
const PADDING = { top: 70, right: 28, bottom: 40, left: 28 };

/** Android draws nothing and says nothing when a map cannot load; past this
 *  without `onMapLoaded`, the map says so with Try again. */
const LOAD_TIMEOUT_MS = 12_000;

/** How long a marker keeps redrawing its image after a change: enough for the
 *  view to lay out at its new size on a slow Android frame. */
const TRACK_MS = 500;

export function ThreadMap({
  points,
  labels,
  pick,
  pickedNames,
  hidden,
  bottom,
  selected,
  onSelect,
  onOpen,
  failed,
  onRetry,
}: {
  points: Point[];
  labels: Label[];
  pick: LabelPick;
  pickedNames: string[];
  /** Under List: kept, out of sight and reach. */
  hidden: boolean;
  /** What covers the map's foot: the plate, the keyboard, the place sheet.
   *  Google's logo and legal line sit above it. */
  bottom: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onOpen: (point: Point) => void;
  /** The points read failed. */
  failed: boolean;
  onRetry: () => void;
}) {
  const COLOR = useColors();
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const reduced = useReducedMotion();
  const map = useRef<MapView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fitted = useRef(false);
  // Where the callout's point is on screen, re-read as the map moves.
  const [calloutAt, setCalloutAt] = useState<{ x: number; y: number } | null>(null);
  const [calloutHeight, setCalloutHeight] = useState(0);
  // A marker draws its children into an image: on while they change, then off
  // once they have settled, so a point redraws once rather than every frame.
  // One frame was not enough on Android: a point that changed size when picked
  // was imaged mid-layout, drew clipped, and vanished when unpicked.
  const [tracking, setTracking] = useState(true);

  const order = useMemo(() => labels.map((l) => ({ id: l.id, colour: l.colour })), [labels]);
  const shown = useMemo(() => points.filter((p) => pointPasses(p, pick)), [points, pick]);
  const spots = useMemo(() => shown.filter((p) => !p.approximate), [shown]);
  const areas = useMemo(() => shown.filter((p) => p.approximate), [shown]);
  const byKey = useMemo(() => new Map(points.map((p) => [p.key, p])), [points]);
  const picked = selected ? (byKey.get(selected) ?? null) : null;
  // Clustering follows the zoom alone, so a pan regroups nothing.
  const zoom = camera?.zoom ?? null;
  const groups = useMemo(() => {
    if (zoom === null) return spots.map((p) => ({ keys: [p.key] }));
    return cluster(spots.map((p) => ({ key: p.key, ...worldPixel(p, zoom) })));
  }, [spots, zoom]);
  const grouping = groups.map((g) => g.keys.join(",")).join("|");

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), TRACK_MS);
    return () => clearTimeout(timer);
  }, [selected, dark, order, grouping]);

  // The keyboard coming up closes the callout, and the map does not re-fit.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => onSelect(null));
    return () => sub.remove();
  }, [onSelect]);

  // Android says nothing when a map fails to load.
  useEffect(() => {
    if (!isAndroid || loaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, attempt]);

  // The opening fit, once a visit, to every point: never closer than street
  // level, and never again for a point that arrives while the map is open.
  useEffect(() => {
    if (!ready || fitted.current || points.length === 0 || size.width === 0) return;
    const fit = fitBounds(points, { width: size.width, height: size.height - bottom }, PADDING);
    map.current?.setCamera({ center: { latitude: fit.center.lat, longitude: fit.center.lng }, zoom: fit.zoom });
    setCamera(fit);
    fitted.current = true;
  }, [ready, points, size, bottom]);

  // A picked point's callout is kept inside the frame: the camera moves just
  // enough, only when the pick changes.
  useEffect(() => {
    const p = selected ? byKey.get(selected) : undefined;
    if (!p || !camera || size.width === 0) return;
    const view = { width: size.width, height: size.height - bottom };
    const { dx, dy } = calloutPan(screenOf(p, camera, view), view);
    if (!dx && !dy) return;
    const center = panned(camera, dx, dy);
    map.current?.animateCamera({ center: { latitude: center.lat, longitude: center.lng } }, { duration: cameraMs(reduced) });
    // Only the pick moves the camera; a re-read of the points does not.
  }, [selected]);

  function project(): void {
    if (!picked || !map.current) {
      setCalloutAt(null);
      return;
    }
    void map.current.pointForCoordinate({ latitude: picked.lat, longitude: picked.lng }).then(setCalloutAt, () => setCalloutAt(null));
  }
  useEffect(project, [picked, size]);
  // A change of padding (the place sheet, the keyboard) slides the map with
  // no region event, so the callout looks for its point again once the map
  // has moved (seen on iOS).
  useEffect(() => {
    const timer = setTimeout(project, 350);
    return () => clearTimeout(timer);
  }, [bottom]);

  function settle(region: Region): void {
    if (size.width === 0) return;
    setCamera({ center: { lat: region.latitude, lng: region.longitude }, zoom: zoomOf(region.longitudeDelta, size.width) });
    project();
  }

  if (failed || timedOut) {
    return (
      <View className="absolute inset-0 items-center justify-center bg-surface-page" style={{ gap: 10 }}>
        <Text className="font-core text-text-secondary" style={{ fontSize: 15 }}>
          Couldn&apos;t load the map
        </Text>
        <Pressable
          onPress={() => {
            setTimedOut(false);
            setAttempt((n) => n + 1);
            onRetry();
          }}
          accessibilityRole="button"
          className="items-center justify-center rounded-pill bg-surface-fill px-space-6"
          style={{ minHeight: 44 }}
        >
          <Text className="font-core font-medium text-text-primary" style={{ fontSize: 14 }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  const left = calloutAt ? Math.min(Math.max(calloutAt.x - CALLOUT_WIDTH / 2, 8), size.width - CALLOUT_WIDTH - 8) : 0;

  return (
    <View
      className="absolute inset-0"
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      pointerEvents={hidden ? "none" : "auto"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={hidden ? (isAndroid ? { transform: [{ translateX: 100_000 }] } : { opacity: 0 }) : undefined}
    >
      <MapView
        key={attempt}
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        {...(points[0]
          ? { initialRegion: { latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 0.05, longitudeDelta: 0.05 } }
          : {})}
        mapPadding={{ top: 0, right: 0, bottom, left: 0 }}
        paddingAdjustmentBehavior="never"
        userInterfaceStyle={dark ? "dark" : "light"}
        customMapStyle={isAndroid && dark ? darkStyle : []}
        toolbarEnabled={false}
        showsCompass={false}
        showsIndoors={false}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        onMapReady={() => setReady(true)}
        onMapLoaded={() => setLoaded(true)}
        onRegionChange={project}
        onRegionChangeComplete={settle}
        // A tap inside an area picks it; anything else closes the callout.
        // Tested here because neither map makes a circle reliably tappable.
        onPress={(event) => {
          if (event.nativeEvent.action === "marker-press") return;
          const at = event.nativeEvent.coordinate;
          const scale = metresPerPixel(at.latitude, camera?.zoom ?? 14);
          onSelect(hitCircle({ lat: at.latitude, lng: at.longitude }, areas.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng })), scale));
        }}
      >
        {areas.map((p) => {
          const colour = COLOR.labels[pointFill(p.labelIds, order).a ?? 0]!;
          const isPicked = p.key === selected;
          return (
            <Circle
              key={`${p.key}:${isPicked}:${dark}`}
              center={{ latitude: p.lat, longitude: p.lng }}
              radius={CIRCLE_METRES}
              fillColor={atOpacity(colour, isPicked ? 0.26 : 0.16)}
              strokeColor={atOpacity(colour, isPicked ? 1 : 0.7)}
              strokeWidth={isPicked ? 2.5 : 1.5}
            />
          );
        })}
        {/* An area's point at its centre, inside its circle: the owner's call
            on 2026-10-03. It is the area's named target too. Imaged after
            layout like any point: a marker imaged before its view has a size
            falls back to Google's red pin (seen on iOS). */}
        {areas.map((p) => {
          const fill = pointFill(p.labelIds, order);
          return (
            <Marker
              // A new marker when the pick changes: Android does not image a
              // marker view again at a new size, and the picked point drew
              // clipped, then left a sliver behind when unpicked.
              key={`area:${p.key}:${p.key === selected}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={p.key === selected ? 2 : 1}
              tracksViewChanges={tracking}
              accessibilityLabel={`${p.title}, ${kindWord(p.type)}`}
              onPress={() => onSelect(p.key)}
            >
              <View style={{ width: 44, height: 44 }} className="items-center justify-center">
                <PointDot a={fill.a} b={fill.b} shape={pointShape(p.type, p.source)} picked={p.key === selected} />
              </View>
            </Marker>
          );
        })}
        {groups.map((group) => {
          if (group.keys.length > 1) {
            const members = group.keys.map((k) => byKey.get(k)).filter((m): m is Point => Boolean(m));
            const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
            const lng = members.reduce((s, m) => s + m.lng, 0) / members.length;
            return (
              <Marker
                key={group.keys.join("|")}
                coordinate={{ latitude: lat, longitude: lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={tracking}
                accessibilityLabel={`Zoom in to ${members.length}`}
                onPress={() => {
                  const split = splitZoom(members, { width: size.width, height: size.height - bottom }, PADDING);
                  map.current?.animateCamera(
                    { center: { latitude: split.center.lat, longitude: split.center.lng }, zoom: split.zoom },
                    { duration: cameraMs(reduced) },
                  );
                }}
              >
                {/* The 44 target a point has, around the 24 dot. */}
                <View style={{ width: 44, height: 44 }} className="items-center justify-center">
                  <View
                    className="items-center justify-center rounded-pill bg-text-primary"
                    style={{ width: 24, height: 24, borderWidth: 2, borderColor: COLOR.paper, boxShadow: COLOR.shadowPoint }}
                  >
                    <Text className="font-core font-semibold text-surface-page" style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
                      {members.length}
                    </Text>
                  </View>
                </View>
              </Marker>
            );
          }
          const p = byKey.get(group.keys[0]!);
          if (!p) return null;
          const fill = pointFill(p.labelIds, order);
          return (
            <Marker
              // A new marker when the pick changes, as for an area above.
              key={`${p.key}:${p.key === selected}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={p.key === selected ? 2 : 1}
              tracksViewChanges={tracking}
              accessibilityLabel={`${p.title}, ${p.source === "calendar" ? "event" : kindWord(p.type)}`}
              onPress={() => onSelect(p.key)}
            >
              {/* The 44 target around a point. */}
              <View style={{ width: 44, height: 44 }} className="items-center justify-center">
                <PointDot a={fill.a} b={fill.b} shape={pointShape(p.type, p.source)} picked={p.key === selected} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {picked && calloutAt ? (
        <View
          pointerEvents="box-none"
          className="absolute"
          style={{ left, top: calloutAt.y - calloutHeight - CALLOUT_LIFT, opacity: calloutHeight ? 1 : 0 }}
        >
          <Callout point={picked} labels={labels} onOpen={onOpen} onHeight={setCalloutHeight} />
        </View>
      ) : null}

      {shown.length === 0 && points.length > 0 ? (
        <View pointerEvents="none" className="absolute inset-x-0 items-center" style={{ bottom: bottom + 24 }}>
          <Text
            className="overflow-hidden rounded-pill bg-surface-raised px-space-6 py-space-3 font-core font-medium text-text-primary"
            style={{ fontSize: 13 }}
          >
            {emptyLine(pickedNames)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
