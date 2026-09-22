// The one place this phone's own zone appears. 023.
//
// On Today, when the device's zone differs from the account's clock, follow
// is on and this zone is not the one they answered Keep to. `InvitationStrip`'s
// shape: the soft accent ground, a compass in a 28px disc, one sentence, and
// both answers inside the card as text buttons, each its own 44px target.
//
// It states the fact before it offers the change, so ignoring it is a
// complete answer. Use writes the clock, and the server clears what was kept
// with it; Keep writes this zone as kept, so a two-week trip asks on arrival
// and stays quiet, and a third zone asks again. Both draw first and write
// second: a failed write puts the strip back with one clause, and the same
// two answers are the way to try again. Cities, never offsets.
//
// The disc is the accent colour, which the tokens name only as text: there is
// no solid accent surface alias to consume, and the handoff names the same
// ramp step for both.

import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { zoneCity, zoneStrip } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { deviceZone } from "../../lib/clock";
import { setClock, useMe } from "../../lib/me";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

export function ZoneStrip() {
  const me = useMe();
  const COLOR = useColors();
  // The zone answered for, drawn as gone before the write lands, and back to
  // null when the write fails, which puts the strip back.
  const [answered, setAnswered] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const strip = me ? zoneStrip(me, deviceZone()) : null;
  if (!strip || answered === strip.device) return null;

  const here = zoneCity(strip.device);
  const clock = zoneCity(strip.account);
  const device = strip.device;

  async function answer(patch: { timeZone: string } | { keptTimeZone: string }) {
    setAnswered(device);
    setFailed(false);
    if (!(await setClock(patch))) {
      setAnswered(null);
      setFailed(true);
    }
  }

  return (
    <View
      className={`mb-space-6 gap-space-3 rounded-lg px-space-5 py-space-5 ${
        isAndroid ? "bg-a-c-low" : "bg-surface-accent-soft"
      }`}
    >
      <View className="flex-row items-center gap-space-4">
        <View
          className="items-center justify-center rounded-pill"
          style={{ width: 28, height: 28, backgroundColor: COLOR.accent }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Glyph name="compass" size={15} color={COLOR.onBrand} />
        </View>
        <Text
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 14, lineHeight: 19.5 }}
        >
          Showing times in <Text className="font-medium">{clock}</Text>. This phone says{" "}
          <Text className="font-medium">{here}</Text>.
        </Text>
      </View>

      {failed ? (
        <View className="flex-row gap-space-4">
          <View style={{ width: 28 }} />
          <Text
            className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-danger"}`}
            style={{ fontSize: 13, lineHeight: 18 }}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            Couldn&apos;t save that.
          </Text>
        </View>
      ) : null}

      {/* Under the sentence, not under the disc: the spacer is the disc's
          width and the row shares its gap. */}
      <View className="flex-row items-center gap-space-4">
        <View style={{ width: 28 }} />
        <View className="flex-row gap-space-2" style={{ marginLeft: -8 }}>
          <Pressable
            onPress={() => void answer({ timeZone: device })}
            accessibilityRole="button"
            className="min-h-tap-min justify-center rounded-sm px-space-3"
          >
            <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13.5 }}>
              Use {here}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void answer({ keptTimeZone: device })}
            accessibilityRole="button"
            className="min-h-tap-min justify-center rounded-sm px-space-3"
          >
            <Text
              className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 13.5 }}
            >
              Keep {clock}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
