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
export default tokens;
