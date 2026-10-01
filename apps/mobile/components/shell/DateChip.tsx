// The date on a row. 023.
//
// One chip, drawn at the trailing edge of the title line on every row that
// has a date, from the shared `chipFor`, so the three surfaces cannot
// disagree about what late, soon and later are. A row with no date draws
// nothing and asks nothing: no dashed slot, no placeholder, because principle
// 04 made offload not ask for dates nobody gave. The bell after the words
// reports `is_reminder` and sets nothing.

import { Text, View } from "react-native";
import { chipFor, timeIn, type ChipRow } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";

export function DateChip({ row, isReminder }: { row: ChipRow; isReminder: boolean }) {
  const { zone, today } = useClock();
  const COLOR = useColors();
  const chip = chipFor(row, zone, today);
  if (!chip) return null;

  // Late is clay, the pair a failure already uses, because a date that has
  // passed is the one state that wants finding. Soon is amber rather than
  // blue, since blue is the attention colour and would read as offload
  // asking for something. Later is the plain fill, so a list where every
  // row is dated still has colour only where it means something. A done row
  // is plain whatever its date: ticked is not late.
  const ground =
    chip.tone === "late"
      ? "bg-surface-danger-soft"
      : chip.tone === "soon"
        ? "bg-surface-noticed-soft"
        : "bg-surface-fill";
  const ink = chip.tone === "late" ? COLOR.danger : chip.tone === "soon" ? COLOR.textNoticed : COLOR.secondary;

  return (
    <View
      className={`flex-row items-center gap-space-1 self-start rounded-xs px-space-2 ${ground}`}
      style={{ minHeight: 24 }}
      accessibilityLabel={isReminder ? `${chip.label}, offload will remind you` : chip.label}
    >
      <Glyph name="calendar" size={12} color={ink} />
      <Text
        className="font-core font-medium text-caption"
        style={{ color: ink, fontVariant: ["tabular-nums"], lineHeight: 16 }}
      >
        {chip.label}
      </Text>
      {isReminder ? <Glyph name="bell" size={11} color={ink} /> : null}
    </View>
  );
}

/** 027. Today's chip for a row with a time on the day shown: the hour, with a
 *  clock, on the raised ground in secondary ink. The day itself is the
 *  stepper's, so it is not repeated. */
export function HourChip({ row }: { row: ChipRow }) {
  const { zone } = useClock();
  const COLOR = useColors();
  const at = row.type === "event" ? row.occursAt : row.dueAt;
  if (!at) return null;
  const hour = timeIn(new Date(at), zone, "en-GB");
  return (
    <View
      className="flex-row items-center gap-space-1 self-start rounded-xs bg-surface-raised px-space-2"
      style={{ minHeight: 24 }}
      accessibilityLabel={`At ${hour}`}
    >
      <Glyph name="clock" size={12} color={COLOR.secondary} />
      <Text className="font-core font-medium text-caption" style={{ color: COLOR.secondary, fontVariant: ["tabular-nums"], lineHeight: 16 }}>
        {hour}
      </Text>
    </View>
  );
}
