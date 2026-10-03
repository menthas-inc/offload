// 033. The intro's three scenes, each acting out its sentence.
//
// From `onboarding-screens.js`'s `art()` and the timings in the handoff. Every
// scene mounts fresh (the intro keys it), so its entrances run from its own
// start. With `animate` off, for reduced motion or a screen reader, each scene
// draws its end state and nothing moves.
//
// The drawing is a picture: the intro hides it from assistive technology and
// announces the copy instead.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { INTRO_DUMPS, INTRO_SHARED, INTRO_THREADS, INTRO_WAYS } from "../../lib/gate";
import { SKIN, type Tone } from "./skin";

const ENTER = Easing.bezier(0.2, 0.8, 0.2, 1);
const OVERSHOOT = Easing.bezier(0.3, 1.5, 0.5, 1);
const FILE = Easing.bezier(0.5, 0, 0.3, 1);

/** When scene one starts filing, and how far apart each dump goes. */
const FILE_AT = 4600;
const FILE_GAP = 650;
const FILE_MS = 1100;
const LANDS_AFTER = 950;
const HIT_MS = 550;

/** Rises 14px into place from 0.96, or pops from 0.4 with an overshoot. */
function Enter({
  delay = 0,
  animate,
  pop = false,
  style,
  children,
}: {
  delay?: number;
  animate: boolean;
  pop?: boolean;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const shown = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    shown.value = withDelay(delay, withTiming(1, { duration: pop ? 700 : 900, easing: pop ? OVERSHOOT : ENTER }));
  }, [animate, delay, pop, shown]);
  const moving = useAnimatedStyle(() =>
    pop
      ? { opacity: Math.min(1, shown.value), transform: [{ scale: 0.4 + 0.6 * shown.value }] }
      : {
          opacity: shown.value,
          transform: [{ translateY: 14 * (1 - shown.value) }, { scale: 0.96 + 0.04 * shown.value }],
        },
  );
  return <Animated.View style={[style, moving]}>{children}</Animated.View>;
}

/** A person in the picture: a flat circle on a label colour, not `Avatar`,
 *  which would fetch the mark of an account that does not exist. */
function Person({ initials, tone, size = 28, ring }: { initials: string; tone: string; size?: number; ring: string }) {
  return (
    <View
      className={`items-center justify-center rounded-pill ${tone} ${ring}`}
      style={{ width: size + 4, height: size + 4, borderWidth: 2 }}
    >
      <Text className="font-core font-semibold text-text-on-solid" style={{ fontSize: Math.round(size * 0.38) }}>
        {initials}
      </Text>
    </View>
  );
}

const PEOPLE_TONES = ["bg-label-1", "bg-label-2", "bg-label-6"] as const;

// ---------------------------------------------------------------- scene 1

type Centre = SharedValue<{ x: number; y: number }>;

function centreOf(event: LayoutChangeEvent) {
  const { x, y, width, height } = event.nativeEvent.layout;
  return { x: x + width / 2, y: y + height / 2 };
}

function Dump({
  text,
  index,
  target,
  animate,
  tone,
}: {
  text: string;
  index: number;
  target: Centre;
  animate: boolean;
  tone: Tone;
}) {
  const own = useSharedValue({ x: 0, y: 0 });
  const filed = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    filed.value = withDelay(FILE_AT + index * FILE_GAP, withTiming(1, { duration: FILE_MS, easing: FILE }));
  }, [animate, filed, index]);
  // Travels to the centre of its thread, shrinking to a quarter and fading.
  const travel = useAnimatedStyle(() => ({
    opacity: 1 - filed.value,
    transform: [
      { translateX: (target.value.x - own.value.x) * filed.value },
      { translateY: (target.value.y - own.value.y) * filed.value },
      { scale: 1 - 0.75 * filed.value },
    ],
  }));
  const right = index % 2 === 1;
  return (
    <Animated.View
      onLayout={(event) => {
        own.value = centreOf(event);
      }}
      style={[{ alignSelf: right ? "flex-end" : "flex-start", maxWidth: "84%" }, travel]}
    >
      <Enter animate={animate} delay={1000 + index * 700}>
        <View
          className={tone === "android" ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"}
          style={{ borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16 }}
        >
          <Text className={`font-core ${SKIN[tone].text}`} style={{ fontSize: 16, lineHeight: 21 }}>
            {text}
          </Text>
        </View>
      </Enter>
    </Animated.View>
  );
}

