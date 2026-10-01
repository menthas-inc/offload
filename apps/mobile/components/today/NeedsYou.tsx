// Needs you. 027, from `TodayParts.jsx`'s `NeedsYou`.
//
// Interruptions only, one card with the rest stacked under it. The kind and
// how long it has waited, a title, one line, the actions that settle it, and a
// clock that puts it off until tomorrow; a sideways swipe does the same. Each
// action does exactly what it does where it already lives, with its own Undo
// or none and its own failure words. The next card's actions take no tap for
// 300ms, so a second tap meant for the first cannot land on it. Drawn only
// when it holds something.

import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { zoneCity } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { ThreadPill } from "../shell/ThreadPill";
import type { ToastState } from "../shell/Toast";
import { useColors } from "../../lib/colors";
import { API_URL } from "../../lib/auth";
import { answerQuestion } from "../../lib/dump";
import { setClock } from "../../lib/me";
import { acceptInvitation, answerRequest, firstNameOf, nameOf } from "../../lib/people";
import { putOff, stackView, type Card } from "../../lib/today";

const isAndroid = Platform.OS === "android";
const WEB = process.env["EXPO_PUBLIC_WEB_URL"] ?? "https://offload.club";
/** The notifications card's put-off lives on this phone: it is a fact about it. */
export const NOTIFICATIONS_PUT_OFF = "offload_today_notifications_until";
const INERT_MS = 300;
const SWIPE_PT = 96;

type Tone = "danger" | "attention" | "accent";

interface Face {
  icon: string;
  tone: Tone;
  kind: string;
  title: string;
  line: string | null;
  thread: { id: string; name: string } | null;
}

function waited(since: string, before: string): string {
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
  return days >= 1 ? `Waiting ${days} ${days === 1 ? "day" : "days"}` : before;
}

function faceOf(card: Card): Face {
  switch (card.kind) {
    case "calendar":
      return {
        icon: "cloud-off",
        tone: "danger",
        kind: "Calendar",
        title: "Google Calendar stopped syncing",
        line: card.email ?? "Sign in again to see its events here.",
        thread: null,
      };
    case "zone":
      return {
        icon: "compass",
        tone: "danger",
        kind: "Time zone",
        title: `This phone says ${zoneCity(card.device)}`,
        line: `Showing times in ${zoneCity(card.account)}.`,
        thread: null,
      };
    case "notifications":
      return { icon: "bell", tone: "danger", kind: "Notifications", title: "Notifications are off", line: "Reminders can't reach this phone.", thread: null };
    case "request":
      return { icon: "users", tone: "attention", kind: waited(card.since, "Wants to connect"), title: `${nameOf(card.person)} wants to connect`, line: null, thread: null };
    case "invitation":
      // 022's preview line, as the invitation screen says it.
      return {
        icon: "users",
        tone: "attention",
        kind: waited(card.since, "Shared a thread"),
        title: `${nameOf(card.from)} shared ${card.threadName}`,
        line: `${card.preview.count > 0 ? `${card.preview.count} in it. ` : ""}You can add to it, and you cannot delete anything of ${firstNameOf(card.from)}'s.`,
        thread: null,
      };
    case "question":
      return {
        icon: "message-circle",
        tone: "attention",
        kind: card.fromEmail ? "About an email" : "offload asked",
        title: card.question.text,
        line: null,
        thread: card.threadId && card.threadName ? { id: card.threadId, name: card.threadName } : null,
      };
    case "tip":
      return { icon: "mail", tone: "accent", kind: "Tip", title: "Forward emails to offload", line: `Send them to ${card.address} from ${card.from}.`, thread: null };
  }
}

interface Action {
  label: string;
  run: () => Promise<boolean>;
  /** The line a refusal puts the card back with. */
  failed: string;
}

