// 2026-10-29. A thread on My threads, as a square tile: its ground and wash,
// all text white (`APPLY-2026-10-29-threads-grid.md`, section 3). Since
// 2026-11-17 the name leads, large, with its line under it, and the people and
// a large glyph sit at the foot, so tiles tell apart at a glance; the back
// glyph went with that.
//
// It draws and nothing else: My threads owns the hold, the drag and the menu,
// and says the tile's name to a screen reader, so all of this is hidden.

import { useEffect, useState } from "react";
import { Image, PixelRatio, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";
import { DEFAULT_THREAD_ICON, isThreadIcon, threadSeed, threadWash } from "@offload/widgets";
import { Glyph } from "./Glyph";
import { useColors } from "../lib/colors";
import { renderWash, washed } from "../lib/threadWash";
import { washKey } from "../lib/threadWashMath";
import { tileFit } from "../lib/threadGrid";
import type { ThreadRow } from "../lib/threads";

/** The tile's corner: the handoff's 18 on iOS, 16 on Android. */
export const TILE_CORNER = Platform.OS === "android" ? 16 : 18;

export function ThreadTile({ thread, side }: { thread: ThreadRow; side: number }) {
  const COLOR = useColors();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? "dark" : "light";
  const n = Number.isInteger(thread.hue) && thread.hue >= 1 && thread.hue <= 10 ? thread.hue : 1;
  const ground = COLOR.threadGrounds[n]!;
  const seed = threadSeed(thread.id);
  const glyph = isThreadIcon(thread.icon) ? thread.icon : DEFAULT_THREAD_ICON;
  const spec = { seed, hue: n, size: side, theme, round: false, scale: PixelRatio.get(), corner: TILE_CORNER } as const;
  const key = washKey(spec);
  const [wash, setWash] = useState<{ key: string; uri: string } | null>(null);
  const uri = washed(spec) ?? (wash?.key === key ? wash.uri : undefined);
  const faces = thread.faces ?? [];
  const { fontScale } = useWindowDimensions();
  const fit = tileFit(side, fontScale);

  useEffect(() => {
    if (washed(spec)) return;
    let live = true;
    void renderWash({ ...spec, wash: threadWash(seed), ground }).then((made) => {
      if (live && made) setWash({ key, uri: made });
    });
    return () => {
      live = false;
    };
    // `key` is everything `spec` and the ground are made from.
  }, [key]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: side, height: side, borderRadius: TILE_CORNER, backgroundColor: ground, overflow: "hidden", padding: 14 }}
    >
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} fadeDuration={0} /> : null}
      {/* The text gives way before the foot: `tileFit` drops the line whole. */}
      <View style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Text
          className="font-core text-title-1 font-semibold"
          style={{ lineHeight: 28, color: COLOR.onBrand }}
          numberOfLines={2}
          android_hyphenationFrequency="normal"
          maxFontSizeMultiplier={1.3}
        >
          {thread.name}
        </Text>
        {fit.meta && thread.meta ? (
          // 92%: white at 86% fell under 4.5:1 on three of the light grounds.
          <Text className="mt-space-1 font-core text-caption" style={{ lineHeight: 16, color: COLOR.onBrand, opacity: 0.92 }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {thread.meta}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-end">
        {faces.length > 0 ? (
          <View className="flex-row items-center">
            {faces.slice(0, 2).map((face, i) => (
              <View
                key={face.accountId}
                className="items-center justify-center rounded-pill bg-surface-raised"
                style={{ width: 24, height: 24, marginLeft: i > 0 ? -6 : 0, borderWidth: 2, borderColor: ground }}
              >
                <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 9.5 }} numberOfLines={1} maxFontSizeMultiplier={1}>
                  {face.initials}
                </Text>
              </View>
            ))}
            {faces.length > 2 ? (
              <Text className="ml-space-2 font-core text-caption" style={{ color: COLOR.onBrand }} maxFontSizeMultiplier={1.3}>
                +{faces.length - 2}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View className="ml-auto">
          <Glyph name={glyph} size={fit.glyph} color={COLOR.onBrand} />
        </View>
      </View>
    </View>
  );
}