function ThreadRow({
  index,
  count,
  hit,
  centre,
  animate,
  tone,
}: {
  index: number;
  count: number;
  hit: boolean;
  centre: Centre;
  animate: boolean;
  tone: Tone;
}) {
  const COLOR = useColors();
  const [glyph, name] = INTRO_THREADS[index]!;
  const struck = useSharedValue(0);
  useEffect(() => {
    struck.value = withTiming(hit ? 1 : 0, { duration: 400 });
  }, [hit, struck]);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.03 * struck.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: struck.value }));
  return (
    <Animated.View
      onLayout={(event) => {
        centre.value = centreOf(event);
      }}
      style={[index === 0 ? { marginTop: 14 } : undefined, lift]}
    >
      <Enter animate={animate} delay={index * 300}>
        <View
          className={`flex-row items-center ${tone === "android" ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"}`}
          style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: tone === "android" ? 20 : 16 }}
        >
          <View
            className={`items-center justify-center ${SKIN[tone].well}`}
            style={{ width: 34, height: 34, borderRadius: tone === "android" ? 17 : 10 }}
          >
            <Glyph name={glyph} size={18} color={COLOR.iconOnWell} />
          </View>
          <Text className={`flex-1 font-core font-semibold ${SKIN[tone].text}`} style={{ fontSize: 17 }}>
            {name}
          </Text>
          <Text
            className={`font-core font-medium ${hit ? SKIN[tone].text : SKIN[tone].quiet}`}
            style={{ fontSize: 14, fontVariant: ["tabular-nums"] }}
          >
            {count}
          </Text>
          {/* The ring a thread takes as a dump lands. Drawn over the row so
              the row's own size never changes mid-flight. */}
          <Animated.View
            pointerEvents="none"
            className={SKIN[tone].ring}
            style={[
              { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderWidth: 1.5, borderRadius: tone === "android" ? 20 : 16 },
              ring,
            ]}
          />
        </View>
      </Enter>
    </Animated.View>
  );
}

