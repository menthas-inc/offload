// How the app looks, kept on the device.
//
// Three theme values, and **the default is light, not the device**. That is a
// design decision with its own entry, 25 August, surface all: "a new account
// opens in light regardless of the device setting. Dark is a choice in
// Settings." `system` is offered as a choice somebody can make, which is a
// different thing from it being what they get before they have made one.
//
// **Text size is not here, and that is structural rather than an omission.**
// Web scales because every size is a token and `[data-type="large"]` overrides
// them. This app writes 73 numeric `fontSize:` literals across 20 files in
// inline styles, with no size variables in the generated stylesheet to swap, so
// a size choice would mean either a generator that emits a large scale to
// NativeWind and a rewrite of all 73, or a multiplier threaded through every
// call site, which is a hand-rolled scale off-token. Its own piece of work.
//
// **Stored in SecureStore, which is the wrong store and the right one
// available.** It is the only key-value store this app has, and adding
// AsyncStorage for one string would mean a native rebuild of the dev client and
// every EAS build. What decides it is that `getItem` is *synchronous*: the
// theme is read before first paint, so a dark device never shows a frame of
// light. If a second device preference ever needs storing, that is the moment
// to add a real one.

import { colorScheme } from "nativewind";
import * as SecureStore from "expo-secure-store";

const KEY = "offload_theme";

export type Theme = "light" | "dark" | "system";

export const THEMES: Theme[] = ["light", "dark", "system"];

/** Sentence case, like everything. */
export const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/** What is stored, read synchronously.
 *
 *  Synchronous on purpose: this is called before the first render, and an async
 *  read here is a frame of the wrong theme on every launch. */
export function storedTheme(): Theme {
  try {
    const raw = SecureStore.getItem(KEY);
    return isTheme(raw) ? raw : "light";
  } catch {
    // A store that will not open is not a reason to fail to launch, and the
    // answer is the same as no preference: light.
    return "light";
  }
}

/** Tell NativeWind, which is what actually paints.
 *
 *  Every `bg-*` and `text-*` class resolves through the generated `.dark:root`
 *  scope, so this one call moves every class in the app. It does not move
 *  colours that reach React Native props rather than classes: `useColors` is
 *  the other half, and a theme that moved one and not the other is the
 *  half-dark screen the old hardcoded `colorScheme.set("light")` was there to
 *  avoid. */
export function applyTheme(theme: Theme): void {
  colorScheme.set(theme);
}

/** Store it and apply it. */
export function setTheme(theme: Theme): void {
  try {
    SecureStore.setItem(KEY, theme);
  } catch {
    // Applied anyway. A preference that does not survive a restart is worse
    // than one that does and better than one that does not take effect.
  }
  applyTheme(theme);
}
