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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { ReduceMotion, SlideInLeft, SlideInRight, runOnJS } from "react-native-reanimated";
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
import { useConversation } from "./conversation-context";
import { QUICK_ADD_CHARS } from "../../lib/threads";
import type { ContentRow, Note } from "../../lib/threads";

const isAndroid = Platform.OS === "android";

interface Props {
  threadId: string;
  threadName: string;
  rows: ContentRow[];
  notes: Note[];
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onEdit: (row: ContentRow) => void;
  onArchive: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
}

export function Timeline({
  threadId,
  threadName,
  rows,
  notes,
  onDelete,
  onActions,
  onEdit,
  onArchive,
  onToggle,
}: Props) {
  const { raiseFor } = useConversation();
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
  // Which way the last move went, so the grid comes in from the side it came
  // from. Movement says the direction in a way a redraw cannot.
  const [went, setWent] = useState<1 | -1>(1);

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
      // that it read as nothing, and a flat fill said it so evenly that it
      // read as one block of colour rather than a light. The ring is still a
      // border, sized in every state so nothing shuffles as things are added
      // and ticked off, but the fill is now a blurred inset `boxShadow`
      // instead: RN 0.86 draws it natively, the same shape the web draws with
      // `box-shadow`, so the colour comes in from the edge and thins toward
      // the middle rather than filling the cell.
      style={{
        borderWidth: 1,
        borderColor:
          day.iso === selected
            ? COLOR.attention
            : day.count > 0 || day.today
              ? COLOR.borderFocus
              : "transparent",
        backgroundColor: day.iso === selected ? COLOR.attention : "transparent",
        boxShadow:
          day.iso !== selected && day.count > 0
            ? [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: COLOR.borderAttention, inset: true }]
            : undefined,
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

  const goToday = (): void => {
    // Back to this month from wherever you are, and in the direction that is
    // actually true: forward if you had wandered into the past.
    if (grid) setWent(grid.key > today ? -1 : 1);
    setMonth(null);
    setSelected(today);
  };

  const step = (by: 1 | -1): void => {
    if (!grid) return;
    setWent(by);
    setMonth(stepMonth(grid.key, by));
  };

  // Sideways only, and only once the movement is clearly sideways, so a
  // vertical drag still scrolls the thread under it. `runOnJS` because the
  // callback runs on the UI thread and `step` is ordinary React state.
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationX < -40) runOnJS(step)(1);
      else if (event.translationX > 40) runOnJS(step)(-1);
    });

  const when = new Date(`${selected}T12:00:00`);

  return (
    <View className="pt-space-5">
      {/* A month at a time, once the span is past a few weeks. The controls are
          the ones a calendar always has, and Today is the way back from
          wherever stepping through months left somebody. */}
      {grid ? (
        <View className="flex-row items-center gap-space-2 px-gutter-screen pb-space-3">
          <Pressable
            onPress={() => step(-1)}
            hitSlop={10}
            accessibilityLabel="Previous month"
            className="min-h-tap-min justify-center"
          >
            <Glyph name="chevron-left" size={18} color={COLOR.iconOnWell} />
          </Pressable>

          {/* **The arrows are the ends and everything else is between them.**
              Today sat beyond the next arrow, which put the two ways of moving
              through months on either side of a control that is not one. It is
              always drawn: appearing and disappearing would shift the month
              name beside it, and on this month it still takes the day back to
              today. */}
          <View className="flex-1 flex-row items-center justify-center gap-space-3">
            <Text
              className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{ fontSize: 14 }}
            >
              {grid.label}
            </Text>
            <Pressable onPress={goToday} hitSlop={10} className="min-h-tap-min justify-center">
              <Text className="font-core font-medium text-text-accent" style={{ fontSize: 12.5 }}>
                Today
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => step(1)}
            hitSlop={10}
            accessibilityLabel="Next month"
            className="min-h-tap-min justify-center"
          >
            <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
          </Pressable>
        </View>
      ) : null}

      {/* **A month is also a swipe.** The arrows are the discoverable way and
          this is the one a thumb reaches for on a grid that looks like every
          other calendar.

          `activeOffsetX` is what stops it fighting the thread's own scrolling:
          the gesture only takes over once the movement is clearly sideways, so
          a vertical drag still scrolls the page under it. */}
      {grid ? (
        <GestureDetector gesture={swipe}>
          {/* Keyed by the month so it remounts and the animation runs. Without
              the key the same element is rewritten in place and nothing moves,
              which is a redraw rather than a change of month. */}
          <Animated.View
            key={grid.key}
            entering={(went === 1 ? SlideInRight : SlideInLeft)
              .duration(140)
              // Anybody who has asked for less movement gets the change and
              // none of the travel.
              .reduceMotion(ReduceMotion.System)}
          >
            {grid.weeks.map((row) => week(row, grid.inMonth))}
          </Animated.View>
        </GestureDetector>
      ) : (
        (rail ?? []).map((row) => week(row))
      )}

      <View className="flex-row items-start gap-space-3 px-gutter-screen pb-space-3 pt-space-6">
        <Text
          className={`flex-1 font-core font-semibold ${
            isAndroid ? "text-a-on" : "text-text-primary"
          }`}
          style={{ fontSize: 21 }}
        >
          {when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        {selected === today ? (
          <View
            className={`shrink-0 rounded-pill px-space-3 py-space-1 ${
              isAndroid ? "bg-a-c" : "bg-surface-fill"
            }`}
            style={{ marginTop: 4 }}
          >
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 12 }}
            >
              Today
            </Text>
          </View>
        ) : null}

        {/* The same + every other section has, onto the day that is open. It
            raises the composer rather than opening a field of its own, like the
            others. The day travels with it; everything else about the thing is
            in the words, including how often it comes round. */}
        <Pressable
          onPress={() =>
            raiseFor({
              threadId,
              threadName,
              write: "quickAdd",
              section: "timeline",
              title: `Add to ${when.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}`,
              placeholder: "Type it, offload will sort it out",
              charLimit: QUICK_ADD_CHARS,
              day: selected,
            })
          }
          hitSlop={12}
          accessibilityLabel="Add to this day"
          style={{ marginTop: 3 }}
        >
          <Glyph name="plus" size={22} color={COLOR.iconOnWell} />
        </Pressable>
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
          onEdit={() => onEdit(row)}
          onArchive={() => onArchive(row)}
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
