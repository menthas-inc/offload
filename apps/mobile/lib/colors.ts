// Token values as plain strings, for the props that cannot take a class.
//
// Some React Native props take a colour, not a class: an SVG stroke, a
// navigator tint, an ActivityIndicator. NativeWind cannot reach those, and a
// literal there is the thing OFF-7 forbids, so they are read from the generated
// tokens instead.
//
// **These are the half of the theme that classes do not move.** Every `bg-*`
// and `text-*` in the app resolves through the generated `.dark:root` scope and
// swaps by itself; these do not, because they were resolved once at module
// load. A theme that moved the classes and not these is a screen with dark
// surfaces and ink type on it, which is exactly what the old hardcoded
// `colorScheme.set("light")` was put there to prevent.
//
// **A hook, not a proxy.** A `Proxy` over a live scheme would need no call site
// touched and is the wrong answer: several of these are read inside Reanimated
// worklets, where a JS getter cannot run at all. `useColors()` resolves on the
// JS thread, at render, and hands a plain object to whatever needs it.

import { useColorScheme } from "nativewind";
import { Platform } from "react-native";
import { resolved, android } from "@offload/tokens";

const isAndroid = Platform.OS === "android";

/** Named for what it is for, not for the token, so a call site says why it
 *  wants a colour. */
export interface Colors {
  onSolid: string;
  accent: string;
  /** The icon well's content, which sits on a different surface per platform. */
  iconOnWell: string;
  /** A tab that is on, and one that is not. Material and iOS disagree about
   *  how quiet the off state should be, and both come from their own scope. */
  tabOn: string;
  tabOff: string;
  /** Moss. "offload did this, you didn't", which is also the change mark. */
  accentSoft: string;
  /** What a sheet dims the screen behind it with, and what an elevated surface
   *  casts. Both are ink at a low opacity rather than black: the palette is
   *  warm and a true black scrim reads cold against it. Opacity is applied at
   *  the call site so this stays a token rather than a computed literal. */
  scrim: string;
  /** The ground a row sits on, which the change mark fades back to. */
  page: string;
  /** Clay. The one destructive action in a sheet, at most. */
  danger: string;
}

function paletteFor(dark: boolean): Colors {
  const base = dark ? resolved.dark : resolved.light;
  const m3 = dark ? android.dark : android.light;
  // The base scope resolves every key in both themes, but `resolved.dark` is
  // built by overlaying dark on light, so a lookup that misses is a real gap
  // rather than a shrug. Fall back to light for the one platform-scoped case.
  const light = resolved.light;

  return {
    onSolid: base["text-inverse"] ?? light["paper"]!,
    accent: base["text-accent"] ?? light["text-accent"]!,
    iconOnWell: isAndroid ? m3["a-on-var"]! : base["text-secondary"] ?? light["text-secondary"]!,
    tabOn: isAndroid ? m3["a-on"]! : base["text-primary"] ?? light["text-primary"]!,
    tabOff: isAndroid ? m3["a-on-quiet"]! : base["text-tertiary"] ?? light["text-tertiary"]!,
    accentSoft: base["surface-accent-soft"] ?? light["surface-accent-soft"]!,
    scrim: base["ink-950"] ?? light["ink-950"]!,
    page: isAndroid ? m3["a-surface"]! : base["surface-page"] ?? light["surface-page"]!,
    danger: base["text-danger"] ?? light["text-danger"]!,
  };
}

const LIGHT = paletteFor(false);
const DARK = paletteFor(true);

/** The palette for whatever theme is showing now.
 *
 *  Two frozen objects rather than one built per render: the identity is stable,
 *  so a style depending on it does not churn, and a worklet closing over one
 *  closes over a plain object rather than a getter. */
export function useColors(): Colors {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? DARK : LIGHT;
}

/** The light palette, for the two places with no component to hook from.
 *
 *  **Not the general answer.** Anything inside a component uses `useColors`; a
 *  module-level constant cannot follow a theme, and this exists only for code
 *  that runs before or outside React. */
export const COLOR = LIGHT;
