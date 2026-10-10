// Customize Today. 027, from `TodayParts.jsx`'s `CustomizeSheet`.
//
// Needs you, with a grip and its four kinds switched one by one; Your day,
// Reminders (042) and Open in your threads, each with a grip and a switch. The sections drag to
// reorder; the kinds keep
// their order, which is the server's. A drag or a switch applies at once and
// is written as it settles, one write per gesture, and a write that fails puts
// the sheet back. The last switch on cannot be switched off, so Today is never
// blank. Reset returns the defaults.

import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { TODAY_REMINDERS } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { Switch } from "../settings/Switch";
import { DragSheet } from "../shell/DragSheet";
import { useColors } from "../../lib/colors";
import {
  DEFAULT_LAYOUT,
  PARTS,
  canSwitchOff,
  dayOn,
  moveSection,
  openThreadsOn,
  partOn,
  remindersOn,
  setSwitch,
  type Layout,
  type Part,
  type SectionSwitch,
} from "../../lib/today";

const isAndroid = Platform.OS === "android";

const KIND: Record<Part, [string, string]> = {
  account: ["Account issues", "Calendar, time zone, notifications"],
  people: ["People", "Requests and shared threads"],
  questions: ["Questions", "What offload asked you"],
  tips: ["Tips", "Ways to use offload"],
};
const SECTION: Record<SectionSwitch, [string, string]> = {
  day: ["Your day", "Events and to-dos, a day at a time"],
  reminders: [TODAY_REMINDERS.name, TODAY_REMINDERS.line],
  open_threads: ["Open in your threads", "To-dos with no date, a thread at a time"],
};
const ROW_H = 56;

function Grip({ name, onMove }: { name: string; onMove: (step: -1 | 1) => void }) {
  const COLOR = useColors();
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const drag = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      lifted.value = 1;
    })
    .onUpdate((event) => {
      dy.value = event.translationY;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationY) > ROW_H / 2) runOnJS(onMove)(event.translationY < 0 ? -1 : 1);
    })
    .onFinalize(() => {
      lifted.value = 0;
      dy.value = withTiming(0, { duration: 120, reduceMotion: ReduceMotion.System });
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }], opacity: lifted.value ? 0.7 : 1 }));
  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[{ width: 44, height: ROW_H, alignItems: "center", justifyContent: "center", marginLeft: -12 }, style]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Move ${name}`}
        accessibilityHint="Hold, then drag"
        accessibilityActions={[
          { name: "moveUp", label: "Move up" },
          { name: "moveDown", label: "Move down" },
        ]}
        onAccessibilityAction={(event) => onMove(event.nativeEvent.actionName === "moveUp" ? -1 : 1)}
      >
        <Glyph name="grip-vertical" size={17} color={COLOR.iconOnWell} />
      </Animated.View>
    </GestureDetector>
  );
}

export function CustomizeSheet({
  layout,
  onChange,
  onClose,
}: {
  layout: Layout;
  /** The new layout, drawn at once by the screen; resolves false when the
   *  write failed and was put back. */
  onChange: (next: Layout) => Promise<boolean>;
  onClose: () => void;
}) {
  // Drawn from the screen's layout, which is drawn ahead of each write and
  // put back by the shared rule when one fails: one copy, not two.
  const shown = layout;
  const [failed, setFailed] = useState<Layout | null>(null);
  const ink = isAndroid ? "text-a-on" : "text-text-primary";
  const quiet = "text-text-tertiary";

  const apply = (next: Layout) => {
    if (next === shown) return;
    setFailed(null);
    void onChange(next).then((ok) => setFailed(ok ? null : next));
  };
  const rule = isAndroid ? "border-a-outline" : "border-border-hairline";

  const switchRow = (key: Part | SectionSwitch, name: string, line: string, inset: boolean) => {
    const on =
      key === "day" ? dayOn(shown) : key === "reminders" ? remindersOn(shown) : key === "open_threads" ? openThreadsOn(shown) : partOn(shown, key);
    return (
      <View key={key} className={`flex-row items-center gap-space-4 ${inset ? `border-b ${rule}` : ""}`} style={{ minHeight: ROW_H, paddingLeft: inset ? 32 : 0 }}>
        <View className="flex-1 py-space-2">
          <Text className={`font-core ${ink}`} style={{ fontSize: 16 }}>
            {name}
          </Text>
          <Text className={`font-core ${quiet}`} style={{ fontSize: 13, lineHeight: 17 }}>
            {line}
          </Text>
        </View>
        <Switch checked={on} disabled={on && !canSwitchOff(shown, key)} onChange={(next) => apply(setSwitch(shown, key, next))} label={name} />
      </View>
    );
  };

  return (
    <DragSheet onClose={onClose} className="px-gutter-screen pb-space-8" accessibilityLabel="Customize Today">
      <Text className={`font-core font-semibold ${ink}`} style={{ fontSize: 20, lineHeight: 26 }} accessibilityRole="header">
        Customize Today
      </Text>
      <Text className="mb-space-4 mt-space-1 font-core text-text-secondary" style={{ fontSize: 14 }}>
        Drag to reorder. Switch off to hide.
      </Text>
      {shown.sections.map((section) =>
        section.kind === "needs_you" ? (
          <View key="needs_you">
            <View className={`flex-row items-center gap-space-4 border-b ${rule}`} style={{ minHeight: ROW_H }}>
              <Grip name="Needs you" onMove={(step) => apply(moveSection(shown, "needs_you", step))} />
              <Text className={`flex-1 font-core font-medium ${ink}`} style={{ fontSize: 16 }}>
                Needs you
              </Text>
            </View>
            {PARTS.map((part) => switchRow(part, KIND[part][0], KIND[part][1], true))}
          </View>
        ) : (
          <View key={section.kind} className={`flex-row items-center gap-space-4 border-b ${rule}`}>
            <Grip name={SECTION[section.kind][0]} onMove={(step) => apply(moveSection(shown, section.kind, step))} />
            <View className="flex-1">{switchRow(section.kind, SECTION[section.kind][0], SECTION[section.kind][1], false)}</View>
          </View>
        ),
      )}
      {failed ? (
        <View className="mt-space-3 flex-row items-center gap-space-4">
          <Text className="font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
            Couldn&apos;t save that.
          </Text>
          <Pressable onPress={() => apply(failed)} accessibilityRole="button" className="min-h-tap-min justify-center">
            <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13 }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View className="mt-space-5 flex-row justify-between">
        <Pressable onPress={() => apply(DEFAULT_LAYOUT)} accessibilityRole="button" className="min-h-tap-min justify-center">
          <View className="justify-center rounded-pill border border-border-hairline px-space-5" style={{ minHeight: 30 }}>
            <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 13 }}>
              Reset
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" className="min-h-tap-min justify-center">
          <View className={`justify-center rounded-pill px-space-6 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`} style={{ minHeight: 30 }}>
            <Text className={`font-core font-medium ${isAndroid ? "text-a-surface" : "text-text-inverse"}`} style={{ fontSize: 13 }}>
              Done
            </Text>
          </View>
        </Pressable>
      </View>
    </DragSheet>
  );
}
