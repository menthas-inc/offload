"use client";

// 033. The intro's three scenes on the web.
//
// CSS entrances restarted by a key per scene, as the exploration does; scene
// one's filing measures each dump and its thread and travels between them,
// as its `fileScene` does. With `animate` off every scene draws its end state.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "../Icon";
import { INTRO_DUMPS, INTRO_SHARED, INTRO_THREADS, INTRO_WAYS } from "./copy";
import styles from "./firstrun.module.css";

const FILE_AT = 4600;
const FILE_GAP = 650;
const LANDS_AFTER = 950;
const HIT_MS = 550;

const at = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Filing({ animate }: { animate: boolean }) {
  const dumps = useRef<(HTMLDivElement | null)[]>([]);
  const threads = useRef<(HTMLDivElement | null)[]>([]);
  const filedInto = (thread: number) => INTRO_DUMPS.filter(([, into]) => into === thread).length;
  const [counts, setCounts] = useState(() =>
    INTRO_THREADS.map(([, , start], thread) => (animate ? start : start + filedInto(thread))),
  );
  const [filed, setFiled] = useState<boolean[]>(() => INTRO_DUMPS.map(() => !animate));
  const [hits, setHits] = useState([false, false]);

  useEffect(() => {
    if (!animate) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    later(() => {
      // Measured once everything has arrived, so the travel is from where
      // each dump actually sits to the centre of its thread.
      INTRO_DUMPS.forEach(([, thread], index) => {
        const dump = dumps.current[index];
        const target = threads.current[thread];
        if (dump && target) {
          const from = dump.getBoundingClientRect();
          const to = target.getBoundingClientRect();
          dump.style.setProperty("--dx", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
          dump.style.setProperty("--dy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
        }
        const set = (on: boolean) => setHits((was) => was.map((h, k) => (k === thread ? on : h)));
        later(() => setFiled((was) => was.map((f, k) => (k === index ? true : f))), index * FILE_GAP);
        later(() => {
          setCounts((was) => was.map((n, k) => (k === thread ? n + 1 : n)));
          set(true);
        }, index * FILE_GAP + LANDS_AFTER);
        later(() => set(false), index * FILE_GAP + LANDS_AFTER + HIT_MS);
      });
    }, FILE_AT);
    return () => timers.forEach(clearTimeout);
  }, [animate]);

  return (
    <div className={styles.sceneArt}>
      {INTRO_DUMPS.map(([text], index) => (
        <div
          key={text}
          ref={(node) => {
            dumps.current[index] = node;
          }}
          className={`${styles.dump} ${index % 2 ? styles.dumpRight : ""} ${filed[index] ? (animate ? styles.filed : styles.gone) : ""}`}
        >
          <div className={`${styles.bubble} ${styles.enter}`} style={at(1000 + index * 700)}>
            {text}
          </div>
        </div>
      ))}
      {INTRO_THREADS.map(([glyph, name], index) => (
        // The entrance on the wrapper, the ring and the lift on the row: an
        // animation that has finished still holds its transform, and would
        // hold the row's scale at none.
        <div
          key={name}
          ref={(node) => {
            threads.current[index] = node;
          }}
          className={`${styles.enter} ${index === 0 ? styles.threadFirst : ""}`}
          style={at(index * 300)}
        >
          <div className={`${styles.thread} ${hits[index] ? styles.hit : ""}`}>
            <span className={styles.well}>
              <Icon name={glyph} size={18} />
            </span>
            <span className={styles.threadName}>{name}</span>
            <span className={styles.count}>{counts[index]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Shared() {
  return (
    <div className={styles.sceneArt}>
      <div className={`${styles.card} ${styles.enter}`} style={{ animationDuration: "1000ms" }}>
        <div className={styles.cardHead}>
          <span className={styles.well}>
            <Icon name="lasso" size={18} />
          </span>
          <span className={styles.cardTitle}>{INTRO_SHARED.thread}</span>
          <span className={styles.people}>
            {INTRO_SHARED.people.map(([name, initials], index) => (
              <span
                key={name}
                className={`${styles.person} ${PEOPLE_TONES[index]} ${index > 0 ? styles.popIn : ""}`}
                style={index > 0 ? at(2000 + (index - 1) * 600) : undefined}
              >
                {initials}
              </span>
            ))}
          </span>
        </div>
        {INTRO_SHARED.rows.map(([glyph, text]) => (
          <div key={text} className={styles.cardRow}>
            <span>
              <Icon name={glyph} size={16} />
            </span>
            <span>{text}</span>
          </div>
        ))}
        <div className={`${styles.cardRow} ${styles.cardRowNew} ${styles.enter}`} style={at(5000)}>
          <span className={`${styles.person} ${styles.personSmall} ${styles.label6}`}>{INTRO_SHARED.people[2][1]}</span>
          <span>
            <b>{INTRO_SHARED.addedBy}</b> {INTRO_SHARED.added}
          </span>
        </div>
      </div>
      <span className={`${styles.pill} ${styles.enter}`} style={at(3200)}>
        <Icon name="users" size={15} />
        {INTRO_SHARED.shared}
      </span>
    </div>
  );
}

const PEOPLE_TONES = [styles.label1, styles.label2, styles.label6];

const WAVE = [8, 14, 22, 12, 26, 18, 9, 20, 28, 16, 11, 24, 15, 7, 19, 25, 10, 13];

function Ways() {
  const [emailLabel, emailHead, emailLine] = INTRO_WAYS.email;
  const [linkLabel, linkHead, linkLine] = INTRO_WAYS.link;
  return (
    <div className={styles.sceneArt}>
      <div className={styles.ways}>
        <div className={`${styles.way} ${styles.enter}`}>
          <div className={styles.photo}>
            <Icon name="image" size={26} />
          </div>
          <span className={styles.wayLabel}>
            <Icon name="camera" size={14} />
            {INTRO_WAYS.photo}
          </span>
        </div>
        <div className={`${styles.way} ${styles.enter}`} style={at(800)}>
          <div className={styles.wave}>
            {WAVE.map((height, index) => (
              <span key={index} className={styles.waveBar} style={{ height }} />
            ))}
          </div>
          <span className={styles.wayLabel}>
            <Icon name="mic" size={14} />
            {INTRO_WAYS.voice}
          </span>
        </div>
        <div className={`${styles.way} ${styles.enter}`} style={at(1600)}>
          <div className={styles.note}>
            <span className={styles.noteHead}>{emailHead}</span>
            <span className={styles.noteLine}>{emailLine}</span>
          </div>
          <span className={styles.wayLabel}>
            <Icon name="mail" size={14} />
            {emailLabel}
          </span>
        </div>
        <div className={`${styles.way} ${styles.enter}`} style={at(2400)}>
          <div className={styles.note}>
            <span className={styles.noteHead}>{linkHead}</span>
            <span className={styles.noteLine}>{linkLine}</span>
          </div>
          <span className={styles.wayLabel}>
            <Icon name="link" size={14} />
            {linkLabel}
          </span>
        </div>
      </div>
      <span className={`${styles.pill} ${styles.pillFiled} ${styles.enter}`} style={at(4400)}>
        <Icon name="check" size={16} />
        {INTRO_WAYS.filed}
      </span>
    </div>
  );
}

export function IntroArt({ scene, animate }: { scene: number; animate: boolean }) {
  // `go` turns the entrances on; without it every element is where it ends.
  // Keyed by both, since reduced motion is read after the first render.
  return (
    <div key={`${scene}.${animate}`} className={animate ? styles.go : undefined} style={{ width: "100%" }} aria-hidden="true">
      {scene === 0 ? <Filing animate={animate} /> : scene === 1 ? <Shared /> : <Ways />}
    </div>
  );
}
