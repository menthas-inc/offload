// Custom, the one thing in the picker that navigates. 023.
//
// Four controls and nothing else: an interval and its unit, the weekdays when
// the unit is weeks, the anchor when it is months, and one of three endings.
// Google's dialog has exactly this. Cancel and Done rather than Clear and
// Save: this sheet edits a rule and hands it back, it does not write the row.

import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { WEEKDAYS, formatRule, noonUtc, parseRule, utcDay, type Freq, type Rule, type Weekday } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { atOpacity, useColors } from "../../lib/colors";
import { useScreenSheet } from "./conversation-context";

const isAndroid = Platform.OS === "android";
const UNITS: { freq: Freq; one: string; many: string }[] = [
  { freq: "DAILY", one: "day", many: "days" },
  { freq: "WEEKLY", one: "week", many: "weeks" },
  { freq: "MONTHLY", one: "month", many: "months" },
  { freq: "YEARLY", one: "year", many: "years" },
];
const ORDINAL_WORDS: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };

function weekdayOf(day: string): Weekday {
  return WEEKDAYS[(noonUtc(day).getUTCDay() + 6) % 7]!;
}

export function CustomRepeatSheet({
  open,
  anchorDay,
  initial,
  onClose,
  onDone,
}: {
  open: boolean;
  anchorDay: string;
  initial: string | null;
  onClose: () => void;
  onDone: (rule: string) => void;
}) {
  const COLOR = useColors();
  const { height: windowHeight } = useWindowDimensions();
  useScreenSheet(open);

  const parsed = initial ? parseRule(initial) : null;
  const start: Rule = parsed?.ok ? parsed.rule : { freq: "WEEKLY", interval: 1, byDay: [weekdayOf(anchorDay)] };
  const dom = noonUtc(anchorDay).getUTCDate();
  const nth = (Math.ceil(dom / 7) >= 5 ? -1 : Math.ceil(dom / 7)) as 1 | 2 | 3 | 4 | -1;

  const [interval, setInterval] = useState(start.interval);
  const [freq, setFreq] = useState<Freq>(start.freq);
  const [byDay, setByDay] = useState<Weekday[]>(start.byDay ?? [weekdayOf(anchorDay)]);
  const [anchor, setAnchor] = useState<"dom" | "nth">(start.ordinal ? "nth" : "dom");
  const [ends, setEnds] = useState<"never" | "on" | "after">(start.until ? "on" : start.count ? "after" : "never");
  const [until, setUntil] = useState<string>(
    start.until ? `${start.until.slice(0, 4)}-${start.until.slice(4, 6)}-${start.until.slice(6, 8)}` : utcDay(new Date(noonUtc(anchorDay).getTime() + 90 * 86_400_000)),
  );
  const [count, setCount] = useState(start.count ?? 6);
  const [pickingUntil, setPickingUntil] = useState(false);

  if (!open) return null;

  const rule: Rule = { freq, interval };
  if (freq === "WEEKLY" && byDay.length > 0) rule.byDay = WEEKDAYS.filter((day) => byDay.includes(day));
  if (freq === "MONTHLY") {
    if (anchor === "nth") rule.ordinal = { n: nth, day: weekdayOf(anchorDay) };
    else rule.byMonthDay = dom;
  }
  if (ends === "on") rule.until = `${until.replace(/-/g, "")}T235959Z`;
  if (ends === "after") rule.count = count;

  const rowInk = isAndroid ? "text-a-on" : "text-text-primary";
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";
  const unit = UNITS.find((one) => one.freq === freq)!;

  /** A number typed rather than stepped: the design draws a field, and the
   *  glyph set has no minus. Clamped to the grammar's range on every change. */
  const Count = ({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) => (
    <TextInput
      value={String(value)}
      onChangeText={(text) => {
        const digits = text.replace(/[^0-9]/g, "");
        if (digits !== "") onChange(Math.min(max, Math.max(min, Number(digits))));
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={label}
      className={`rounded-sm border border-border-hairline px-space-3 py-space-2 text-center font-core ${rowInk}`}
      style={{ fontSize: 15, minWidth: 56, fontVariant: ["tabular-nums"] }}
    />
  );

  const Choice = ({ on, label, note, onPress }: { on: boolean; label: string; note?: string; onPress: () => void }) => (
    <Pressable onPress={onPress} className="min-h-tap-min flex-row items-center gap-space-3" accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <View className="items-center justify-center rounded-pill" style={{ width: 20, height: 20, borderWidth: 1.5, borderColor: on ? COLOR.ink : COLOR.hairline }}>
        {on ? <View className="rounded-pill bg-surface-inverse" style={{ width: 10, height: 10 }} /> : null}
      </View>
      <Text className={`font-core ${rowInk}`} style={{ fontSize: 15 }}>
        {label}
      </Text>
      {note ? (
        <Text className={`ml-auto font-core ${quiet}`} style={{ fontSize: 15 }}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} className="absolute inset-0" style={{ backgroundColor: atOpacity(COLOR.scrim, 0.35) }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        className={`absolute inset-x-0 bottom-0 pb-space-8 pt-space-3 ${isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"}`}
        style={{ maxHeight: windowHeight * 0.88 }}
      >
        <ScrollView contentContainerClassName="px-gutter-screen">
          <Text className={`font-core font-semibold ${rowInk}`} style={{ fontSize: 17 }}>
            Custom
          </Text>

          <View className="mt-space-3 min-h-tap-min flex-row items-center gap-space-3">
            <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
              Repeat every
            </Text>
            <Count value={interval} onChange={setInterval} min={1} max={99} label={`Every how many ${unit.many}`} />
          </View>
          <View className="flex-row gap-space-2">
            {UNITS.map((one) => (
              <Pressable
                key={one.freq}
                onPress={() => setFreq(one.freq)}
                className={`rounded-pill px-space-4 ${freq === one.freq ? "bg-surface-inverse" : "border border-border-hairline"}`}
                style={{ minHeight: 30, justifyContent: "center" }}
                accessibilityRole="radio"
                accessibilityState={{ checked: freq === one.freq }}
              >
                <Text className={`font-core font-medium ${freq === one.freq ? "text-text-inverse" : rowInk}`} style={{ fontSize: 13 }}>
                  {interval === 1 ? one.one : one.many}
                </Text>
              </Pressable>
            ))}
          </View>

          {freq === "WEEKLY" ? (
            <>
              <Text className={`mt-space-4 font-core ${quiet}`} style={{ fontSize: 13 }}>
                Repeat on
              </Text>
              <View className="mt-space-2 flex-row justify-between">
                {WEEKDAYS.map((day) => {
                  const on = byDay.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => setByDay(on ? byDay.filter((one) => one !== day) : [...byDay, day])}
                      className={`items-center justify-center rounded-pill ${on ? "bg-surface-inverse" : "border border-border-hairline"}`}
                      style={{ width: 38, height: 38 }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={day}
                    >
                      <Text className={`font-core font-medium ${on ? "text-text-inverse" : rowInk}`} style={{ fontSize: 13 }}>
                        {day.charAt(0)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {freq === "MONTHLY" ? (
            <View className="mt-space-3">
              <Choice on={anchor === "dom"} label={`On the ${dom}${dom % 10 === 1 && dom !== 11 ? "st" : dom % 10 === 2 && dom !== 12 ? "nd" : dom % 10 === 3 && dom !== 13 ? "rd" : "th"}`} onPress={() => setAnchor("dom")} />
              <Choice on={anchor === "nth"} label={`On the ${ORDINAL_WORDS[String(nth)]} ${new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(noonUtc(anchorDay))}`} onPress={() => setAnchor("nth")} />
            </View>
          ) : null}

          <Text className={`mt-space-4 font-core ${quiet}`} style={{ fontSize: 13 }}>
            Ends
          </Text>
          <Choice on={ends === "never"} label="Never" onPress={() => setEnds("never")} />
          <Choice
            on={ends === "on"}
            label="On"
            note={new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(noonUtc(until))}
            onPress={() => {
              setEnds("on");
              if (isAndroid) {
                DateTimePickerAndroid.open({
                  mode: "date",
                  value: noonUtc(until),
                  onChange: (event, picked) => {
                    if (event.type === "set" && picked) setUntil(utcDay(new Date(Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate(), 12))));
                  },
                });
              } else setPickingUntil(!pickingUntil);
            }}
          />
          {ends === "on" && pickingUntil && !isAndroid ? (
            <DateTimePicker
              mode="date"
              display="inline"
              value={noonUtc(until)}
              timeZoneName="UTC"
              onChange={(_, picked) => picked && setUntil(utcDay(picked))}
            />
          ) : null}
          <View className="flex-row items-center">
            <View className="flex-1">
              <Choice on={ends === "after"} label="After" onPress={() => setEnds("after")} />
            </View>
            <Count value={count} onChange={(n) => { setCount(n); setEnds("after"); }} min={1} max={999} label="How many times" />
            <Text className={`ml-space-2 font-core ${quiet}`} style={{ fontSize: 15 }}>
              times
            </Text>
          </View>

          <View className="mt-space-4 flex-row items-center justify-end gap-space-4">
            <Pressable onPress={onClose} className="rounded-pill border border-border-hairline px-space-5" style={{ minHeight: 30, justifyContent: "center" }} accessibilityRole="button">
              <Text className={`font-core font-medium ${quiet}`} style={{ fontSize: 13 }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable onPress={() => onDone(formatRule(rule))} className={`rounded-pill px-space-5 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`} style={{ minHeight: 30, justifyContent: "center" }} accessibilityRole="button">
              <Text className={`font-core font-medium ${isAndroid ? "text-a-surface" : "text-text-inverse"}`} style={{ fontSize: 13 }}>
                Done
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}
