// The design system's UndoLine (2026-10-18): the way back drawn where the
// change is. `slot` in the place a removed thing left, amber; `under` a thing
// that changed, grey; `plate` above the composer when nothing on screen did.
// A refusal is the same line with circle-alert, its clause and Retry, no rule,
// and is not red, as with Toast.

import { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { token } from "@offload/tokens";
import { RETURNED_MS, UNDO_MS, summaryWords, type ReplySummary, type UndoEntry } from "@offload/widgets";
import { useColors } from "../../lib/colors";
import { undoStore, useDrawn, useReturned, useUndoEntry } from "../../lib/undo";
import { Glyph } from "../Glyph";

const isAndroid = Platform.OS === "android";
/** The plate's corner, the web's too. */
const PLATE_RADIUS = parseFloat(token("radius-md"));

/** The clock: a 2px rule along the foot, full width to nothing over the
 *  window. It runs under reduced motion too, because it is information. */
function Clock({ startedAt, amber }: { startedAt: number; amber: boolean }) {
  const left = Math.max(0, UNDO_MS - (Date.now() - startedAt));
  const scale = useSharedValue(left / UNDO_MS);
  useEffect(() => {
    // Information, not decoration: it runs with reduced motion on too.
    scale.value = withTiming(0, { duration: left, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    // Once per window (keyed by it): a line drawn late starts from the time it has left.
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
  // Counted as on screen, so the plate does not draw it a second time.
  useDrawn(entry.form === "plate" ? null : entry.id);
  const slot = entry.form === "slot";
  const action = entry.action;
  const ink = slot ? "text-text-noticed" : isAndroid ? "text-a-on-var" : "text-text-secondary";
  const ground = slot
    ? "bg-surface-noticed-soft"
    : entry.form === "plate"
      ? "bg-surface-raised border border-border-hairline"
      : "";
  return (
    <Animated.View
      {...(still ? {} : { entering: FadeIn.duration(200), exiting: FadeOut.duration(240) })}
      accessibilityLiveRegion={entry.failed ? "assertive" : "polite"}
      accessibilityRole={entry.failed ? "alert" : undefined}
      className={`flex-row items-center overflow-hidden ${ground}`}
      style={{
        gap: 10,
        minHeight: height ?? (slot ? 56 : entry.form === "plate" ? 40 : 36),
        paddingLeft: entry.form === "under" ? 47 : 14,
        paddingRight: 4,
        borderRadius: entry.form === "plate" ? PLATE_RADIUS : radius,
      }}
    >
      <Glyph
        name={entry.failed ? "circle-alert" : entry.icon}
        size={entry.form === "under" ? 14 : 16}
        color={slot ? COLOR.textNoticed : COLOR.quiet}
      />
      <Text
        numberOfLines={entry.wrap ? undefined : 1}
        className={`flex-1 font-core ${ink}`}
        style={entry.wrap ? { fontSize: 14, paddingVertical: 8 } : { fontSize: 14 }}
      >
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
      {entry.failed ? null : <Clock key={entry.startedAt} startedAt={entry.startedAt} amber={slot} />}
    </Animated.View>
  );
}

/** 052. The glyph for what a turn did. */
const DID: Record<ReplySummary["kind"], string> = {
  new: "plus",
  filed: "lasso",
  moved: "lasso",
  ticked: "check",
  changed: "pencil",
  started: "lasso",
  remembered: "cloudy",
  added: "plus",
};

/** 052. The fourth form, **turn**, at the foot of a reply: what the turn did,
 *  in moss, and Undo. Not a store entry like the other three, because it
 *  outlives eight seconds: early it carries 043's clock and takes the whole
 *  turn back; late it stays, with no clock, until the next dump retires it.
 *  A refusal is the same line with circle-alert and Retry; a late Undo that
 *  would take an event off a calendar others see asks first, in its place. */
export function TurnLine({
  summary,
  phase,
  startedAt,
  folded,
  ask,
  failed,
  onUndo,
  onConfirm,
  onDecline,
}: {
  summary: ReplySummary;
  phase: "early" | "late" | "retired";
  startedAt: number | null;
  /** A late Undo landed: the changed line, and nothing to press. */
  folded?: string | undefined;
  /** A late Undo that has to ask first: the outward line. */
  ask?: string | undefined;
  failed?: boolean | undefined;
  onUndo: () => void;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const COLOR = useColors();
  const action =
    folded !== undefined || phase === "retired"
      ? null
      : ask
        ? { label: "Undo", run: onConfirm }
        : failed
          ? { label: "Retry", run: onUndo }
          : { label: "Undo", run: onUndo };
  return (
    <View
      accessibilityLiveRegion={failed ? "assertive" : "polite"}
      accessibilityRole={failed ? "alert" : undefined}
      className="flex-row items-center overflow-hidden"
      style={{ gap: 8, minHeight: 44 }}
    >
      <Glyph name={failed ? "circle-alert" : DID[summary.kind]} size={14} color={ask || failed ? COLOR.quiet : COLOR.accent} />
      <Text
        className={`flex-1 font-core ${ask ? (isAndroid ? "text-a-on-var" : "text-text-secondary") : "font-medium text-text-accent"}`}
        style={{ fontSize: 12.5, lineHeight: 17.5 }}
      >
        {folded ?? ask ?? summaryWords(summary)}
      </Text>
      {ask ? (
        <Pressable onPress={onDecline} accessibilityRole="button" className="items-center justify-center" style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 6 }}>
          <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
            Not now
          </Text>
        </Pressable>
      ) : null}
      {action ? (
        <Pressable onPress={action.run} accessibilityRole="button" className="items-center justify-center" style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 6 }}>
          <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 13 }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
      {phase === "early" && startedAt !== null && !failed && !ask && folded === undefined ? <Clock key={startedAt} startedAt={startedAt} amber={false} /> : null}
    </View>
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
