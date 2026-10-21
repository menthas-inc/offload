// Today. 027, from `TodayScreen.jsx` and `TodayParts.jsx`.
//
// What to expect and what to do, across every thread. Needs you on top when
// something is waiting on the person, then the day, one at a time: the
// stepper, the next line, Where you will be and To do; and on Today, open in
// your threads (2026-10-07). In the order Customize Today keeps, each drawn only when it holds
// something. The page opens on Today every time; the day shown is never kept.
//
// 042. Reminders, on Today only: what offload is reminding about, nearest
// first, as the kit's column since 2026-10-11 (`Reminders.tsx`), with a
// dismiss that hides one reminder. Empty, it draws nothing. A section kind
// this build does not know draws nothing either: Your day is its own branch,
// never the fall-through.
//
// Bands (2026-10-11): each drawn section sits in a `Band`; by position they
// alternate between the page and a full-bleed band, and a section that draws
// nothing takes no position.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedScrollHandler } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { addUtcDays, afterWrite, dayIn, dayName, dayTitle, keepInPlace, monthDated, twoWeekFor, nothingLine, reminderEntryKey, remindersInOrder, stepWeek, type MonthCount } from "@offload/widgets";
import { prismShift, PRISM_SCROLL_FACTOR } from "../../lib/prism-scroll";
import { GearDot } from "../people/GearDot";
import { Glyph } from "../Glyph";
import { Logo } from "../Logo";
import { DAY_ONE_INVITATION, EXAMPLES } from "../../lib/gate";
import { useColors } from "../../lib/colors";
import { deviceZone, useClock } from "../../lib/clock";
import { useWeekStart } from "../../lib/appearance";
import { refreshMe, useMe } from "../../lib/me";
import { permitted, register } from "../../lib/notifications";
import {
  dayOn,
  fetchDay,
  fetchMonth,
  fetchNeeds,
  fetchOpenThreads,
  fetchReminders,
  layoutOf,
  notificationsCard,
  onTodayReset,
  openThreadsOn,
  remindersOn,
  saveLayout,
  stackOf,
  zoneCard,
  type Day,
  type DeviceCard,
  type Layout,
  type OpenPage,
  type ReminderEntry,
  type ServerCard,
  type TodayReminders,
  type TodayRow,
} from "../../lib/today";
import { useConversation } from "../shell/conversation-context";
import { PlateSpace } from "../shell/plate-inset";
import { BellDot } from "../shell/BellDot";
import { ToastHost, useToast } from "../shell/Toast";
import { NeedsYou, NOTIFICATIONS_PUT_OFF } from "./NeedsYou";
import { Band, Ground } from "./Band";
import { TodayField } from "./TodayField";
import { EventsStrip, NextLine, SectionHead } from "./DayParts";
import { MonthGrid } from "../shell/MonthGrid";
import { CustomizeSheet } from "./CustomizeSheet";
import { OpenThreads } from "./OpenThreads";
import { Reminders } from "./Reminders";
import { useTodayRows } from "./useTodayRows";
import { drawInPlace } from "../shell/InPlace";
import { useInPlace, useUndoEntries } from "../../lib/undo";

const isAndroid = Platform.OS === "android";
/** The month reaches the edge of what offload keeps of a calendar. */
const DAYS_AHEAD = 365;
/** A day that arrives within this draws no spinner. */
const QUIET_MS = 250;
const LATE_SHOWN = 3;

