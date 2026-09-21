// 021. The browser's recorder, with the bars the kit's row draws.
//
// `MediaRecorder` in the first container the browser offers, mono at about
// 64 kbps, and an `AnalyserNode` on the same stream read every 100ms for the
// live window. Every sample is kept, so stopping can resample the whole
// note to the kit's thirty two bars: the stored waveform is the note, not
// its last three seconds. There is no file on disk; the note is a `Blob` in
// the composer's state until it sends or is discarded.

import { MAX_VOICE_MS, WAVEFORM_BARS } from "./dump";

/** In preference order. AAC in MP4 first wherever the browser offers it,
 *  Safari and recent Chrome, because that is the one container every phone
 *  plays back; Opus in WebM or Ogg otherwise, which an iPhone cannot play
 *  and which its bubble then says with "Not here yet.". */
const MIME_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/ogg;codecs=opus"];

/** A bar and its gap, the kit's 3px and 2px. The live window is as many
 *  bars as the row's width holds at this pitch. */
export const BAR_PITCH_PX = 5;
export const SAMPLE_MS = 100;

export interface Recording {
  audio: Blob;
  durationMs: number;
  waveform: number[];
}

export type RecorderState = "recording" | "stopped";

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

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
    out.push(Math.max(0, Math.min(255, Math.round(((sum / (to - from)) / peak) * 255))));
  }
  return out;
}

export class Recorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private chunks: Blob[] = [];
  private samples: number[] = [];
  private startedAt = 0;
  private stoppedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopping: Promise<void> | null = null;
  private resolveStopped: (() => void) | null = null;
  state: RecorderState = "recording";

  private constructor(
    private readonly onSample: (live: number[], elapsedMs: number) => void,
    private readonly onStopped: () => void,
  ) {}

  /** Ask for the microphone and start. Throws when the browser refuses,
   *  which the composer draws as its one line. */
  static async start(
    onSample: (live: number[], elapsedMs: number) => void,
    onStopped: () => void,
  ): Promise<Recorder> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const self = new Recorder(onSample, onStopped);
    self.stream = stream;
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    self.recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 64_000,
    });
    self.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) self.chunks.push(event.data);
    };
    self.stopping = new Promise((resolve) => {
      self.resolveStopped = resolve;
    });
    self.recorder.onstop = () => self.resolveStopped?.();

    // The bars: a small analyser on the stream, read on a clock.
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      self.context = new AudioContextCtor();
      const source = self.context.createMediaStreamSource(stream);
      const analyser = self.context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      self.timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centred = (value - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / data.length);
        self.samples.push(rms);
        const elapsed = Date.now() - self.startedAt;
        // Every sample, scaled to a bar: the row slices as many as its
        // width holds, so the window scales with the row.
        self.onSample(self.samples.map((v) => Math.min(1, v * 3)), elapsed);
        if (elapsed >= MAX_VOICE_MS) void self.stop();
      }, SAMPLE_MS);
    }

    self.startedAt = Date.now();
    self.recorder.start(1000);
    return self;
  }

  get elapsedMs(): number {
    return (this.state === "stopped" ? this.stoppedAt : Date.now()) - this.startedAt;
  }

  /** Stop, keeping what was heard. The row stays with its two controls. */
  async stop(): Promise<void> {
    if (this.state === "stopped") return;
    this.state = "stopped";
    this.stoppedAt = Date.now();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    else this.resolveStopped?.();
    await this.stopping;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.onStopped();
  }

  /** The note, stopped if it was not. */
  async take(): Promise<Recording> {
    await this.stop();
    const type = this.recorder?.mimeType || "audio/webm";
    return {
      audio: new Blob(this.chunks, { type }),
      durationMs: Math.max(1, Math.min(MAX_VOICE_MS, this.stoppedAt - this.startedAt)),
      waveform: resample(this.samples),
    };
  }

  /** Throw it away. */
  async discard(): Promise<void> {
    await this.stop();
    this.chunks = [];
    this.samples = [];
  }
}
