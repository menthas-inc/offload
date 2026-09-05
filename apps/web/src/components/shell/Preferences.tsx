"use client";

// Theme and text size, as two named rows in the nav foot.
//
// They were two unlabelled glyphs, a sun and a `scan-text`, and the 5 September
// design pass took them out: **an accessibility control nobody can name is not
// one.** A `scan-text` icon does not say "text size" to anybody who has not
// been told, and the person most likely to want that control is the least
// likely to be able to find it by guessing at a picture.
//
// So each is a row that says what it is and what it is currently set to, in the
// nav's own row shape. Clicking cycles: it is the shortcut, and the Settings
// Appearance page is where you go to see the choices laid out. Both read the
// same stored value through `useAppearance`.
//
// The type size once used `zoom`, which was wrong in a way worth remembering:
// `zoom` scales the layout too, so the 248px sidebar became 285px and the 520px
// pane became 598px, and on a laptop the right-hand pane went off the edge.
// Bigger text means text taking more of the space it already has.

import {
  THEMES,
  THEME_LABEL,
  TYPE_SIZES,
  TYPE_SIZE_LABEL,
  useAppearance,
} from "../../lib/appearance";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export function Preferences() {
  const { theme, size, setTheme, setSize } = useAppearance();

  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
  const nextSize = TYPE_SIZES[(TYPE_SIZES.indexOf(size) + 1) % TYPE_SIZES.length]!;

  return (
    <>
      <button
        type="button"
        className={styles.navItem}
        onClick={() => setTheme(nextTheme)}
        title={`Switch to ${THEME_LABEL[nextTheme].toLowerCase()}`}
      >
        <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "blend"} size={17} />
        <span className={styles.navLabel}>Theme</span>
        <span className={styles.navValue}>{THEME_LABEL[theme]}</span>
      </button>

      <button
        type="button"
        className={styles.navItem}
        onClick={() => setSize(nextSize)}
        title={`Switch to ${TYPE_SIZE_LABEL[nextSize].toLowerCase()} text`}
      >
        <Icon name="scan-text" size={17} />
        <span className={styles.navLabel}>Text size</span>
        <span className={styles.navValue}>{TYPE_SIZE_LABEL[size]}</span>
      </button>
    </>
  );
}
