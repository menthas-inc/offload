// A calendar as a row: the same row in Settings and in a thread's sheet. 019.
//
// A checkbox, never a switch: a switch says a capability is on, and the
// capability is the connection one level up. This is a selection among peers.
// The box is the one `ConsentTicks` draws, ink on iOS and Material's primary
// on Android, at the governed 20px: **never the moss tick**, which means a
// finished row. The calendar's own colour comes in as a 10px dot inside a
// hairline ring, as recognition and never as the differentiator: four of seven
// ordinary Google colours fail 3:1 on the row's ground, so the name is what
// tells two apart. A ticked row is full ink and an unticked one tertiary,
// which inverts the task checkbox's treatment for the same reason: dimming
// marks the row that is out of play.

import { Platform, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";
const BOX = 20;

export interface CalendarRowShape {
  id: string;
  name: string;
  colour: string | null;
  writable: boolean;
  sharedWithYou: boolean;
  primary: boolean;
  note?: string | null;
}

/** The row's note, in this order: the account's address when two rows share a
 *  name, then the two load-bearing ones. A read-only calendar cannot be added
 *  to; a shared one says so without naming anybody, since Google's list
 *  carries no name. */
export function calendarNote(calendar: CalendarRowShape): string | null {
  if (calendar.note) return calendar.note;
  if (calendar.primary) return "Your own calendar";
  if (!calendar.writable) return "Read only";
  if (calendar.sharedWithYou) return "Shared with you";
  return null;
}

export function CalendarRow({
  calendar,
  picked,
  onChange,
  disabled = false,
  last = false,
}: {
  calendar: CalendarRowShape;
  picked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const COLOR = useColors();
  const note = calendarNote(calendar);
  const box = picked
    ? isAndroid
      ? "bg-blue-600 border-transparent"
      : "bg-ink-950 border-transparent"
    : isAndroid
      ? "border-a-outline"
      : "border-border-strong";
  const title = picked
    ? isAndroid
      ? "text-a-on"
      : "text-text-primary"
    : isAndroid
      ? "text-a-on-var"
      : "text-text-tertiary";

  return (
    <Pressable
      onPress={() => onChange(!picked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled }}
      accessibilityLabel={note ? `${calendar.name}, ${note}` : calendar.name}
      className={`flex-row items-center gap-space-4 py-space-4 ${last ? "" : "border-b border-border-hairline"}`}
      style={{ minHeight: isAndroid ? 56 : 48 }}
    >
      <View
        className={`items-center justify-center rounded-xs border ${box}`}
        style={{ width: BOX, minHeight: BOX }}
      >
        {picked ? (
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path d="M20 6L9 17l-5-5" stroke={isAndroid ? COLOR.onBrand : COLOR.onSolid} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      {/* Definition, not contrast: the ring keeps the pale ones an edge. */}
      <View
        className="rounded-pill border border-border-hairline"
        style={{ width: 10, height: 10, backgroundColor: calendar.colour ?? COLOR.iconOnWell }}
      />
      <View className="flex-1">
        <Text className={`font-core ${title}`} style={{ fontSize: 15, lineHeight: 20 }}>
          {calendar.name}
        </Text>
        {note ? (
          <Text
            className={`mt-space-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
            style={{ fontSize: 12.5, lineHeight: 17.5 }}
          >
            {note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
