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
      {/* Drawn at 40 inside the 44 target, as the kit's stepper is. */}
      <View className={`items-center justify-center rounded-pill ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`} style={{ width: 40, height: 40 }}>
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

export function SectionHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <View className="flex-row items-baseline gap-space-3 pb-space-2">
      <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} accessibilityRole="header">
        {title}
      </Text>
      {count !== undefined ? (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
          {count}
        </Text>
      ) : null}
      {hint ? (
        <Text className="ml-auto font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
          {hint}
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
              ? () => router.push({ pathname: "/threads/[id]", params: { id: event.threadId! } })
              : event.link && GOOGLE_EVENT_LINK.test(event.link)
                ? () => void openLink(event.link)
                : null;
          const body = (
            <View
              className={`gap-space-1 ${raised ? "border border-border-hairline bg-surface-raised" : isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
              style={[
                { width: 128, paddingHorizontal: 12, paddingVertical: 10, borderRadius: isAndroid ? 16 : 14 },
                raised ? { shadowColor: COLOR.shadowLift.color, shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY }, shadowRadius: COLOR.shadowLift.radius, shadowOpacity: 1 } : null,
              ]}
            >
              <Text className="font-core font-semibold text-text-secondary" style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
                {eventRange(event, zone)}
              </Text>
              <Text
                className={`font-core font-medium ${past ? "text-text-secondary" : isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 14, lineHeight: 18 }}
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
                <ThreadPill id={event.threadId} name={event.threadName} size={24} />
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
