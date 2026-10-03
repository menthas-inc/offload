"use client";

// 033. The intro on the web: one screen that plays itself.
//
// The art on the left over the bloom, the bars, the words and Continue on
// the right. Three scenes of 9.6s, looping; pressing the art moves on and
// restarts the clock. With reduced motion nothing moves on its own.
//
// **It stops while the pointer is over it or focus is inside it** (owner,
// 2026-10-03). The phones stop for a running screen reader; the web cannot
// tell whether one is running, and anything that moves on its own for more
// than five seconds needs a way to hold it still. It resumes from where it
// stopped rather than from the start of the scene.

import { useEffect, useRef, useState } from "react";
import { Logo } from "../Logo";
import { SCENE_MS, autoAdvance, introNext } from "../../lib/first-run";
import { INTRO } from "./copy";
import { IntroArt } from "./IntroArt";
import { RunFooter } from "./RunFooter";
import styles from "./firstrun.module.css";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const changed = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  return reduced;
}

export function Intro({ button, onLeave }: { button: string; onLeave: () => void }) {
  const [scene, setScene] = useState(0);
  const [tapped, setTapped] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const playing = autoAdvance({ reduceMotion: reduced, screenReader: false });

  // What is left of the current scene, so a pause resumes where it stopped.
  const clock = useRef({ started: 0, remaining: SCENE_MS });
  useEffect(() => {
    clock.current = { started: Date.now(), remaining: SCENE_MS };
  }, [scene, tapped]);
  useEffect(() => {
    if (!playing || paused) return;
    clock.current.started = Date.now();
    const timer = setTimeout(() => setScene(introNext), clock.current.remaining);
    return () => {
      clearTimeout(timer);
      clock.current.remaining -= Date.now() - clock.current.started;
    };
  }, [playing, paused, scene, tapped]);

  // Native listeners: React builds its pointer enter and leave from over and
  // out, and focus leaving the intro is a focusout whose next target is
  // outside it.
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let hovered = false;
    let focused = false;
    const update = () => setPaused(hovered || focused);
    const enter = () => ((hovered = true), update());
    const leave = () => ((hovered = false), update());
    const focusIn = () => ((focused = true), update());
    const focusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
      focused = false;
      update();
    };
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("focusin", focusIn);
    node.addEventListener("focusout", focusOut);
    return () => {
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("focusin", focusIn);
      node.removeEventListener("focusout", focusOut);
    };
  }, []);

  const current = INTRO[scene]!;
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Logo size={24} />
      </div>
      <section ref={root} data-intro className={`${styles.story} ${paused ? styles.paused : ""}`}>
        <div className={styles.artSide}>
          <div className={styles.bloom} aria-hidden="true" />
          <button
            type="button"
            className={styles.art}
            aria-label="Next scene"
            onClick={() => {
              setScene(introNext);
              setTapped((n) => n + 1);
            }}
          >
            <IntroArt scene={scene} animate={!reduced} />
          </button>
        </div>
        <div className={styles.words}>
          <div className={styles.bars} role="presentation">
            {INTRO.map((item, index) => (
              <span key={item.title} className={styles.bar}>
                <span
                  // Keyed by the clock, so a press restarts the fill.
                  key={index === scene ? `${scene}.${tapped}` : index}
                  className={`${styles.barFill} ${
                    index < scene ? styles.barDone : index > scene ? "" : playing ? styles.barNow : styles.barStill
                  }`}
                />
              </span>
            ))}
          </div>
          <div className={styles.copy} aria-live="polite">
            <div key={scene} className={styles.scene}>
              <h1 className={styles.introTitle}>{current.title}</h1>
              <p className={styles.introLine}>{current.line}</p>
            </div>
          </div>
          <RunFooter start main={{ label: button, onPress: onLeave }} />
        </div>
      </section>
    </main>
  );
}
