// Needs you. 027, from `TodayParts.jsx`'s `NeedsYou`.
//
// Interruptions only, one card with the rest stacked under it. The kind and
// how long it has waited, a title, one line, the actions that settle it, and a
// clock that puts it off until tomorrow; a sideways swipe does the same. Each
// action does exactly what it does where it already lives, with its own Undo
// or none and its own failure words; an answer's Undo line takes the card's
// place and corners (2026-10-18), the next card under it. The next card's actions take no tap for
// 300ms, so a second tap meant for the first cannot land on it. Drawn only
// when it holds something.

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { zoneCity } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { QuickReplies } from "../shell/QuickReplies";
import { ThreadPill } from "../shell/ThreadPill";
import type { ToastState } from "../shell/Toast";
import { UndoLine } from "../shell/UndoLine";
import { useUndoEntries } from "../../lib/undo";
import { useColors } from "../../lib/colors";
import { DEVICE_ONLY } from "../../lib/account-keys";
import { API_URL } from "../../lib/auth";
import { answerQuestion, undoTurn } from "../../lib/dump";
import { setClock } from "../../lib/me";
import { acceptInvitation, answerRequest, firstNameOf, nameOf } from "../../lib/people";
import { turnOn } from "../../lib/notifications";
import { putOff, resumeQuestion, stackView, typedOnly, type Card } from "../../lib/today";
import { useConversation } from "../shell/conversation-context";

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
  thread: { id: string; name: string; icon: string | null; hue: number | null } | null;
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
        // The account first when there are two, then the way forward.
        line: card.email ? `${card.email}. Sign in again to see its events here.` : "Sign in again to see its events here.",
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
        thread: card.threadId && card.threadName ? { id: card.threadId, name: card.threadName, icon: card.threadIcon, hue: card.threadHue } : null,
      };
    case "tip":
      return { icon: "mail", tone: "accent", kind: "Tip", title: "Forward emails to offload", line: `Send them to ${card.address} from ${card.from}.`, thread: null };
  }
}

/** Landed; already settled somewhere else, so the card goes quietly; or
 *  refused, so it comes back with its line and Try again. */
type Outcome = "ok" | "gone" | "failed";
const outcomeOf = (ok: boolean): Outcome => (ok ? "ok" : "failed");

interface Action {
  label: string;
  run: () => Promise<Outcome>;
  /** The line a refusal puts the card back with. */
  failed: string;
  /** Acts without settling the card: Copy address, and Reconnect, whose
   *  card goes only once a fresh read finds the account syncing. */
  keeps?: boolean;
}

