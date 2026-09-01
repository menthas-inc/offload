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
} as const;
