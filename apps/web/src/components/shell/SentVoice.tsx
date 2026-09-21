"use client";

// 021. A voice note sent with a message, from ui_kits/mobile_app/LiveConversation.jsx.
//
// The kit's `SentVoice`: the microphone glyph, the bars, the length. Three
// things differ here and each is logged. The bars are the note's own thirty
// two from the wire, resampled over the whole recording on the device, not
// the live window the kit passes and not the sine it draws when it has
// nothing. The row plays: a tap fills the bars left to right, the length
// counts down, a second tap pauses, and one plays at a time across the
// screen. And the transcript draws beneath, in the bubble's own type at the
// secondary colour, with "Show all" past its first lines, because that is
// where somebody sees what offload heard.
//
// The web kit's turns draw text only, so this is the phones' component too.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { voiceUrl, type VoiceOnWire } from "../../lib/dump";
import styles from "../../app/(shell)/composer.module.css";

/** Seconds floor, never round: 59.6 is 0:59 and not 0:60. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Past this many characters the transcript folds, roughly four lines. */
const FOLD_AT = 280;

/** One playing at a time across the screen: starting one pauses the other. */
let playing: HTMLAudioElement | null = null;

export function SentVoice({
  voice,
  /** The composer is recording: the row is inert, so playback never feeds
   *  the microphone. */
  inert = false,
}: {
  voice: VoiceOnWire;
  inert?: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [position, setPosition] = useState(0);
  const [notYet, setNotYet] = useState(false);
  const [all, setAll] = useState(false);

  const duration = voice.durationMs;
  const played = duration > 0 ? Math.min(1, position / duration) : 0;
  const bars = voice.waveform.length ? voice.waveform : Array.from({ length: 32 }, () => 40);

  useEffect(() => {
    return () => {
      const el = audio.current;
      if (el) {
        el.pause();
        if (playing === el) playing = null;
      }
    };
  }, []);

  function element(): HTMLAudioElement {
    if (audio.current) return audio.current;
    const el = new Audio();
    el.crossOrigin = "use-credentials";
    el.preload = "none";
    el.src = voice.localUrl ?? voiceUrl(voice.blobId);
    el.addEventListener("timeupdate", () => setPosition(el.currentTime * 1000));
    el.addEventListener("ended", () => {
      setState("idle");
      setPosition(0);
      if (playing === el) playing = null;
    });
    el.addEventListener("pause", () => {
      if (!el.ended) setState((current) => (current === "playing" ? "paused" : current));
    });
    el.addEventListener("error", () => {
      setState("idle");
      setNotYet(true);
      if (playing === el) playing = null;
    });
    audio.current = el;
    return el;
  }

  async function toggle(): Promise<void> {
    if (inert) return;
    const el = element();
    if (state === "playing") {
      el.pause();
      setState("paused");
      return;
    }
    if (playing && playing !== el) playing.pause();
    playing = el;
    setNotYet(false);
    try {
      await el.play();
      setState("playing");
    } catch {
      setState("idle");
      setNotYet(true);
    }
  }

  const remaining = state === "idle" ? duration : Math.max(0, duration - position);
  const name = `Voice note, ${mmss(duration)}, ${state === "playing" ? "pause" : "play"}`;
  const stateText =
    state === "playing" ? `playing, ${mmss(remaining)} left` : state === "paused" ? "paused" : undefined;
  const transcript = voice.transcribed ? (voice.transcript ?? "") : null;
  const folded = transcript !== null && transcript.length > FOLD_AT && !all;

  return (
    <span className={styles.sentVoice}>
      <button
        type="button"
        className={styles.sentVoiceRow}
        onClick={() => void toggle()}
        aria-label={name}
        aria-description={stateText}
        aria-pressed={state === "playing"}
        disabled={inert}
        data-state={state}
      >
        <Icon name="mic" size={14} />
        <span className={styles.sentVoiceBars} aria-hidden="true">
          {bars.map((value, at) => (
            <span
              key={at}
              className={styles.sentVoiceBar}
              data-played={at / bars.length < played ? true : undefined}
              style={{ height: `${Math.max(3, Math.round((value / 255) * 20))}px` }}
            />
          ))}
        </span>
        <span className={styles.sentVoiceTime}>{mmss(remaining)}</span>
      </button>
      {notYet ? (
        <span className={styles.sentVoiceLine} role="alert">
          Not here yet.
        </span>
      ) : null}
      {transcript !== null && transcript.length > 0 ? (
        <span className={styles.sentVoiceTranscript}>
          {folded ? `${transcript.slice(0, FOLD_AT).trimEnd()}` : transcript}
          {folded ? (
            <>
              {" "}
              <button type="button" className={styles.sentVoiceMore} onClick={() => setAll(true)}>
                Show all
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
