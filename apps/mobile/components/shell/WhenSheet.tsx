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
//
// 2026-09-29. The body is `WhenPanel`, which the edit sheet opens in place
// rather than as a second sheet over it, and which this sheet wraps when the
// long press's When opens it alone. Its foot is the row sheets' own: Clear on
// the left where Delete sits, Cancel and Save on the right.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { formatRule, monthFor, parseRule, presetsFor, stepMonth, type Preset } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { Switch } from "../settings/Switch";
import { useColors } from "../../lib/colors";
import { useWeekStart } from "../../lib/appearance";
import { useClock } from "../../lib/clock";
import { NOTHING, anHourAfter, clockLabel, repeatsLabel, whenLabel, type WhenValue } from "../../lib/when";
import { DragSheet } from "./DragSheet";
import { CustomRepeatSheet } from "./CustomRepeatSheet";
import { SheetFoot } from "./SheetFoot";

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

/** A Custom rule's sheet, asked for by the panel and drawn by whoever holds
 *  the panel, at its root: inside a scroll view, `absolute inset-0` measures
 *  against the scrolled content. */
export interface CustomAsk {
  anchorDay: string;
  initial: string | null;
  done: (rule: string) => void;
}

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
  const { height: windowHeight } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [custom, setCustom] = useState<CustomAsk | null>(null);
  if (!open) return null;
  return (
    <>
      <DragSheet onClose={onClose} className="pb-space-8" sheetStyle={{ maxHeight: windowHeight * 0.88 }}>
        <ScrollView ref={scroll} contentContainerClassName="px-gutter-screen" keyboardShouldPersistTaps="handled">
          <WhenPanel
            title={title}
            isEvent={isEvent}
            initial={initial}
            focus={focus}
            confirm="Save"
            onCancel={onClose}
            onSave={onSave}
            onCustom={setCustom}
            onScrollTo={(y) => scroll.current?.scrollTo({ y, animated: false })}
          />
        </ScrollView>
      </DragSheet>

      <CustomFor ask={custom} onClose={() => setCustom(null)} />
    </>
  );
}

/** The Custom rule's sheet, for a panel's ask. */
export function CustomFor({ ask, onClose }: { ask: CustomAsk | null; onClose: () => void }): ReactNode {
  if (!ask) return null;
  return (
    <CustomRepeatSheet
      open
      anchorDay={ask.anchorDay}
      initial={ask.initial}
      onClose={onClose}
      onDone={(rule) => {
        ask.done(rule);
        onClose();
      }}
    />
  );
}

/** An hour under All day: the system's compact picker on iOS, a row that
 *  opens the system's dialog on Android, at five-minute steps either way. */
function HourRow({
  label,
  time,
  onPick,
  onAndroid,
  ink,
  quiet,
}: {
  label: string;
  time: string;
  onPick: (event: DateTimePickerEvent, picked?: Date) => void;
  onAndroid: () => void;
  ink: string;
  quiet: string;
}) {
  if (isAndroid) {
    return (
      <Pressable onPress={onAndroid} className="min-h-tap-min flex-row items-center" accessibilityRole="button" accessibilityLabel={label}>
        <Text className={`flex-1 font-core ${ink}`} style={{ fontSize: 15 }}>
          {label}
        </Text>
        <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }}>
          {clockLabel(time)}
        </Text>
      </Pressable>
    );
  }
  return (
    <View className="min-h-tap-min flex-row items-center">
      <Text className={`flex-1 font-core ${ink}`} style={{ fontSize: 15 }}>
        {label}
      </Text>
      <DateTimePicker mode="time" display="compact" minuteInterval={5} value={pickerDate(time)} onChange={onPick} accessibilityLabel={label} />
    </View>
  );
}

