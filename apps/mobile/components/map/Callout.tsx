// 030. The callout over a picked point, on the phones: the row's own title,
// its kind and labels, then Directions to Google Maps and Open. An ordinary
// view over the map, placed by the map's own projection, so both actions are
// pressables of their own rather than one image the map draws.

import { Linking, Platform, Pressable, Text, View } from "react-native";
import { directionsUrl, kindWord } from "@offload/widgets";
import type { Label } from "../../lib/labels";
import type { Point } from "../../lib/threads";
import { useColors } from "../../lib/colors";
import { Glyph } from "../Glyph";
import { LabelMark } from "../labels/LabelMark";

const isAndroid = Platform.OS === "android";

/** 228 wide; the tail's 6 below and 18 of clearance above the point. */
export const CALLOUT_WIDTH = 228;
export const CALLOUT_LIFT = 18;

export function Callout({
  point,
  labels,
  onOpen,
  onHeight,
}: {
  point: Point;
  labels: Label[];
  onOpen: (point: Point) => void;
  onHeight: (height: number) => void;
}) {
  const COLOR = useColors();
  const carried = labels.filter((label) => point.labelIds.includes(label.id));
  const kind = point.source === "calendar" ? (point.calendarName ?? "Calendar") : kindWord(point.type);
  // A 36 or 32 pill, reaching 44 by slop.
  const pill = isAndroid ? 36 : 32;
  const reach = (44 - pill) / 2;
  return (
    <View
      accessibilityLabel={point.title}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      className="bg-surface-raised"
      style={{
        width: CALLOUT_WIDTH,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 12,
        borderRadius: isAndroid ? 16 : 14,
        boxShadow: COLOR.shadowCallout,
      }}
    >
      <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 15, lineHeight: 19 }}>
        {point.title}
      </Text>
      <View className="flex-row flex-wrap items-center" style={{ gap: 6, marginTop: 3 }}>
        <Text className="font-core text-text-secondary" style={{ fontSize: 12.5 }}>
          {kind.charAt(0).toUpperCase() + kind.slice(1)}
        </Text>
        {carried.map((label) => (
          <LabelMark key={label.id} color={label.colour}>
            {label.name}
          </LabelMark>
        ))}
      </View>
      <View className="mt-space-4 flex-row" style={{ gap: 6 }}>
        <Pressable
          onPress={() => void Linking.openURL(directionsUrl({ lat: point.lat, lng: point.lng, googlePlaceId: point.googlePlaceId }))}
          hitSlop={{ top: reach, bottom: reach }}
          accessibilityRole="link"
          accessibilityLabel={`Directions to ${point.title}`}
          className="flex-row items-center rounded-pill bg-surface-inverse px-space-5"
          style={{ height: pill, gap: 5 }}
        >
          <Glyph name="compass" size={13} color={COLOR.onSolid} />
          <Text className="font-core font-medium text-text-inverse" style={{ fontSize: 13 }}>
            Directions
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onOpen(point)}
          hitSlop={{ top: reach, bottom: reach }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${point.title}`}
          className="items-center justify-center rounded-pill bg-surface-fill px-space-5"
          style={{ height: pill }}
        >
          <Text className="font-core font-medium text-text-primary" style={{ fontSize: 13 }}>
            Open
          </Text>
        </Pressable>
      </View>
      {/* The tail on the point. */}
      <View
        className="absolute bg-surface-raised"
        style={{ width: 12, height: 12, bottom: -6, left: CALLOUT_WIDTH / 2 - 6, transform: [{ rotate: "45deg" }] }}
      />
    </View>
  );
}
