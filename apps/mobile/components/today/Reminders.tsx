// 042 Reminders, on Today only: what offload is reminding you about, nearest
// first. Drawn as the kit's column since 2026-10-11 (`TodayReminders.jsx`,
// shared by iOS, Android and the web): the countdown leads in a fixed column,
// everything on the day shares one card under a single Today, each later
// thing is a card of its own, and under the name is where it lives, with its
// time in the day's colour. No tick, no chip, no pill: the row opens the
// thing, a row or a note its thread, a memory Memories. The row and its
// dismiss are two controls side by side, as Open in your threads draws its
// tick and its row, so a screen reader reaches both.
//
// The x dismisses **this reminder and nothing else** (the owner): a birthday
// dismissed a month out comes back a week out, so its line says when, with
// Undo, where the name was (2026-10-18). Which entries show is the screen's,
// so an emptied section takes no band once its last line has run.

import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import {
  countdownLabel,
  dismissedLine,
  dismissLabel,
  reminderDayLine,
  reminderLine,
  reminderTimeLine,
  TODAY_REMINDERS,
  type ReminderLine,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { perform, type Writes } from "../../lib/optimistic";
import { dismissReminder, reminderDoor, undismissReminder, type ReminderEntry } from "../../lib/today";
import type { ToastState } from "../shell/Toast";
import { CARD_RADIUS, placedItem } from "../shell/InPlace";
import { useInPlace } from "../../lib/undo";
import { groundClass, useInBand } from "./Band";
import { SectionHead } from "./DayParts";

const isAndroid = Platform.OS === "android";
/** The countdown's column at the system's default text size; it grows with
 *  the system's text size, as the countdown does. */
const WHEN_WIDTH = 82;

/** One line of the column, built in widgets as the web builds it. */
type Line = ReminderLine & { door: ReturnType<typeof reminderDoor> };

function lineOf(entry: ReminderEntry, zone: string | null): Line {
  const line = reminderLine(entry, zone);
  return { ...line, door: reminderDoor(line.opens) };
}

export function Reminders({
  entries,
  today,
  zone,
  onGone,
  toast,
  writes,
}: {
  /** What is showing, nearest first, with what was dismissed here taken out. */
  entries: ReminderEntry[];
  today: string;
  zone: string | null;
  /** Hide or show an entry dismissed here, by its key. */
  onGone: (key: string, gone: boolean) => void;
  toast: ToastState;
  writes: Writes;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const inBand = useInBand();
  const { fontScale } = useWindowDimensions();
  const lines = entries.map((entry) => lineOf(entry, zone));
  const onDay = lines.filter((line) => line.day === today);
  const later = lines.filter((line) => line.day !== today);
  const keyOfLine = (line: Line) => line.key;
  const placedOnDay = useInPlace(onDay, keyOfLine);
  const placedLater = useInPlace(later, keyOfLine);
  if (placedOnDay.length + placedLater.length === 0) return null;

  const ink = isAndroid ? "text-a-on" : "text-text-primary";
  const quietInk = isAndroid ? "text-a-on-var" : "text-text-secondary";
  // The kit's 14 (Android 16): the card radius, not the page's 20.
  const card = `overflow-hidden ${isAndroid ? "rounded-a-lg" : "rounded-md"} ${groundClass(inBand)}`;
  const edge = { boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` };
  const rule = isAndroid ? "border-a-outline" : "border-border-hairline";

  function dismiss(line: Line): void {
    void perform(
      {
        apply: () => onGone(line.key, true),
        revert: () => onGone(line.key, false),
        write: () => dismissReminder(line.which),
        unwrite: () => undismissReminder(line.which),
        did: dismissedLine(line.next, today),
        failed: "Couldn't dismiss that",
        unfailed: "Couldn't put that back",
        place: { id: line.key, icon: "bell", form: "slot" },
      },
      toast,
      writes,
    );
  }

  // The shared card's day line is the day's, never one thing's "By".
  const when = (line: Pick<Line, "day" | "by">, shared: boolean) => (
    <View style={{ width: WHEN_WIDTH * fontScale }}>
      <Text className={`font-core font-semibold ${shared ? "text-text-noticed" : ink}`} style={{ fontSize: 17, lineHeight: 20, letterSpacing: -0.17 }}>
        {countdownLabel(line.day, today)}
      </Text>
      <Text className="font-core text-text-tertiary" style={{ fontSize: 12, lineHeight: 16, marginTop: 2, fontVariant: ["tabular-nums"] }}>
        {reminderDayLine(line.day, shared ? false : line.by)}
      </Text>
    </View>
  );

  const said = (line: Line) => (
    <View className="flex-1">
      <Text className={`font-core font-medium ${ink}`} style={{ fontSize: 15, lineHeight: 20 }}>
        {line.name}
      </Text>
      <View className="flex-row flex-wrap items-center" style={{ gap: 5, marginTop: 3 }}>
        <Glyph name={line.where.icon} size={12} color={COLOR.iconOnWell} />
        <Text className={`font-core ${quietInk}`} style={{ fontSize: 12.5, lineHeight: 15 }}>
          {line.where.text}
        </Text>
        {line.time ? (
          <Text className="font-core font-medium text-text-noticed" style={{ fontSize: 12.5, lineHeight: 15 }}>
            {`· ${reminderTimeLine(line.time, line.by)}`}
          </Text>
        ) : null}
      </View>
    </View>
  );

  /** The row opens the thing when it has somewhere to open; the x beside it
   *  is a control of its own. `inner` is what the button holds: the name and
   *  where it lives, or the countdown too on a card of its own. */
  const controls = (line: Line, inner: React.ReactNode) => (
    <>
      {line.door ? (
        <Pressable
          onPress={() => router.push(line.door!)}
          accessibilityRole="button"
          accessibilityLabel={`${line.name}, ${countdownLabel(line.day, today)}`}
          className="flex-1 flex-row items-center"
          style={{ gap: 12 }}
        >
          {inner}
        </Pressable>
      ) : (
        <View accessible className="flex-1 flex-row items-center" style={{ gap: 12 }}>
          {inner}
        </View>
      )}
      <Pressable
        onPress={() => dismiss(line)}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel(line.name)}
        className="items-center justify-center rounded-pill"
        style={{ width: 40, height: 40, marginVertical: -4, marginRight: -4 }}
      >
        <Glyph name="x" size={16} color={COLOR.iconOnWell} />
      </Pressable>
    </>
  );

  return (
    <View>
      <SectionHead title={TODAY_REMINDERS.name} count={lines.length} big />
      <View className="gap-space-4">
        {placedOnDay.length > 0 ? (
          <View className={`flex-row ${card}`} style={[edge, { paddingLeft: 14, gap: 12 }]}>
            {/* The day's, which every line on this card shares. */}
            <View style={{ paddingTop: 12 }}>{when({ day: today, by: false }, true)}</View>
            <View className="flex-1">
              {placedOnDay.map((one, index) =>
                placedItem(one, index < placedOnDay.length - 1, {
                  idOf: keyOfLine,
                  rule,
                  row: (line, border) => (
                    <View
                      key={line.key}
                      className={`flex-row items-center ${border ? `border-b ${rule}` : ""}`}
                      style={{ gap: 12, paddingVertical: 12, paddingRight: 10 }}
                    >
                      {controls(line, said(line))}
                    </View>
                  ),
                }),
              )}
            </View>
          </View>
        ) : null}
        {/* A later thing is a card of its own, so its line takes the card's corners. */}
        {placedLater.map((one) =>
          placedItem(one, false, {
            idOf: keyOfLine,
            radius: CARD_RADIUS,
            row: (line) => (
              <View key={line.key} className={`flex-row items-center ${card}`} style={[edge, { paddingVertical: 12, paddingLeft: 14, paddingRight: 10, gap: 12 }]}>
                {controls(
                  line,
                  <>
                    {when(line, false)}
                    {said(line)}
                  </>,
                )}
              </View>
            ),
          }),
        )}
      </View>
    </View>
  );
}
