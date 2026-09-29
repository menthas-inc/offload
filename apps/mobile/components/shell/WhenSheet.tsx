// The When sheet. 023.
//
// One field, called When, and the row's type decides what it writes. The
// grid is the front door: today outlined, the pick filled, two facts and two
// marks. The hour and the rule open inside the same sheet rather than on
// screens of their own, so nothing here navigates except Custom. Clear is a
// first-class control and clears the day, the hour and the rule together.
//
// The sheet hands its value back; the caller decides whether to write it now
// or hold it until an edit sheet's Save, which is what "Save writes once"
// means when this opened from one.

import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Animated from "react-native-reanimated";
import { scrimIn, scrimOut, sheetIn, sheetOut } from "../../lib/motion";
import { formatRule, monthFor, parseRule, presetsFor, stepMonth, type Preset } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { Switch } from "../settings/Switch";
import { atOpacity, useColors } from "../../lib/colors";
import { useWeekStart } from "../../lib/appearance";
import { useClock } from "../../lib/clock";
import { anHourAfter, clockLabel, repeatsLabel, type WhenValue } from "../../lib/when";
import { useScreenSheet } from "./conversation-context";
import { CustomRepeatSheet } from "./CustomRepeatSheet";

const isAndroid = Platform.OS === "android";

/** A wall time as a Date the platform's picker can show: the local clock of
 *  this device, which is only a way of drawing hours and minutes. */
function pickerDate(time: string | null): Date {
  const [h, m] = (time ?? "09:00").split(":").map(Number);
  const at = new Date();
  at.setHours(h ?? 9, m ?? 0, 0, 0);
  return at;
}

