// The three first-run illustrations.
//
// They are each screen's argument rather than decoration: dumps going in,
// things coming out, one notification that earned its interruption. Without
// them the three screens are three sentences.
//
// Not forked. The Material variant differs only in which surface roles it
// paints with, so it takes them as props from the screen that renders it,
// rather than existing twice with the same layout in both copies.

import { Text, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { DUMPS, THINGS } from "../lib/gate";
import { COLOR } from "../lib/colors";

export interface ArtTone {
  bubble: string;
  bubbleText: string;
  row: string;
  rowBorder: string;
  iconWell: string;
  name: string;
  meta: string;
  radius: string;
}

export const IOS_TONE: ArtTone = {
  bubble: "bg-surface-fill",
  bubbleText: "text-text-secondary",
  row: "bg-surface-raised",
  rowBorder: "border border-border-hairline",
  iconWell: "bg-surface-fill",
  name: "text-text-primary",
  meta: "text-text-tertiary",
  radius: "rounded-lg",
};

export const M3_TONE: ArtTone = {
  bubble: "bg-a-c-low",
  bubbleText: "text-a-on-var",
  row: "bg-a-c-low",
  rowBorder: "",
  iconWell: "bg-a-c-high",
  name: "text-a-on",
  meta: "text-a-on-quiet",
  radius: "rounded-a-lg",
};

function ThingIcon({ name, color }: { name: string; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.7, fill: "none" as const };
  if (name === "lasso") {
    return (
      <Svg width={17} height={17} viewBox="0 0 24 24">
        <Ellipse cx="12" cy="9" rx="8" ry="5.5" {...stroke} />
        <Path d="M8 13.8c-1 .7-1.5 1.5-1.5 2.4 0 1.9 2.5 3.5 5.5 3.5" strokeLinecap="round" {...stroke} />
      </Svg>
    );
  }
  if (name === "bookmark") {
    return (
      <Svg width={17} height={17} viewBox="0 0 24 24">
        <Path d="M6.5 4h11v16l-5.5-4-5.5 4z" strokeLinejoin="round" {...stroke} />
      </Svg>
    );
  }
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 18z" strokeLinejoin="round" {...stroke} />
      <Circle cx="0" cy="0" r="0" {...stroke} />
    </Svg>
  );
}

export function TutorialArt({ kind, tone }: { kind: string; tone: ArtTone }) {
  if (kind === "bubbles") {
    return (
      <View className="w-full gap-space-5">
        {DUMPS.map((text, index) => (
          <View
            key={text}
            className={`${tone.bubble} px-space-6 py-space-5`}
            style={{
              alignSelf: index % 2 ? "flex-end" : "flex-start",
              maxWidth: "88%",
              // 18, which is between lg and xl and belongs to neither: the kit
              // draws a chat bubble, not a card.
              borderRadius: 18,
            }}
          >
            <Text className={`font-core ${tone.bubbleText}`} style={{ fontSize: 15, lineHeight: 20 }}>
              {text}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (kind === "things") {
    return (
      <View className="w-full gap-space-4">
        {THINGS.map(([icon, name, meta]) => (
          <View
            key={name}
            className={`flex-row items-center gap-space-5 px-space-6 py-space-5 ${tone.radius} ${tone.rowBorder} ${tone.row}`}
          >
            <View className={`h-space-9 w-space-9 items-center justify-center rounded-sm ${tone.iconWell}`}>
              <ThingIcon name={icon} color={COLOR.iconOnWell} />
            </View>
            <Text className={`flex-1 font-core font-medium ${tone.name}`} style={{ fontSize: 15 }}>
              {name}
            </Text>
            <Text className={`font-core text-body-sm ${tone.meta}`}>{meta}</Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className={`w-full ${tone.radius} ${tone.rowBorder} ${tone.row} px-space-6 py-space-5`}>
      <View className="flex-row justify-between">
        <Text className={`font-core font-medium ${tone.meta}`} style={{ fontSize: 12 }}>
          offload
        </Text>
        <Text className={`font-core ${tone.meta}`} style={{ fontSize: 12 }}>
          now
        </Text>
      </View>
      <Text className={`mt-space-2 font-core font-semibold ${tone.name}`} style={{ fontSize: 15 }}>
        Brackets go up Friday
      </Text>
      <Text className={`mt-space-1 font-core text-body-sm ${tone.bubbleText}`}>
        You saved the link on Tuesday.
      </Text>
    </View>
  );
}