export function NeedsYou({
  cards,
  load,
  toast,
  onChanged,
  onReload,
}: {
  cards: Card[];
  /** Which read of Needs you this is: a new one starts the stack afresh. */
  load: number;
  toast: ToastState;
  onChanged: () => void;
  /** Read Needs you again: after a sign-in, which only a read can confirm. */
  onReload: () => void;
}) {
  const COLOR = useColors();
  const { resumeConversation } = useConversation();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<{ key: string; label: string; line: string } | null>(null);
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
  // The answered cards' lines, while their windows run.
  const undoLines = useUndoEntries();
  const answered = [...gone].flatMap((key) => {
    const entry = undoLines.get(`needs:${key}`);
    return entry ? [entry] : [];
  });
  const radius = isAndroid ? 16 : 18;

  if (!card) {
    return answered.length > 0 ? (
      <View className="gap-space-4">
        {answered.map((entry) => (
          <UndoLine key={entry.id} entry={entry} radius={radius} />
        ))}
      </View>
    ) : null;
  }
  const face = faceOf(card);
  const tone = face.tone === "danger" ? "text-text-danger" : face.tone === "attention" ? "text-text-attention" : "text-text-accent";
  const toneColor = face.tone === "danger" ? COLOR.danger : face.tone === "attention" ? COLOR.textAttention : COLOR.accent;

  /** Off the stack at the press; back with its line and Try again if the
   *  write is refused; gone quietly if it was settled somewhere else. */
  const settle = (key: string, write: () => Promise<Outcome>, failure: string, label: string) => {
    setFailed(null);
    setGone((held) => new Set(held).add(key));
    setInert(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setInert(false), INERT_MS);
    // A settled card stays gone from this load's stack, so *N of M* counts
    // on from where it was; the next focus reads the stack afresh.
    void write()
      .catch((): Outcome => "failed")
      .then((outcome) => {
        if (outcome === "ok") onChanged();
        if (outcome !== "failed") return;
        setGone((held) => {
          const next = new Set(held);
          next.delete(key);
          return next;
        });
        setFailed({ key, label, line: failure });
      });
  };

  /** An action that leaves the card where it is, a sign-in or a dialog that
   *  may change nothing: no inert spell, and only a failure says anything. */
  const keep = (key: string, run: () => Promise<Outcome>, failure: string, label: string) => {
    setFailed(null);
    void run()
      .catch((): Outcome => "failed")
      .then((outcome) => {
        if (outcome === "failed") setFailed({ key, label, line: failure });
      });
  };

  const tomorrow = async (): Promise<Outcome> => {
    if (card.kind === "notifications") {
      // The phone's own midnight, on purpose: this card is a fact about the
      // phone, not the account.
      const start = new Date();
      start.setHours(24, 0, 0, 0);
      try {
        SecureStore.setItem(NOTIFICATIONS_PUT_OFF, start.toISOString(), DEVICE_ONLY);
        return "ok";
      } catch {
        return "failed";
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
            keeps: true,
            run: async () => {
              await WebBrowser.openAuthSessionAsync(`${API_URL}/api/connectors/google/start?landing=settings`, `${WEB}/settings/apps`);
              onReload();
              return "ok";
            },
            failed: "That didn't go through.",
          },
        ];
      case "zone":
        return [
          { label: `Use ${zoneCity(card.device)}`, run: async () => outcomeOf((await setClock({ timeZone: card.device })) !== null), failed: "Couldn't save that." },
          { label: `Keep ${zoneCity(card.account)}`, run: async () => outcomeOf((await setClock({ keptTimeZone: card.device })) !== null), failed: "Couldn't save that." },
        ];
      case "notifications":
        return [
          {
            label: "Turn on",
            keeps: true,
            // The card goes once a fresh read finds this phone allowed. A
            // no is the person's answer: the card already says they are
            // off, and the next press opens System settings.
            run: async () => {
              const outcome = await turnOn();
              if (outcome === "on") onReload();
              return outcome === "failed" ? "failed" : "ok";
            },
            failed: "That didn't go through.",
          },
        ];
      case "request":
        return [
          { label: "Accept", run: async () => outcomeOf(await answerRequest(card.requestId, "accept")), failed: "That didn't go through." },
          { label: "Not now", run: async () => outcomeOf(await answerRequest(card.requestId, "dismiss")), failed: "That didn't go through." },
        ];
      case "invitation":
        return [
          {
            label: "Add it to my threads",
            run: async () => {
              const accepted = await acceptInvitation(card.memberId);
              return accepted === "gone" ? "gone" : outcomeOf(accepted !== null);
            },
            failed: "That didn't go through.",
          },
          { label: "Not now", run: () => putOff(card.key, true), failed: "That didn't go through." },
        ];
      case "tip":
        return [
          {
            label: "Copy address",
            keeps: true,
            run: async () => {
              await Clipboard.setStringAsync(card.address);
              toast.show("Copied");
              return "ok";
            },
            failed: "That didn't go through.",
          },
          { label: "Got it", run: () => putOff(card.key, true), failed: "That didn't go through." },
        ];
      case "question":
        // Values are tapped through QuickReplies below. A question only
        // typing answers is drawn as any other card, one row: Answer opens
        // the conversation that asked, and stays until the typed answer
        // closes the question; Dismiss is 018's way out by its index.
        if (!typedOnly(card.question.options)) return [];
        return [
          {
            label: "Answer",
            keeps: true,
            run: async () => {
              const outcome = await resumeQuestion(card.question.id);
              if (outcome === "gone") {
                setGone((held) => new Set(held).add(card.key));
                return "ok";
              }
              return outcome === "ok" && (await resumeConversation()) ? "ok" : "failed";
            },
            failed: "That didn't go through.",
          },
          {
            label: "Dismiss",
            run: answerWrite(card, card.question.options.findIndex((option) => option.kind === "plain")),
            failed: "That didn't go through.",
          },
        ];
    }
  })();

  const putAway = () => settle(card.key, tomorrow, "Couldn't save that.", "Tomorrow");
  const failure = failed?.key === card.key ? failed : null;
  const labelOf = (label: string) => (failure?.label === label ? "Try again" : label);

  /** 018's answer by option, with 018's Undo on a value, and a question
   *  already closed somewhere else let go with nothing to retry. */
  function answerWrite(on: Extract<Card, { kind: "question" }>, index: number): () => Promise<Outcome> {
    const option = on.question.options[index]!;
    return async () => {
      const { status, sent } = await answerQuestion(on.question.id, index);
      if (status === 404 || status === 409) return "gone";
      if (!sent) return "failed";
      if (option.kind === "value") {
        const place = { id: `needs:${on.key}`, icon: "check", form: "slot" } as const;
        toast.show(
          on.threadName ? `${option.label}, for ${on.threadName}` : option.label,
          {
            label: "Undo",
            onPress: async () => {
              if (!(await undoTurn(sent.turnId).catch(() => false))) toast.show("Couldn't undo that", undefined, place);
            },
          },
          place,
        );
      }
      return "ok";
    };
  }
  const answer = (on: Extract<Card, { kind: "question" }>, index: number) =>
    settle(on.key, answerWrite(on, index), "That didn't go through.", on.question.options[index]!.label);
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

  const ground = "bg-surface-raised border border-border-hairline";
  const lift = { shadowColor: COLOR.shadowLift.color, shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY }, shadowRadius: COLOR.shadowLift.radius, shadowOpacity: 1 };
  const pill = "min-h-tap-min justify-center";
  const outline = `justify-center border px-space-5 ${isAndroid ? "rounded-a-sm border-a-outline" : "rounded-pill border-border-hairline"}`;
  const filled = `justify-center px-space-5 ${isAndroid ? "rounded-a-sm bg-a-on" : "rounded-pill bg-surface-inverse"}`;
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
    <View className="gap-space-4">
      {answered.map((entry) => (
        <UndoLine key={entry.id} entry={entry} radius={radius} />
      ))}
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
                <ThreadPill id={face.thread.id} name={face.thread.name} icon={face.thread.icon} hue={face.thread.hue} size={24} />
              </View>
            ) : null}
            {failure ? (
              <Text className="mt-space-2 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
                {failure.line}
              </Text>
            ) : null}

            {question && !typedOnly(question.question.options) ? (
              // The conversation's own QuickReplies: no option filled, Not
              // that alone on its line with the clock beside it.
              <View className="mt-space-4">
                <QuickReplies
                  options={question.question.options.map((option) => ({ ...option, label: labelOf(option.label) }))}
                  label={question.question.text}
                  disabled={inert}
                  onPick={(index) => answer(question, index)}
                  trailing={clock}
                />
              </View>
            ) : (
              <View className="mt-space-4 flex-row flex-wrap items-center gap-space-2">
                {actions.map((action, index) => (
                  <Pressable
                    key={action.label}
                    disabled={inert}
                    onPress={() => {
                      if (action.keeps) keep(card.key, action.run, action.failed, action.label);
                      else settle(card.key, action.run, action.failed, action.label);
                    }}
                    accessibilityRole="button"
                    className={pill}
                  >
                    <View className={index === 0 ? filled : outline} style={{ minHeight: pillHeight }}>
                      <Text
                        className={`font-core font-medium ${index === 0 ? (isAndroid ? "text-a-surface" : "text-text-inverse") : isAndroid ? "text-a-on" : "text-text-primary"}`}
                        style={{ fontSize: 13 }}
                      >
                        {labelOf(action.label)}
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
    </View>
  );
}