function fromPicker(date: Date): string {
  const minute = Math.round(date.getMinutes() / 5) * 5;
  const hour = (date.getHours() + Math.floor(minute / 60)) % 24;
  return `${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** An hour after, on the same day. */

export function WhenSheet({
  open,
  title,
  isEvent,
  initial,
  focus = "when",
  onClose,
  onSave,
}: {
  open: boolean;
  /** The row's title, under the sheet's own. */
  title: string;
  /** An event writes its occurrence and may have an end; everything else
   *  writes the day it is wanted by and has none. */
  isEvent: boolean;
  initial: WhenValue;
  /** Which block opens first: the grid, or Repeats scrolled to its own block. */
  focus?: "when" | "repeats";
  onClose: () => void;
  /** Save, or Clear, which is Save with nothing in it. */
  onSave: (value: WhenValue) => void;
}) {
  const COLOR = useColors();
  const { zone, today } = useClock();
  const weekStart = useWeekStart();
  const { height: windowHeight } = useWindowDimensions();
  useScreenSheet(open);

  const [day, setDay] = useState<string | null>(initial.day);
  const [time, setTime] = useState<string | null>(initial.time);
  const [endTime, setEndTime] = useState<string | null>(initial.endTime);
  const [rrule, setRule] = useState<string | null>(initial.rrule);
  const [month, setMonth] = useState<string>(initial.day ?? today);
  const [block, setBlock] = useState<"time" | "repeats" | null>(focus === "repeats" ? "repeats" : null);
  const [ends, setEnds] = useState(false);
  const [custom, setCustom] = useState(false);

  // Opened for Repeats, the sheet lands on that block rather than the grid:
  // the row reports where it is and the sheet scrolls there once, unanimated.
  const scroll = useRef<ScrollView>(null);
  const [repeatsY, setRepeatsY] = useState<number | null>(null);
  useEffect(() => {
    if (focus === "repeats" && repeatsY !== null) scroll.current?.scrollTo({ y: repeatsY, animated: false });
  }, [focus, repeatsY]);

  const grid = useMemo(() => monthFor(month, [], today, weekStart), [month, today, weekStart]);
  const presets: Preset[] = useMemo(() => (day ? presetsFor(day) : []), [day]);
  const current: WhenValue = { day, time, endTime: isEvent ? endTime : null, rrule: day ? rrule : null };

  if (!open) return null;

  // The presets read off the picked day and rewrite when it changes; a rule
  // chosen from them follows the day, a Custom one is kept as it was.
  const chosenPreset = presets.find((preset) => preset.rule && preset.rule === rrule);
  const pickDay = (iso: string): void => {
    const wasPreset = presets.find((preset) => preset.rule && preset.rule === rrule);
    setDay(iso);
    if (wasPreset) {
      const index = presets.indexOf(wasPreset);
      setRule(presetsFor(iso)[index]?.rule ?? null);
    }
    if (!grid.inMonth(iso)) setMonth(iso);
  };

  const onTime = (_: DateTimePickerEvent, picked?: Date): void => {
    if (!picked) return;
    const next = fromPicker(picked);
    setTime(next);
    if (isEvent && !endTime) setEndTime(anHourAfter(next));
  };
  const onEnd = (_: DateTimePickerEvent, picked?: Date): void => {
    if (picked) setEndTime(fromPicker(picked));
  };
  const openAndroidClock = (which: "start" | "end"): void => {
    DateTimePickerAndroid.open({
      mode: "time",
      value: pickerDate(which === "start" ? time : endTime),
      onChange: (event, picked) => {
        if (event.type !== "set" || !picked) return;
        if (which === "start") onTime(event, picked);
        else onEnd(event, picked);
      },
    });
  };
  const setAllDay = (on: boolean): void => {
    if (on) {
      setTime(null);
      setEndTime(null);
    } else {
      const next = time ?? "09:00";
      setTime(next);
      if (isEvent && !endTime) setEndTime(anHourAfter(next));
    }
  };

  const rowInk = isAndroid ? "text-a-on" : "text-text-primary";
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  return (
    <>
      <Animated.View
        entering={scrimIn()}
        exiting={scrimOut()}
        className="absolute inset-0"
        style={{ backgroundColor: atOpacity(COLOR.scrim, 0.35) }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        entering={sheetIn()}
        exiting={sheetOut()}
        className={`absolute inset-x-0 bottom-0 pb-space-8 pt-space-3 ${
          isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"
        }`}
        style={{ maxHeight: windowHeight * 0.88 }}
      >
        <ScrollView ref={scroll} contentContainerClassName="px-gutter-screen" keyboardShouldPersistTaps="handled">
          <Text className={`font-core font-semibold ${rowInk}`} style={{ fontSize: 17 }}>
            When
          </Text>
          <Text className={`mt-space-1 font-core ${quiet}`} style={{ fontSize: 13 }} numberOfLines={1}>
            {title}
          </Text>

          {/* The month, and the arrows that step it. */}
          <View className="mt-space-4 flex-row items-center">
            <Text className={`flex-1 font-core font-medium ${rowInk}`} style={{ fontSize: 15 }}>
              {grid.label}
            </Text>
            <Pressable onPress={() => setMonth(stepMonth(month, -1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" className="min-h-tap-min justify-center px-space-3">
              <Glyph name="chevron-left" size={20} color={COLOR.iconOnWell} />
            </Pressable>
            <Pressable onPress={() => setMonth(stepMonth(month, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" className="min-h-tap-min justify-center px-space-3">
              <Glyph name="chevron-right" size={20} color={COLOR.iconOnWell} />
            </Pressable>
          </View>

          {/* The grid. Today is outlined, the pick is filled; the days either
              side of the month are quieter and still tappable. */}
          <View className="mt-space-2 flex-row">
            {grid.weeks[0]?.days.map((one) => (
              <Text key={one.iso} className={`flex-1 text-center font-core ${quiet}`} style={{ fontSize: 11 }}>
                {one.dow.slice(0, 1)}
              </Text>
            ))}
          </View>
          {grid.weeks.map((week) => (
            <View key={week.key} className="flex-row">
              {week.days.map((one) => {
                const picked = one.iso === day;
                return (
                  <Pressable
                    key={one.iso}
                    onPress={() => pickDay(one.iso)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked }}
                    accessibilityLabel={one.iso}
                    className="flex-1 items-center justify-center"
                    style={{ minHeight: 40 }}
                  >
                    <View
                      className={`items-center justify-center rounded-pill ${picked ? "bg-surface-inverse" : ""}`}
                      style={{
                        minWidth: 34,
                        minHeight: 34,
                        ...(one.today && !picked ? { borderWidth: 1.5, borderColor: COLOR.borderFocus } : {}),
                      }}
                    >
                      <Text
                        className={`font-core ${picked ? "font-medium text-text-inverse" : grid.inMonth(one.iso) ? rowInk : "text-text-tertiary"}`}
                        style={{ fontSize: 15, fontVariant: ["tabular-nums"] }}
                      >
                        {one.dom}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Time, revealed in place. */}
          <Pressable
            onPress={() => day && setBlock(block === "time" ? null : "time")}
            disabled={!day}
            accessibilityRole="button"
            className="mt-space-3 min-h-tap-min flex-row items-center gap-space-3"
            style={{ opacity: day ? 1 : 0.45 }}
          >
            <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
              Time
            </Text>
            <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }}>
              {time ? clockLabel(time) : "All day"}
            </Text>
            <Glyph name="chevron-down" size={18} color={COLOR.iconOnWell} />
          </Pressable>
          {block === "time" && day ? (
            <View className="pb-space-2">
              <View className="min-h-tap-min flex-row items-center">
                <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                  All day
                </Text>
                <Switch checked={time === null} onChange={setAllDay} label="All day" />
              </View>
              {isAndroid ? (
                // No inline wheel on Android: the hour is a row that opens the
                // system's own dialog, and while All day is on it shows the
                // last hour greyed, which keeps the same promise in Material's
                // shape.
                <Pressable
                  onPress={() => (time === null ? setAllDay(false) : openAndroidClock("start"))}
                  className="min-h-tap-min flex-row items-center"
                  style={{ opacity: time === null ? 0.45 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel="Time"
                >
                  <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                    {isEvent ? "Starts" : "Time"}
                  </Text>
                  <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }}>
                    {clockLabel(time ?? "09:00")}
                  </Text>
                </Pressable>
              ) : (
                // The system's wheel at five-minute steps, greyed rather than
                // removed while All day is on, so the hour you had stays
                // visible; touching it turns All day back off.
                <View style={{ opacity: time === null ? 0.4 : 1 }}>
                  <Pressable onPress={() => time === null && setAllDay(false)} disabled={time !== null}>
                    <View pointerEvents={time === null ? "none" : "auto"}>
                      <DateTimePicker
                        mode="time"
                        display="spinner"
                        minuteInterval={5}
                        value={pickerDate(time)}
                        onChange={onTime}
                        style={{ height: 132 }}
                      />
                    </View>
                  </Pressable>
                </View>
              )}
              {isEvent && time ? (
                <>
                  <Pressable
                    onPress={() => (isAndroid ? openAndroidClock("end") : setEnds(!ends))}
                    className="min-h-tap-min flex-row items-center gap-space-3"
                    accessibilityRole="button"
                  >
                    <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                      Ends at
                    </Text>
                    <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }}>
                      {clockLabel(endTime ?? anHourAfter(time))}
                    </Text>
                    <Glyph name={isAndroid ? "chevron-right" : "chevron-down"} size={18} color={COLOR.iconOnWell} />
                  </Pressable>
                  {ends && !isAndroid ? (
                    <DateTimePicker
                      mode="time"
                      display="spinner"
                      minuteInterval={5}
                      value={pickerDate(endTime ?? anHourAfter(time))}
                      onChange={onEnd}
                      style={{ height: 132 }}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          {/* Repeats, revealed in place. */}
          <Pressable
            onPress={() => day && setBlock(block === "repeats" ? null : "repeats")}
            onLayout={(event) => setRepeatsY(event.nativeEvent.layout.y)}
            disabled={!day}
            accessibilityRole="button"
            className="min-h-tap-min flex-row items-center gap-space-3"
            style={{ opacity: day ? 1 : 0.45 }}
          >
            <Glyph name="clock" size={18} color={COLOR.iconOnWell} />
            <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
              Repeats
            </Text>
            <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }} numberOfLines={1}>
              {repeatsLabel(current)}
            </Text>
            <Glyph name="chevron-down" size={18} color={COLOR.iconOnWell} />
          </Pressable>
          {block === "repeats" && day ? (
            <View className="pb-space-2">
              {presets.map((preset) => {
                const on = preset.rule === "custom" ? rrule !== null && !chosenPreset : preset.rule === rrule;
                return (
                  <Pressable
                    key={preset.label}
                    onPress={() => (preset.rule === "custom" ? setCustom(true) : setRule(preset.rule))}
                    className="min-h-tap-min flex-row items-center gap-space-3"
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                      {preset.label}
                    </Text>
                    {preset.rule === "custom" ? (
                      <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
                    ) : on ? (
                      <Glyph name="check" size={18} color={COLOR.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Clear and Save. */}
          <View className="mt-space-4 flex-row items-center justify-end gap-space-4">
            <Pressable
              onPress={() => onSave({ day: null, time: null, endTime: null, rrule: null })}
              hitSlop={8}
              className="rounded-pill border border-border-hairline px-space-5"
              style={{ minHeight: 30, justifyContent: "center" }}
              accessibilityRole="button"
            >
              <Text className="font-core font-medium text-text-danger" style={{ fontSize: 13 }}>
                Clear
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(current)}
              hitSlop={8}
              className={`rounded-pill px-space-5 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`}
              style={{ minHeight: 30, justifyContent: "center" }}
              accessibilityRole="button"
            >
              <Text className={`font-core font-medium ${isAndroid ? "text-a-surface" : "text-text-inverse"}`} style={{ fontSize: 13 }}>
                Save
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>

      {custom && day ? (
        <CustomRepeatSheet
          open
          anchorDay={day}
          initial={rrule && !chosenPreset ? rrule : null}
          onClose={() => setCustom(false)}
          onDone={(rule) => {
            const parsed = parseRule(rule);
            setRule(parsed.ok ? formatRule(parsed.rule) : null);
            setCustom(false);
          }}
        />
      ) : null}
    </>
  );
}
