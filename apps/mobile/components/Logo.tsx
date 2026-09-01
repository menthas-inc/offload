// The mark: a dot above an open vessel, a thought let go of downwards into
// something that catches it. One colour, no greys, no accent. The vessel never
// gains a lid and the dot never touches it.

import Svg, { Circle, Path } from "react-native-svg";
import { View, Text } from "react-native";

export function Logo({ size = 22, tone = "text-ink-950" }: { size?: number; tone?: string }) {
  return (
    <View className="flex-row items-center gap-space-4">
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Circle cx="48" cy="21" r="10" fill="currentColor" />
        <Path
          d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46"
          fill="none"
          stroke="currentColor"
          strokeWidth={10}
          strokeLinecap="round"
        />
      </Svg>
      {/* Live text, always lowercase, never an outlined file. */}
      <Text
        className={`font-core ${tone}`}
        style={{ fontSize: size - 2, fontWeight: "600", letterSpacing: -0.03 * (size - 2) }}
      >
        offload
      </Text>
    </View>
  );
}
