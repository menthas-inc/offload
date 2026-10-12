// The day's head: the stepper, the next line, and Where you will be. 027,
// from `TodayParts.jsx`'s `DayStepper` and `TodayBody`.
//
// Events are context: a calendar's event opens in Google Calendar through the
// platform, an offload event opens its thread, and nothing here edits one.

import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { GOOGLE_EVENT_LINK, eventPast, eventRange, nextLine, type LineEvent } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { ThreadPill } from "../shell/ThreadPill";
import { useColors } from "../../lib/colors";
import { firstNameOf } from "../../lib/people";
import { openLink } from "../../lib/links";
import type { TodayEvent } from "../../lib/today";
import { threadHref } from "../../lib/loose";
import { groundClass, useInBand } from "./Band";

const isAndroid = Platform.OS === "android";

export function DayStepper({
  name,
  sub,
  first,
  last,
  onPrev,
  onNext,
}: {
  name: string;
  sub: string | null;
  first: boolean;
  last: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const COLOR = useColors();
  const inBand = useInBand();
  const chevron = (icon: string, label: string, disabled: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="items-center justify-center"
      style={{ width: 44, height: 44, opacity: disabled ? 0.35 : 1 }}
    >
      {/* Drawn at 40 inside the 44 target, as the kit's stepper is. Its
          edge is Dark theme: edges (design decisions, 2026-10-07). */}
      <View
        className={`items-center justify-center rounded-pill ${groundClass(inBand)}`}
        style={{ width: 40, height: 40, boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }}
      >
        <Glyph name={icon} size={18} color={COLOR.ink} />
      </View>
    </Pressable>
  );
  return (
    <View className="flex-row items-center gap-space-2">
      {chevron("chevron-left", "Previous day", first, onPrev)}
      <View className="flex-1 items-center" accessibilityLiveRegion="polite">
        <Text
          className={`text-center font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.2 }}
          maxFontSizeMultiplier={1.35}
          accessibilityRole="header"
        >
          {name}
        </Text>
        {sub ? (
          <Text className={`mt-space-1 text-center font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {chevron("chevron-right", "Next day", last, onNext)}
    </View>
  );
}

/** *Call with Ana in 1h 30m*, the tail in the attention colour. */
export function NextLine({ events, now, isToday, zone }: { events: TodayEvent[]; now: Date; isToday: boolean; zone: string | null }) {
  const line = nextLine(events as LineEvent[], now, isToday, zone);
  if (!line) return null;
  return (
    <Text
      className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
      style={{ fontSize: 20, lineHeight: 25, letterSpacing: -0.2 }}
    >
      {line.title}
      <Text className="text-text-attention">{line.tail}</Text>
    </Text>
  );
}

/** A section's head. `big` is the band's size (design 2026-10-11): Reminders
 *  and Open in your threads head at 20; Where you will be and To do keep 15. */
export function SectionHead({ title, count, big = false }: { title: string; count?: number; big?: boolean }) {
  return (
    <View className={`flex-row items-baseline gap-space-3 ${big ? "" : "pb-space-2"}`} style={big ? { paddingBottom: 10 } : undefined}>
      <Text
        className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={big ? { fontSize: 20, lineHeight: 24, letterSpacing: -0.2 } : { fontSize: 15 }}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {count !== undefined ? (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
          {count}
        </Text>
      ) : null}
    </View>
  );
}

export function EventsStrip({
  events,
  count,
  now,
  isToday,
  zone,
}: {
  events: TodayEvent[];
  count: number;
  now: Date;
  isToday: boolean;
  zone: string | null;
}) {
  const router = useRouter();
  const inBand = useInBand();
  const COLOR = useColors();
  const next = nextLine(events as LineEvent[], now, isToday, zone);
  if (events.length === 0) return null;
  return (
    <View>
      <SectionHead title="Where you will be" count={count} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Past the gutter, the kit's `margin: 0 calc(var(--gutter-screen) * -1)`.
        className="-mx-gutter-screen"
        contentContainerClassName="gap-space-3 px-gutter-screen pb-space-1"
      >
        {events.map((event) => {
          const raised = next?.id === event.id;
          const past = isToday && eventPast(event, now);
          const open =
            event.source === "offload" && event.threadId
              ? () => router.push(threadHref(event.threadId!, event.threadName))
              : event.link && GOOGLE_EVENT_LINK.test(event.link)
                ? () => void openLink(event.link)
                : null;
          const body = (
            <View
              className={`gap-space-1 ${raised ? "border border-border-hairline bg-surface-raised" : groundClass(inBand)}`}
              style={[
                { width: 128, paddingHorizontal: 12, paddingVertical: 10, borderRadius: isAndroid ? 16 : 14 },
                raised
                  ? { shadowColor: COLOR.shadowLift.color, shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY }, shadowRadius: COLOR.shadowLift.radius, shadowOpacity: 1 }
                  : { boxShadow: `inset 0 0 0 1px ${COLOR.edgeCard}` },
              ]}
            >
              <Text className="font-core font-semibold text-text-secondary" style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
                {eventRange(event, zone)}
              </Text>
              {/* A past event's title takes the finished row's treatment (the
                  owner, 2026-10-12): tertiary ink and a 1px strike, never dimmed. */}
              <Text
                className={`font-core font-medium ${past ? "text-text-tertiary" : isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 14, lineHeight: 18, ...(past ? { textDecorationLine: "line-through" as const } : {}) }}
                numberOfLines={2}
              >
                {event.title}
              </Text>
              {event.authorName ? (
                <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }} numberOfLines={1}>
                  {firstNameOf({ displayName: event.authorName })}&apos;s
                </Text>
              ) : null}
              {event.threadId && event.threadName ? (
                <ThreadPill id={event.threadId} name={event.threadName} icon={event.threadIcon} hue={event.threadHue} size={24} />
              ) : event.calendarName ? (
                <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }} numberOfLines={1}>
                  {event.calendarName}
                </Text>
              ) : null}
            </View>
          );
          return open ? (
            <Pressable
              key={event.id}
              onPress={open}
              accessibilityRole={event.source === "calendar" ? "link" : "button"}
              accessibilityLabel={`${event.title}, ${eventRange(event, zone)}`}
              accessibilityHint={event.source === "calendar" ? "Opens in Google Calendar" : "Opens its thread"}
            >
              {body}
            </Pressable>
          ) : (
            <View key={event.id} accessible accessibilityLabel={`${event.title}, ${eventRange(event, zone)}`}>
              {body}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
