// 021. The phones' recorder, with the bars the kit's row draws.
//
// `expo-audio` records AAC in an M4A, mono at 64 kbps, and its metering is
// read every 100ms for the live window. Every sample is kept, so stopping
// resamples the whole note to the kit's thirty two bars: the stored waveform
// is the note, not its last three seconds. The file lives in the app's own
// recordings directory until it sends or is discarded, and anything left
// there by a kill is swept on launch.

import {
  type AudioRecorder,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { MAX_VOICE_MS, WAVEFORM_BARS } from "./dump";

/** The kit's live window: the last few seconds, as bars. */
export const LIVE_BARS = 32;
export const SAMPLE_MS = 100;

/** Mono, about 64 kbps, AAC in an M4A on both platforms. Ten minutes is
 *  about five megabytes. */
export const RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: "aac ", audioQuality: 96 },
  web: { mimeType: "audio/webm", bitsPerSecond: 64000 },
};

/** Seconds floor, never round: 59.6 is 0:59 and not 0:60. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface Recording {
  uri: string;
  durationMs: number;
  waveform: number[];
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
    out.push(Math.max(0, Math.min(255, Math.round((sum / (to - from) / peak) * 255))));
  }
  return out;
}

/** Metering arrives in decibels below full scale, about -160 to 0. As an
 *  amplitude from 0 to 1, with a floor so silence is flat and a whisper is
 *  not. */
export function amplitude(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

/** Where the notes wait on this device. */
export function recordingsDirectory(): Directory {
  return new Directory(Paths.cache, "voice");
}

/** Delete whatever a kill left behind. Called on launch. */
export function sweepRecordings(): void {
  try {
    const dir = recordingsDirectory();
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File) entry.delete();
    }
  } catch {
    // A cache directory that cannot be read is one with nothing in it.
  }
}

/** Delete one note's file. Send and Discard both end here. */
export function deleteRecording(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

/** One recording, on one `AudioRecorder`. The recorder itself is the
 *  provider's, made once by the hook; this drives it for the length of a
 *  note and hands back the file, the length and the bars. */
export class Session {
  private samples: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private stoppedAt = 0;
  private stopping: Promise<void> | null = null;
  state: "recording" | "stopped" = "recording";

  private constructor(
    private readonly recorder: AudioRecorder,
    private readonly onSample: (live: number[], elapsedMs: number) => void,
    private readonly onStopped: () => void,
  ) {}

  /** Ask for the microphone once, then record. Throws when refused. */
  static async start(
    recorder: AudioRecorder,
    onSample: (live: number[], elapsedMs: number) => void,
    onStopped: () => void,
  ): Promise<Session> {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error("microphone refused");
    // Recording ducks whatever else is playing; playback goes through the
    // silent switch, as a voice note does in every messaging app.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    const session = new Session(recorder, onSample, onStopped);
    session.startedAt = Date.now();
    recorder.record();
    session.timer = setInterval(() => session.tick(), SAMPLE_MS);
    return session;
  }

  private tick(): void {
    if (this.state !== "recording") return;
    const status = this.recorder.getStatus();
    // An interruption, a call, ends the recording under us: the row shows
    // the stopped state and what was heard is kept.
    if (!status.isRecording && Date.now() - this.startedAt > SAMPLE_MS * 3) {
      void this.stop();
      return;
    }
    this.samples.push(amplitude(status.metering));
    const elapsed = Date.now() - this.startedAt;
    this.onSample(this.samples.slice(-LIVE_BARS), elapsed);
    if (elapsed >= MAX_VOICE_MS) void this.stop();
  }

  get elapsedMs(): number {
    return (this.state === "stopped" ? this.stoppedAt : Date.now()) - this.startedAt;
  }

  /** Stop, keeping what was heard. */
  async stop(): Promise<void> {
    if (this.state === "stopped") return this.stopping ?? undefined;
    this.state = "stopped";
    this.stoppedAt = Date.now();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopping = (async () => {
      try {
        await this.recorder.stop();
      } catch {
        // Already stopped by the system.
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      this.onStopped();
    })();
    return this.stopping;
  }

  /** The note, stopped if it was not, moved into the recordings directory. */
  async take(): Promise<Recording | null> {
    await this.stop();
    const from = this.recorder.uri;
    if (!from) return null;
    const dir = recordingsDirectory();
    dir.create({ idempotent: true, intermediates: true });
    const file = new File(dir, `${Date.now()}.m4a`);
    try {
      new File(from).move(file);
    } catch {
      // The recorder's own file is fine to send from.
      return {
        uri: from,
        durationMs: Math.max(1, Math.min(MAX_VOICE_MS, this.stoppedAt - this.startedAt)),
        waveform: resample(this.samples),
      };
    }
    return {
      uri: file.uri,
      durationMs: Math.max(1, Math.min(MAX_VOICE_MS, this.stoppedAt - this.startedAt)),
      waveform: resample(this.samples),
    };
  }

  /** Throw it away. */
  async discard(): Promise<void> {
    await this.stop();
    if (this.recorder.uri) deleteRecording(this.recorder.uri);
    this.samples = [];
  }
}
