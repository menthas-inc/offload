/**
 * A voice note on a sent message, inside the person's own bubble: the control, the
 * waveform, the length, and the transcript beneath once offload has written it down.
 *
 * **The bars are the note's own thirty two**, resampled over the whole recording on the
 * device at stop and stored with it, so every surface and every reload draws the same bars
 * and a bar is a fixed slice of time. Never the composer's live window, and never a drawn
 * sine: a sine is a picture of a different recording.
 *
 * **The glyph says what pressing it does** — `play` at rest, `pause` while playing. A
 * microphone there says record, which is the composer's job and not this row's.
 *
 * **The remainder recedes only while playing.** Played bars are `--text-attention` and the
 * rest drop to `--ink-300`, a 3.53:1 boundary; at rest every bar is `--text-tertiary` at
 * 4.76:1, because then the whole waveform is the note. `--text-primary` is louder but
 * measures 1.21:1 against a tertiary remainder, which makes the fill edge invisible.
 *
 * **The whole row is the target**, 44px minimum, and it is named "Voice note, 0:14, play".
 * The transcript beneath is the bubble's text, read once, and not part of the target.
 */
export interface SentVoiceProps {
  durationMs: number;
  /** Thirty two values, 0-255, from the wire. Falls back to a flat row rather than a sine. */
  waveform?: number[];
  /** What offload heard. Empty string when there was nothing to hear. */
  transcript?: string;
  /** Whether offload has listened yet. Until then no transcript line is drawn at all — an
   *  empty line under the bars reads as a transcript that lost its words. */
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
  style?: React.CSSProperties;
}
export declare function SentVoice(props: SentVoiceProps): JSX.Element;
