// Today. 027, from `TodayScreen.jsx` and `TodayParts.jsx`.
//
// What to expect and what to do, across every thread. Needs you on top when
// something is waiting on the person, then the day, one at a time: the
// stepper, the next line, Where you will be, To do, and on Today If you have
// time. In the order Customize Today keeps, each drawn only when it holds
// something. The page opens on Today every time; the day shown is never kept.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedScrollHandler } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { addUtcDays, afterWrite, dayIn, dayName, nothingLine } from "@offload/widgets";
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
  DEFAULT_LAYOUT,
  dayOn,
  fetchDay,
  fetchNeeds,
  notificationsCard,
  onTodayReset,
  saveLayout,
  stackOf,
  zoneCard,
  type Day,
  type DeviceCard,
  type Layout,
  type ServerCard,
  type TodayRow,
} from "../../lib/today";
import { useConversation } from "../shell/conversation-context";
import { PlateSpace } from "../shell/plate-inset";
import { BellDot } from "../shell/BellDot";
import { ToastHost, useToast } from "../shell/Toast";
import { NeedsYou, NOTIFICATIONS_PUT_OFF } from "./NeedsYou";
import { DayStepper, EventsStrip, NextLine, SectionHead } from "./DayParts";
import { CustomizeSheet } from "./CustomizeSheet";
import { useTodayRows } from "./useTodayRows";