function ArrowUp() {
  const COLOR = useColors();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke={COLOR.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export default function TodayScreen() {
  const COLOR = useColors();
  const me = useMe();
  const { zone, today } = useClock();
  const weekStart = useWeekStart();
  const { setDraft, filed } = useConversation();
  const toast = useToast();
  const params = useLocalSearchParams<{ day?: string }>();

  const onScroll = useAnimatedScrollHandler((event) => {
    prismShift.value = event.contentOffset.y * PRISM_SCROLL_FACTOR;
  });

  // ---------------------------------------------------------------- the day shown
  const [date, setDate] = useState(today);
  // The week the two rows start on. Null is the one the day is in, so a door
  // or the Today tab moving the day brings the weeks with it.
  const [month, setMonth] = useState<string | null>(null);
  const [went, setWent] = useState<1 | -1>(1);
  const [day, setDay] = useState<Day | null>(null);
  const [dayFailed, setDayFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const asked = useRef(0);

  const loadDay = useCallback((which: string) => {
    const ask = ++asked.current;
    setDayFailed(false);
    setSlow(false);
    const quiet = setTimeout(() => {
      if (ask === asked.current) setSlow(true);
    }, QUIET_MS);
    void fetchDay(which).then((next) => {
      clearTimeout(quiet);
      if (ask !== asked.current) return;
      if (next) setDay(next);
      else setDayFailed(true);
      setSlow(false);
    });
  }, []);

  // Open in your threads: read with Today and again after every write, laid
  // over the pages as drawn so a ticked row keeps its place until Today is
  // built again, which a step away and back, or a return to the tab, is.
  const [open, setOpen] = useState<OpenPage[] | null>(null);
  const [struck, setStruck] = useState<ReadonlySet<string>>(new Set());
  const struckNow = useRef(struck);
  struckNow.current = struck;
  const askedOpen = useRef(0);
  const loadOpen = useCallback((fresh: boolean) => {
    const ask = ++askedOpen.current;
    if (fresh) {
      setOpen(null);
      setStruck(new Set());
      struckNow.current = new Set();
    }
    void fetchOpenThreads().then((pages) => {
      if (ask !== askedOpen.current || !pages) return;
      setOpen((drawn) => keepInPlace(drawn ?? [], pages, struckNow.current));
    });
  }, []);
  const strike = useCallback((id: string, on: boolean) => {
    setStruck((held) => {
      const next = new Set(held);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // 042. Reminders: read with Today and again after every write, as open in
  // your threads is.
  const [reminders, setReminders] = useState<TodayReminders | null>(null);
  // Dismissed here: hidden until Today is built again, which the server's
  // read then agrees with.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const onGone = useCallback((key: string, hidden: boolean) => {
    setGone((held) => {
      const next = new Set(held);
      if (hidden) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const askedReminders = useRef(0);
  const loadReminders = useCallback((fresh: boolean) => {
    const ask = ++askedReminders.current;
    if (fresh) {
      setReminders(null);
      setGone(new Set());
    }
    void fetchReminders().then((next) => {
      if (ask !== askedReminders.current || !next) return;
      setReminders(next);
    });
  }, []);

  const show = useCallback(
    (which: string) => {
      setMonth(null);
      setDate(which);
      setDay((held) => (held?.date === which ? held : null));
      loadDay(which);
      if (which === today) {
        loadOpen(true);
        loadReminders(true);
      }
    },
    [loadDay, loadOpen, loadReminders, today],
  );

  // A turn that filed, changed or removed something may have done it to this
  // day, and the conversation sits over Today without taking its focus.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    loadDay(date);
    if (date === today) {
      loadOpen(false);
      loadReminders(false);
    }
  }, [filed, loadDay, loadOpen, loadReminders, date, today]);

  // ---------------------------------------------------------------- Needs you
  const [needs, setNeeds] = useState<ServerCard[] | null>(null);
  const [needsLoad, setNeedsLoad] = useState(0);
  const [allowed, setAllowed] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const loadNeeds = useCallback(() => {
    void fetchNeeds().then((cards) => {
      setNeeds(cards ?? []);
      setNeedsLoad((n) => n + 1);
    });
    void permitted().then(setAllowed);
  }, []);

  // A digest's day opens once; every other way in opens on Today.
  const opened = useRef<string | null>(null);
  const entry = (): string => {
    const asked = params.day;
    if (asked && asked !== opened.current && asked > today && asked <= addUtcDays(today, DAYS_AHEAD)) {
      opened.current = asked;
      return asked;
    }
    return today;
  };

  useFocusEffect(
    useCallback(() => {
      show(entry());
      loadNeeds();
      void refreshMe();
      void register();
    }, [params.day, today]),
  );
  useEffect(() => onTodayReset(() => show(today)), [show, today]);

  // The clock, each minute while the app is in front, and back on Today at
  // midnight in the account's zone.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), 60_000);
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => {
      clearInterval(timer);
      if (state === "active") {
        start();
        void permitted().then(setAllowed);
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  const lastToday = useRef(today);
  useEffect(() => {
    const current = dayIn(now, zone);
    if (current !== lastToday.current) {
      lastToday.current = current;
      show(current);
      loadNeeds();
    }
  }, [now, zone, show, loadNeeds]);

  // ---------------------------------------------------------------- the layout
  const [layoutState, setLayoutState] = useState(() => {
    const held = layoutOf(me);
    return { shown: held, confirmed: held };
  });
  const latestLayout = useRef(layoutState);
  latestLayout.current = layoutState;
  useEffect(() => {
    // 042. V3 names Reminders; V2 is the same document without it.
    const held = me?.todayLayoutV3 ?? me?.todayLayoutV2;
    if (!held) return;
    // A gesture still in flight stays drawn; its own answer decides.
    setLayoutState((now) => (now.shown === now.confirmed ? { shown: held, confirmed: held } : { ...now, confirmed: held }));
  }, [me?.todayLayoutV3, me?.todayLayoutV2]);
  const layout = layoutState.shown;
  const [customizing, setCustomizing] = useState(false);
  const changeLayout = async (next: Layout): Promise<boolean> => {
    setLayoutState((now) => ({ ...now, shown: next }));
    const ok = await saveLayout(next);
    const after = afterWrite(latestLayout.current, next, ok);
    // Only a write that undid itself is a failure the sheet shows.
    const undone = !ok && after.shown !== latestLayout.current.shown;
    setLayoutState(after);
    if (ok) loadNeeds();
    return ok || !undone;
  };

  // ---------------------------------------------------------------- the cards
  const putOffUntil = useMemo(() => {
    try {
      return SecureStore.getItem(NOTIFICATIONS_PUT_OFF);
    } catch {
      return null;
    }
    // Read again whenever the cards are.
  }, [needs]);
  const zoneOffer = me ? zoneCard(me, deviceZone() ?? "") : null;
  const notifications = me ? notificationsCard(me, allowed, putOffUntil, now) : null;
  const zoneKey = zoneOffer?.kind === "zone" ? zoneOffer.device : null;
  const notificationsKey = notifications?.key ?? null;
  const cards = useMemo(() => {
    const device: DeviceCard[] = [];
    if (zoneOffer) device.push(zoneOffer);
    if (notifications) device.push(notifications);
    return stackOf(needs ?? [], device, layout);
    // The device cards by what they are, so a new object each render is not a new stack.
  }, [needs, layout, zoneKey, notificationsKey]);

  // ---------------------------------------------------------------- the rows
  // Bumped after every write, so the month's dots follow a tick or a dismiss.
  const [monthRead, setMonthRead] = useState(0);
  const reloadDay = useCallback(() => {
    setMonthRead((n) => n + 1);
    loadDay(date);
    if (date === today) {
      loadOpen(false);
      loadReminders(false);
    }
  }, [loadDay, loadOpen, loadReminders, date, today]);
  const rows = useTodayRows(day, reloadDay, toast);
  const [lateOpen, setLateOpen] = useState(false);
  useEffect(() => setLateOpen(false), [date]);

  const isToday = date === today;
  const { name } = dayName(date, today, weekStart);
  const lastDay = addUtcDays(today, DAYS_AHEAD);

  // The two weeks (2026-10-19, in place of the month): what each day on the
  // grid holds, read for the whole window and again after a filing, which
  // may have dated something.
  const span = twoWeekFor(month ?? date, [], today, weekStart);
  const gridFrom = span.weeks[0]?.days[0]?.iso ?? span.key;
  const gridTo = span.weeks[span.weeks.length - 1]?.days[6]?.iso ?? span.key;
  const [counts, setCounts] = useState<{ window: string; days: MonthCount[] } | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMonth(gridFrom, gridTo).then((days) => {
      if (live && days) setCounts({ window: `${gridFrom}|${gridTo}`, days });
    });
    return () => {
      live = false;
    };
  }, [gridFrom, gridTo, filed?.at, zone, monthRead]);
  const grid = twoWeekFor(month ?? date, counts?.window === `${gridFrom}|${gridTo}` ? monthDated(counts.days) : [], today, weekStart);

  const ink = isAndroid ? "text-a-on" : "text-text-primary";
  // The ground is the band's (`Ground`), so a card in a band steps up.
  const cardShape = `overflow-hidden ${isAndroid ? "rounded-a-lg" : "rounded-lg"}`;
  // Dark theme: edges (design decisions, 2026-10-07). A layer over the rows
  // rather than a shadow on the card, since each row paints the card's fill
  // under its swipe and would cover it.
  const cardEdge = (
    <View
      pointerEvents="none"
      className={`absolute inset-0 ${isAndroid ? "rounded-a-lg" : "rounded-lg"}`}
      style={{ boxShadow: `inset 0 0 0 1px ${COLOR.edgeCard}` }}
    />
  );

  // To do, with its Undo lines: a row ticked, archived or deleted keeps a
  // slot where it was. Late and the rest are two lists, either side of the
  // late fold.
  const late = rows.live(day?.late ?? []);
  const timed = rows.live(day?.timed ?? []);
  const restRows = rows.live(day?.rest ?? []);
  const lateShown = lateOpen ? late : late.slice(0, LATE_SHOWN);
  const todo: { row: TodayRow; chip: "date" | "time" | "none" }[] = [
    ...lateShown.map((row) => ({ row, chip: "date" as const })),
    ...timed.map((row) => ({ row, chip: "time" as const })),
    ...restRows.map((row) => ({ row, chip: "none" as const })),
  ];
  const placedLate = useInPlace(lateShown, (row) => row.id);
  const placedRest = useInPlace(todo.slice(lateShown.length), (one) => one.row.id);

  const dayBody = (() => {
    if (!day) {
      if (dayFailed) {
        return (
          <View className="items-start gap-space-3">
            <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15 }}>
              Couldn&apos;t load this day
            </Text>
            <Pressable onPress={() => loadDay(date)} accessibilityRole="button" className="min-h-tap-min justify-center">
              <Text className="font-core font-medium text-text-accent" style={{ fontSize: 15 }}>
                Try again
              </Text>
            </Pressable>
          </View>
        );
      }
      return slow ? (
        <View className="items-center py-space-8">
          <ActivityIndicator color={COLOR.iconOnWell} />
        </View>
      ) : null;
    }

    const lateHidden = late.length - lateShown.length;
    const todoCount = late.length + timed.length + restRows.length + day.lateMore + day.timedMore + day.restMore;
    const notDrawn = day.timedMore + day.restMore;
    const drawnTodo = placedLate.length + placedRest.length;

    if (day.events.length === 0 && todoCount === 0 && drawnTodo === 0) {
      return (
        <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15 }}>
          {nothingLine(name)}
        </Text>
      );
    }

    return (
      <>
        <EventsStrip events={day.events} count={day.eventCount} now={now} isToday={isToday} zone={zone} />
        {drawnTodo > 0 ? (
          <View>
            <SectionHead title="To do" count={todoCount} />
            <Ground className={cardShape}>
              {drawInPlace(placedLate, {
                idOf: (row) => row.id,
                trailing: placedRest.length > 0 || lateHidden > 0,
                row: (row, border) => rows.row(row, { border, chip: "date" }),
              })}
              {lateHidden > 0 ? (
                <Pressable
                  onPress={() => setLateOpen(true)}
                  accessibilityRole="button"
                  className="min-h-tap-min justify-center border-b border-border-hairline px-space-5"
                >
                  <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14 }}>
                    {lateHidden + day.lateMore} more late
                  </Text>
                </Pressable>
              ) : null}
              {drawInPlace(placedRest, {
                idOf: (one) => one.row.id,
                row: (one, border) => rows.row(one.row, { border, chip: one.chip }),
              })}
              {/* 046: on the card, not below it, so it never lands on the field. */}
              {notDrawn > 0 ? (
                <Text className="px-space-5 pb-space-4 pt-space-2 font-core text-text-tertiary" style={{ fontSize: 13 }}>
                  and {notDrawn} more
                </Text>
              ) : null}
              {cardEdge}
            </Ground>
          </View>
        ) : null}
      </>
    );
  })();

  const dayOne = day && !day.everDumped && isToday;

  // 042. One list, nearest first; a row archived or deleted here leaves it,
  // and so does a reminder dismissed here, its section kept while the line
  // of one dismissed here still runs.
  const undoLines = useUndoEntries();
  const reminding = (() => {
    if (!reminders) return [];
    const live = new Map(rows.live(reminders.rows).map((row) => [row.id, row]));
    return remindersInOrder(reminders)
      .flatMap((entry): ReminderEntry[] => {
        if (!("row" in entry)) return [entry];
        const row = live.get(entry.row.id);
        return row ? [{ row, day: row.remindDay }] : [];
      })
      .filter((entry) => !gone.has(reminderEntryKey(entry)));
  })();

  const sections = layout.sections.map((section) => {
    if (section.kind === "open_threads") {
      // Today only, and never over the day-one invitation.
      return isToday && openThreadsOn(layout) && open && open.length > 0 && !dayOne ? (
        <OpenThreads
          key="open"
          pages={open.map((page) => {
            // A row archived or deleted here leaves the count too, so N more holds.
            const todos = rows.live(page.todos);
            return { ...page, todos, count: page.count - (page.todos.length - todos.length) };
          })}
          struck={struck}
          onStrike={strike}
          onOpenRow={rows.open}
          toast={toast}
          writes={rows.writes}
          now={now}
        />
      ) : null;
    }
    if (section.kind === "needs_you") return cards.length > 0 ? <NeedsYou key="needs" cards={cards} load={needsLoad} toast={toast} onChanged={reloadDay} onReload={loadNeeds} /> : null;
    if (section.kind === "reminders") {
      // Today only, never over the day-one invitation, and nothing when empty.
      return isToday && remindersOn(layout) && reminders && !dayOne && (reminding.length > 0 || [...gone].some((key) => undoLines.has(key))) ? (
        <Reminders key="reminders" entries={reminding} today={today} zone={zone} onGone={onGone} toast={toast} writes={rows.writes} />
      ) : null;
    }
    if (section.kind !== "day") return null;
    if (!dayOn(layout)) return null;
    if (dayOne) {
      return (
        <View key="day">
          <Text className={`font-quiet ${ink}`} style={{ fontSize: 17, lineHeight: 25.5 }}>
            {DAY_ONE_INVITATION}
          </Text>
          <View className="mt-space-7 gap-space-3">
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                onPress={() => setDraft(example)}
                className={`min-h-tap-min flex-row items-center gap-space-4 px-space-6 py-space-5 ${
                  isAndroid ? "rounded-a-lg bg-a-c-low" : "rounded-md border border-dashed border-border-strong bg-surface-raised"
                }`}
              >
                <ArrowUp />
                <Text className={`flex-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15, lineHeight: 21 }}>
                  {example}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }
    return (
      <View key="day" className="gap-space-8">
        <View className="gap-space-6">
          {/* One raised card under the two weeks (046): the empty days, the
              month head and its Today link are small text that would otherwise
              sit on the prism field's densest bloom. */}
          <Ground className={`${cardShape} p-space-4`}>
            <MonthGrid
              grid={grid}
              unit="week"
              selected={date}
              went={went}
              inset={false}
              // A day before today, or past the calendar copy's edge, does not open.
              closed={(iso) => iso < today || iso > lastDay}
              // The head names the picked day while the two weeks are shown;
              // on today, the month with Today beside it (the owner,
              // 2026-10-19).
              title={date !== today ? dayTitle(date) : undefined}
              heading
              first={grid.key <= today}
              last={stepWeek(grid.key, 1) > lastDay}
              onPick={show}
              onStep={(by) => {
                setWent(by);
                setMonth(stepWeek(grid.key, by));
              }}
              onToday={() => {
                setWent(grid.key > today ? -1 : 1);
                show(today);
              }}
            />
          </Ground>
          {day ? <NextLine events={day.events} now={now} isToday={isToday} zone={zone} /> : null}
        </View>
        {dayBody}
      </View>
    );
  });

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      {/* The kit's bar on Today: the wordmark, then Customize Today, the bell
          and settings. Only Today draws the sliders. */}
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={24} />
        <View className="ml-auto flex-row items-center gap-space-6">
          <Pressable onPress={() => setCustomizing(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Customize Today">
            <Glyph name="sliders-horizontal" size={24} color={COLOR.iconOnWell} />
          </Pressable>
          <BellDot />
          <GearDot />
        </View>
      </View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerClassName="pb-space-8">
        <TodayField />
        {layout.sections
          .map((section, index) => [section.kind, sections[index] ?? null] as const)
          .filter(([, drawn]) => drawn !== null)
          .map(([kind, drawn], index) => (
            <Band key={kind} index={index}>
              {drawn}
            </Band>
          ))}
        <PlateSpace />
      </Animated.ScrollView>
      {rows.sheets}
      {customizing ? <CustomizeSheet layout={layout} onChange={changeLayout} onClose={() => setCustomizing(false)} /> : null}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}
