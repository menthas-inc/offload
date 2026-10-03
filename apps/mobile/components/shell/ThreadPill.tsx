// The thread pill. 027.
//
// The conversation's moss chip, one component now: the turn footer draws it
// at 30, the height every mark in the footer shares, and Today draws it on a
// row's marks line and an event card. Since 037 it leads with the thread's
// own icon at 18, a circle, which takes Today's pill to 26. A tap opens
// the thread. Moss soft ground and accent ink in both themes, which is what
// "a thread" looks like everywhere a person reads one.

import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { ThreadIcon } from "../ThreadIcon";

export function ThreadPill({
  id,
  name,
  icon,
  hue,
  size,
  onOpen,
}: {
  id: string;
  name: string;
  /** Null from a build of the server that sent none: the icon draws lasso. */
  icon: string | null;
  hue: number | null;
  /** The row it sits on: 24 on Today, where the pill itself is 26, and 30 in
   *  the turn footer. */
  size: 24 | 30;
  /** Runs before the thread opens: the footer puts the conversation away. */
  onOpen?: () => void;
}) {
  const router = useRouter();
  const small = size === 24;
  const height = small ? 26 : size;
  return (
    <Pressable
      onPress={() => {
        onOpen?.();
        router.push({ pathname: "/threads/[id]", params: { id } });
      }}
      // The drawn pill is shorter than a tap: the slop makes up the 44.
      hitSlop={{ top: (44 - height) / 2, bottom: (44 - height) / 2, left: 4, right: 4 }}
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}`}
      className="flex-row items-center self-start rounded-pill bg-surface-accent-soft"
      style={{ minHeight: height, gap: 6, paddingLeft: small ? 4 : 6, paddingRight: small ? 10 : 12 }}
    >
      <ThreadIcon icon={icon ?? ""} hue={hue ?? 1} seed={id} size={18} round />
      <Text className="font-core font-medium text-text-accent" style={{ fontSize: 12.5 }} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}
