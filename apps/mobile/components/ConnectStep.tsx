// The last screen of first run: bring in your calendar.
//
// From `ConnectScreen` and `M3ConnectScreen` in the kits, which is option A of
// `explorations/connect-apps.html`. One provider, one screen. The screen makes
// no claim that a list exists, so a second connector becomes another screen
// rather than a redesign.
//
// A `tone` rather than a pair of files, the same shape `ConsentTicks` and
// `NameField` use: the copy is identical on both platforms and only the chrome
// forks. Here that is the geometry Material and iOS disagree about, which the
// two kits spell out and which is why the numbers below are per tone rather
// than shared.

import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Glyph } from "./Glyph";
import { CONNECT_STEP } from "../lib/gate";
import { useColors } from "../lib/colors";

export type ConnectTone = "ios" | "android";

/** The provider's mark, 88px, and **never redrawn.**
 *
 *  offload's own mark can be drawn from its own geometry because that geometry
 *  is ours. A third party's corner radius, colours and letterforms are their
 *  specification, and an approximation that is ninety percent right is the one
 *  kind of wrong somebody spots instantly on a logo they see every day.
 *
 *  With nothing passed, both kits draw a dashed stand-in and so does this, so a
 *  missing asset is visible rather than silent. The file belongs at
 *  `assets/brands/google-calendar.svg`, from Google's own brand resources, and
 *  their terms govern clear space and forbid recolouring: the 88px rounded
 *  container may have to grow to satisfy the clear-space rule. */
export function ProviderMark({
  tone,
  source,
  size = 88,
  radius,
}: {
  tone: ConnectTone;
  source?: number | null;
  /** 88 on the connect screen; 34 in Settings' provider block (019), where
   *  the radius is given rather than inferred: 8 is a proportional scaling of
   *  the stand-in's own 18 rather than a step on the radius scale. */
  size?: number;
  radius?: number;
}) {
  const COLOR = useColors();
  const [broken, setBroken] = useState(false);
  // Only the stand-in is rounded, and the two cases are genuinely different.
  //
  // **The real mark carries its own silhouette** and Google Calendar's includes
  // a folded corner, so a container radius on top of it clips geometry its
  // owner already specified. Both kits round it, which is right for a provider
  // whose asset is a bare square bitmap and wrong for one that is a shaped
  // icon. Code wins, and the divergence is logged.
  //
  // The stand-in **is** a bare square, and its radius is what makes a dashed
  // box read as the slot an icon goes in rather than as a broken image.
  const standInRadius = radius ?? (tone === "ios" ? 18 : 20);

  if (source && !broken) {
    return (
      <Image
        source={source}
        onError={() => setBroken(true)}
        resizeMode="contain"
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      accessible={false}
      className={tone === "android" ? "bg-a-c-low" : "bg-surface-fill"}
      style={{
        width: size,
        height: size,
        borderRadius: standInRadius,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: COLOR.iconOnWell,
      }}
    />
  );
}

/** Dots left, the way out top right, in the same place they sit on every
 *  tutorial screen so neither moves under the thumb.
 *
 *  **Four dots, the tutorial plus this**, which is the number both kits draw
 *  and `STEPS = TUTORIAL.length + 1` in each. The name and consent screens are
 *  outside the count: the design system's own note says nothing decides whether
 *  they join it, and the kits answer by not counting them. */
export function ConnectStepBar({
  tone,
  steps,
  onNotNow,
}: {
  tone: ConnectTone;
  steps: number;
  onNotNow: () => void;
}) {
  const isAndroid = tone === "android";
  return (
    <View className="flex-row items-center justify-between px-gutter-screen">
      <View className="flex-row items-center gap-space-3">
        {Array.from({ length: steps }).map((_, index) => {
          const on = index === steps - 1;
          return (
            <View
              key={index}
              className={`h-space-3 rounded-pill ${
                on
                  ? isAndroid
                    ? "bg-a-on"
                    : "bg-ink-950"
                  : isAndroid
                    ? "bg-a-c-high"
                    : "bg-ink-200"
              }`}
              style={{ width: on ? 18 : 6 }}
            />
          );
        })}
      </View>

      <Pressable
        onPress={onNotNow}
        className="min-h-tap-min justify-center px-space-4"
        accessibilityRole="button"
      >
        <Text
          className={`font-core font-medium ${isAndroid ? "text-blue-700" : "text-text-secondary"}`}
          style={isAndroid ? { fontSize: 14, lineHeight: 20 } : undefined}
        >
          {CONNECT_STEP.notNow}
        </Text>
      </Pressable>
    </View>
  );
}

/** The mark, the two sentences, and the two facts under them. */
export function ConnectStepBody({
  tone,
  mark,
}: {
  tone: ConnectTone;
  mark?: number | null;
}) {
  const COLOR = useColors();
  const isAndroid = tone === "android";

  return (
    <>
      <View className="flex-1 items-center justify-center px-gutter-screen">
        <ProviderMark tone={tone} source={mark ?? null} />
      </View>

      <View className="px-gutter-screen pb-space-7">
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={
            isAndroid
              ? { fontSize: 28, lineHeight: 33, letterSpacing: -0.4 }
              : { fontSize: 28, lineHeight: 33, letterSpacing: -0.4 }
          }
        >
          {CONNECT_STEP.title}
        </Text>
        <Text
          className={`mt-space-4 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
          style={{
            fontSize: 16,
            lineHeight: 24,
            letterSpacing: isAndroid ? 0.16 : 0,
          }}
        >
          {CONNECT_STEP.sub}
        </Text>

        {/* Two facts, not a feature list: what it reads, and what it does back. */}
        <View
          className={`${isAndroid ? "mt-space-6" : "mt-space-7"} gap-space-5`}
        >
          {CONNECT_STEP.facts.map(([icon, head, rest]) => (
            <View key={head} className="flex-row items-start gap-space-5">
              <View style={{ marginTop: isAndroid ? 4 : 3 }}>
                <Glyph name={icon} size={16} color={COLOR.iconOnWell} />
              </View>
              <Text
                className={`flex-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  letterSpacing: isAndroid ? 0.21 : 0,
                }}
              >
                <Text
                  className={`font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                >
                  {head}
                </Text>{" "}
                {rest}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

/** The connect button, the one first run draws: the same control from the
 *  first-run door and the Settings door, so the two screens are one screen
 *  with one sentence added. `min-h-composer-height` on iOS and the Material
 *  row height on Android, `text-body`, inverse text on ink. */
export function ConnectButton({ tone, onPress }: { tone: ConnectTone; onPress: () => void }) {
  const isAndroid = tone === "android";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`${
        isAndroid ? "min-h-a-row-height bg-blue-600" : "min-h-composer-height bg-ink-950"
      } w-full items-center justify-center rounded-pill active:opacity-90`}
    >
      <Text className="font-core text-body font-medium text-text-inverse">{CONNECT_STEP.connect}</Text>
    </Pressable>
  );
}