function Filing({ tone, animate }: { tone: Tone; animate: boolean }) {
  const lisbon = useSharedValue({ x: 0, y: 0 });
  const bookshelf = useSharedValue({ x: 0, y: 0 });
  const targets = [lisbon, bookshelf];
  // Where they end: every dump filed, each count up by what landed in it.
  const filedInto = (thread: number) => INTRO_DUMPS.filter(([, into]) => into === thread).length;
  const [counts, setCounts] = useState(() =>
    INTRO_THREADS.map(([, , start], thread) => (animate ? start : start + filedInto(thread))),
  );
  const [hits, setHits] = useState([false, false]);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!animate) return;
    const set = (thread: number, on: boolean) => setHits((was) => was.map((h, k) => (k === thread ? on : h)));
    INTRO_DUMPS.forEach(([, thread], index) => {
      const lands = FILE_AT + index * FILE_GAP + LANDS_AFTER;
      timers.current.push(
        setTimeout(() => {
          setCounts((was) => was.map((n, k) => (k === thread ? n + 1 : n)));
          set(thread, true);
        }, lands),
        setTimeout(() => set(thread, false), lands + HIT_MS),
      );
    });
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [animate]);

  return (
    <View style={{ gap: 10 }}>
      {INTRO_DUMPS.map(([text, thread], index) => (
        <Dump key={text} text={text} index={index} target={targets[thread]!} animate={animate} tone={tone} />
      ))}
      {INTRO_THREADS.map(([, name], index) => (
        <ThreadRow
          key={name}
          index={index}
          count={counts[index]!}
          hit={hits[index]!}
          centre={targets[index]!}
          animate={animate}
          tone={tone}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- scene 2

function Shared({ tone, animate }: { tone: Tone; animate: boolean }) {
  const COLOR = useColors();
  const skin = SKIN[tone];
  const card = tone === "android" ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised";
  // The ring around each person is the card's own ground, so the stack reads
  // as cut-outs rather than outlines.
  const ring = tone === "android" ? "border-a-c-low" : "border-surface-raised";
  const [first, ...joining] = INTRO_SHARED.people;
  return (
    <View style={{ gap: 6 }}>
      <Enter animate={animate}>
        <View
          className={`overflow-hidden ${card}`}
          style={{
            borderRadius: 20,
            paddingTop: 6,
            paddingBottom: 4,
            shadowColor: COLOR.shadowLift.color,
            shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY },
            shadowRadius: COLOR.shadowLift.radius,
            shadowOpacity: tone === "android" ? 0 : 1,
          }}
        >
          <View className="flex-row items-center border-b border-border-hairline" style={{ gap: 12, paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16 }}>
            <View className={`items-center justify-center ${skin.well}`} style={{ width: 34, height: 34, borderRadius: tone === "android" ? 17 : 10 }}>
              <Glyph name="lasso" size={18} color={COLOR.iconOnWell} />
            </View>
            <Text className={`flex-1 font-core font-semibold ${skin.text}`} style={{ fontSize: 19 }}>
              {INTRO_SHARED.thread}
            </Text>
            <View className="flex-row">
              <Person initials={first[1]} tone={PEOPLE_TONES[0]} ring={ring} />
              {joining.map(([name, initials], index) => (
                <Enter key={name} animate={animate} pop delay={2000 + index * 600} style={{ marginLeft: -8 }}>
                  <Person initials={initials} tone={PEOPLE_TONES[index + 1]!} ring={ring} />
                </Enter>
              ))}
            </View>
          </View>
          {INTRO_SHARED.rows.map(([glyph, text], index) => (
            <View
              key={text}
              className={`flex-row items-center ${index > 0 ? "border-t border-border-hairline" : ""}`}
              style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Glyph name={glyph} size={16} color={COLOR.iconOnWell} />
              <Text className={`flex-1 font-core ${skin.text}`} style={{ fontSize: 15.5, lineHeight: 20 }}>
                {text}
              </Text>
            </View>
          ))}
          <Enter animate={animate} delay={5000}>
            <View className="flex-row items-center border-t border-border-hairline bg-surface-accent-soft" style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
              <Person initials={INTRO_SHARED.people[2][1]} tone={PEOPLE_TONES[2]} size={20} ring="border-surface-accent-soft" />
              <Text className={`flex-1 font-core ${skin.text}`} style={{ fontSize: 15.5, lineHeight: 20 }}>
                <Text className="font-semibold">{INTRO_SHARED.addedBy}</Text> {INTRO_SHARED.added}
              </Text>
            </View>
          </Enter>
        </View>
      </Enter>
      <Enter animate={animate} delay={3200} style={{ alignSelf: "center" }}>
        <View className="flex-row items-center rounded-pill bg-surface-inverse" style={{ gap: 8, minHeight: 34, paddingHorizontal: 14, marginTop: 6 }}>
          <Glyph name="users" size={15} color={COLOR.page} />
          <Text className="font-core font-medium text-text-inverse" style={{ fontSize: 14 }}>
            {INTRO_SHARED.shared}
          </Text>
        </View>
      </Enter>
    </View>
  );
}

// ---------------------------------------------------------------- scene 3

const WAVE = [8, 14, 22, 12, 26, 18, 9, 20, 28, 16, 11, 24, 15, 7, 19, 25, 10, 13];

function Bar({ height, index, animate, color }: { height: number; index: number; animate: boolean; color: string }) {
  const breath = useSharedValue(1);
  useEffect(() => {
    if (!animate) return;
    // Three phases, as the exploration staggers every third bar.
    breath.value = withDelay(
      (index % 3) * 300,
      withRepeat(withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [animate, breath, index]);
  const breathing = useAnimatedStyle(() => ({ transform: [{ scaleY: breath.value }] }));
  return <Animated.View style={[{ width: 3, height, borderRadius: 2, backgroundColor: color }, breathing]} />;
}

function Way({
  glyph,
  label,
  delay,
  animate,
  tone,
  children,
}: {
  glyph: string;
  label: string;
  delay: number;
  animate: boolean;
  tone: Tone;
  children: ReactNode;
}) {
  const COLOR = useColors();
  return (
    <Enter animate={animate} delay={delay} style={{ flex: 1 }}>
      <View
        className={tone === "android" ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"}
        style={{ borderRadius: 16, padding: 8, gap: 8 }}
      >
        {children}
        <View className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 4, paddingBottom: 4 }}>
          <Glyph name={glyph} size={14} color={COLOR.secondary} />
          <Text className={`font-core font-medium ${SKIN[tone].quiet}`} style={{ fontSize: 13 }} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Enter>
  );
}

function Note({ head, line, tone }: { head: string; line: string; tone: Tone }) {
  return (
    <View className={`overflow-hidden ${SKIN[tone].well}`} style={{ height: 88, borderRadius: 10, padding: 10, gap: 4 }}>
      <Text className={`font-core font-semibold ${SKIN[tone].text}`} style={{ fontSize: 13.5, lineHeight: 17 }}>
        {head}
      </Text>
      <Text className={`font-core ${SKIN[tone].quiet}`} style={{ fontSize: 12.5, lineHeight: 16 }}>
        {line}
      </Text>
    </View>
  );
}

function Ways({ tone, animate }: { tone: Tone; animate: boolean }) {
  const COLOR = useColors();
  const [emailLabel, emailHead, emailLine] = INTRO_WAYS.email;
  const [linkLabel, linkHead, linkLine] = INTRO_WAYS.link;
  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row" style={{ gap: 10 }}>
        <Way glyph="camera" label={INTRO_WAYS.photo} delay={0} animate={animate} tone={tone}>
          <View className="items-center justify-center bg-surface-accent-soft" style={{ height: 88, borderRadius: 10 }}>
            <Glyph name="image" size={26} color={COLOR.accentInk} />
          </View>
        </Way>
        <Way glyph="mic" label={INTRO_WAYS.voice} delay={800} animate={animate} tone={tone}>
          <View className={`flex-row items-center justify-center ${SKIN[tone].well}`} style={{ height: 88, borderRadius: 10, gap: 3 }}>
            {WAVE.map((height, index) => (
              <Bar key={index} height={height} index={index} animate={animate} color={COLOR.iconOnWell} />
            ))}
          </View>
        </Way>
      </View>
      <View className="flex-row" style={{ gap: 10 }}>
        <Way glyph="mail" label={emailLabel} delay={1600} animate={animate} tone={tone}>
          <Note head={emailHead} line={emailLine} tone={tone} />
        </Way>
        <Way glyph="link" label={linkLabel} delay={2400} animate={animate} tone={tone}>
          <Note head={linkHead} line={linkLine} tone={tone} />
        </Way>
      </View>
      <Enter animate={animate} delay={4400} style={{ alignSelf: "center" }}>
        <View className="flex-row items-center rounded-pill bg-surface-accent-soft" style={{ gap: 8, minHeight: 38, paddingHorizontal: 16, marginTop: 8 }}>
          <Glyph name="check" size={16} color={COLOR.accent} />
          <Text className="font-core font-medium text-text-accent" style={{ fontSize: 15 }}>
            {INTRO_WAYS.filed}
          </Text>
        </View>
      </Enter>
    </View>
  );
}

export function IntroArt({ scene, tone, animate }: { scene: number; tone: Tone; animate: boolean }) {
  // Keyed by scene, so each one's clock starts when it appears, and by
  // whether it moves, since stillness is read after the first render.
  return (
    <View key={`${scene}.${animate}`} style={{ width: "100%" }}>
      {scene === 0 ? (
        <Filing tone={tone} animate={animate} />
      ) : scene === 1 ? (
        <Shared tone={tone} animate={animate} />
      ) : (
        <Ways tone={tone} animate={animate} />
      )}
    </View>
  );
}
