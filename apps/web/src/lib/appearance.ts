"use client";

// Theme and text size, kept on the device and read from two places.
//
// It was one component holding its own state, which was fine while the nav foot
// was the only thing that could change it. From 5 September there is a Settings
// Appearance page as well, and two components each holding a copy of the same
// localStorage key is how a screen ends up disagreeing with itself: change the
// theme in Settings and the nav foot still says Light until a reload.
//
// So the value lives in localStorage and every subscriber is told when it moves.
// `storage` events only fire in *other* tabs, so this dispatches its own event
// too and listens for both: other tabs through `storage`, this one through
// `offload:appearance`.
//
// **Theme has three values and one of them is not a colour.** `system` means
// follow the device, which is what an unset preference already did; making it a
// choice you can return to is the whole reason it is named. Text size has two.

import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "offload:theme";
const SIZE_KEY = "offload:type-size";
const CHANGED = "offload:appearance";

export type Theme = "light" | "dark" | "system";
export type TypeSize = "normal" | "large";

export const THEMES: Theme[] = ["light", "dark", "system"];
export const TYPE_SIZES: TypeSize[] = ["normal", "large"];

/** What the row and the segmented control both print. Sentence case, because
 *  everything is. */
export const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export const TYPE_SIZE_LABEL: Record<TypeSize, string> = {
  normal: "Normal",
  large: "Larger",
};

function storedTheme(): Theme {
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "light" || raw === "system" ? raw : "system";
}

function storedSize(): TypeSize {
  return window.localStorage.getItem(SIZE_KEY) === "large" ? "large" : "normal";
}

/** What `system` resolves to right now. */
function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function paint(theme: Theme, size: TypeSize): void {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  root.setAttribute("data-theme", dark ? "dark" : "light");
  if (size === "large") root.setAttribute("data-type", "large");
  else root.removeAttribute("data-type");
}

export interface Appearance {
  theme: Theme;
  size: TypeSize;
  setTheme: (theme: Theme) => void;
  setSize: (size: TypeSize) => void;
}

export function useAppearance(): Appearance {
  // `system` before the first read, which is what the document already shows,
  // so nothing flips on the way in.
  const [theme, setThemeState] = useState<Theme>("system");
  const [size, setSizeState] = useState<TypeSize>("normal");

  useEffect(() => {
    const read = (): void => {
      setThemeState(storedTheme());
      setSizeState(storedSize());
    };
    read();

    window.addEventListener(CHANGED, read);
    window.addEventListener("storage", read);

    // Following the device means following it while the app is open, not only
    // at load: somebody whose phone turns dark at sunset should see this do it.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const repaint = (): void => {
      if (storedTheme() === "system") paint("system", storedSize());
    };
    media.addEventListener("change", repaint);

    return () => {
      window.removeEventListener(CHANGED, read);
      window.removeEventListener("storage", read);
      media.removeEventListener("change", repaint);
    };
  }, []);

  useEffect(() => {
    paint(theme, size);
  }, [theme, size]);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  const setSize = useCallback((next: TypeSize) => {
    window.localStorage.setItem(SIZE_KEY, next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { theme, size, setTheme, setSize };
}
