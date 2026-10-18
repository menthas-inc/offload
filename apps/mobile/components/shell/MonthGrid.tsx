// A month as a calendar, on a phone: the thread calendar's grid, and since
// 2026-10-18 Today's too, in place of Today's day stepper. One grid, so a day
// is dotted, named and picked the same way in both. A day that does not open
// is drawn and closed: Today's past, and anything past the calendar copy's
// edge.

import { Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { ReduceMotion, SlideInLeft, SlideInRight, runOnJS } from "react-native-reanimated";
import { dayLabel, type Day, type Month, type RailRow } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

export function MonthGrid({
  grid,
  selected,
  went,
  onPick,
  onStep,
  onToday,
  closed,
  first = false,
  last = false,
  inset = true,
  title,
  heading = false,
}: {
  grid: Month;
  selected: string;
  /** Which way the last move went, so the grid comes in from that side. */
  went: 1 | -1;
  onPick: (iso: string) => void;
  onStep: (by: 1 | -1) => void;
  onToday: () => void;
  /** A day that is drawn but does not open. */
  closed?: (iso: string) => boolean;
  /** No month before this one, or after it. */
  first?: boolean;
  last?: boolean;
  /** Its own screen gutter, unless what it sits in already has one. */
  inset?: boolean;
  /** What the head names in place of the month: Today's picked day. */
  title?: string | undefined;
  /** The head is the screen's heading, as on Today. */
  heading?: boolean;
}) {
  const COLOR = useColors();
  const gutter = inset ? "px-gutter-screen" : "";
  const DOT: Record<string, string> = {
    task: COLOR.textAttention,
    event: COLOR.ink,
    note: COLOR.textNoticed,
    other: COLOR.quiet,
    // 2026-09-29. A picked calendar's event, hollow in the quietest ink: a
    // calendar with something every day otherwise lit every cell.
    calendar: COLOR.quiet,
  };

  const cell = (day: Day, outside = false) => (
    <Pressable
      key={day.iso}
      onPress={() => onPick(day.iso)}
      disabled={closed?.(day.iso) ?? false}
      // The dots are the fast read and never the only one.
      accessibilityLabel={dayLabel(day)}
      accessibilityRole="button"
      accessibilityState={{ selected: day.iso === selected }}
      className="min-h-tap-min flex-1 items-center rounded-xs py-space-3"
      // **A day with something on it is a lift, not a light**, and the day being
      // read is white on blue. The blue glow this replaces was not illegible;
      // it went because with the waiting chip and the task dot on the same
      // screen, blue was carrying five meanings at once. Blue now keeps the two
      // that are about time, today and the day being read, and everything about
      // content moved off the hue.
      //
      // **The border says things about the date, the surface says things about
      // the content**, which is the architecture the rail already had. Today is
      // still a blue edge, the read day is still the fill, and the lift sits
      // underneath both. The border is drawn in every state so nothing shuffles
      // as things are added and ticked off.
      style={{
        borderWidth: 1,
        borderColor:
          day.iso === selected
            ? COLOR.attention
            : day.today
              ? COLOR.borderFocus
              : day.own > 0
                ? COLOR.lift
                : "transparent",
        backgroundColor:
          day.iso === selected
            ? COLOR.attention
            : day.own > 0
              ? COLOR.raised
              : "transparent",
        // The drop that makes it a lift rather than a tint. Not inset: an
        // inset shadow is the glow this replaced.
        boxShadow:
          day.iso !== selected && day.own > 0
            ? [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: COLOR.shadow, inset: false }]
            : undefined,
      }}
    >
      <Text
        className={day.iso === selected ? "font-core" : "font-core text-text-tertiary"}
        style={{
          fontSize: 11,
          opacity: outside ? 0.6 : 1,
          // A day that does not open reads as closed: Today's past and the far edge.
          ...(day.iso === selected ? { color: COLOR.onAttention } : closed?.(day.iso) ? { color: COLOR.disabledText } : {}),
        }}
      >
        {day.dow}
      </Text>
      {/* **A day with nothing on it steps back**, which is the other half of the
          lift: without it the lift has nothing to be raised above. A wash dulls
          and an edge advances, which is why the grey version of the lit state
          read as *less* present than an empty cell.

          **Today is exempt.** A day with nothing on it is still today, and a
          rule that demotes empty days catches today on any week where today
          happens to be empty, which is most weeks. */}
      <Text
        className={`font-core ${
          day.iso === selected
            ? "font-semibold"
            : day.past || outside
              ? "font-semibold text-text-tertiary"
              : day.own === 0 && !day.today
                ? "text-text-tertiary"
                : isAndroid
                  ? "font-semibold text-a-on"
                  : "font-semibold text-text-primary"
        }`}
        style={{
          fontSize: 13,
          opacity: outside ? 0.6 : 1,
          // A day that does not open reads as closed: Today's past and the far edge.
          ...(day.iso === selected ? { color: COLOR.onAttention } : closed?.(day.iso) ? { color: COLOR.disabledText } : {}),
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
              // A calendar's event is hollow too, so the thread's own stand out.
              backgroundColor: dot.done || dot.kind === "calendar"
                ? "transparent"
                : day.iso === selected
                  ? COLOR.onAttention
                  : DOT[dot.kind] ?? DOT["other"],
              borderWidth: dot.done || dot.kind === "calendar" ? 1 : 0,
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

  const week = (row: RailRow) => (
    <View key={row.key} className={`flex-row gap-space-1 ${gutter}`}>
      {row.days.map((day) => cell(day, !grid.inMonth(day.iso)))}
    </View>
  );

  // Sideways only, and only once the movement is clearly sideways, so a
  // vertical drag still scrolls the thread under it. `runOnJS` because the
  // callback runs on the UI thread and `step` is ordinary React state.
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationX < -40) runOnJS(onStep)(1);
      else if (event.translationX > 40) runOnJS(onStep)(-1);
    });

  return (
    <>
      {/* A month at a time. The controls are the ones a calendar always has,
        and Today is the way back from wherever stepping through months left
        somebody. */}
      <View className={`flex-row items-center gap-space-2 pb-space-3 ${gutter}`}>
        <Pressable
          onPress={() => onStep(-1)}
          disabled={first}
          hitSlop={10}
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          className="min-h-tap-min justify-center"
        >
          <Glyph name="chevron-left" size={18} color={first ? COLOR.disabledText : COLOR.iconOnWell} />
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
            accessibilityRole={heading ? "header" : undefined}
          >
            {title ?? grid.label}
          </Text>
          <Pressable onPress={onToday} hitSlop={10} accessibilityRole="button" className="min-h-tap-min justify-center">
            <Text className="font-core font-medium text-text-accent" style={{ fontSize: 12.5 }}>
              Today
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => onStep(1)}
          disabled={last}
          hitSlop={10}
          accessibilityLabel="Next month"
          accessibilityRole="button"
          className="min-h-tap-min justify-center"
        >
          <Glyph name="chevron-right" size={18} color={last ? COLOR.disabledText : COLOR.iconOnWell} />
        </Pressable>
      </View>

      {/* **A month is also a swipe.** The arrows are the discoverable way and
        this is the one a thumb reaches for on a grid that looks like every
        other calendar.

        `activeOffsetX` is what stops it fighting the thread's own scrolling:
        the gesture only takes over once the movement is clearly sideways, so
        a vertical drag still scrolls the page under it. */}
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
          {grid.weeks.map(week)}
        </Animated.View>
      </GestureDetector>

    </>
  );
}