/** The When sheet's body and foot, with no sheet around it. */
export function WhenPanel({
  title,
  isEvent,
  initial,
  focus = "when",
  confirm,
  onCancel,
  onSave,
  onCustom,
  onScrollTo,
}: {
  title: string;
  isEvent: boolean;
  initial: WhenValue;
  focus?: "when" | "repeats";
  /** Save where this writes, Done where it hands back to an edit sheet. */
  confirm: string;
  onCancel: () => void;
  /** Save, or Clear, which is Save with nothing in it. */
  onSave: (value: WhenValue) => void;
  onCustom: (ask: CustomAsk) => void;
  /** Scrolls whatever holds the panel, for landing on Repeats. */
  onScrollTo: (y: number) => void;
}) {
  const COLOR = useColors();
  const { zone, today } = useClock();
  const weekStart = useWeekStart();

  const [day, setDay] = useState<string | null>(initial.day);
  // 2026-10-17. A span's last day, picked on the same grid while
  // `pickingEnd` is on.
  const [endDay, setEndDay] = useState<string | null>(initial.endDay);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [time, setTime] = useState<string | null>(initial.time);
  const [endTime, setEndTime] = useState<string | null>(initial.endTime);
  const [rrule, setRule] = useState<string | null>(initial.rrule);
  const [month, setMonth] = useState<string>(initial.day ?? today);
  const [block, setBlock] = useState<"repeats" | null>(focus === "repeats" ? "repeats" : null);

  // Opened for Repeats, the sheet lands on that block rather than the grid:
  // the row reports where it is and the sheet scrolls there once, unanimated.
  const [repeatsY, setRepeatsY] = useState<number | null>(null);
  const landed = useRef(false);
  useEffect(() => {
    if (focus === "repeats" && repeatsY !== null && !landed.current) {
      landed.current = true;
      onScrollTo(repeatsY);
    }
  }, [focus, repeatsY, onScrollTo]);

  const grid = useMemo(() => monthFor(month, [], today, weekStart), [month, today, weekStart]);
  const presets: Preset[] = useMemo(() => (day ? presetsFor(day) : []), [day]);
  const current: WhenValue = { day, endDay: day && !rrule ? endDay : null, time, endTime: isEvent ? endTime : null, rrule: day ? rrule : null };

  // The presets read off the picked day and rewrite when it changes; a rule
  // chosen from them follows the day, a Custom one is kept as it was.
  const chosenPreset = presets.find((preset) => preset.rule && preset.rule === rrule);
  const pickDay = (iso: string): void => {
    // A last day on or before the first is one day again.
    if (pickingEnd && day) {
      setPickingEnd(false);
      setEndDay(iso > day ? iso : null);
      if (!grid.inMonth(iso)) setMonth(iso);
      return;
    }
    setEndDay(endDay && endDay > iso ? endDay : null);
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
    <View>
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
            const picked = one.iso === day || one.iso === current.endDay;
            const between = Boolean(day && current.endDay && one.iso > day && one.iso < current.endDay);
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
                  className={`items-center justify-center rounded-pill ${picked ? "bg-surface-inverse" : between ? "bg-surface-fill" : ""}`}
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

      {/* The last day, picked on the same grid (2026-10-17). Not on a
          repeating row: the chip has no words for a repeating span. */}
      {day && !rrule ? (
        <Pressable
          onPress={() => setPickingEnd(!pickingEnd)}
          accessibilityRole="button"
          accessibilityState={{ selected: pickingEnd }}
          accessibilityLabel={`Last day, ${pickingEnd ? "pick on the grid" : endDay ? whenLabel({ ...NOTHING, day: endDay }) : "same day"}`}
          className="mt-space-3 min-h-tap-min flex-row items-center"
        >
          <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
            Last day
          </Text>
          {/* Android has no accent ink in this sheet: its own ink, heavier. */}
          <Text className={`font-core ${pickingEnd ? (isAndroid ? "font-medium text-a-on" : "text-text-accent") : quiet}`} style={{ fontSize: 15 }}>
            {pickingEnd ? "Pick on the grid" : endDay ? whenLabel({ ...NOTHING, day: endDay }) : "Same day"}
          </Text>
        </Pressable>
      ) : null}

      {/* Time is one row, the All day switch (the owner, 2026-10-16). While
          it is off the hour sits under it, and on an event the end; while it
          is on there is no clock to show (2026-10-12). iOS draws the system's
          compact picker, Android a row that opens the system's dialog. */}
      <View className={`${day ? "" : "mt-space-3 "}min-h-tap-min flex-row items-center`} style={{ opacity: day ? 1 : 0.45 }}>
        <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
          All day
        </Text>
        <Switch checked={time === null} onChange={setAllDay} label="All day" disabled={!day} />
      </View>
      {day && time !== null ? (
        <HourRow label={isEvent ? "Starts" : "Time"} time={time} onPick={onTime} onAndroid={() => openAndroidClock("start")} ink={rowInk} quiet={quiet} />
      ) : null}
      {day && isEvent && time !== null ? (
        <HourRow label="Ends at" time={endTime ?? anHourAfter(time)} onPick={onEnd} onAndroid={() => openAndroidClock("end")} ink={rowInk} quiet={quiet} />
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
                onPress={() =>
                  preset.rule === "custom"
                    ? onCustom({
                        anchorDay: day,
                        initial: rrule && !chosenPreset ? rrule : null,
                        done: (rule) => {
                          const parsed = parseRule(rule);
                          setRule(parsed.ok ? formatRule(parsed.rule) : null);
                        },
                      })
                    : setRule(preset.rule)
                }
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

      {/* Clear where Delete sits, Cancel and Save on the right. */}
      <SheetFoot
        lead={{ label: "Clear", danger: true, onPress: () => onSave(NOTHING) }}
        onCancel={onCancel}
        onConfirm={() => onSave(current)}
        confirm={confirm}
      />
    </View>
  );
}
