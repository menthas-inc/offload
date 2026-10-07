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
// Where everything goes is `lib/memories-map.ts`, from the shared geometry in
// `@offload/widgets`. The camera is state; a pan, a pinch or a flight moves
// it and every mark is placed from it. The shape, tall or wide, is picked once
// from the map's first size and never reshuffles.

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useReducedMotion } from "react-native-reanimated";
import { Canvas, Circle, Fill, Group, Image as SkiaImage, RadialGradient, useImage, vec } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import { memoryAt, memoryWorld, type MemoryKindId, type MemoryView, type MemoryWorld, type MemoryWorldKind } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { usePlateInset } from "../shell/plate-inset";
import { atOpacity, useColors } from "../../lib/colors";
import { cameraMs } from "../../lib/motion";
import { kindColors } from "../../lib/memories";
import {
  CLOUD_REACH,
  DIMMED,
  clampCamera,
  dotFlight,
  everything,
  fitZoom,
  flightAt,
  focusKind,
  kindFlight,
  mapLabels,
  mapMarks,
  mapNothing,
  mapWide,
  openCamera,
  pillBox,
  pillTarget,
  screenOf,
  showsEverything,
  zoomAbout,
  zoomLevel,
  zoomStep,
  type Camera,
  type Size,
} from "../../lib/memories-map";

/** The map's pan starts this far in from either side, so the edge stays the
 *  system's: Android's back, and iOS's swipe between screens. */
const EDGE = 24;
/** A dot is drawn at 10 and answers to 44. */
const DOT = 10;
const DOT_SLOP = (44 - DOT) / 2;

