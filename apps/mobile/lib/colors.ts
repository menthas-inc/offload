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
  onBrand: string;
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
  /** The mark's one colour. Ink on a light ground and near-white on a dark one:
   *  `ink-950` resolved from the light scope is invisible on a dark surface,
   *  which is what the wordmark did the first time anybody looked at dark. */
  ink: string;
  /** 015's rail, where a dot's colour is what the thing is. Blue already means
   *  waiting on you, amber is what the kits use for something offload has
   *  noticed, and the day somebody is standing on is outlined rather than
   *  filled, which is what `borderFocus` is for. */
  attention: string;
  noticed: string;
  raised: string;
  lift: string;
  textAttention: string;
  textNoticed: string;
  shadow: string;
  /** The quietest ink there is. Not `iconOnWell`, which is `text-secondary`
   *  and a visibly different grey: the fourth dot kind was that on a phone and
   *  `text-tertiary` on web, which is one legend drawn two ways. */
  quiet: string;
  borderFocus: string;
  /** The inward glow on a day that has something on it, as an inset
   *  `boxShadow` colour: a soft blue that fades toward the middle of the
   *  cell rather than filling it. Grey said it so quietly that it read as
   *  nothing, and a flat fill said it so evenly that it read as one block. */
  borderAttention: string;
  hairline: string;
  sunken: string;
  /** White, in both themes, because the fill it sits on is blue in both and
   *  does not flip. `onSolid` does flip, which is how a near-black number ends
   *  up on blue. */
  onAttention: string;
  /** 020. The plane a photo is viewed on: dark in both themes, as the web
   *  draws it. `surface-inverse` at 90% in light and `surface-page` at 92% in
   *  dark, mixed here since a phone takes one colour. `ink` was tried and is
   *  `text-primary`, which is near white in dark, so the plane went light. */
  viewerPlane: string;
  /** `surface-inverse`: the bar over the viewer on iOS, translucent. */
  inverse: string;
}

function paletteFor(dark: boolean): Colors {
  const base = dark ? resolved.dark : resolved.light;
  const m3 = dark ? android.dark : android.light;
  // The base scope resolves every key in both themes, but `resolved.dark` is
  // built by overlaying dark on light, so a lookup that misses is a real gap
  // rather than a shrug. Fall back to light for the one platform-scoped case.
  const light = resolved.light;

  return {
    // **Two tokens, and they are not interchangeable.**
    //
    // `onSolid` is `text-inverse`, which flips with the theme, and it is right
    // on a fill that flips with it: `surface-inverse`, or `text-accent`, which
    // lightens in dark.
    //
    // `onBrand` is `text-on-solid`, which is #FFFFFF in both themes because the
    // fills it sits on are moss, blue and clay and none of them flip. Using
    // `onSolid` there put a near-black glyph on moss green in dark, next to a
    // label already using the right token and drawn white, so one control
    // disagreed with itself. The web stylesheet had `--text-on-solid` correct
    // all along; this is the parity fix.
    onSolid: base["text-inverse"] ?? light["paper"]!,
    onBrand: base["text-on-solid"] ?? light["text-on-solid"]!,
    accent: base["text-accent"] ?? light["text-accent"]!,
    iconOnWell: isAndroid ? m3["a-on-var"]! : base["text-secondary"] ?? light["text-secondary"]!,
    tabOn: isAndroid ? m3["a-on"]! : base["text-primary"] ?? light["text-primary"]!,
    tabOff: isAndroid ? m3["a-on-quiet"]! : base["text-tertiary"] ?? light["text-tertiary"]!,
    accentSoft: base["surface-accent-soft"] ?? light["surface-accent-soft"]!,
    scrim: base["ink-950"] ?? light["ink-950"]!,
    page: isAndroid ? m3["a-surface"]! : base["surface-page"] ?? light["surface-page"]!,
    danger: base["text-danger"] ?? light["text-danger"]!,
    ink: base["text-primary"] ?? light["text-primary"]!,
    attention: base["surface-attention"] ?? light["surface-attention"]!,
    noticed: base["surface-noticed"] ?? light["surface-noticed"]!,
    quiet: base["text-tertiary"] ?? light["text-tertiary"]!,
    borderFocus: base["border-focus"] ?? light["border-focus"]!,
    borderAttention: base["border-attention"] ?? light["border-attention"]!,
    hairline: base["border-hairline"] ?? light["border-hairline"]!,
    sunken: base["surface-sunken"] ?? light["surface-sunken"]!,
    onAttention: base["text-on-solid"] ?? light["text-on-solid"]!,
    // The rail's two tiers, 14 September. `raised` and `lift` are the lift; the
    // two dot colours are text aliases rather than the fill aliases they were,
    // because a fill alias is fixed across themes and a 5px mark on a ground
    // that now moves with the theme measured 2.62:1 and 2.03:1.
    raised: base["surface-raised"] ?? light["surface-raised"]!,
    lift: base["border-lift"] ?? light["border-lift"]!,
    textAttention: base["text-attention"] ?? light["text-attention"]!,
    textNoticed: base["text-noticed"] ?? light["text-noticed"]!,
    /** The lift's own shadow, as a colour rather than a CSS string.
     *
     *  `--shadow-1` and `--shadow-2` are whole `box-shadow` declarations, which
     *  React Native cannot take, and in the dark scope `--shadow-1` is the
     *  keyword `none`. So the two scopes are expressed here as the one thing RN
     *  needs: light gets the blurred drop's colour, dark gets the hard 1px
     *  line's, and the caller picks its geometry. Same values, same two rules,
     *  spelled the way this platform can draw them. */
    shadow: dark ? "rgba(255,255,255,0.04)" : "rgba(11,11,11,0.04)",
    inverse: base["surface-inverse"] ?? light["surface-inverse"]!,
    viewerPlane: dark
      ? atOpacity(base["surface-page"] ?? light["surface-page"]!, 0.92)
      : atOpacity(base["surface-inverse"] ?? light["surface-inverse"]!, 0.9),
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

/** A colour at an opacity, as one colour rather than a colour and an opacity.
 *
 *  **Because `entering={FadeIn}` overwrites `opacity` and nothing warns you.**
 *  A scrim drawn as `backgroundColor: scrim, opacity: 0.35` with a Reanimated
 *  entering animation on it does not fade to 0.35: the animation owns the
 *  property and runs 0 to 1, so the screen fades to solid `ink-950` and only
 *  snaps back to 0.35 when the animation ends. Recorded off a device on
 *  2026-09-14 at 30fps: mean frame brightness fell to 24/255 and then jumped
 *  back to 178, which is the "fades black real quick" that was reported.
 *
 *  Lengthening the fade, which is what the first attempt at this did, makes it
 *  worse rather than better. The fix is for the layer to be translucent in
 *  itself, so 100% of it is the dim that was wanted.
 *
 *  Hex in, `rgba()` out. The tokens are all `#rrggbb`; anything else comes back
 *  unchanged rather than half parsed. */
export function atOpacity(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return color;
  const n = parseInt(hex[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
