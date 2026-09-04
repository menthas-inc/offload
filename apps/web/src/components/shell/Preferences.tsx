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
// **Type size** uses `zoom`, and that is a blunt instrument worth naming. The
// proper mechanism is a type scale in the token set with every size derived
// from it, and the shell's sizes are literal pixels, so there is nothing to
// scale. `zoom` moves text and the space around it together, which is what
// somebody asking for bigger text actually wants, and it is one property rather
// than a rewrite of every rule. When the design system grows a scale, this
// becomes that.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

const THEME_KEY = "offload:theme";
const ZOOM_KEY = "offload:zoom";

/** Roughly two points on body text, which is what was asked for. */
const LARGE = 1.15;

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
    setLarge(window.localStorage.getItem(ZOOM_KEY) === "large");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(`.${styles.shell}`);
    if (shell) shell.style.zoom = large ? String(LARGE) : "";
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
      window.localStorage.setItem(ZOOM_KEY, current ? "normal" : "large");
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
