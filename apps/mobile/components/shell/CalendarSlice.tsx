// 052. A reply's calendar: the built MonthGrid, still, for only the period the
// turn is about, and the picked day's entries at full width under it. Tapping
// an entry opens its details where it is; several can be open at once.
//
// Read lazily: the month's dots and the day's entries are asked for once the
// slice is on screen, once a session each (`lib/reply.ts`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { calendarColour, dayTitle, gridFor, periodLabel, timeIn, wasLine, type MonthCount } from "@offload/widgets";
import type { Slice } from "../../lib/dump";
import { useClock } from "../../lib/clock";
import { useColors } from "../../lib/colors";
import { useWeekStart } from "../../lib/appearance";
import { dayOnce, entriesOf, entryDetails, monthOnce, onTranscriptMoved, type Entry } from "../../lib/reply";
import type { Day } from "../../lib/today";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { Mark } from "./AnswerResult";
import { useChanged, useConversation } from "./conversation-context";
import { MonthGrid } from "./MonthGrid";

const isAndroid = Platform.OS === "android";
/** A span reads each day that has something on it, this many at most. */
const SPAN_DAYS = 7;

/** Whether a box measured in the window is in it. */
function onScreen(y: number, height: number, window: number): boolean {
  return height > 0 && y < window && y + height > 0;
}

