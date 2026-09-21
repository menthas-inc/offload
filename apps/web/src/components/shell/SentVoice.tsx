"use client";

// 021. A voice note sent with a message, from components/conversation/SentVoice.jsx.
//
// Two pieces. `SentVoice` is the design system's component, to its contract:
// the control, the bars, the length, the transcript beneath, all of it told
// what to draw. `VoiceNotePlayer` is what the conversation renders: it owns
// the audio element, one playing at a time across the screen, and hands the
// component its state. The split is the contract's: the kit draws a voice
// note with no player behind it, and the phones draw the same component
// over a different player.
//
// The bars are the note's own thirty two from the wire, resampled over the
// whole recording on the device, never the live window and never a sine. At
// rest every bar is tertiary; while playing the played bars are the
// attention blue and the rest recede to `--ink-300`, since ink on tertiary
// measures 1.21:1 and the fill edge is the one thing you have to see. The
// glyph says what pressing it does: play, then pause.

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
export const FOLD_AT = 280;

const BARS = 32;

export function SentVoice({
  durationMs,
  waveform,
  transcript,
  transcribed = false,
  playing = false,
  positionMs = 0,
  failed = false,
  inert = false,
  onToggle,
  folded = false,
  onShowAll,
}: {
  durationMs: number;
  /** Thirty two values, 0 to 255, from the wire. A flat row when absent, never a sine. */
  waveform?: number[];
  /** What offload heard. Empty when there was nothing to hear. */
  transcript?: string;
  /** Until offload has listened, no transcript line is drawn at all. */
  transcribed?: boolean;
  playing?: boolean;
  positionMs?: number;
  /** Playback could not start: "Not here yet.", with no control. */
  failed?: boolean;
  /** The composer is recording, so the row is inert and playback never feeds the mic. */
  inert?: boolean;
  onToggle?: () => void;
  /** The transcript is past its first lines, so "Show all" is drawn. */
  folded?: boolean;
  onShowAll?: () => void;
}) {
  const bars = waveform && waveform.length ? waveform : Array.from({ length: BARS }, () => 40);
  const played = playing && durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const remaining = playing ? Math.max(0, durationMs - positionMs) : durationMs;
  const words = transcribed ? (transcript ?? "") : null;

  return (
    <span className={styles.sentVoice}>
      <button
        type="button"
        className={styles.sentVoiceRow}
        onClick={onToggle}
        aria-label={`Voice note, ${mmss(durationMs)}, ${playing ? "pause" : "play"}`}
        aria-description={playing ? `playing, ${mmss(remaining)} left` : undefined}
        aria-pressed={playing}
        disabled={inert}
      >
        <Icon name={playing ? "pause" : "play"} size={14} />
        <span className={styles.sentVoiceBars} aria-hidden="true">
          {bars.map((value, at) => (
            <span
              key={at}
              className={styles.sentVoiceBar}
              data-fill={at / bars.length < played ? "played" : playing ? "remainder" : "rest"}
              style={{ height: `${Math.max(3, Math.round((value / 255) * 20))}px` }}
            />
          ))}
        </span>
        <span className={styles.sentVoiceTime}>{mmss(remaining)}</span>
      </button>
      {failed ? (
        <span className={styles.sentVoiceLine} role="alert">
          Not here yet.
        </span>
      ) : null}
      {words ? (
        <span className={styles.sentVoiceTranscript}>
          {words}
          {folded ? (
            <>
              {" "}
              <button type="button" className={styles.sentVoiceMore} onClick={onShowAll}>
                Show all
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** One playing at a time across the screen: starting one pauses the other. */
let playingNow: HTMLAudioElement | null = null;

/** The conversation's voice note: the audio behind `SentVoice`. */
export function VoiceNotePlayer({
  voice,
  /** The composer is recording: the row is inert, so playback never feeds
   *  the microphone. */
  inert = false,
}: {
  voice: VoiceOnWire;
  inert?: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    return () => {
      const el = audio.current;
      if (el) {
        el.pause();
        if (playingNow === el) playingNow = null;
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
      setPlaying(false);
      setPosition(0);
      if (playingNow === el) playingNow = null;
    });
    el.addEventListener("pause", () => {
      if (!el.ended) setPlaying(false);
    });
    el.addEventListener("error", () => {
      setPlaying(false);
      setFailed(true);
      if (playingNow === el) playingNow = null;
    });
    audio.current = el;
    return el;
  }

  async function toggle(): Promise<void> {
    if (inert) return;
    const el = element();
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    if (playingNow && playingNow !== el) playingNow.pause();
    playingNow = el;
    // The row is the retry: the line clears on the way in.
    setFailed(false);
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setFailed(true);
    }
  }

  const transcript = voice.transcribed ? (voice.transcript ?? "") : "";
  const folded = transcript.length > FOLD_AT && !all;

  return (
    <SentVoice
      durationMs={voice.durationMs}
      waveform={voice.waveform}
      transcript={folded ? transcript.slice(0, FOLD_AT).trimEnd() : transcript}
      transcribed={voice.transcribed}
      playing={playing}
      positionMs={position}
      failed={failed}
      inert={inert}
      onToggle={() => void toggle()}
      folded={folded}
      onShowAll={() => setAll(true)}
    />
  );
}
