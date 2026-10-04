"use client";

// The scrolling frame's one piece of JavaScript: how far the window has
// scrolled, written onto the frame as two numbers and one flag.
//
// `--scroll-k` is the first screen, 0 to 1; `--scroll-p` is the whole page.
// `data-scrolled` is the header's band, past 8px. Styles read them, so a
// scroll costs one write per frame here and no React render anywhere.

import { useEffect, useRef } from "react";
import styles from "./screen.module.css";

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = ref.current?.parentElement;
    if (!frame) return;

    let queued = 0;
    const write = () => {
      queued = 0;
      const y = window.scrollY;
      const height = window.innerHeight || 1;
      const room = Math.max(1, document.documentElement.scrollHeight - height);
      frame.style.setProperty("--scroll-k", Math.min(1, Math.max(0, y / height)).toFixed(3));
      frame.style.setProperty("--scroll-p", Math.min(1, Math.max(0, y / room)).toFixed(4));
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
