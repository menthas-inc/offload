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
// follow the device, and it is offered as a choice somebody can make.
//
// **It is not the default, and this got that wrong until 7 September.** "A new
// account opens in light regardless of the device setting. Dark is a choice in
// Settings" is a design decision from 25 August with surface *all*, and an
// unset preference resolving to `system` meant a new account on a dark laptop
// opened dark. Offering `system` and defaulting to it are different things.
// Text size has two.

import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "offload:theme";
const SIZE_KEY = "offload:type-size";
const WEEK_KEY = "offload:week-start";
const CHANGED = "offload:appearance";

export type Theme = "light" | "dark" | "system";
export type TypeSize = "normal" | "large";
export type { WeekStart } from "./widgets";

export const THEMES: Theme[] = ["light", "dark", "system"];
export const TYPE_SIZES: TypeSize[] = ["normal", "large"];
export const WEEK_STARTS = ["monday", "sunday"] as const;

/** What the row and the segmented control both print. Sentence case, because
 *  everything is. */
export const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** Default, as 031's Text size tile names it, so the nav foot and the page
 *  say one word for one state. */
export const TYPE_SIZE_LABEL: Record<TypeSize, string> = {
  normal: "Default",
  large: "Larger",
};

/** Which day a week starts on, for 015's rail.
 *
 *  Device-local, like the two above it. It is arguably an account preference
 *  and would then need a column, an endpoint and a sync, which is a lot for a
 *  value somebody sets once and never thinks about again. */
export const WEEK_START_LABEL: Record<string, string> = {
  monday: "Monday",
  sunday: "Sunday",
};

function storedTheme(): Theme {
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "light" || raw === "system" ? raw : "light";
}

function storedSize(): TypeSize {
  return window.localStorage.getItem(SIZE_KEY) === "large" ? "large" : "normal";
}

function storedWeekStart(): "monday" | "sunday" {
  return window.localStorage.getItem(WEEK_KEY) === "sunday" ? "sunday" : "monday";
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
  weekStart: "monday" | "sunday";
  setTheme: (theme: Theme) => void;
  setSize: (size: TypeSize) => void;
  setWeekStart: (start: "monday" | "sunday") => void;
  /** 030. The stored choice has been read. Before it, `theme` is the light
   *  default, and a map made from that would be made again a moment later. */
  read: boolean;
}

export function useAppearance(): Appearance {
  // Light before the first read, which is both the default and what the
  // document is already showing, so nothing flips on the way in.
  const [theme, setThemeState] = useState<Theme>("light");
  const [size, setSizeState] = useState<TypeSize>("normal");
  const [weekStart, setWeekStartState] = useState<"monday" | "sunday">("monday");
  // Nothing is painted until the stored choice has been read. Every screen
  // that asks for the week start mounts this hook, and painting its light
  // default on mount turned a dark page white for a frame whenever one opened.
  const [read, setRead] = useState(false);

  useEffect(() => {
    const sync = (): void => {
      setThemeState(storedTheme());
      setSizeState(storedSize());
      setWeekStartState(storedWeekStart());
      setRead(true);
    };
    sync();

    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);

    // Following the device means following it while the app is open, not only
    // at load: somebody whose phone turns dark at sunset should see this do it.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const repaint = (): void => {
      if (storedTheme() === "system") paint("system", storedSize());
    };
    media.addEventListener("change", repaint);

    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", repaint);
    };
  }, []);

  useEffect(() => {
    if (read) paint(theme, size);
  }, [read, theme, size]);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  const setSize = useCallback((next: TypeSize) => {
    window.localStorage.setItem(SIZE_KEY, next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  // Nothing to paint: the rail reads this and redraws from the array it already
  // holds, which is why changing it costs no fetch.
  const setWeekStart = useCallback((next: "monday" | "sunday") => {
    window.localStorage.setItem(WEEK_KEY, next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { theme, size, weekStart, setTheme, setSize, setWeekStart, read };
}
