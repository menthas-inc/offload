// The rail: a thread's dates as weeks, and the day underneath it, on a phone.
//
// **It is not a widget and it is drawn for every thread**, including one with
// no dates on it at all. 015 took it out of the earned set rather than making
// it a widget that is always earned, because "widgets are earned from content"
// and "drawn whether or not the content exists" are not the same rule.
//
// The nearest thing any kit draws is `TimelineWidget`, a Mon to Sun rail with
// one dot per day for "has content" and an Overall/Daily toggle. This keeps its
// shape, gives the dot a colour per kind and lets a day carry several, and
// drops the toggle: picking a day is the toggle.

import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import {
  WEEKS_BEFORE_MONTHS,
  dayLabel,
  datedFor,
  localDay,
  monthFor,
  railFor,
  stepMonth,
  thingsOn,
  weeksSpanned,
  type Dated,
  type Day,
  type RailRow,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useWeekStart } from "../../lib/appearance";
import { ContentRowView } from "./ContentRow";
import type { ContentRow, Note } from "../../lib/threads";

const isAndroid = Platform.OS === "android";

interface Props {
  rows: ContentRow[];
  notes: Note[];
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
}

export function Timeline({ rows, notes, onDelete, onActions, onToggle }: Props) {
  const COLOR = useColors();
  const weekStart = useWeekStart();
  // Computed on render, so the first render after midnight moves today and
  // nothing polls for it.
  const today = localDay(new Date());
  // **Thread-scoped only because this is keyed by the thread.** `selected` and
  // `opened` are plain state, and the day somebody was reading would otherwise
  // follow them into the next thread, along with a gap row that reads as
  // already open because its key is a date with no thread in it. The caller
  // passes `key`, and expo-router pushes a screen per thread besides.
  const [selected, setSelected] = useState(today);
  // The month on screen, in month mode. Null means the one today is in, so it
  // follows today over midnight rather than pinning the month this mounted in.
  const [month, setMonth] = useState<string | null>(null);

  /** The colour of a dot is what the thing is: blue already means waiting on
   *  you, ink is a fact of the day rather than a demand on it, and amber is
   *  what the kits use for something offload has noticed. */
  const DOT: Record<string, string> = {
    task: COLOR.attention,
    event: COLOR.ink,
    note: COLOR.noticed,
    other: COLOR.quiet,
  };

  const dated = useMemo(() => datedFor(rows, notes), [rows, notes]);

  // **A rail past a few weeks stops being a rail.** Weeks read as time passing,
  // which is what the empty days are for; a year of weeks is a scroll. Past the
  // threshold it draws the shape everybody already knows instead.
  const weeks = useMemo(() => weeksSpanned(dated, today, weekStart), [dated, today, weekStart]);
  const asMonth = weeks > WEEKS_BEFORE_MONTHS;

  const rail = useMemo(
    () => (asMonth ? null : railFor(dated, today, weekStart)),
    [asMonth, dated, today, weekStart],
  );
  const grid = useMemo(
    () => (asMonth ? monthFor(month ?? today, dated, today, weekStart) : null),
    [asMonth, month, dated, today, weekStart],
  );

  // **Over the entries, not the rows.** A task with an occurrence on one day
  // and a due date on another is on both, and they are two different facts:
  // drawing it from the row's own fields puts the occurrence's time on the due
  // day and says the thing happens on a day it does not.
  const onDay = thingsOn(dated, selected);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const dayRows = onDay
    .map((one) => ({ one, row: byId.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; row: ContentRow } => pair.row !== undefined);
  const dayNotes = onDay
    .map((one) => ({ one, note: notesById.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; note: Note } => pair.note !== undefined);

  const cell = (day: Day, outside = false) => (
    <Pressable
      key={day.iso}
      onPress={() => setSelected(day.iso)}
      // The dots are the fast read and never the only one.
      accessibilityLabel={dayLabel(day)}
      accessibilityRole="button"
      accessibilityState={{ selected: day.iso === selected }}
      className="min-h-tap-min flex-1 items-center rounded-xs py-space-3"
      // **A day with anything on it glows inward, in blue**, and the day being
      // read is white on blue. Grey said "there is something here" so quietly
      // that it read as nothing, so the hue does the work. React Native has no
      // inset shadow, so the ring is a border and the ground is the fill: the
      // cell keeps its 1px border in every state, including transparent, so
      // nothing shuffles as things are added and ticked off.
      style={{
        borderWidth: 1,
        borderColor:
          day.iso === selected
            ? COLOR.attention
            : day.count > 0 || day.today
              ? COLOR.borderFocus
              : "transparent",
        backgroundColor:
          day.iso === selected
            ? COLOR.attention
            : day.count > 0
              ? COLOR.attentionSoft
              : "transparent",
      }}
    >
      <Text
        className={day.iso === selected ? "font-core" : "font-core text-text-tertiary"}
        style={{
          fontSize: 11,
          opacity: outside ? 0.6 : 1,
          ...(day.iso === selected ? { color: COLOR.onAttention } : {}),
        }}
      >
        {day.dow}
      </Text>
      <Text
        className={`font-core font-semibold ${
          day.iso === selected
            ? ""
            : day.past || outside
              ? "text-text-tertiary"
              : isAndroid
                ? "text-a-on"
                : "text-text-primary"
        }`}
        style={{
          fontSize: 13,
          opacity: outside ? 0.6 : 1,
          ...(day.iso === selected ? { color: COLOR.onAttention } : {}),
        }}
      >
        {day.dom}
      </Text>
      <View className="mt-space-1 flex-row items-center gap-space-1" style={{ minHeight: 7 }}>
        {day.dots.map((dot, index) => (
          <View
            key={index}
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              // Done keeps its colour and loses its fill, so the legend stays
              // about what a thing is.
              // White on the day being read: a blue task dot on a blue cell is
              // not a dot, and that day's contents are listed directly below.
              backgroundColor: dot.done
                ? "transparent"
                : day.iso === selected
                  ? COLOR.onAttention
                  : DOT[dot.kind] ?? DOT["other"],
              borderWidth: dot.done ? 1 : 0,
              borderColor:
                day.iso === selected ? COLOR.onAttention : DOT[dot.kind] ?? DOT["other"],
            }}
          />
        ))}
        {day.count > day.dots.length ? (
          <Text className="font-core text-text-tertiary" style={{ fontSize: 10 }}>
            +{day.count - day.dots.length}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const week = (row: RailRow, outside?: (iso: string) => boolean) => (
    <View key={row.key} className="flex-row gap-space-1 px-gutter-screen">
      {row.days.map((day) => cell(day, outside ? !outside(day.iso) : false))}
    </View>
  );

  const when = new Date(`${selected}T12:00:00`);

  return (
    <View className="pt-space-5">
      {/* A month at a time, once the span is past a few weeks. The controls are
          the ones a calendar always has, and Today is the way back from
          wherever stepping through months left somebody. */}
      {grid ? (
        <View className="flex-row items-center gap-space-2 px-gutter-screen pb-space-3">
          <Pressable
            onPress={() => setMonth(stepMonth(grid.key, -1))}
            hitSlop={10}
            accessibilityLabel="Previous month"
            className="min-h-tap-min justify-center"
          >
            <Glyph name="chevron-left" size={18} color={COLOR.iconOnWell} />
          </Pressable>
          {/* **It takes the room, so the arrows never move.** Sized by the
              month name, the right arrow walked between March and September,
              and further in a language with longer months. */}
          <Text
            className={`flex-1 text-center font-core font-medium ${
              isAndroid ? "text-a-on" : "text-text-primary"
            }`}
            style={{ fontSize: 14 }}
          >
            {grid.label}
          </Text>
          <Pressable
            onPress={() => setMonth(stepMonth(grid.key, 1))}
            hitSlop={10}
            accessibilityLabel="Next month"
            className="min-h-tap-min justify-center"
          >
            <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
          </Pressable>
          <Pressable
            onPress={() => {
              setMonth(null);
              setSelected(today);
            }}
            hitSlop={10}
            className="ml-auto min-h-tap-min justify-center"
          >
            <Text className="font-core font-medium text-text-accent" style={{ fontSize: 12.5 }}>
              Today
            </Text>
          </Pressable>
        </View>
      ) : null}

      {(grid ? grid.weeks : (rail ?? [])).map((row) =>
        week(row, grid ? grid.inMonth : undefined),
      )}

      <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-6">
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 21 }}
        >
          {when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        {selected === today ? (
          <View
            className={`rounded-pill px-space-3 py-space-1 ${
              isAndroid ? "bg-a-c" : "bg-surface-fill"
            }`}
          >
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 12 }}
            >
              Today
            </Text>
          </View>
        ) : null}
      </View>

      {dayRows.length === 0 && dayNotes.length === 0 ? (
        <Text
          className="px-gutter-screen font-core text-text-tertiary"
          style={{ fontSize: 13, lineHeight: 19 }}
        >
          Nothing on this day.
        </Text>
      ) : null}

      {/* A note is drawn as a note: no tick, no tools, nothing to open. */}
      {dayNotes.map(({ one, note }) => (
        <View
          key={one.id}
          className="flex-row items-start gap-space-3 border-b border-border-hairline px-gutter-screen py-space-4"
        >
          {note.origin === "learned" ? (
            <View style={{ marginTop: 3 }}>
              <Glyph name="sparkles" size={14} color={COLOR.accent} />
            </View>
          ) : null}
          <Text
            className={`flex-1 font-core ${
              note.origin === "learned"
                ? "text-text-accent"
                : isAndroid
                  ? "text-a-on"
                  : "text-text-primary"
            }`}
            style={{ fontSize: 14.5, lineHeight: 21 }}
            accessibilityLabel={
              (note.origin === "learned" ? "offload wrote this. " : "") + note.text
            }
          >
            {note.text}
          </Text>
        </View>
      ))}

      {dayRows.map(({ one, row }, index) => (
        <ContentRowView
          key={one.id}
          row={row}
          border={index < dayRows.length - 1}
          arrived={false}
          onDelete={() => onDelete(row)}
          onActions={() => onActions(row)}
          onToggle={row.type === "task" ? () => onToggle(row) : undefined}
          // **The time, which the phone's row has nowhere else to put.** Web
          // draws it in the meta slot; here the row has one text line and this
          // is the slot it has, so a day with three timed events says which
          // order they are in rather than listing them silently.
          // **Nothing when the date has no time in it.** A bare date is a day,
          // and drawing an hour it does not have is how "Sunday brunch" read
          // "8:00 PM".
          note={
            one.due
              ? "due"
              : row.allDay || !row.occursAt
                ? undefined
                : new Date(row.occursAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })
          }
        />
      ))}
    </View>
  );
}
