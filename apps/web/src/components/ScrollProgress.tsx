"use client";

// The scrolling frame's one piece of JavaScript: how far the window has
// scrolled, as two numbers and one flag.
//
// `--scroll-k` is the first screen, 0 to 1; `--scroll-p` is the whole page.
// `data-scrolled` is the header's band, past 8px. Styles read them, so a
// scroll costs one write per frame here and no React render anywhere.
//
// The numbers go on the elements that read them: the bar, and anything in the
// frame marked `data-scroll-cue`. Never on the frame. A custom property is
// inherited, so one written there restyles every element of the page on every
// scroll frame, and the page repaints behind it: 500ms of style and 240ms of
// paint in a six second scroll, against 60 and 50 written here.

import { useEffect, useRef } from "react";
import styles from "./screen.module.css";

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = ref.current;
    const frame = bar?.parentElement;
    if (!bar || !frame) return;
    const cues = [...frame.querySelectorAll<HTMLElement>("[data-scroll-cue]")];

    let queued = 0;
    const write = () => {
      queued = 0;
      const y = window.scrollY;
      const height = window.innerHeight || 1;
      const room = Math.max(1, document.documentElement.scrollHeight - height);
      const k = Math.min(1, Math.max(0, y / height)).toFixed(3);
      bar.style.setProperty("--scroll-k", k);
      bar.style.setProperty("--scroll-p", Math.min(1, Math.max(0, y / room)).toFixed(4));
      for (const cue of cues) cue.style.setProperty("--scroll-k", k);
      frame.toggleAttribute("data-scrolled", y > 8);
    };
    const onScroll = () => {
      if (!queued) queued = requestAnimationFrame(write);
    };

    write();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(queued);
    };
  }, []);

  return (
    <div ref={ref} className={styles.progress} aria-hidden="true">
      <div className={styles.progressFill} />
    </div>
  );
}