const isAndroid = Platform.OS === "android";
/** The stepper reaches the edge of what offload keeps of a calendar. */
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
  const { setDraft } = useConversation();
  const toast = useToast();
  const params = useLocalSearchParams<{ day?: string }>();

  const onScroll = useAnimatedScrollHandler((event) => {
    prismShift.value = event.contentOffset.y * PRISM_SCROLL_FACTOR;
  });

  // ---------------------------------------------------------------- the day shown
  const [date, setDate] = useState(today);
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

  const show = useCallback(
    (which: string) => {
      setDate(which);
      setDay((held) => (held?.date === which ? held : null));
      loadDay(which);
    },
    [loadDay],
  );

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
    const held = me?.todayLayout ?? DEFAULT_LAYOUT;
    return { shown: held, confirmed: held };
  });
  const latestLayout = useRef(layoutState);
  latestLayout.current = layoutState;
  useEffect(() => {
    const held = me?.todayLayout;
    if (!held) return;
    // A gesture still in flight stays drawn; its own answer decides.
    setLayoutState((now) => (now.shown === now.confirmed ? { shown: held, confirmed: held } : { ...now, confirmed: held }));
  }, [me?.todayLayout]);
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
  const reloadDay = useCallback(() => loadDay(date), [loadDay, date]);
  const rows = useTodayRows(day, reloadDay, toast);
  const [lateOpen, setLateOpen] = useState(false);
  useEffect(() => setLateOpen(false), [date]);

  const isToday = date === today;
  const { name, sub } = dayName(date, today, weekStart);
  const step = (by: 1 | -1) => {
    const next = addUtcDays(date, by);
    if (next < today || next > addUtcDays(today, DAYS_AHEAD)) return;
    show(next);
  };
  const swipe = Gesture.Pan()
    .activeOffsetX([-28, 28])
    .failOffsetY([-14, 14])
    .onEnd((event) => {
      if (Math.abs(event.translationX) > 56) runOnJS(step)(event.translationX < 0 ? 1 : -1);
    });

  const ink = isAndroid ? "text-a-on" : "text-text-primary";
  const card = `overflow-hidden ${isAndroid ? "rounded-a-lg bg-a-c-low" : "rounded-lg bg-surface-fill"}`;

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

    const taken = new Set(rows.taken);
    const late = rows.live(day.late);
    const timed = rows.live(day.timed);
    const rest = rows.live([...day.rest, ...day.picks.filter((pick) => taken.has(pick.id))]);
    const picks = isToday ? rows.live(day.picks.filter((pick) => !taken.has(pick.id))) : [];
    const lateShown = lateOpen ? late : late.slice(0, LATE_SHOWN);
    const lateHidden = late.length - lateShown.length;
    const todo: { row: TodayRow; chip: "date" | "time" | "none" }[] = [
      ...lateShown.map((row) => ({ row, chip: "date" as const })),
      ...timed.map((row) => ({ row, chip: "time" as const })),
      ...rest.map((row) => ({ row, chip: "none" as const })),
    ];
    const todoCount = late.length + timed.length + rest.length + day.lateMore + day.restMore;

    if (day.events.length === 0 && todoCount === 0 && picks.length === 0) {
      return (
        <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15 }}>
          {nothingLine(name)}
        </Text>
      );
    }

    return (
      <>
        <EventsStrip events={day.events} count={day.eventCount} now={now} isToday={isToday} zone={zone} />
        {todo.length > 0 ? (
          <View>
            <SectionHead title="To do" count={todoCount} />
            <View className={card}>
              {lateShown.map((row, index) => rows.row(row, { border: index < todo.length - 1 || lateHidden > 0, chip: "date" }))}
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
              {todo.slice(lateShown.length).map(({ row, chip }, index) =>
                rows.row(row, { border: lateShown.length + index < todo.length - 1, chip }),
              )}
            </View>
            {day.restMore > 0 ? (
              <Text className="pt-space-2 font-core text-text-tertiary" style={{ fontSize: 13 }}>
                and {day.restMore} more
              </Text>
            ) : null}
          </View>
        ) : null}
        {picks.length > 0 ? (
          <View>
            <SectionHead title="If you have time" hint="picked by offload" />
            <View className={card}>
              {picks.map((pick, index) => (
                <PickRow key={pick.id} pick={pick} last={index === picks.length - 1} rows={rows} />
              ))}
            </View>
          </View>
        ) : null}
      </>
    );
  })();

  const dayOne = day && !day.everDumped && isToday;
  const sections = layout.sections.map((section) => {
    if (section.kind === "needs_you") return cards.length > 0 ? <NeedsYou key="needs" cards={cards} load={needsLoad} toast={toast} onChanged={reloadDay} /> : null;
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
      <View key="day" className="gap-space-6">
        <GestureDetector gesture={swipe}>
          <View className="gap-space-6">
            <DayStepper name={name} sub={sub} first={isToday} last={date >= addUtcDays(today, DAYS_AHEAD)} onPrev={() => step(-1)} onNext={() => step(1)} />
            {day ? <NextLine events={day.events} now={now} isToday={isToday} zone={zone} /> : null}
          </View>
        </GestureDetector>
        {dayBody}
      </View>
    );
  });

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      {/* The kit's bar on Today: the wordmark, then Customize Today, the bell
          and settings. Only Today draws the sliders. */}
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
        <View className="ml-auto flex-row items-center gap-space-5">
          <Pressable onPress={() => setCustomizing(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Customize Today">
            <Glyph name="sliders-horizontal" size={21} color={COLOR.iconOnWell} />
          </Pressable>
          <BellDot />
          <GearDot />
        </View>
      </View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerClassName="gap-space-6 px-gutter-screen pt-space-3 pb-space-8">
        {sections}
        <PlateSpace />
      </Animated.ScrollView>
      {rows.sheets}
      {customizing ? <CustomizeSheet layout={layout} onChange={changeLayout} onClose={() => setCustomizing(false)} /> : null}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function PickRow({ pick, last, rows }: { pick: TodayRow; last: boolean; rows: ReturnType<typeof useTodayRows> }) {
  return (
    <>
      {rows.row(pick, { border: !last, chip: "none", trailing: <PlusToday title={pick.title} onPress={() => rows.take(pick)} /> })}
    </>
  );
}

function PlusToday({ title, onPress }: { title: string; onPress: () => void }) {
  const COLOR = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Add ${title} to today`} className="min-h-tap-min justify-center">
      <View className="flex-row items-center gap-space-1 rounded-pill border border-border-strong bg-surface-raised px-space-4" style={{ minHeight: 28 }}>
        <Glyph name="plus" size={13} color={COLOR.ink} />
        <Text className="font-core font-medium text-text-primary" style={{ fontSize: 12.5 }}>
          Today
        </Text>
      </View>
    </Pressable>
  );
}