export function MemoriesMap({
  memories,
  query,
  openId,
  onOpen,
  onFocusKind,
}: {
  memories: MemoryView[];
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
  // Picked once, when the map first has a size, and kept.
  const [wide, setWide] = useState<boolean | null>(null);
  const world = useMemo(() => memoryWorld(memories, wide ?? false), [memories, wide]);

  const [camera, setCamera] = useState<Camera | null>(null);
  const [min, setMin] = useState(0);
  const cameraRef = useRef<Camera | null>(null);
  cameraRef.current = camera;

  useEffect(() => {
    if (!size || wide === null || camera) return;
    const open = openCamera(world, size, memories.length);
    setMin(open.min);
    setCamera({ cx: open.cx, cy: open.cy, z: open.z });
  }, [size, wide, camera, world, memories.length]);

  // Which kind the camera is in, for the plus. Said only when it changes.
  const focused = camera ? focusKind(world, camera) : null;
  useEffect(() => {
    onFocusKind(focused);
  }, [focused, onFocusKind]);

  const flight = useRef(0);
  useEffect(() => () => cancelAnimationFrame(flight.current), []);
  const stopFlight = (): void => cancelAnimationFrame(flight.current);

  // The camera's duration, and a jump under reduced motion.
  const fly = (to: Camera): void => {
    stopFlight();
    const from = cameraRef.current;
    const ms = cameraMs(reduced);
    if (!from || ms === 0) return setCamera(to);
    const started = Date.now();
    const step = (): void => {
      const p = Math.min(1, (Date.now() - started) / ms);
      setCamera(flightAt(from, to, p));
      if (p < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  };

  // A pan from where the finger went down; a pinch about where the fingers
  // met. While two fingers are down the pan rebases, so lifting one never
  // jumps the map.
  const held = useRef({ pan: null as Camera | null, tx: 0, ty: 0, pinch: null as Camera | null, fx: 0, fy: 0 });
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(5)
    .hitSlop({ left: -EDGE, right: -EDGE })
    .onStart((event) => {
      stopFlight();
      held.current.pan = cameraRef.current;
      held.current.tx = event.translationX;
      held.current.ty = event.translationY;
    })
    .onUpdate((event) => {
      const g = held.current;
      if (!g.pan) return;
      if (g.pinch) {
        g.pan = cameraRef.current;
        g.tx = event.translationX;
        g.ty = event.translationY;
        return;
      }
      const from = g.pan;
      setCamera(clampCamera({ ...from, cx: from.cx - (event.translationX - g.tx) / from.z, cy: from.cy - (event.translationY - g.ty) / from.z }, world, min));
    })
    .onFinalize(() => {
      held.current.pan = null;
    });
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart((event) => {
      stopFlight();
      held.current.pinch = cameraRef.current;
      held.current.fx = event.focalX;
      held.current.fy = event.focalY;
    })
    .onUpdate((event) => {
      const g = held.current;
      if (!g.pinch || !size) return;
      setCamera(zoomAbout(g.pinch, g.fx, g.fy, g.pinch.z * event.scale, size, world, min));
    })
    .onFinalize(() => {
      held.current.pinch = null;
    });
  const gestures = Gesture.Simultaneous(pan, pinch);

  const nothing = mapNothing(memories, query);

  return (
    <View
      className="flex-1 overflow-hidden"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setSize({ width, height });
        if (wide === null) setWide(mapWide(width, height));
      }}
      // A named region, as the web's role="group": the buttons inside stay
      // their own stops, and the group is announced on the way in.
      role="group"
      accessibilityLabel="Map of memories"
    >
      {size && camera ? (
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
              <Group blendMode={dark ? "screen" : "multiply"} opacity={dark ? 0.6 : 1}>
                {world.kinds.map((k) => {
                  const hue = kindColors(k.kind, COLOR).dot;
                  const at = screenOf(camera, size, k.cx, k.cy);
                  const r = k.radius * camera.z * CLOUD_REACH;
                  return (
                    <Circle key={k.kind} cx={at.x} cy={at.y} r={r}>
                      <RadialGradient
                        c={vec(at.x, at.y)}
                        r={r}
                        colors={[atOpacity(hue, 0.34), atOpacity(hue, 0.14), atOpacity(hue, 0)]}
                        positions={[0, 0.45, 0.7]}
                      />
                    </Circle>
                  );
                })}
              </Group>
            </Canvas>

            <Marks
              memories={memories}
              world={world}
              camera={camera}
              size={size}
              query={query}
              onDot={(memory) => fly(dotFlight(memoryAt(world, memory), camera, world, min))}
              openId={openId}
              onOpen={onOpen}
            />

            <Labels world={world} camera={camera} size={size} onGo={(k) => fly(kindFlight(k, size, world, min))} />
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

      {size && camera ? (
        <>
          <View
            className="absolute items-center rounded-sm border border-border-hairline bg-surface-raised"
            style={{ right: 14, bottom: plate + 16, boxShadow: COLOR.shadowRaised }}
          >
            <Pressable
              onPress={() => fly(zoomStep(camera, 1, world, min))}
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
              <View className="rounded-pill" style={{ height: `${Math.max(6, zoomLevel(camera.z, min) * 100)}%`, backgroundColor: COLOR.secondary }} />
            </View>
            <Pressable
              onPress={() => fly(zoomStep(camera, -1, world, min))}
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
          {showsEverything(camera.z, fitZoom(world, size)) ? (
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

function Marks({
  memories,
  world,
  camera,
  size,
  query,
  onDot,
  openId,
  onOpen,
}: {
  memories: MemoryView[];
  world: MemoryWorld;
  camera: Camera;
  size: Size;
  query: string;
  onDot: (memory: MemoryView) => void;
  openId: string | null;
  onOpen: (memory: MemoryView) => void;
}) {
  const COLOR = useColors();
  const box = pillBox(camera.z);
  // Towards 44 only as far as the rows allow: at the sentence threshold they
  // are about 32 apart, and a 44 target would reach into the next one. The
  // box holds the slop, since Android delivers no touch outside a parent.
  const target = pillTarget(camera.z);
  const reach = box.height + 2 * target.slop;
  return (
    <>
      {mapMarks(memories, world, camera, size, query).map((mark) => {
        const hue = kindColors(mark.memory.kind, COLOR).dot;
        if (mark.shape === "dot") {
          return (
            <Pressable
              key={mark.memory.id}
              onPress={() => onDot(mark.memory)}
              hitSlop={DOT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={mark.label}
              style={{
                position: "absolute",
                left: mark.x - DOT / 2,
                top: mark.y - DOT / 2,
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
        // Centred on its point, in a box as tall as the pill can be. A
        // zero-height box collapsed the clamped sentence to nothing on iOS.
        return (
          <View
            key={mark.memory.id}
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: mark.x - box.maxWidth / 2,
              top: mark.y - reach / 2,
              width: box.maxWidth,
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
              accessibilityState={{ selected: mark.memory.id === openId }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                maxWidth: box.maxWidth,
                paddingVertical: box.padV,
                paddingHorizontal: box.padH,
                borderRadius: box.radius,
                // The open one ringed in its kind's ink, as the web's aria-current.
                borderWidth: mark.memory.id === openId ? 2 : 1,
                borderColor: mark.memory.id === openId ? kindColors(mark.memory.kind, COLOR).ink : atOpacity(hue, 0.3),
                backgroundColor: atOpacity(COLOR.raised, 0.92),
                boxShadow: mark.memory.id === openId ? COLOR.shadowPointPicked : COLOR.shadowPoint,
                opacity: mark.dim ? DIMMED : 1,
              }}
            >
              {mark.learned ? <Glyph name="sparkles" size={box.spark} color={COLOR.textNoticed} /> : null}
              {/* Clamped, so a long one never reaches the next row; the whole
                  sentence is the button's name and the editor's. */}
              <Text
                className="shrink font-core"
                numberOfLines={box.lines}
                style={{ fontSize: box.fontSize, lineHeight: box.fontSize * 1.3, color: COLOR.ink }}
              >
                {mark.memory.text}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

/** A label's box, wide enough for any kind's name and count, centred on its
 *  point. As tall as the label and its hit slop: iOS delivers no touch outside
 *  a parent's bounds, so a zero-height box made every label untappable. */
const LABEL_BOX = 240;
const LABEL_BOX_HEIGHT = 44;

function Labels({ world, camera, size, onGo }: { world: MemoryWorld; camera: Camera; size: Size; onGo: (k: MemoryWorldKind) => void }) {
  const COLOR = useColors();
  const { onScreen, dock } = mapLabels(world, camera, size);
  const go = (kind: MemoryKindId): void => {
    const k = world.kinds.find((one) => one.kind === kind);
    if (k) onGo(k);
  };
  return (
    <>
      {onScreen.map((l) => {
        const colors = kindColors(l.kind, COLOR);
        const ink = colors.filled ? COLOR.onSolid : colors.ink;
        return (
          <View
            key={l.kind}
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: l.x - LABEL_BOX / 2,
              top: l.y - LABEL_BOX_HEIGHT / 2,
              width: LABEL_BOX,
              height: LABEL_BOX_HEIGHT,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            <Pressable
              onPress={() => go(l.kind)}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel={l.label}
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
              <Glyph name={l.glyph} size={14} color={ink} />
              <Text className="font-core font-semibold" style={{ fontSize: 13, color: ink }}>
                {l.name}
              </Text>
              <Text className="font-core" style={{ fontSize: 13, color: ink, opacity: 0.85 }}>
                {l.count}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {dock.length ? (
        <View className="absolute flex-row flex-wrap" style={{ top: 10, left: 12, right: 12, gap: 6, zIndex: 3 }} pointerEvents="box-none">
          {dock.map((l) => {
            const colors = kindColors(l.kind, COLOR);
            const ink = colors.filled ? COLOR.onSolid : colors.ink;
            return (
              <Pressable
                key={l.kind}
                onPress={() => go(l.kind)}
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
    </>
  );
}
