// The thread pill. 027.
//
// The conversation's moss chip with `lasso`, one component now: the turn
// footer draws it at 30, the height every mark in the footer shares, and
// Today draws it at 24 on a row's marks line and an event card. A tap opens
// the thread. Moss soft ground and accent ink in both themes, which is what
// "a thread" looks like everywhere a person reads one.

import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

export function ThreadPill({
  id,
  name,
  size,
  onOpen,
}: {
  id: string;
  name: string;
  size: 24 | 30;
  /** Runs before the thread opens: the footer puts the conversation away. */
  onOpen?: () => void;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const small = size === 24;
  return (
    <Pressable
      onPress={() => {
        onOpen?.();
        router.push({ pathname: "/threads/[id]", params: { id } });
      }}
      // The drawn pill is shorter than a tap: the slop makes up the 44.
      hitSlop={{ top: (44 - size) / 2, bottom: (44 - size) / 2, left: 4, right: 4 }}
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}`}
      className={`flex-row items-center self-start rounded-pill bg-surface-accent-soft ${small ? "gap-space-1" : "gap-space-2 px-space-5"}`}
      style={{ minHeight: size, ...(small ? { paddingLeft: 7, paddingRight: 9 } : {}) }}
    >
      <Glyph name="lasso" size={13} color={COLOR.accent} />
      <Text className="font-core font-medium text-text-accent" style={{ fontSize: 12.5 }} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}
