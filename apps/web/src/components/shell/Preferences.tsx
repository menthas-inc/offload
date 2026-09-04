"use client";

// Two things about how the app looks, kept on the device.
//
// Neither is in the kit, and both are here because the product owner asked for
// them after checking the type scale: the app and the kit use the same sizes
// (13, 13.5, 14, 14.5, 15.5, 18, 20, 25), and the kit only looks larger because
// it renders inside a fixed 1440px canvas.
//
// **Theme** flips `data-theme` on the document, which is the switch the token
// set already reads. Nothing else changes: every colour in the app is a token,
// so the whole thing turns over at once.
//
// **Type size** sets `data-type` on the document, and the shell's stylesheet
// derives every text size from one variable while leaving every width, gutter
// and icon a literal pixel.
//
// It used `zoom` first, which was wrong in a way worth remembering: `zoom`
// scales the layout too, so the 248px sidebar became 285px and the 520px pane
// became 598px, and on a laptop the right-hand pane went off the edge. Bigger
// text means text taking more of the space it already has, not the same layout
// on a smaller screen.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

const THEME_KEY = "offload:theme";
const SIZE_KEY = "offload:type-size";

type Theme = "light" | "dark";

export function Preferences() {
  const [theme, setTheme] = useState<Theme>("light");
  const [large, setLarge] = useState(false);

  // Read once. The values are applied to the document rather than held in a
  // provider, because everything that reads them is CSS.
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const initial: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    setLarge(window.localStorage.getItem(SIZE_KEY) === "large");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (large) root.setAttribute("data-type", "large");
    else root.removeAttribute("data-type");
  }, [large]);

  const flipTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const flipSize = useCallback(() => {
    setLarge((current) => {
      window.localStorage.setItem(SIZE_KEY, current ? "normal" : "large");
      return !current;
    });
  }, []);

  return (
    <span className={styles.prefs}>
      <button
        type="button"
        className={styles.prefButton}
        onClick={flipTheme}
        aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
        title={theme === "dark" ? "Light" : "Dark"}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
      </button>

      <button
        type="button"
        className={styles.prefButton}
        onClick={flipSize}
        aria-label={large ? "Smaller text" : "Larger text"}
        aria-pressed={large}
        title={large ? "Smaller text" : "Larger text"}
      >
        <Icon name="scan-text" size={16} />
      </button>
    </span>
  );
}
