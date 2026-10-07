// 040 part D. The memories as a map: each kind a cloud of its hue, and inside
// it memories that mean similar things near each other, one row each. From
// the kit's `mapH()`, `fly()` and `zoomAt()`, and the web's `MemoriesMap.tsx`,
// whose behaviour this matches.
//
// **Skia paints, React Native presses.** The ground and the clouds are one
// canvas, blended onto the paper: multiplied in light, screened at lower
// strength in dark (owner, 2026-10-06). Every dot, pill and label over it is
// a real button named by its sentence and kind, in list order, so the map is
// never only a picture.
//
// **Built for 300 on a phone (2026-10-07).**
//   - The camera is three shared values on the UI thread. A pan, a pinch and
//     a flight move them in worklets, and nothing crosses to JS per frame.
//   - Every mark sits in one world layer whose transform is the camera, so a
//     frame moves one view, and the canvas's clouds read the same values.
//   - The layer is laid out at the settled zoom and scales by the live one
//     over it; once the camera settles React lays it out again at scale 1, so
//     a pinch stretches the type for its length and it snaps sharp after.
//   - React re-renders on discrete changes only: the threshold crossed, the
//     camera settled, or the screen leaving the window of marks last mounted,
//     which is how marks stream in while panning.
//   - Only marks inside that window are mounted, each memoised, so a
//     recompute mounts what enters and unmounts what leaves.
// Off-screen marks are therefore not in the accessibility tree; the list is
// the complete accessible view, as the spec has it.
//
// Where everything goes is `lib/memories-map.ts`, from the shared geometry in
// `@offload/widgets`. The shape, tall or wide, is picked once from the map's
// first size and never reshuffles.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Canvas, Circle, Fill, Group, Image as SkiaImage, RadialGradient, useImage, vec, type Transforms3d } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import { MAP_ZOOM, memoryAt, memoryWorld, toSecondPerson, type MemoryKindId, type MemoryKindPlace, type MemoryView, type MemoryWorldKind } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { usePlateInset } from "../shell/plate-inset";
import { atOpacity, useColors } from "../../lib/colors";
import { cameraMs } from "../../lib/motion";
import { kindColors } from "../../lib/memories";
import {
  CLOUD_REACH,
  DIMMED,
  cardOf,
  clampCamera,
  crossesSentences,
  cullWindow,
  dotFlight,
  everything,
  fitZoom,
  flightAt,
  focusKind,
  kindFlight,
  kindLabel,
  labelAnchor,
  layerTransform,
  mapLabels,
  mapMarks,
  mapNothing,
  needsRecull,
  openCamera,
  pillTarget,
  settle,
  showsEverything,
  zoomAbout,
  zoomLevel,
  zoomStep,
  type Camera,
  type Mark,
  type Rect,
  type Size,
} from "../../lib/memories-map";

/** The map's pan starts this far in from either side, so the edge stays the
 *  system's: Android's back, and iOS's swipe between screens. */
const EDGE = 24;
/** A dot is drawn at 10 and answers to 44. */
const DOT = 10;
const DOT_SLOP = (44 - DOT) / 2;
/** Room around the world inside the layer, for a pill or a label that reaches
 *  past the world's edge: a touch outside a parent's bounds is not delivered. */
const PAD = 240;

type Box = ReturnType<typeof settle>["box"];

interface Settled {
  camera: Camera;
  zs: number;
  near: boolean;
  box: Box;
  window: Rect;
}

/** A phone's canvas before it has a size: tall. */
const TALL = 0.6;