export function NeedsYou({
  cards,
  load,
  toast,
  onChanged,
}: {
  cards: Card[];
  /** Which read of Needs you this is: a new one starts the stack afresh. */
  load: number;
  toast: ToastState;
  onChanged: () => void;
}) {
  const COLOR = useColors();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const [inert, setInert] = useState(false);
  const [loaded, setLoaded] = useState(cards.length);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A fresh read starts the stack again. A card leaving by itself between
  // reads (the zone card once Keep lands) leaves what was settled settled.
  useEffect(() => {
    setGone(new Set());
    setFailed(null);
    setLoaded(cards.length);
    // `cards` is read at the moment the load changes, not tracked.
  }, [load]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const view = stackView(cards, gone, loaded);
  const card = view.current;
  const dx = useSharedValue(0);
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }], opacity: 1 - Math.min(0.6, Math.abs(dx.value) / 400) }));
  useEffect(() => {
    dx.value = 0;
  }, [card?.key, dx]);

  if (!card) return null;
  const face = faceOf(card);
  const tone = face.tone === "danger" ? "text-text-danger" : face.tone === "attention" ? "text-text-attention" : "text-text-accent";
  const toneColor = face.tone === "danger" ? COLOR.danger : face.tone === "attention" ? COLOR.textAttention : COLOR.accent;

  /** Off the stack at the press; back with its line if the write is refused. */
  const settle = (key: string, write: () => Promise<boolean>, failure: string) => {
    setFailed(null);
    setGone((held) => new Set(held).add(key));
    setInert(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setInert(false), INERT_MS);
    // A settled card stays gone from this load's stack, so *N of M* counts
    // on from where it was; the next focus reads the stack afresh.
    void write().then((ok) => {
      if (ok) {
        onChanged();
        return;
      }
      setGone((held) => {
        const next = new Set(held);
        next.delete(key);
        return next;
      });
      setFailed(failure);
    });
  };

  const tomorrow = async (): Promise<boolean> => {
    if (card.kind === "notifications") {
      const start = new Date();
      start.setHours(24, 0, 0, 0);
      try {
        SecureStore.setItem(NOTIFICATIONS_PUT_OFF, start.toISOString());
        return true;
      } catch {
        return false;
      }
    }
    return putOff(card.key);
  };
  const canPutOff = card.kind !== "zone";

  const actions: Action[] = (() => {
    switch (card.kind) {
      case "calendar":
        return [
          {
            label: "Reconnect",
            run: async () => {
              await WebBrowser.openAuthSessionAsync(`${API_URL}/api/connectors/google/start?landing=settings`, `${WEB}/settings/apps`);
              return true;
            },
            failed: "That didn't go through.",
          },
        ];
      case "zone":
        return [
          { label: `Use ${zoneCity(card.device)}`, run: async () => (await setClock({ timeZone: card.device })) !== null, failed: "Couldn't save that." },
          { label: `Keep ${zoneCity(card.account)}`, run: async () => (await setClock({ keptTimeZone: card.device })) !== null, failed: "Couldn't save that." },
        ];
      case "notifications":
        return [{ label: "Turn on", run: async () => (await Linking.openSettings().then(() => true, () => false)), failed: "That didn't go through." }];
      case "request":
        return [
          { label: "Accept", run: () => answerRequest(card.requestId, "accept"), failed: "That didn't go through." },
          { label: "Not now", run: () => answerRequest(card.requestId, "dismiss"), failed: "That didn't go through." },
        ];
      case "invitation":
        return [
          { label: "Add it to my threads", run: async () => (await acceptInvitation(card.memberId)) !== null, failed: "That didn't go through." },
          { label: "Not now", run: () => putOff(card.key, true), failed: "That didn't go through." },
        ];
      case "tip":
        return [
          {
            label: "Copy address",
            run: async () => {
              await Clipboard.setStringAsync(card.address);
              toast.show("Copied");
              return true;
            },
            failed: "That didn't go through.",
          },
          { label: "Got it", run: () => putOff(card.key, true), failed: "That didn't go through." },
        ];
      case "question":
        return [];
    }
  })();

  // Copy address leaves the card where it is: the tip is settled by Got it.
  const keeps = (action: Action) => card.kind === "tip" && action.label === "Copy address";

  const putAway = () => settle(card.key, tomorrow, "Couldn't save that.");
  const swipe = Gesture.Pan()
    .enabled(canPutOff && !inert)
    .activeOffsetX([-16, 16])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      dx.value = event.translationX;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > SWIPE_PT) {
        dx.value = withTiming(Math.sign(event.translationX) * 480, { duration: 180, reduceMotion: ReduceMotion.System }, () => runOnJS(putAway)());
      } else {
        dx.value = withTiming(0, { duration: 160, reduceMotion: ReduceMotion.System });
      }
    });

  const radius = isAndroid ? 16 : 18;
  const ground = "bg-surface-raised border border-border-hairline";
  const lift = { shadowColor: COLOR.shadowLift.color, shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY }, shadowRadius: COLOR.shadowLift.radius, shadowOpacity: 1 };
  const pill = "min-h-tap-min justify-center";
  const outline = `justify-center rounded-pill border border-border-hairline px-space-5 ${isAndroid ? "rounded-xs" : ""}`;
  const filled = `justify-center rounded-pill px-space-5 ${isAndroid ? "bg-a-on rounded-xs" : "bg-surface-inverse"}`;
  const pillHeight = isAndroid ? 32 : 34;

  const clock = canPutOff ? (
    <Pressable
      onPress={putAway}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel="Tomorrow"
      accessibilityHint="Puts this off until tomorrow"
      className={`${pill} ml-auto`}
    >
      <View className="items-center justify-center rounded-pill border border-border-hairline" style={{ width: pillHeight, height: pillHeight }}>
        <Glyph name="clock" size={14} color={COLOR.iconOnWell} />
      </View>
    </Pressable>
  ) : null;

  const question = card.kind === "question" ? card : null;

  return (
    <View className="relative" style={{ paddingBottom: view.slivers > 0 ? 10 : 0 }}>
      {view.slivers > 1 ? (
        <View className={`absolute ${ground}`} style={{ left: 20, right: 20, bottom: 0, height: 60, borderRadius: radius, opacity: 0.7 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      ) : null}
      {view.slivers > 0 ? (
        <View className={`absolute ${ground}`} style={{ left: 10, right: 10, bottom: 5, height: 60, borderRadius: radius }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      ) : null}
      <GestureDetector gesture={swipe}>
        <Animated.View className={ground} style={[{ borderRadius: radius, paddingHorizontal: 16, paddingVertical: 14 }, lift, moved]}>
          <View className="flex-row items-center gap-space-2">
            <Glyph name={face.icon} size={14} color={toneColor} />
            <Text className={`font-core font-medium ${tone}`} style={{ fontSize: 12 }}>
              {face.kind}
            </Text>
            <Text className="ml-auto font-core font-medium text-text-tertiary" style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {view.position} of {view.total}
            </Text>
          </View>
          <Text
            className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 17, lineHeight: 22, marginTop: 8, marginBottom: 2 }}
            numberOfLines={face.line || face.thread ? 2 : 3}
            accessibilityRole="header"
          >
            {face.title}
          </Text>
          {face.line ? (
            <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13.5, lineHeight: 19 }} numberOfLines={1}>
              {face.line}
            </Text>
          ) : null}
          {face.thread ? (
            <View className="mt-space-1">
              <ThreadPill id={face.thread.id} name={face.thread.name} size={24} />
            </View>
          ) : null}
          {failed ? (
            <Text className="mt-space-2 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
              {failed}
            </Text>
          ) : null}

          {question ? (
            // `QuickReplies`' rule: no option is filled, since a filled one
            // would say offload recommends it; Not that alone on the last
            // line with its x; the group named by the question itself.
            <View className="mt-space-4 gap-space-2" accessibilityLabel={question.question.text}>
              <View className="flex-row flex-wrap gap-space-2">
                {question.question.options.map((option, index) =>
                  option.kind === "value" ? (
                    <Pressable
                      key={index}
                      disabled={inert}
                      onPress={() =>
                        settle(card.key, async () => (await answerQuestion(question.question.id, index)).status === 200, "That didn't go through.")
                      }
                      accessibilityRole="button"
                      className={pill}
                    >
                      <View className={outline} style={{ minHeight: pillHeight }}>
                        <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 13 }}>
                          {option.label}
                        </Text>
                      </View>
                    </Pressable>
                  ) : null,
                )}
              </View>
              <View className="flex-row items-center">
                {question.question.options.map((option, index) =>
                  option.kind === "plain" ? (
                    <Pressable
                      key={index}
                      disabled={inert}
                      onPress={() =>
                        settle(card.key, async () => (await answerQuestion(question.question.id, index)).status === 200, "That didn't go through.")
                      }
                      accessibilityRole="button"
                      className={pill}
                    >
                      <View className={`${outline} flex-row items-center gap-space-1`} style={{ minHeight: pillHeight }}>
                        <Glyph name="x" size={13} color={COLOR.secondary} />
                        <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
                          {option.label}
                        </Text>
                      </View>
                    </Pressable>
                  ) : null,
                )}
                {clock}
              </View>
            </View>
          ) : (
            <View className="mt-space-4 flex-row flex-wrap items-center gap-space-2">
              {actions.map((action, index) => (
                <Pressable
                  key={action.label}
                  disabled={inert}
                  onPress={() => {
                    if (keeps(action)) void action.run();
                    else settle(card.key, action.run, action.failed);
                  }}
                  accessibilityRole="button"
                  className={pill}
                >
                  <View className={index === 0 ? filled : outline} style={{ minHeight: pillHeight }}>
                    <Text
                      className={`font-core font-medium ${index === 0 ? (isAndroid ? "text-a-surface" : "text-text-inverse") : isAndroid ? "text-a-on" : "text-text-primary"}`}
                      style={{ fontSize: 13 }}
                    >
                      {action.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {clock}
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
