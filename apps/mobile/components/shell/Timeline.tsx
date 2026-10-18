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

import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import {
  datedFor,
  monthFor,
  stepMonth,
  contentOn,
  type Dated,
  dayIn,
  utcDay,
  eventMeta,
} from "@offload/widgets";
import { useClock } from "../../lib/clock";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useWeekStart } from "../../lib/appearance";
import { ContentRowView } from "./ContentRow";
import { MonthGrid } from "./MonthGrid";
import { useConversation } from "./conversation-context";
import { QUICK_ADD_CHARS, TYPED_ROW_PLACEHOLDER, fetchThreadEvents, rangeOf } from "../../lib/threads";
import type { ContentRow, Note, ThreadEvent } from "../../lib/threads";

/** 019. A calendar's event as an entry on the rail: kind `calendar`, never done,
 *  never repeating here since the copy already holds every occurrence. The id
 *  is prefixed so it can never collide with a row's. */
function eventDated(event: ThreadEvent, zone: string | null): Dated | null {
  if (!event.occursAt) return null;
  // 023. An all-day event is a date; a timed one lands on its day in the
  // account's clock.
  const day = (at: string) => (event.allDay ? utcDay(new Date(at)) : dayIn(new Date(at), zone));
  const from = day(event.occursAt);
  const end = event.occursEndAt ? day(event.occursEndAt) : from;
  return { id: `event:${event.id}`, rowId: `event:${event.id}`, due: false, kind: "calendar", from, to: end < from ? from : end, done: false };
}

const isAndroid = Platform.OS === "android";

interface Props {
  threadId: string;
  threadName: string;
  rows: ContentRow[];
  notes: Note[];
  onDelete: (row: ContentRow) => void;
  onEdit: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  /** 019. Whether any member has picked a calendar here, which is what puts
   *  the calendars' events on the rail. Bumped when the picks change. */
  calendars: { anyPicked: boolean; version: number };
}