export function CalendarSlice({
  slice,
  markFor,
  onOpenThread,
}: {
  slice: Extract<Slice, { kind: "calendar" }>;
  markFor: number;
  onOpenThread: (threadId: string, threadName: string | null) => void;
}) {
  const COLOR = useColors();
  const { zone, today } = useClock();
  const weekStart = useWeekStart();
  const { height: window } = useWindowDimensions();
  const box = useRef<View>(null);
  const [seen, setSeen] = useState(false);
  const [counts, setCounts] = useState<MonthCount[] | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The day picked is not kept: a reopened reply opens on the turn's day.
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // Read again when a turn files something, or a change is heard from
  // elsewhere or on coming back to the foreground.
  const { filed } = useConversation();
  const [heard, setHeard] = useState(0);
  useChanged(["thread", "today"], () => setHeard(Date.now()));
  const fresh = Math.max(filed?.at ?? 0, heard);

  const grid = gridFor(slice.period, counts ?? [], today, weekStart);
  const from = grid.weeks[0]?.days[0]?.iso ?? slice.period.from;
  const to = grid.weeks.at(-1)?.days[6]?.iso ?? slice.period.to;

  // On screen yet: when it is laid out, and each time the transcript stops.
  const look = (): void =>
    box.current?.measureInWindow((_x, y, _width, height) => {
      if (onScreen(y, height, window)) setSeen(true);
    });
  useEffect(() => (seen ? undefined : onTranscriptMoved(look)));

  useEffect(() => {
    if (!seen) return;
    let live = true;
    void monthOnce(from, to, fresh).then((got) => {
      if (!live) return;
      if (got === null && slice.span) setFailed(true);
      setCounts(got ?? []);
    });
    return () => {
      live = false;
    };
  }, [seen, from, to, fresh]);

  // The days listed: the one picked, every day of a span with something on
  // it, or the turn's day.
  const listed =
    picked !== null
      ? [picked]
      : slice.span
        ? (counts ?? [])
            .filter((one) => one.date >= slice.period.from && one.date <= slice.period.to && one.task + one.event + one.calendar > 0)
            .map((one) => one.date)
            // shortcut: a span lists its first seven days with entries; read the rest as they scroll in when a month answer is seen to need it.
            .slice(0, SPAN_DAYS)
        : [slice.day];
  const wanted = listed.join("|");
  const ready = !slice.span || picked !== null || counts !== null;
  useEffect(() => {
    if (!seen || !ready) return;
    let live = true;
    void Promise.all(listed.map((date) => dayOnce(date, date < today, fresh))).then((got) => {
      if (!live) return;
      if (got.some((one) => one === null)) return setFailed(true);
      setDays(got as Day[]);
    });
    return () => {
      live = false;
    };
  }, [seen, ready, wanted, fresh]);

  // Offline, or refused: the reply's undo line says what the turn did.
  if (failed) return null;

  const toggle = (id: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View
      ref={box}
      onLayout={look}
      className={`overflow-hidden rounded-a-md ${isAndroid ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"}`}
      style={isAndroid ? { boxShadow: `inset 0 0 0 1px ${COLOR.edgeCard}` } : undefined}
    >
      <View className="bg-surface-fill px-space-3 pt-space-4 pb-space-3">
        <MonthGrid
          grid={grid}
          still
          selected={picked ?? (slice.span ? null : slice.day)}
          went={1}
          inset={false}
          aside={periodLabel(slice.day, today)}
          onPick={(iso) => {
            setPicked(iso);
            setDays(null);
          }}
        />
      </View>
      {(days ?? []).map((day) => {
        const entries = entriesOf(day);
        if (entries.length === 0 && listed.length > 1) return null;
        return (
          <View key={day.date}>
            <Text
              className="px-space-5 pt-space-4 pb-space-2 font-core font-medium text-text-tertiary"
              style={{ fontSize: 12 }}
              accessibilityRole="header"
            >
              {dayTitle(day.date)}
            </Text>
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                date={day.date}
                zone={zone}
                open={open.has(entry.id)}
                marked={slice.marked.includes(entry.id) ? markFor : 0}
                was={wasLine(slice.previous?.[entry.id], zone)}
                onToggle={() => toggle(entry.id)}
                onOpenThread={onOpenThread}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function EntryRow({
  entry,
  date,
  zone,
  open,
  marked,
  was,
  onToggle,
  onOpenThread,
}: {
  entry: Entry;
  date: string;
  zone: string | null;
  open: boolean;
  marked: number;
  /** AC-9. When a moved entry was, while its Undo holds it. */
  was: string | null;
  onToggle: () => void;
  onOpenThread: (threadId: string, threadName: string | null) => void;
}) {
  const COLOR = useColors();
  const details = open ? entryDetails(entry, date, zone) : null;
  const done = entry.kind === "row" && entry.item.doneAt !== null;
  const at =
    entry.kind === "event"
      ? entry.item.allDay || !entry.item.startsAt
        ? "All day"
        : timeIn(new Date(entry.item.startsAt), zone, "en-GB")
      : null;
  return (
    <View className="border-t border-border-hairline">
      {marked > 0 ? <Mark left={marked} /> : null}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-tap-min flex-row items-start gap-space-4 px-space-5 py-space-3"
      >
        {/* An event leads with its time, a to-do with its tick.
            shortcut: the tick here is drawn, not tapped; the list slice above
            and Today tick; wire it to completeContent when it is seen to be tried. */}
        {at !== null ? (
          <Text className="font-core text-text-secondary" style={{ width: 44, fontSize: 13, lineHeight: 21 }}>
            {at}
          </Text>
        ) : (
          <View
            className={`items-center justify-center rounded-a-xs ${done ? "border-moss-600 bg-moss-600" : "border-border-strong"}`}
            style={{ width: 21, height: 21, borderWidth: 1.5 }}
          >
            {done ? <Glyph name="check" size={13} color={COLOR.onBrand} /> : null}
          </View>
        )}
        {/* Titles wrap and are never shortened. */}
        <View className="flex-1">
          <Text
            className={`font-core font-medium ${done ? "text-text-tertiary line-through" : "text-text-primary"}`}
            style={{ fontSize: 15, lineHeight: 21 }}
          >
            {entry.item.title}
          </Text>
          {was ? (
            <Text className="font-core text-text-secondary" style={{ fontSize: 12.5, lineHeight: 18 }}>
              {was}
            </Text>
          ) : null}
        </View>
        <View style={{ marginTop: 3, transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Glyph name="chevron-down" size={14} color={COLOR.quiet} />
        </View>
      </Pressable>

      {details ? (
        <View className="gap-space-2 pb-space-4 pr-space-5" style={{ paddingLeft: 70 }}>
          <Line glyph="clock">{details.span}</Line>
          {details.place ? (
            <View className="flex-row flex-wrap items-center gap-space-3">
              {details.place.words ? <Line glyph="map-pin">{details.place.words}</Line> : null}
              {details.place.url ? (
                <Pressable
                  onPress={() => void Linking.openURL(details.place!.url!).catch(() => {})}
                  accessibilityRole="link"
                  className="min-h-tap-min justify-center"
                >
                  <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13.5 }}>
                    Directions
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {details.theirs ? null : details.thread ? (
            <Pressable
              onPress={() => onOpenThread(details.thread!.id, details.thread!.name)}
              accessibilityRole="link"
              className="min-h-tap-min flex-row items-center gap-space-2"
            >
              {details.thread.name !== null ? (
                <ThreadIcon icon={details.thread.icon ?? ""} hue={details.thread.hue ?? 1} seed={details.thread.id} size={14} round />
              ) : null}
              <Text className="flex-1 font-core text-text-secondary" style={{ fontSize: 13.5, lineHeight: 19 }}>
                {details.thread.name !== null ? `In ${details.thread.name}` : "Not in a thread"}
              </Text>
            </Pressable>
          ) : null}
          {!details.theirs && !details.calendar ? <Line glyph="calendar">Not on a calendar</Line> : null}
          {!details.theirs && details.calendar ? (
            <View className="flex-row items-center gap-space-2">
              {/* The calendar's own colour, as its provider stores it, ringed
                  so a pale one still reads on the card. */}
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: calendarColour(details.calendar.colour) ?? COLOR.quiet,
                  boxShadow: `0 0 0 1px ${COLOR.hairline}`,
                }}
              />
              <Text className="flex-1 font-core text-text-secondary" style={{ fontSize: 13.5, lineHeight: 19 }}>
                {details.calendar.name}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Line({ glyph, children }: { glyph: string; children: ReactNode }) {
  const COLOR = useColors();
  return (
    <View className="flex-row items-center gap-space-2">
      <Glyph name={glyph} size={14} color={COLOR.quiet} />
      <Text className="flex-1 font-core text-text-secondary" style={{ fontSize: 13.5, lineHeight: 19 }}>
        {children}
      </Text>
    </View>
  );
}