export function MemoriesMap({
  memories,
  places = [],
  query,
  openId,
  onOpen,
  onFocusKind,
}: {
  memories: MemoryView[];
  /** Where each kind's cloud sits, from last night's layout. */
  places?: MemoryKindPlace[];
  query: string;
  /** The memory open in the editor, whose pill says so. */
  openId: string | null;
  onOpen: (memory: MemoryView) => void;
  /** The kind the camera is zoomed into, or null: the plus preselects it. */
  onFocusKind: (kind: MemoryKindId | null) => void;
}) {
  const COLOR = useColors();
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const reduced = useReducedMotion();
  const plate = usePlateInset();
  const ground = useImage(require("../../assets/prism/oil-ground.png"));

  const [size, setSize] = useState<Size | null>(null);
  // The canvas's shape, taken once when the map first has a size, and kept.
  const [aspect, setAspect] = useState<number | null>(null);
  const world = useMemo(() => memoryWorld(memories, aspect ?? TALL, places), [memories, aspect, places]);
  const [min, setMin] = useState<number>(MAP_ZOOM.min);

  // The camera, on the UI thread.
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const z = useSharedValue(1);
  /** The zoom the layer is laid out at: it scales by z over this. */
  const zs = useSharedValue(1);
  const sw = useSharedValue(1);
  const sh = useSharedValue(1);
  const bw = useSharedValue(1);
  const bh = useSharedValue(1);
  const minZ = useSharedValue<number>(MAP_ZOOM.min);
  /** The window of marks last mounted, in world units. */
  const win = useSharedValue<Rect>({ left: 0, top: 0, right: 0, bottom: 0 });
  const ready = useSharedValue(false);

  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!size) return;
    sw.value = size.width;
    sh.value = size.height;
  }, [size, sw, sh]);

  /** The camera came to rest: lay the layer out at its zoom, snap the type,
   *  and mount the marks around it. */
  const settleAt = useCallback(
    (x: number, y: number, zoom: number) => {
      if (!size) return;
      const camera = { cx: x, cy: y, z: zoom };
      const next = settle(camera, size);
      win.value = next.window;
      setSettled({ camera, ...next });
    },
    [size, win],
  );

  /** The screen left the window: mount around where it is, at the same
   *  layout zoom, so nothing already mounted moves. */
  const recullAt = useCallback(
    (x: number, y: number, zoom: number) => {
      if (!size) return;
      const camera = { cx: x, cy: y, z: zoom };
      const window = cullWindow(camera, size);
      win.value = window;
      setSettled((prev) => (prev ? { ...prev, camera, window } : prev));
    },
    [size, win],
  );

  // The layout zoom moves only once React has laid the marks out at it.
  const settledZoom = settled?.zs ?? null;
  useLayoutEffect(() => {
    if (settledZoom !== null) zs.value = settledZoom;
  }, [settledZoom, zs]);

  // Open once, on the first size; after that, keep the camera in a world
  // that a memory added or forgotten has changed.
  const opened = useRef(false);
  useEffect(() => {
    bw.value = world.width;
    bh.value = world.height;
    if (!size || aspect === null) return;
    if (!opened.current) {
      opened.current = true;
      const open = openCamera(world, size, memories.length);
      minZ.value = open.min;
      setMin(open.min);
      cx.value = open.cx;
      cy.value = open.cy;
      z.value = open.z;
      settleAt(open.cx, open.cy, open.z);
      ready.value = true;
      return;
    }
    const kept = clampCamera({ cx: cx.value, cy: cy.value, z: z.value }, world, minZ.value);
    cx.value = kept.cx;
    cy.value = kept.cy;
    settleAt(kept.cx, kept.cy, kept.z);
    // Not on `memories.length` or `settleAt`: `world` already follows the one
    // and `size` the other.
  }, [world, size, aspect]);

  // The discrete changes, heard on the UI thread and told to React once.
  useAnimatedReaction(
    () => ({ x: cx.value, y: cy.value, zoom: z.value }),
    (now, before) => {
      if (!ready.value) return;
      if (before && crossesSentences(before.zoom, now.zoom)) {
        runOnJS(settleAt)(now.x, now.y, now.zoom);
        return;
      }
      const camera = { cx: now.x, cy: now.y, z: now.zoom };
      const screen = { width: sw.value, height: sh.value };
      if (needsRecull(win.value, camera, screen)) {
        // Taken here at once, so the next frame does not ask again.
        win.value = cullWindow(camera, screen);
        runOnJS(recullAt)(now.x, now.y, now.zoom);
      }
    },
  );

  // Which kind the camera is in, for the plus. Said only when it changes.
  const focused = settled ? focusKind(world, settled.camera) : null;
  useEffect(() => {
    onFocusKind(focused);
  }, [focused, onFocusKind]);

  // A flight: progress on the UI thread, the camera read from it each frame.
  const progress = useSharedValue(1);
  const flying = useSharedValue(false);
  const from = useSharedValue<Camera>({ cx: 0, cy: 0, z: 1 });
  const to = useSharedValue<Camera>({ cx: 0, cy: 0, z: 1 });
  useAnimatedReaction(
    () => progress.value,
    (p) => {
      if (!flying.value) return;
      const c = flightAt(from.value, to.value, p);
      cx.value = c.cx;
      cy.value = c.cy;
      z.value = c.z;
    },
  );

  const fly = useCallback(
    (target: Camera) => {
      cancelAnimation(progress);
      // The camera's duration, and a jump under reduced motion.
      const ms = cameraMs(reduced);
      if (ms === 0) {
        flying.value = false;
        cx.value = target.cx;
        cy.value = target.cy;
        z.value = target.z;
        settleAt(target.cx, target.cy, target.z);
        return;
      }
      from.value = { cx: cx.value, cy: cy.value, z: z.value };
      to.value = target;
      flying.value = true;
      progress.value = 0;
      progress.value = withTiming(1, { duration: ms, easing: Easing.linear }, (done) => {
        if (!done) return;
        flying.value = false;
        runOnJS(settleAt)(target.cx, target.cy, target.z);
      });
    },
    [reduced, settleAt, progress, flying, from, to, cx, cy, z],
  );

  const current = useCallback((): Camera => ({ cx: cx.value, cy: cy.value, z: z.value }), [cx, cy, z]);

  // A pan from where the finger went down; a pinch about where the fingers
  // met. While two fingers are down the pan rebases, so lifting one never
  // jumps the map. Worklets, every one: nothing here reaches JS per frame.
  const panFrom = useSharedValue<Camera>({ cx: 0, cy: 0, z: 1 });
  const panAt = useSharedValue<[number, number]>([0, 0]);
  const pinchFrom = useSharedValue<Camera>({ cx: 0, cy: 0, z: 1 });
  const focal = useSharedValue<[number, number]>([0, 0]);
  const panning = useSharedValue(false);
  const pinching = useSharedValue(false);

  const pan = Gesture.Pan()
    .minDistance(5)
    .hitSlop({ left: -EDGE, right: -EDGE })
    .onStart((event) => {
      cancelAnimation(progress);
      flying.value = false;
      panning.value = true;
      panFrom.value = { cx: cx.value, cy: cy.value, z: z.value };
      panAt.value = [event.translationX, event.translationY];
    })
    .onUpdate((event) => {
      if (pinching.value) {
        panFrom.value = { cx: cx.value, cy: cy.value, z: z.value };
        panAt.value = [event.translationX, event.translationY];
        return;
      }
      const start = panFrom.value;
      const c = clampCamera(
        { cx: start.cx - (event.translationX - panAt.value[0]) / start.z, cy: start.cy - (event.translationY - panAt.value[1]) / start.z, z: start.z },
        { width: bw.value, height: bh.value },
        minZ.value,
      );
      cx.value = c.cx;
      cy.value = c.cy;
    })
    .onEnd(() => {
      panning.value = false;
      if (!pinching.value) runOnJS(settleAt)(cx.value, cy.value, z.value);
    })
    .onFinalize(() => {
      panning.value = false;
    });
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      cancelAnimation(progress);
      flying.value = false;
      pinching.value = true;
      pinchFrom.value = { cx: cx.value, cy: cy.value, z: z.value };
      focal.value = [event.focalX, event.focalY];
    })
    .onUpdate((event) => {
      const start = pinchFrom.value;
      const c = zoomAbout(
        start,
        focal.value[0],
        focal.value[1],
        start.z * event.scale,
        { width: sw.value, height: sh.value },
        { width: bw.value, height: bh.value },
        minZ.value,
      );
      cx.value = c.cx;
      cy.value = c.cy;
      z.value = c.z;
    })
    .onEnd(() => {
      pinching.value = false;
      if (!panning.value) runOnJS(settleAt)(cx.value, cy.value, z.value);
    })
    .onFinalize(() => {
      pinching.value = false;
    });
  const gestures = Gesture.Simultaneous(pan, pinch);

  // One transform a frame, for the marks and the labels.
  const layer = useAnimatedStyle(() => {
    const t = layerTransform({ cx: cx.value, cy: cy.value, z: z.value }, zs.value, { width: sw.value, height: sh.value });
    return {
      transform: [{ translateX: t.translateX - t.scale * PAD }, { translateY: t.translateY - t.scale * PAD }, { scale: t.scale }],
    };
  });
  // The same camera for the canvas: the clouds are drawn in world units.
  const cloudTransform = useDerivedValue<Transforms3d>(() => [
    { translateX: sw.value / 2 - cx.value * z.value },
    { translateY: sh.value / 2 - cy.value * z.value },
    { scale: z.value },
  ]);
  const level = useAnimatedStyle(() => ({ height: `${Math.max(6, zoomLevel(z.value, minZ.value) * 100)}%` }));

  // Stable, so a memoised mark is not re-rendered for a new closure.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const worldRef = useRef(world);
  worldRef.current = world;
  const openMark = useCallback((memory: MemoryView) => onOpenRef.current(memory), []);
  const flyToDot = useCallback(
    (memory: MemoryView) => fly(dotFlight(memoryAt(worldRef.current, memory), current(), worldRef.current, minZ.value)),
    [fly, current, minZ],
  );
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const goTo = useCallback(
    (kind: MemoryKindId) => {
      const k = worldRef.current.kinds.find((one) => one.kind === kind);
      if (k && sizeRef.current) fly(kindFlight(k, sizeRef.current, worldRef.current, minZ.value));
    },
    [fly, minZ],
  );

  // A mark's name is its sentence, read to the person it is about (F4).
  const marks = useMemo(
    () => (settled ? mapMarks(memories, world, settled.window, settled.zs, query).map((m) => ({ ...m, label: toSecondPerson(m.label) })) : []),
    [memories, world, settled, query],
  );
  // One object per layout zoom, so a window move keeps every mark's props equal.
  const box = useMemo(() => settled?.box ?? null, [settledZoom]); // `settled.box` is made from `settledZoom`.

  const nothing = mapNothing(memories, query);
  const dock = settled && size ? mapLabels(world, settled.camera, size).dock : [];

  return (
    <View
      className="flex-1 overflow-hidden"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setSize({ width, height });
        if (aspect === null) setAspect(width / height);
      }}
      // A named region, as the web's role="group": the buttons inside stay
      // their own stops, and the group is announced on the way in.
      role="group"
      accessibilityLabel="Map of memories"
    >
      {size && settled && box ? (
        <GestureDetector gesture={gestures}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Fill color={COLOR.page} />
              {ground ? (
                <SkiaImage
                  image={ground}
                  fit="cover"
                  x={-size.width * 0.1}
                  y={-size.height * 0.1}
                  width={size.width * 1.2}
                  height={size.height * 1.2}
                  opacity={dark ? 0.08 : 0.22}
                  blendMode={dark ? "screen" : "multiply"}
                />
              ) : null}
              <Group transform={cloudTransform} blendMode={dark ? "screen" : "multiply"} opacity={dark ? 0.6 : 1}>
                {world.kinds.map((k) => {
                  const hue = kindColors(k.kind, COLOR).dot;
                  return (
                    <Circle key={k.kind} cx={k.cx} cy={k.cy} r={k.radius * CLOUD_REACH}>
                      <RadialGradient
                        c={vec(k.cx, k.cy)}
                        r={k.radius * CLOUD_REACH}
                        colors={[atOpacity(hue, 0.34), atOpacity(hue, 0.14), atOpacity(hue, 0)]}
                        positions={[0, 0.45, 0.7]}
                      />
                    </Circle>
                  );
                })}
              </Group>
            </Canvas>

            <Animated.View
              pointerEvents="box-none"
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: world.width * settled.zs + 2 * PAD,
                  height: world.height * settled.zs + 2 * PAD,
                  transformOrigin: "left top",
                },
                layer,
              ]}
            >
              {marks.map((mark) => (
                <MapMark key={mark.memory.id} mark={mark} box={box} zs={settled.zs} open={mark.memory.id === openId} onDot={flyToDot} onOpen={openMark} />
              ))}
              {world.kinds.map((k) => (
                <KindLabel key={k.kind} k={k} near={settled.near} zs={settled.zs} onGo={goTo} />
              ))}
            </Animated.View>

            {dock.length ? (
              <View className="absolute flex-row flex-wrap" style={{ top: 10, left: 12, right: 12, gap: 6, zIndex: 3 }} pointerEvents="box-none">
                {dock.map((l) => {
                  const colors = kindColors(l.kind, COLOR);
                  const ink = colors.filled ? COLOR.onSolid : colors.ink;
                  return (
                    <Pressable
                      key={l.kind}
                      onPress={() => goTo(l.kind)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={l.label}
                      className="flex-row items-center rounded-pill"
                      style={{
                        minHeight: 28,
                        gap: 6,
                        paddingLeft: 12,
                        paddingRight: 10,
                        backgroundColor: colors.filled ? COLOR.inverse : COLOR.raised,
                        boxShadow: COLOR.shadowRaised,
                        ...(colors.filled ? {} : { borderWidth: 1.5, borderColor: colors.ink }),
                      }}
                    >
                      <Text className="font-core font-semibold" style={{ fontSize: 13, color: ink }}>
                        {l.name}
                      </Text>
                      <View style={{ transform: [{ rotate: `${l.turn.toFixed(0)}deg` }] }}>
                        <Glyph name="arrow-up" size={13} color={ink} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </GestureDetector>
      ) : null}

      {nothing ? (
        <View className="absolute inset-x-0 items-center px-gutter-screen" style={{ top: "50%" }} pointerEvents="none">
          <Text className="text-center font-core text-text-tertiary" style={{ fontSize: 13.5, lineHeight: 19.6 }}>
            {nothing}
          </Text>
        </View>
      ) : null}

      {size && settled ? (
        <>
          <View
            className="absolute items-center rounded-sm border border-border-hairline bg-surface-raised"
            style={{ right: 14, bottom: plate + 16, boxShadow: COLOR.shadowRaised }}
          >
            <Pressable
              onPress={() => fly(zoomStep(current(), 1, world, min))}
              hitSlop={3}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              className="items-center justify-center"
              style={{ width: 38, height: 38 }}
            >
              <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 18 }}>
                +
              </Text>
            </Pressable>
            <View className="rounded-pill bg-surface-fill" style={{ width: 4, height: 46, justifyContent: "flex-end" }}>
              <Animated.View className="rounded-pill" style={[{ backgroundColor: COLOR.secondary }, level]} />
            </View>
            <Pressable
              onPress={() => fly(zoomStep(current(), -1, world, min))}
              hitSlop={3}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              className="items-center justify-center"
              style={{ width: 38, height: 38 }}
            >
              <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 18 }}>
                {"−"}
              </Text>
            </Pressable>
          </View>
          {showsEverything(settled.camera.z, fitZoom(world, size)) ? (
            <Pressable
              onPress={() => fly(everything(world, size, min))}
              hitSlop={5}
              accessibilityRole="button"
              className="absolute justify-center rounded-pill border border-border-hairline bg-surface-raised px-space-6"
              style={{ left: 14, bottom: plate + 16, minHeight: 34, boxShadow: COLOR.shadowRaised }}
            >
              <Text className="font-core font-medium text-text-primary" style={{ fontSize: 13.5 }}>
                Everything
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

interface MarkProps {
  mark: Mark;
  box: Box;
  /** The zoom the layer is laid out at, which sizes the card. */
  zs: number;
  open: boolean;
  onDot: (memory: MemoryView) => void;
  onOpen: (memory: MemoryView) => void;
}

/** Equal when it would draw the same: a new window keeps every mark already
 *  mounted, since its place, shape and type are the same. */
function sameMark(a: MarkProps, b: MarkProps): boolean {
  return (
    a.mark.memory === b.mark.memory &&
    a.mark.x === b.mark.x &&
    a.mark.y === b.mark.y &&
    a.mark.shape === b.mark.shape &&
    a.mark.dim === b.mark.dim &&
    a.mark.label === b.mark.label &&
    a.box === b.box &&
    a.zs === b.zs &&
    a.open === b.open &&
    a.onDot === b.onDot &&
    a.onOpen === b.onOpen
  );
}

/** One memory on the map, placed in the world layer. */
const MapMark = memo(function MapMark({ mark, box, zs, open, onDot, onOpen }: MarkProps) {
  const COLOR = useColors();
  const hue = kindColors(mark.memory.kind, COLOR).dot;
  if (mark.shape === "dot") {
    return (
      <Pressable
        onPress={() => onDot(mark.memory)}
        hitSlop={DOT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={mark.label}
        style={{
          position: "absolute",
          left: mark.x + PAD - DOT / 2,
          top: mark.y + PAD - DOT / 2,
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: hue,
          // The paper ring, amber when offload learned it.
          boxShadow: `0 0 0 2.5px ${mark.learned ? COLOR.noticed : atOpacity(COLOR.raised, 0.85)}, ${COLOR.shadowPoint}`,
          opacity: mark.dim ? DIMMED : 1,
        }}
      />
    );
  }
  // Centred on its point, in a box as tall as the card. A zero-height box
  // collapsed the clamped sentence to nothing on iOS.
  //
  // Its own shape: one line when short, two when not, as wide as its words.
  // Stored about the person, read to them (F4), and sized by what is read.
  const said = toSecondPerson(mark.memory.text);
  const card = cardOf({ ...mark.memory, text: said }, zs);
  // Towards 44 only as far as the layout's gap allows, by the card's own
  // height. The box holds the slop, since a touch outside a parent is not
  // delivered.
  const target = pillTarget(card.height, zs);
  const reach = card.height + 2 * target.slop;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: mark.x + PAD - card.width / 2,
        top: mark.y + PAD - reach / 2,
        width: card.width,
        height: reach,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
      }}
    >
      <Pressable
        onPress={() => onOpen(mark.memory)}
        hitSlop={{ top: target.slop, bottom: target.slop }}
        accessibilityRole="button"
        accessibilityLabel={mark.label}
        accessibilityState={{ selected: open }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          width: card.width,
          paddingVertical: box.padV,
          paddingHorizontal: box.padH,
          borderRadius: box.radius,
          // The open one ringed in its kind's ink, as the web's aria-current.
          borderWidth: open ? 2 : 1,
          borderColor: open ? kindColors(mark.memory.kind, COLOR).ink : atOpacity(hue, 0.3),
          backgroundColor: atOpacity(COLOR.raised, 0.92),
          boxShadow: open ? COLOR.shadowPointPicked : COLOR.shadowPoint,
          opacity: mark.dim ? DIMMED : 1,
        }}
      >
        {mark.learned ? <Glyph name="sparkles" size={box.spark} color={COLOR.textNoticed} /> : null}
        {/* Clamped, so a long one never reaches the next row; the whole
            sentence is the button's name and the editor's. */}
        <Text
          className="shrink font-core"
          numberOfLines={card.lines}
          // Balanced, as the web's lines are. Android's prop; iOS ignores it.
          textBreakStrategy="balanced"
          style={{ fontSize: box.fontSize, lineHeight: box.fontSize * 1.3, color: COLOR.ink }}
        >
          {said}
        </Text>
      </Pressable>
    </View>
  );
}, sameMark);

/** A label's box, wide enough for any kind's name and count, centred on its
 *  point. As tall as the label and its hit slop: iOS delivers no touch outside
 *  a parent's bounds, so a zero-height box made every label untappable. */
const LABEL_BOX = 240;
const LABEL_BOX_HEIGHT = 44;

/** A kind's label over its cloud, in the world layer so it moves with it. */
const KindLabel = memo(function KindLabel({ k, near, zs, onGo }: { k: MemoryWorldKind; near: boolean; zs: number; onGo: (kind: MemoryKindId) => void }) {
  const COLOR = useColors();
  const words = kindLabel(k);
  if (!words) return null;
  const at = labelAnchor(k, near);
  const colors = kindColors(k.kind, COLOR);
  const ink = colors.filled ? COLOR.onSolid : colors.ink;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: at.x * zs + PAD - LABEL_BOX / 2,
        top: at.y * zs + PAD - LABEL_BOX_HEIGHT / 2,
        width: LABEL_BOX,
        height: LABEL_BOX_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
      }}
    >
      <Pressable
        onPress={() => onGo(k.kind)}
        hitSlop={7}
        accessibilityRole="button"
        accessibilityLabel={words.label}
        className="flex-row items-center rounded-pill"
        style={{
          minHeight: 30,
          gap: 6,
          paddingLeft: 10,
          paddingRight: 12,
          backgroundColor: colors.filled ? COLOR.inverse : colors.soft,
          ...(colors.filled ? {} : { borderWidth: 1, borderColor: atOpacity(colors.dot, 0.3) }),
        }}
      >
        <Glyph name={words.glyph} size={14} color={ink} />
        <Text className="font-core font-semibold" style={{ fontSize: 13, color: ink }}>
          {words.name}
        </Text>
        <Text className="font-core" style={{ fontSize: 13, color: ink, opacity: 0.85 }}>
          {k.count}
        </Text>
      </Pressable>
    </View>
  );
});
