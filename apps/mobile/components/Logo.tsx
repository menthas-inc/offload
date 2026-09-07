// The mark: a dot above an open vessel, a thought let go of downwards into
// something that catches it. One colour, no greys, no accent. The vessel never
// gains a lid and the dot never touches it.
//
// Props match the design system's Logo contract, which the adherence lint
// checks: variant, size, tone. tone is ink or inverse and nothing else.

import Svg, { Circle, Path } from "react-native-svg";
import { View, Text } from "react-native";
import { useColors } from "../lib/colors";

export function Logo({
  variant = "lockup",
  size = 22,
  tone = "ink",
}: {
  /** `mark` is the vessel alone, which the gate sets at 92px with the wordmark
   *  laid out beneath it rather than beside it. */
  variant?: "lockup" | "mark";
  size?: number;
  tone?: "ink" | "inverse";
}) {
  // **Not a module constant.** This read `resolved.light["ink-950"]` once at
  // import, which is near-black, and on a dark surface the mark and the
  // wordmark both vanished. It was the first thing dark mode showed, and it is
  // the same mistake `lib/colors.ts` exists to stop: a colour reaching a React
  // Native prop does not follow a class.
  const COLOR = useColors();
  const color = tone === "inverse" ? COLOR.onSolid : COLOR.ink;

  return (
    <View className="flex-row items-center gap-space-4">
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Circle cx="48" cy="21" r="10" fill={color} />
        <Path
          d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46"
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </Svg>

      {variant === "lockup" ? (
        /* Live text, always lowercase, never an outlined file. */
        <Text
          className="font-core"
          style={{
            fontSize: size - 2,
            fontWeight: "600",
            letterSpacing: -0.03 * (size - 2),
            color,
          }}
        >
          offload
        </Text>
      ) : null}
    </View>
  );
}
