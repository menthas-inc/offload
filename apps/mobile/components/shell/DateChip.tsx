// The date on a row. 023.
//
// One chip, drawn at the trailing edge of the title line on every row that
// has a date, from the shared `chipFor`, so the three surfaces cannot
// disagree about what late, soon and later are. A row with no date draws
// nothing and asks nothing: no dashed slot, no placeholder, because principle
// 04 made offload not ask for dates nobody gave. The bell after the words
// reports `is_reminder`, or (042) that offload will remind the author, and
// sets nothing.

import { Text, View } from "react-native";
import { bellOn, chipFor, timeIn, type ChipRow, type Reminders } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";

export function DateChip({
  row,
  by,
}: {
  row: ChipRow & { isReminder?: boolean; reminders?: Reminders | undefined };
  /** 042. Today's Reminders: an undated task's day, "By Wednesday", said in
   *  the plain fill since the row has no date of its own. */
  by?: string | undefined;
}) {
  const { zone, today } = useClock();
  const COLOR = useColors();
  const chip = chipFor(row, zone, today);
  if (!chip) return by ? <PlainChip label={by} bell={bellOn(row)} /> : null;
  const isReminder = bellOn(row);

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
  // Dark theme: edges (design decisions, 2026-10-07).
  const edge = chip.tone === "late" ? COLOR.edgeDanger : chip.tone === "soon" ? COLOR.edgeNoticed : COLOR.edgeCard;

  return (
    <View
      className={`flex-row items-center gap-space-1 self-start rounded-xs px-space-2 ${ground}`}
      style={{ minHeight: 24, boxShadow: `inset 0 0 0 1px ${edge}` }}
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

/** 042. A date that is not a row's own, in the plain fill: the day an
 *  undated task is reminded against, or a note's or a memory's in Today's
 *  Reminders. */
export function PlainChip({ label, bell = false }: { label: string; bell?: boolean }) {
  const COLOR = useColors();
  return (
    <View
      className="flex-row items-center gap-space-1 self-start rounded-xs bg-surface-fill px-space-2"
      style={{ minHeight: 24, boxShadow: `inset 0 0 0 1px ${COLOR.edgeCard}` }}
      accessibilityLabel={bell ? `${label}, offload will remind you` : label}
    >
      <Glyph name="calendar" size={12} color={COLOR.secondary} />
      <Text className="font-core font-medium text-caption" style={{ color: COLOR.secondary, fontVariant: ["tabular-nums"], lineHeight: 16 }}>
        {label}
      </Text>
      {bell ? <Glyph name="bell" size={11} color={COLOR.secondary} /> : null}
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
