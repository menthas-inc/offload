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

/** Rehomes an all-day timestamp at local noon on the same UTC calendar day.
 *
 *  The API stores an all-day date as UTC midnight for the day it means. Read
 *  with local getters anywhere west of Greenwich, that instant falls the
 *  evening before, so `datedFor`'s `localDay` recovers the wrong day. Noon
 *  keeps the same calendar day no matter the reader's offset. */
function localizeAllDay(iso: string): string {
  const at = new Date(iso);
  return new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 12).toISOString();
}

function forRail<
  T extends {
    allDay: boolean;
    occursAt: string | null;
    occursEndAt: string | null;
    dueAt: string | null;
  },
>(item: T): T {
  if (!item.allDay) return item;
  return {
    ...item,
    occursAt: item.occursAt ? localizeAllDay(item.occursAt) : item.occursAt,
    occursEndAt: item.occursEndAt ? localizeAllDay(item.occursEndAt) : item.occursEndAt,
    dueAt: item.dueAt ? localizeAllDay(item.dueAt) : item.dueAt,
  };
}

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
    other: COLOR.quiet,
  };

  // **All-day dates come back as UTC midnight for the calendar day, and the
  // shared rail reads them with local getters.** West of Greenwich that rolls
  // the day back by one: a due date of the 14th drew its dot on the 13th, and
  // a dateless dentist appointment on the 3rd of March drew on the 2nd at a
  // fabricated 7pm. `forRail` rehomes the timestamp at local noon on the same
  // UTC calendar day, which survives that reading intact.
  const dated = useMemo(
    () => datedFor(rows.map(forRail), notes.map(forRail)),
    [rows, notes],
  );
  const rail = useMemo(() => railFor(dated, today, weekStart), [dated, today, weekStart]);

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
      <Text className="font-core text-text-tertiary" style={{ fontSize: 11 }}>
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
          {weeksIn(row, today).map((one) => (one.row === "week" ? week(one.days, one.key) : null))}
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
