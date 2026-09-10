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
  dayLabel,
  datedFor,
  localDay,
  railFor,
  thingsOn,
  weeksIn,
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
  const [opened, setOpened] = useState<string[]>([]);

  /** The colour of a dot is what the thing is: blue already means waiting on
   *  you, ink is a fact of the day rather than a demand on it, and amber is
   *  what the kits use for something offload has noticed. */
  const DOT: Record<string, string> = {
    task: COLOR.attention,
    event: COLOR.ink,
    note: COLOR.noticed,
    other: COLOR.iconOnWell,
  };

  const dated = useMemo(() => datedFor(rows, notes), [rows, notes]);
  const rail = useMemo(() => railFor(dated, today, weekStart), [dated, today, weekStart]);

  const onDay = thingsOn(dated, selected);
  const dayRows = rows.filter((row) => onDay.includes(row.id) || onDay.includes(`${row.id}:due`));
  const dayNotes = notes.filter(
    (note) => onDay.includes(note.id) || onDay.includes(`${note.id}:due`),
  );

  const cell = (day: Day) => (
    <Pressable
      key={day.iso}
      onPress={() => setSelected(day.iso)}
      // The dots are the fast read and never the only one.
      accessibilityLabel={dayLabel(day)}
      accessibilityRole="button"
      accessibilityState={{ selected: day.iso === selected }}
      className={`min-h-tap-min flex-1 items-center rounded-xs py-space-3 ${
        day.iso === selected ? (isAndroid ? "bg-a-c" : "bg-surface-fill") : ""
      }`}
      style={
        day.today
          ? { borderWidth: 1, borderColor: COLOR.borderFocus }
          : { borderWidth: 1, borderColor: "transparent" }
      }
    >
      <Text
        className={`font-core ${day.past ? "text-text-tertiary" : "text-text-tertiary"}`}
        style={{ fontSize: 11 }}
      >
        {day.dow}
      </Text>
      <Text
        className={`font-core font-semibold ${
          day.past ? "text-text-tertiary" : isAndroid ? "text-a-on" : "text-text-primary"
        }`}
        style={{ fontSize: 13 }}
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
              backgroundColor: dot.done ? "transparent" : DOT[dot.kind] ?? DOT["other"],
              borderWidth: dot.done ? 1 : 0,
              borderColor: DOT[dot.kind] ?? DOT["other"],
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

  const week = (days: Day[], key: string) => (
    <View key={key} className="flex-row gap-space-1 px-gutter-screen">
      {days.map(cell)}
    </View>
  );

  const drawRow = (row: RailRow) => {
    if (row.row === "week") return week(row.days, row.key);
    if (opened.includes(row.key)) {
      return (
        <View key={row.key}>
          {weeksIn(row).map((one) => (one.row === "week" ? week(one.days, one.key) : null))}
        </View>
      );
    }
    return (
      <Pressable
        key={row.key}
        onPress={() => setOpened([...opened, row.key])}
        className="min-h-tap-min items-center justify-center"
      >
        <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
          {row.weeks} weeks with nothing
        </Text>
      </Pressable>
    );
  };

  const when = new Date(`${selected}T12:00:00`);

  return (
    <View className="pt-space-5">
      {rail.map(drawRow)}

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
      {dayNotes.map((note) => (
        <View
          key={note.id}
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

      {dayRows.map((row, index) => (
        <ContentRowView
          key={row.id}
          row={row}
          border={index < dayRows.length - 1}
          arrived={false}
          onDelete={() => onDelete(row)}
          onActions={() => onActions(row)}
          onToggle={row.type === "task" ? () => onToggle(row) : undefined}
        />
      ))}
    </View>
  );
}
