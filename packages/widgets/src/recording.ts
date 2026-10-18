// 021. A voice note as both clients record it.

/** The recorders stop themselves here, and the server refuses past it. */
export const MAX_VOICE_MS = 600_000;
/** Bars over the whole note. The server holds the same number. */
export const WAVEFORM_BARS = 32;

/** Thirty two bars over the whole note, from every sample it heard. Each
 *  bar is the mean of its bucket, normalised to the recording's own peak
 *  and quantised to 0 to 255, so a quiet note still draws. */
export function resample(samples: number[], bars = WAVEFORM_BARS): number[] {
  if (samples.length === 0) return Array.from({ length: bars }, () => 0);
  const peak = Math.max(...samples, 1e-6);
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / bars));
    let sum = 0;
    for (let at = from; at < to; at += 1) sum += samples[at] ?? 0;
    out.push(Math.max(0, Math.min(255, Math.round((sum / (to - from) / peak) * 255))));
  }
  return out;
}
