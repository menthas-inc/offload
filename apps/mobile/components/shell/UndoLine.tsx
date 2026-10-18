// The design system's UndoLine (2026-10-18): the way back drawn where the
// change is. `slot` in the place a removed thing left, amber; `under` a thing
// that changed, grey; `plate` above the composer when nothing on screen did.
// A refusal is the same line with circle-alert, its clause and Retry, no rule,
// and is not red, as with Toast.

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { RETURNED_MS, UNDO_MS, type UndoEntry } from "@offload/widgets";
import { useColors } from "../../lib/colors";
import { undoStore, useReturned, useUndoEntry } from "../../lib/undo";
import { Glyph } from "../Glyph";

/** The clock: a 2px rule along the foot, full width to nothing over the
 *  window. It runs under reduced motion too, because it is information. */
function Clock({ startedAt, amber }: { startedAt: number; amber: boolean }) {
  const left = Math.max(0, UNDO_MS - (Date.now() - startedAt));
  const scale = useSharedValue(left / UNDO_MS);
  useEffect(() => {
    scale.value = withTiming(0, { duration: left, easing: Easing.linear });
    // Once per line: a line drawn late starts from the time it has left.
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      className={`absolute inset-x-0 bottom-0 ${amber ? "bg-surface-noticed" : "bg-border-strong"}`}
      style={[{ height: 2, transformOrigin: "left" }, style]}
    />
  );
}

export function UndoLine({
  entry,
  radius = 0,
  height,
}: {
  entry: UndoEntry;
  radius?: number | undefined;
  /** A slot's height when it replaces something shorter than a row: a chip. */
  height?: number | undefined;
}) {
  const COLOR = useColors();
  const still = useReducedMotion();
  const slot = entry.form === "slot";
  const action = entry.action;
  const ink = slot ? "text-text-noticed" : "text-text-secondary";
  const ground = slot
    ? "bg-surface-noticed-soft"
    : entry.form === "plate"
      ? "bg-surface-raised border border-border-hairline"
      : "";
  return (
    <Animated.View
      {...(still ? {} : { entering: FadeIn.duration(200) })}
      accessibilityLiveRegion={entry.failed ? "assertive" : "polite"}
      accessibilityRole={entry.failed ? "alert" : undefined}
      className={`flex-row items-center overflow-hidden ${ground}`}
      style={{
        gap: 10,
        minHeight: height ?? (slot ? 56 : entry.form === "plate" ? 40 : 36),
        paddingLeft: entry.form === "under" ? 47 : 14,
        paddingRight: 4,
        borderRadius: entry.form === "plate" ? 12 : radius,
      }}
    >
      <Glyph
        name={entry.failed ? "circle-alert" : entry.icon}
        size={entry.form === "under" ? 14 : 16}
        color={slot ? COLOR.textNoticed : COLOR.quiet}
      />
      <Text numberOfLines={1} className={`flex-1 font-core ${ink}`} style={{ fontSize: 14 }}>
        {entry.message}
      </Text>
      {action ? (
        <Pressable
          onPress={() => {
            undoStore.drop(entry.id, { returned: action.label === "Undo" });
            void action.onPress();
          }}
          accessibilityRole="button"
          className="items-center justify-center"
          style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 10 }}
        >
          <Text
            className={`font-core font-medium ${slot ? "text-text-noticed underline" : "text-text-accent"}`}
            style={{ fontSize: 14 }}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
      {entry.failed ? null : <Clock startedAt={entry.startedAt} amber={slot} />}
    </Animated.View>
  );
}

/** The lines for changes made off screen, stacked above the composer. */
export function UndoPlates({ entries }: { entries: UndoEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <View className="gap-space-3">
      {entries.map((entry) => (
        <UndoLine key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

/** The line for one id at a fixed spot, when there is one. */
export function UndoAt({ id, radius }: { id: string; radius?: number | undefined }) {
  const entry = useUndoEntry(id);
  return entry ? <UndoLine entry={entry} radius={radius} /> : null;
}

/** A thing Undo just brought back, softly lit for a moment where it returned. */
export function Returned({ id, children }: { id: string; children: React.ReactNode }) {
  const returned = useReturned();
  return returned(id) ? <ReturnedGlow>{children}</ReturnedGlow> : <>{children}</>;
}

function ReturnedGlow({ children }: { children: React.ReactNode }) {
  const still = useReducedMotion();
  const glow = useSharedValue(still ? 0 : 1);
  useEffect(() => {
    glow.value = withTiming(0, { duration: RETURNED_MS, easing: Easing.out(Easing.quad) });
  }, []);
  const veil = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View>
      <Animated.View pointerEvents="none" className="absolute inset-0 bg-surface-attention-soft" style={veil} />
      {children}
    </View>
  );
}
