// 030. The place sheet on the phones, reached only from the map's callout: a
// half sheet over the map, dimming it, read-only. Every line in it is
// offload's own: the row's title, an event's location, a link's domain.
// Nothing Google named, and nothing somebody wrote is drawn as anything but
// text. Its height raises the map's padding, so Google's logo and legal line
// stay above it.

import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
import { directionsUrl, kindWord } from "@offload/widgets";
import type { Label } from "../../lib/labels";
import { domainOf, type Member, type Point } from "../../lib/threads";
import { useColors } from "../../lib/colors";
import { Glyph } from "../Glyph";
import { LabelMark } from "../labels/LabelMark";
import { DragSheet } from "../shell/DragSheet";
import { rowGlyph } from "../shell/ContentRow";

const isAndroid = Platform.OS === "android";

function whenLine(when: NonNullable<Point["when"]>): string {
  const at = new Date(when.at);
  if (when.allDay) return at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return at.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PlaceSheet({
  point,
  threadName,
  labels,
  members,
  onClose,
  onEdit,
  onHeight,
}: {
  point: Point;
  threadName: string;
  labels: Label[];
  members: Member[];
  onClose: () => void;
  onEdit: (point: Point) => void;
  onHeight: (height: number) => void;
}) {
  const COLOR = useColors();
  const calendar = point.source === "calendar";
  const kind = calendar ? (point.calendarName ?? "Calendar") : kindWord(point.type);
  const carried = labels.filter((label) => point.labelIds.includes(label.id));
  const author = point.authorId ? members.find((m) => m.accountId === point.authorId) : undefined;
  const address = point.approximate ? (point.address ? `Approximate, ${point.address}` : "Approximate") : point.address;
  const rows: { key: string; icon: string; label: string; value: React.ReactNode }[] = [];
  if (point.when) rows.push({ key: "when", icon: "calendar", label: "When", value: whenLine(point.when) });
  if (address) rows.push({ key: "address", icon: "map-pin", label: "Address", value: address });
  if (point.url) rows.push({ key: "link", icon: "link", label: "Link", value: domainOf(point.url) ?? point.url });
  if (!calendar) {
    rows.push({
      key: "labels",
      icon: "tag",
      label: "Labels",
      value: carried.length
        ? carried.map((l) => (
            <LabelMark key={l.id} color={l.colour}>
              {l.name}
            </LabelMark>
          ))
        : "None",
    });
  }
  if (!calendar && author) rows.push({ key: "added", icon: "users", label: "Added by", value: author.isYou ? "You" : author.displayName });

  const button = isAndroid ? 40 : 48;
  const secondary = isAndroid ? "border border-border-strong" : "bg-surface-fill";

  return (
    <DragSheet
      onClose={onClose}
      accessibilityLabel={point.title}
      surface={isAndroid ? "rounded-t-a-sheet bg-a-c-low" : "rounded-t-sheet bg-surface-raised"}
      className="px-gutter-screen pb-space-8"
    >
      <View onLayout={(event) => onHeight(event.nativeEvent.layout.height)}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View className={`items-center justify-center overflow-hidden bg-surface-fill ${isAndroid ? "rounded-a-sm" : "rounded-sm"}`} style={{ width: 44, height: 44 }}>
            {point.imageUrl ? (
              <Image source={{ uri: point.imageUrl }} style={{ width: 44, height: 44 }} accessibilityIgnoresInvertColors />
            ) : (
              <Glyph name={rowGlyph(point.type)} size={20} color={COLOR.secondary} />
            )}
          </View>
          <View className="flex-1">
            <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 19, lineHeight: 24 }} accessibilityRole="header">
              {point.title}
            </Text>
            <Text className="font-core text-text-secondary" style={{ fontSize: 13.5, marginTop: 2 }}>
              {kind.charAt(0).toUpperCase() + kind.slice(1)} · {threadName}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="items-center justify-center rounded-pill bg-surface-fill"
            style={{ width: 32, height: 32 }}
          >
            <Glyph name="x" size={14} color={COLOR.secondary} />
          </Pressable>
        </View>

        <View className="mt-space-5">
          {rows.map((row, index) => (
            <View
              key={row.key}
              className="flex-row items-center"
              style={{ gap: 12, minHeight: 46, borderBottomWidth: index === rows.length - 1 ? 0 : 1, borderBottomColor: COLOR.hairline }}
            >
              <Glyph name={row.icon} size={16} color={COLOR.secondary} />
              <Text className="font-core text-text-secondary" style={{ width: 76, fontSize: 14 }}>
                {row.label}
              </Text>
              <View className="flex-1 flex-row flex-wrap items-center" style={{ gap: 6 }}>
                {typeof row.value === "string" ? (
                  <Text className="font-core text-text-primary" style={{ fontSize: 15 }}>
                    {row.value}
                  </Text>
                ) : (
                  row.value
                )}
              </View>
            </View>
          ))}
        </View>

        <View className="mt-space-6 flex-row" style={{ gap: 10 }}>
          <Pressable
            onPress={() => void Linking.openURL(directionsUrl({ lat: point.lat, lng: point.lng, googlePlaceId: point.googlePlaceId }))}
            accessibilityRole="link"
            className="flex-1 flex-row items-center justify-center rounded-pill bg-surface-inverse"
            style={{ minHeight: button, gap: 8 }}
          >
            <Glyph name="compass" size={16} color={COLOR.onSolid} />
            <Text className="font-core font-medium text-text-inverse" style={{ fontSize: isAndroid ? 14 : 15 }}>
              Directions
            </Text>
          </Pressable>
          {calendar ? null : point.url ? (
            <Pressable
              onPress={() => void Linking.openURL(point.url!)}
              accessibilityRole="link"
              className={`flex-1 flex-row items-center justify-center rounded-pill ${secondary}`}
              style={{ minHeight: button, gap: 8 }}
            >
              <Glyph name="arrow-up-right" size={16} color={COLOR.ink} />
              <Text className="font-core font-medium text-text-primary" style={{ fontSize: isAndroid ? 14 : 15 }}>
                Open link
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onEdit(point)}
              accessibilityRole="button"
              className={`flex-1 flex-row items-center justify-center rounded-pill ${secondary}`}
              style={{ minHeight: button, gap: 8 }}
            >
              <Glyph name="pencil" size={16} color={COLOR.ink} />
              <Text className="font-core font-medium text-text-primary" style={{ fontSize: isAndroid ? 14 : 15 }}>
                Edit
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </DragSheet>
  );
}
