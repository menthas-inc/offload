// 021. The parts of a voice note the phone can be wrong about without a
// microphone: the bars sent with the upload, the metering's scale, the
// time as it is drawn, the poll finding the transcript, and the build
// declaring no way to record in the background.
//
// The recorder itself, the row and the bubble are device checks, listed in
// the feature spec.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string }[] = [];
let answer: Record<string, unknown> | null = null;

vi.mock("../lib/api", () => ({
  send: (path: string) => {
    calls.push({ path });
    return Promise.resolve({ status: 200, data: answer });
  },
  upload: () => Promise.resolve({ status: 200, data: null }),
  API_URL: "http://api.test",
}));
vi.mock("expo-file-system", () => ({
  File: class {},
  Directory: class {},
  Paths: { cache: "cache" },
}));
vi.mock("expo-audio", () => ({
  requestRecordingPermissionsAsync: () => Promise.resolve({ granted: true }),
  setAudioModeAsync: () => Promise.resolve(),
}));

const { amplitude, mmss, resample, RECORDING_OPTIONS, Session } = await import("../lib/recorder");
const { awaitAnswer, WAVEFORM_BARS } = await import("../lib/dump");

beforeEach(() => {
  calls.length = 0;
  answer = { state: "seen", reply: null };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the bars", () => {
  it("are thirty two over the whole note, the mean of each bucket against the peak", () => {
    expect(resample([])).toHaveLength(WAVEFORM_BARS);
    const samples = Array.from({ length: 320 }, (_, i) => (i < 160 ? 0.01 : 0.04));
    const bars = resample(samples);
    expect(bars[0]).toBe(64);
    expect(bars[31]).toBe(255);
    expect(resample([0, 0])).toEqual(Array.from({ length: WAVEFORM_BARS }, () => 0));
  });

  it("read metering as an amplitude with a floor, so a whisper draws and silence is flat", () => {
    expect(amplitude(undefined)).toBe(0);
    expect(amplitude(-160)).toBe(0);
    expect(amplitude(-60)).toBe(0);
    expect(amplitude(-30)).toBe(0.5);
    expect(amplitude(0)).toBe(1);
  });
});

describe("the recorder's shape", () => {
  it("records mono AAC in an M4A at about 64 kbps with metering on", () => {
    expect(RECORDING_OPTIONS).toMatchObject({
      extension: ".m4a",
      numberOfChannels: 1,
      bitRate: 64000,
      isMeteringEnabled: true,
      android: { outputFormat: "mpeg4", audioEncoder: "aac" },
    });
  });

  it("declares no way to record in the background", () => {
    const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")) as {
      expo: { ios?: { infoPlist?: Record<string, unknown> } };
    };
    expect(app.expo.ios?.infoPlist?.["UIBackgroundModes"]).toBeUndefined();
  });

  it("prepares each note with its options, so iOS makes a new file after sign-out took the old one's folder", async () => {
    // Without options iOS reuses the recorder made at launch, whose folder
    // `device-data.ts` deletes, and prepare fails until a relaunch.
    const prepareToRecordAsync = vi.fn(() => Promise.resolve());
    const recorder = { prepareToRecordAsync, record: () => undefined, getStatus: () => ({ isRecording: true }) };
    const session = await Session.start(recorder as never, () => undefined, () => undefined);
    expect(prepareToRecordAsync).toHaveBeenCalledWith(RECORDING_OPTIONS);
    await session.discard().catch(() => undefined);
  });
});

describe("the time", () => {
  it("floors the seconds, so 59.6 is 0:59 and the cap is 10:00", () => {
    expect(mmss(59_600)).toBe("0:59");
    expect(mmss(600_000)).toBe("10:00");
    expect(mmss(-1)).toBe("0:00");
  });
});

describe("the poll", () => {
  it("hands the transcript over once, on the tick that first finds it, ahead of the answer", async () => {
    const transcripts: string[] = [];
    const answers: unknown[] = [];
    awaitAnswer("m1", (a) => answers.push(a), undefined, (text) => transcripts.push(text));
    await vi.advanceTimersByTimeAsync(0);
    expect(transcripts).toEqual([]);

    answer = { state: "seen", reply: null, voice: { blobId: "b", durationMs: 1, waveform: [], transcript: "call the plumber", transcribed: true } };
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(transcripts).toEqual(["call the plumber"]);
    expect(answers).toEqual([]);

    answer = { ...answer, state: "answered", reply: "Done." };
    await vi.advanceTimersByTimeAsync(1000);
    expect(answers).toHaveLength(1);
    expect(transcripts).toEqual(["call the plumber"]);
  });
});
