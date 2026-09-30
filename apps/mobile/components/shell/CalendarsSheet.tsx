// 019. Calendars in this thread, as a sheet.
//
// `Sheet` as governed: `--radius-sheet` on top, a 36 by 4 handle with
// `--space-6` under it, a 21px semibold title with `--space-5` under it, and
// `--surface-scrim` behind, which is 0.32 and not the soft scrim's 0.16. On
// Android a Material bottom sheet, which is the same shape on its own tokens.
//
// **The caption under the title carries the state**, because the title has no
// trailing slot: which of your calendars offload reads here, or that it reads
// none and you should tick the ones it should. In a shared thread a second
// line says everyone in the thread sees what is on them, and under the rows
// the other members with picks are named and their calendars counted, never
// named. A thread with nothing approved gets one row, to Connected apps.
//
// The plate is above the router and would paint over this, which is why it
// says it is up through `DragSheet`, as every screen sheet does.

import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { CalendarRow } from "../settings/CalendarRow";
import { useColors } from "../../lib/colors";
import { fetchThreadCalendars, setThreadCalendar, type ThreadCalendars } from "../../lib/threads";
import { DragSheet } from "./DragSheet";

const isAndroid = Platform.OS === "android";
const FAILED = "That did not go through. Try again.";

export function calendarsLabel(picked: number, total: number): string {
  return picked === 0 ? "Calendars, none in this thread" : `Calendars, ${picked} of ${total} in this thread`;
}

/** The captions, per the thread's state. */
export function captionFor(
  threadName: string,
  mine: number,
  others: number,
  members: number
): { line: string; shared: string | null } {
  const line =
    mine > 0
      ? `Which of your calendars offload reads when it works on ${threadName}.`
      : others > 0
        ? `offload is not reading any of your calendars for ${threadName}. Tick the ones it should.`
        : `offload is not reading any calendar for ${threadName}. Tick the ones it should.`;
  return { line, shared: members > 1 ? `Everyone in ${threadName} sees what is on them.` : null };
}

export function othersLine(others: Array<{ displayName: string; count: number }>): string | null {
  if (others.length === 0) return null;
  const names =
    others.length === 1
      ? others[0]!.displayName
      : `${others
          .slice(0, -1)
          .map((o) => o.displayName)
          .join(", ")} and ${others[others.length - 1]!.displayName}`;
  const count = others.reduce((sum, o) => sum + o.count, 0);
  return `${names} ${others.length === 1 ? "reads" : "read"} ${count} ${count === 1 ? "calendar" : "calendars"} here.`;
}

export function CalendarsSheet({
  open,
  threadId,
  threadName,
  members,
  onClose,
  onChanged,
}: {
  open: boolean;
  threadId: string;
  threadName: string;
  members: number;
  onClose: () => void;
  /** The picks changed; the screen reloads its envelope and its rail. */
  onChanged: () => void;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const [list, setList] = useState<ThreadCalendars | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setFailed(false);
    // A list that did not come is the failure line, never the loading state:
    // the title alone is reserved for still fetching.
    fetchThreadCalendars(threadId)
      .then((next) => (next ? setList(next) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [open, threadId]);

  if (!open) return null;

  async function pick(calendarId: string, picked: boolean) {
    setFailed(false);
    const next = await setThreadCalendar(threadId, calendarId, picked);
    if (!next) return setFailed(true);
    setList(next);
    onChanged();
  }

  const mine = list?.calendars.filter((c) => c.picked).length ?? 0;
  const othersCount = list?.others.reduce((sum, o) => sum + o.count, 0) ?? 0;
  const caption = captionFor(threadName, mine, othersCount, members);
  const muted = isAndroid ? "text-a-on-var" : "text-text-secondary";

  return (
    <>
      <DragSheet
        onClose={onClose}
        surface={isAndroid ? "rounded-t-a-sheet bg-a-c-low" : "rounded-t-sheet bg-surface-raised"}
        className="px-gutter-screen pb-space-8 pt-space-2"
      >
        <Text
          className={`pb-space-5 font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 21, lineHeight: 26 }}
          accessibilityRole="header"
        >
          Calendars in this thread
        </Text>

        {/* While the list loads, the title alone: a sheet still fetching must
            never read as a thread with nothing to tick. */}
        {list === null ? (
          failed ? (
            <Text className="font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
              {FAILED}
            </Text>
          ) : null
        ) : list.calendars.length === 0 ? (
          <>
            <Text className={`pb-space-4 font-core ${muted}`} style={{ fontSize: 14, lineHeight: 20 }}>
              offload has no calendars to read yet.
            </Text>
            <Pressable
              className="min-h-tap-min flex-row items-center gap-space-4"
              accessibilityRole="button"
              onPress={() => {
                onClose();
                router.push("/settings/calendar");
              }}
            >
              <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }}>
                Approve a calendar in Settings
              </Text>
              <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} />
            </Pressable>
          </>
        ) : (
          <>
            <Text className={`font-core ${muted}`} style={{ fontSize: 14, lineHeight: 20 }}>
              {caption.line}
            </Text>
            {caption.shared ? (
              <Text className={`mt-space-2 font-core ${muted}`} style={{ fontSize: 14, lineHeight: 20 }}>
                {caption.shared}
              </Text>
            ) : null}
            {failed ? (
              <Text className="mt-space-3 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
                {FAILED}
              </Text>
            ) : null}
            <View className="mt-space-4">
              {list.calendars.map((calendar, index) => (
                <CalendarRow
                  key={calendar.id}
                  calendar={calendar}
                  picked={calendar.picked}
                  onChange={(next) => void pick(calendar.id, next)}
                  last={index === list.calendars.length - 1}
                />
              ))}
            </View>
            {othersLine(list.others) ? (
              <Text className={`mt-space-3 font-core ${isAndroid ? "text-a-on-var" : "text-text-tertiary"}`} style={{ fontSize: 13 }}>
                {othersLine(list.others)}
              </Text>
            ) : null}
          </>
        )}
      </DragSheet>
    </>
  );
}
