// 037. A thread's icon: its glyph on a wash of its hue.
//
// The design calls this the thread's mark; here a mark is already a person's
// picture (`lib/marks.ts`), so the component is `ThreadIcon`. From the
// handoff's item 3: a rounded square at 30% on iOS, a circle on Android and
// inside a pill; the hue mixed into the page as the ground; the prism texture
// over it in luminosity; a 1px ring; the glyph at half the size in the hue
// taken darker.
//
// The ground and the glyph are plain views in colours mixed by the shared
// module. The wash is a picture Skia rendered once (`lib/threadWash.ts`), so
// a list draws no canvas per row, and until it lands the ground alone shows.

import { useEffect, useState } from "react";
import { Image, PixelRatio, Platform, StyleSheet, View } from "react-native";
import { useColorScheme } from "nativewind";
import { DEFAULT_THREAD_ICON, isThreadIcon, threadIconColors, threadSeed, threadWash } from "@offload/widgets";
import { Glyph } from "./Glyph";
import { useColors } from "../lib/colors";
import { renderWash, washed } from "../lib/threadWash";
import { washKey } from "../lib/threadWashMath";

interface Props {
  /** One of the seventy, or lasso. A name this build does not know draws lasso. */
  icon: string;
  /** One of the ten label hues. */
  hue: number;
  /** The thread's id: where the wash sits, the same on every visit. */
  seed: string;
  size: number;
  /** A circle whatever the platform, for inside a pill. */
  round?: boolean;
  /** The wash alone, with no glyph: a hue in Edit thread. */
  bare?: boolean;
}

export function ThreadIcon({ icon, hue, seed, size, round = false, bare = false }: Props) {
  const COLOR = useColors();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? "dark" : "light";
  const circle = round || Platform.OS === "android";
  const n = Number.isInteger(hue) && hue >= 1 && hue <= 10 ? hue : 1;
  const colors = threadIconColors(COLOR.labels[n]!, theme, theme === "dark" ? COLOR.page : COLOR.raised);
  const spec = { seed: threadSeed(seed), hue: n, size, theme, round: circle, scale: PixelRatio.get() } as const;
  const key = washKey(spec);
  const [wash, setWash] = useState<{ key: string; uri: string } | null>(null);
  const uri = washed(spec) ?? (wash?.key === key ? wash.uri : undefined);

  useEffect(() => {
    if (washed(spec)) return;
    let live = true;
    void renderWash({ ...spec, wash: threadWash(spec.seed), ground: colors.ground, ring: colors.ring }).then((made) => {
      if (live && made) setWash({ key, uri: made });
    });
    return () => {
      live = false;
    };
    // `key` is everything `spec` and the colours are made from.
  }, [key]);

  return (
    <View
      // Hidden from a screen reader: the thread's name is always beside it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: circle ? size / 2 : size * 0.3,
        backgroundColor: colors.ground,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} fadeDuration={0} /> : null}
      {bare ? null : <Glyph name={isThreadIcon(icon) ? icon : DEFAULT_THREAD_ICON} size={size / 2} color={colors.glyph} />}
    </View>
  );
}
