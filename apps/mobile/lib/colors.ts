// Token values as plain strings.
//
// Some React Native props take a colour, not a class: an SVG stroke, a
// navigator tint. NativeWind cannot reach those, and a literal there is the
// thing OFF-7 forbids, so they are read from the generated tokens instead.

import { Platform } from "react-native";
import { resolved, android } from "@offload/tokens";

const base = resolved.light;
const m3 = android.light;

/** Named for what it is for, not for the token, so a call site says why it
 *  wants a colour. */
export const COLOR = {
  onSolid: base["text-inverse"] ?? base["paper"]!,
  accent: base["text-accent"]!,
  // The icon well's content, which sits on a different surface per platform.
  iconOnWell: Platform.OS === "android" ? m3["a-on-var"]! : base["text-secondary"]!,
  /** A tab that is on, and one that is not. Material and iOS disagree about
   *  how quiet the off state should be, and both come from their own scope. */
  tabOn: Platform.OS === "android" ? m3["a-on"]! : base["text-primary"]!,
  tabOff: Platform.OS === "android" ? m3["a-on-quiet"]! : base["text-tertiary"]!,
  /** Moss. "offload did this, you didn't", which is also the change mark. */
  accentSoft: base["surface-accent-soft"]!,
  /** What a sheet dims the screen behind it with, and what an elevated surface
   *  casts. Both are ink at a low opacity rather than black: the palette is
   *  warm and a true black scrim reads cold against it. Opacity is applied at
   *  the call site so this stays a token rather than a computed literal. */
  scrim: base["ink-950"]!,
  /** The ground a row sits on, which the change mark fades back to. */
  page: Platform.OS === "android" ? m3["a-surface"]! : base["surface-page"]!,
  /** Clay. The one destructive action in a sheet, at most. */
  danger: base["text-danger"]!,
} as const;
