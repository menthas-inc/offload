// The design system's ThreadNotice (2026-10-31): one full-width strip under a
// thread's read for anything the thread needs to tell the person. Solid moss
// with white from offload, ink from a person, the same in both themes. Two
// lines at most, one underlined word to act on, an x to dismiss.

import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeOut, useReducedMotion } from "react-native-reanimated";
import { useColors } from "../../lib/colors";
import { Avatar } from "../Avatar";
import { Glyph } from "../Glyph";

export function ThreadNotice({
  message,
  action,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel = "Dismiss",
  person,
}: {
  message: string;
  /** One word: Switch, Change. */
  action: string;
  /** What a screen reader hears for the action. */
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  dismissLabel?: string;
  /** A person's notice, drawn in ink with their face; offload's otherwise. */
  person?: { uid: string; initials: string; name: string } | undefined;
}) {
  const COLOR = useColors();
  const still = useReducedMotion();
  // The copy fits two lines at 375 wide; the largest text sizes may run to three.
  const { fontScale } = useWindowDimensions();
  const ink = person ? COLOR.onSolid : COLOR.onBrand;
  return (
    <Animated.View
      {...(still ? {} : { exiting: FadeOut.duration(280) })}
      accessibilityLiveRegion="polite"
      className={`flex-row items-center px-gutter-screen ${person ? "bg-surface-inverse" : "bg-surface-accent"}`}
      style={{ gap: 12, paddingVertical: 14 }}
    >
      {person ? <Avatar uid={person.uid} initials={person.initials} name={person.name} size={28} /> : <Glyph name="sparkles" size={20} color={ink} />}
      <Text
        numberOfLines={fontScale > 1.3 ? undefined : 2}
        className="flex-1 font-core font-medium"
        style={{ fontSize: 16, lineHeight: 16 * 1.35, color: ink }}
      >
        {message}
      </Text>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        className="justify-center"
        style={{ minHeight: 44, marginVertical: -12 }}
      >
        <Text className="font-core font-semibold underline" style={{ fontSize: 16, color: ink }}>
          {action}
        </Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        className="items-center justify-center"
        style={{ width: 44, height: 44, marginVertical: -12, marginLeft: -4, marginRight: -14, opacity: 0.8 }}
      >
        <Glyph name="x" size={18} color={ink} />
      </Pressable>
    </Animated.View>
  );
}