export function Timeline({
  threadId,
  threadName,
  rows,
  notes,
  calendars,
  onDelete,
  onEdit,
  onToggle,
}: Props) {
  const { raiseFor } = useConversation();
  const COLOR = useColors();
  const weekStart = useWeekStart();
  // Computed on render, so the first render after midnight moves today and
  // nothing polls for it.
  const { zone, today } = useClock();
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
  // The thread's own dated things: what the span is made of.
  const own = useMemo(() => datedFor(rows, notes, zone), [rows, notes, zone]);

  // **Always a month.** A rail of weeks was drawn until the span passed six
  // weeks, and a trip over three weeks crossed a month boundary with no way
  // to step. A calendar is read a month at a time, so that is the one shape.
  const here = monthFor(month ?? today, [], today, weekStart).key;

  // 019. The events on the thread's calendars, by the days a month draws,
  // from the copy. **A month is drawn once** (2026-09-29): its dots wait for
  // its events, and the months either side are read ahead, so neither opening
  // the thread nor a step shows the grid changing under whoever reads it.
  // Keyed by the thread, so another thread's events can never be drawn
  // here, and by the picks' version, so a change of calendars reads again.
  const windowOf = (at: string): string => {
    const weeks = monthFor(at, [], today, weekStart).weeks;
    return `${threadId}|${calendars.version}|${weeks[0]?.days[0]?.iso ?? at}|${weeks[weeks.length - 1]?.days[6]?.iso ?? at}`;
  };
  const [read, setRead] = useState<Map<string, ThreadEvent[]>>(() => new Map());
  const asking = useRef(new Set<string>());
  useEffect(() => {
    if (!calendars.anyPicked) return;
    for (const at of [here, stepMonth(here, 1), stepMonth(here, -1)]) {
      const window = windowOf(at);
      if (asking.current.has(window)) continue;
      asking.current.add(window);
      const [, , from, to] = window.split("|") as [string, string, string, string];
      void fetchThreadEvents(threadId, from, to)
        .catch(() => null)
        .then((found) => {
          // A month whose calendars did not answer is drawn with the
          // thread's own dots, and asked for again the next time it is near.
          if (found === null) asking.current.delete(window);
          setRead((held) => new Map(held).set(window, found ?? []));
        });
    }
    // `windowOf` reads only what is listed here.
  }, [threadId, here, today, weekStart, calendars.anyPicked, calendars.version]);

  const shownEvents = calendars.anyPicked ? read.get(windowOf(here)) : [];
  const events = useMemo(() => shownEvents ?? [], [shownEvents]);
  const ready = shownEvents !== undefined;

  // Everything on the thread's days, for the day list: the thread's own
  // things at once, a calendar's as they arrive. Only the grid waits.
  const dated = useMemo(
    () => [...own, ...events.map((event) => eventDated(event, zone)).filter((one): one is Dated => one !== null)],
    [own, events, zone],
  );
  const eventsById = useMemo(() => new Map(events.map((event) => [`event:${event.id}`, event])), [events]);

  // The grid's dots wait for the month's calendars, so it is drawn once.
  const grid = useMemo(
    () => monthFor(here, ready ? dated : [], today, weekStart),
    [here, ready, dated, today, weekStart],
  );

  // **Over the entries, not the rows.** A task with an occurrence on one day
  // and a due date on another is on both, and they are two different facts:
  // drawing it from the row's own fields puts the occurrence's time on the due
  // day and says the thing happens on a day it does not.
  const onDay = contentOn(dated, selected);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const dayRows = onDay
    .map((one) => ({ one, row: byId.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; row: ContentRow } => pair.row !== undefined);
  const dayNotes = onDay
    .map((one) => ({ one, note: notesById.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; note: Note } => pair.note !== undefined);
  const dayEvents = onDay
    .map((one) => ({ one, event: eventsById.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; event: ThreadEvent } => pair.event !== undefined);

  const goToday = (): void => {
    // Back to this month from wherever you are, and in the direction that is
    // actually true: forward if you had wandered into the past.
    setWent(grid.key > today ? -1 : 1);
    setMonth(null);
    setSelected(today);
  };

  const step = (by: 1 | -1): void => {
    setWent(by);
    setMonth(stepMonth(grid.key, by));
  };

  const when = new Date(`${selected}T12:00:00`);

  return (
    <View className="pt-space-5">
      {/* A month at a time: the grid Today draws too. */}
      <MonthGrid grid={grid} selected={selected} went={went} onPick={setSelected} onStep={step} onToday={goToday} />

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
              placeholder: TYPED_ROW_PLACEHOLDER,
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

      {dayRows.length === 0 && dayNotes.length === 0 && dayEvents.length === 0 ? (
        <Text
          className="px-gutter-screen font-core text-text-tertiary"
          style={{ fontSize: 13, lineHeight: 19 }}
        >
          Nothing on this day.
        </Text>
      ) : null}

      {/* 019, redrawn to the 21 September design. A calendar's event is
          DayAgenda's EventLine: the runway's spine, an 8px anchor on it, a
          112px time column so every title starts at the same x, the title
          at title-3, with two additions and only two: the dot takes the
          calendar's own colour with a hairline ring, since Google fixes those
          colours and a dark one on a dark page needs it, and the calendar's
          name is a caption under the title. Another member's calendar is
          named by their display name, which the wire already does. No
          checkbox, no tools, no swipe, no sheet, no tap: the only line in
          the product that cannot be acted on. */}
      {dayEvents.length ? (
        <View className="px-gutter-screen">
          {/* 2026-09-29. A 16px anchor on a 2px spine, twice what they were,
              with the spine through the anchors' centres. */}
          <View style={{ position: "relative", paddingLeft: 27 }}>
            <View
              style={{ position: "absolute", left: 7, top: 10, bottom: 10, width: 2, backgroundColor: COLOR.hairline }}
            />
            {dayEvents.map(({ one, event }) => {
              const when = event.allDay || !event.occursAt ? "All day" : rangeOf(event.occursAt, event.occursEndAt);
              return (
                <View
                  key={one.id}
                  className="flex-row items-start gap-space-5 py-space-4"
                  style={{ position: "relative" }}
                  accessible
                  accessibilityLabel={`${event.title}, ${eventMeta(event.calendarName, event.involved)}, ${when}`}
                >
                  {/* Centred on the first line: the pad, half a 22px line, less half the dot. */}
                  <View
                    style={{
                      position: "absolute",
                      left: -27,
                      top: 8 + 11 - 8,
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: COLOR.hairline,
                      backgroundColor: event.colour ?? COLOR.iconOnWell,
                    }}
                  />
                  <Text
                    className="font-core text-text-tertiary"
                    style={{ width: 112, fontSize: 14, lineHeight: 22, fontVariant: ["tabular-nums"] }}
                    numberOfLines={1}
                  >
                    {when}
                  </Text>
                  <View className="flex-1">
                    {/* 027. An event the viewer is not in stays, quieter, and says so. */}
                    <Text
                      className={`font-core font-medium ${
                        event.involved === false ? (isAndroid ? "text-a-on-var" : "text-text-secondary") : isAndroid ? "text-a-on" : "text-text-primary"
                      }`}
                      style={{ fontSize: 17, lineHeight: 22, paddingTop: 1 }}
                    >
                      {event.title}
                    </Text>
                    <Text className="mt-space-1 font-core text-text-tertiary" style={{ fontSize: 12, lineHeight: 17 }}>
                      {eventMeta(event.calendarName, event.involved)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* A note is drawn as a note: no tick, no tools, nothing to open. */}
      {dayNotes.map(({ one, note }) => (
        <View
          key={one.id}
          className="flex-row items-start gap-space-3 border-b border-border-hairline px-gutter-screen py-space-4"
        >
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
          onEdit={() => onEdit(row)}
          onToggle={row.type === "task" ? () => onToggle(row) : undefined}
          // 023. The row's own chip says the day and the hour now, on the
          // title line; the one thing the day list still has to say is that
          // a row is here for the day it is wanted by rather than the day it
          // happens.
          note={one.due ? "due" : undefined}
        />
      ))}
    </View>
  );
}
