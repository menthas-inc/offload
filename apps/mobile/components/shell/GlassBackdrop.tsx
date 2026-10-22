// The plate's frosted glass (046). The page scrolls behind the plate and shows
// through it blurred and brightened, under a graded tint most opaque where the
// tab labels sit, with a 1px top edge line.
//
// iOS: a system `BlurView` samples whatever is behind the plate in the window
// (the plate is mounted above the router), so no blur target is needed. Under
// Reduce Transparency it falls back to the opaque `--surface-plate`.
//
// Android 12+ (API 31): the Dimezis RenderNode blur, sampling the screens
// through the one `BlurTargetView` the root layout wraps them in (`glassTarget`;
// a view cannot blur its own parent, and the plate is the screens' sibling).
// Below 12, opaque. **Never two live blurs on Android** (046 AC-8): the raised
// conversation stays opaque there; the page is dimmed behind it anyway.

import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useColorScheme } from "nativewind";
import { resolved } from "@offload/tokens";
import { glassTarget } from "./glass-target";
import { androidOverlay, stackedAlpha } from "../../lib/glass";

const isAndroid = Platform.OS === "android";
const androidBlur = isAndroid && Number(Platform.Version) >= 31;

function num(t: Record<string, string>, name: string, fallback: number): number {
  const v = Number.parseFloat(t[name] ?? "");
  return Number.isFinite(v) ? v : fallback;
}

function rgbCss(channels: string | undefined, fallback: string): string {
  const parts = (channels ?? "").trim().split(/\s+/);
  return parts.length === 3 ? `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})` : fallback;
}

function rgbaCss(channels: string | undefined, alpha: number, fallback: string): string {
  const parts = (channels ?? "").trim().split(/\s+/);
  return parts.length === 3 ? `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})` : fallback;
}

// `sheet` is the raised conversation: the same blur under a single flat tint at
// --glass-sheet (more opaque than the plate's graded tint), no edge line. The
// default is the plate: a graded tint and a top edge.
export function GlassBackdrop({ sheet = false }: { sheet?: boolean }) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const t = (dark ? resolved.dark : resolved.light) as Record<string, string>;

  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (isAndroid) return;
    let live = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((on) => {
      if (live) setReduceTransparency(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (on: boolean) => setReduceTransparency(on),
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // Opaque where glass is not available or not wanted.
  if ((isAndroid && (sheet || !androidBlur)) || reduceTransparency) {
    return (
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        className="bg-surface-plate"
      />
    );
  }

  const tint = rgbCss(t["glass-tint-rgb"], "rgb(255, 255, 255)");
  const edge = rgbCss(t["glass-edge-rgb"], "rgb(255, 255, 255)");
  const edgeAlpha = num(t, "glass-edge-alpha", 0.95);
  const intensity = num(t, "glass-blur-intensity", 60);
  // On Android the BlurView already paints an overlay under ours; reduce the
  // stops so the two land on the token values together (2026-10-21: stacked,
  // the Android plate read nearly opaque). iOS's material is left as it is.
  const under = isAndroid ? androidOverlay(dark, intensity) : 0;
  const top = stackedAlpha(num(t, "glass-tint-top", 0.45), under);
  const mid = stackedAlpha(num(t, "glass-tint-mid", 0.55), under);
  const base = stackedAlpha(num(t, "glass-tint-base", 0.85), under);

  if (sheet) {
    const sheetAlpha = num(t, "glass-sheet", 0.8);
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView
          intensity={intensity}
          tint={dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: rgbaCss(t["glass-tint-rgb"], sheetAlpha, "rgba(255,255,255,0.8)") },
          ]}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={intensity}
        tint={dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
        style={StyleSheet.absoluteFill}
        // Android only; iOS ignores both.
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={glassTarget}
      />
      {/* The graded tint: lightest at the top edge, most opaque from just above
          the tab labels down, so a dark button scrolling under the labels never
          drops their contrast. */}
      {/* A unit viewBox stretched with no aspect lock, so the tint covers the
          plate's full measured box, the home-indicator inset included. A bare
          `100%` rect stopped short of the inset on iOS and left the blur showing
          untinted under the tabs as a separate band. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="plateTint" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={top} />
            <Stop offset="0.5" stopColor={tint} stopOpacity={mid} />
            <Stop offset="0.72" stopColor={tint} stopOpacity={base} />
            <Stop offset="1" stopColor={tint} stopOpacity={base} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill="url(#plateTint)" />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: edge,
          opacity: edgeAlpha,
        }}
      />
    </View>
  );
}
