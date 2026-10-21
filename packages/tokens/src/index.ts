// The typed surface over the generated tokens.
//
// Application code imports from here. It never reads the design system's CSS
// directly and never restates a value (OFF-7).

import tokens from "../dist/tokens.json" with { type: "json" };

export type TokenName = keyof (typeof tokens)["light"];
export type Theme = "light" | "dark";

/** A token's value for a theme, fully resolved.
 *
 *  Resolved, not raw: the design uses semantic aliases that point at ramps, so
 *  the raw value of `text-accent` is `var(--moss-600)`. That is right for CSS
 *  and meaningless to React Native. Anything that is not a stylesheet wants
 *  this. */
export function token(name: TokenName, theme: Theme = "light"): string {
  const scope = tokens.resolved[theme] as Record<string, string>;
  const fallback = tokens.resolved.light as Record<string, string>;
  return scope[name as string] ?? fallback[name as string]!;
}

/** Raw values, references intact. For CSS, where var() is the point. */
export const light = tokens.light;
export const dark = tokens.dark;

/** Resolved values, no references. For React Native and anything native. */
export const resolved = tokens.resolved;

/** The Android platform scope: Material's surface roles, shape scale and bar
 *  heights, generated from the Android kit rather than retyped. Only the
 *  Android half of the fork reads these. */
export const android = tokens.android;

/** The Today prism field's bloom placements (046). One source so the phones'
 *  absolute Images and the web's background-image layers cannot drift apart
 *  (the native escape-hatch failure mode). Numbers are from the handoff: `top`
 *  is px down the scroll content, `offset` a percentage from the named edge,
 *  `width` a percentage of the screen. The content container is 140% wide and
 *  centred with overflow hidden, so a bloom can overhang either edge. */
export interface Bloom {
  src: 1 | 2 | 3;
  from: "left" | "right";
  offset: string;
  top: number;
  width: string;
}
export const TODAY_FIELD: { containerWidth: string; blooms: readonly Bloom[] } = {
  containerWidth: "140%",
  blooms: [
    { src: 1, from: "left", offset: "-20%", top: -40, width: "85%" },
    { src: 2, from: "right", offset: "0%", top: 620, width: "80%" },
    { src: 3, from: "left", offset: "10%", top: 1250, width: "85%" },
    { src: 1, from: "right", offset: "5%", top: 1850, width: "80%" },
  ],
};

export default tokens;
