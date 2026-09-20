// 021. The parts of a voice note the browser can be wrong about without a
// microphone: the bars sent with the upload, and the time as it is drawn.
//
// The recorder itself, the row and the bubble are exercised in a browser;
// this suite has no DOM, as the rest of it does not.

import { describe, expect, it } from "vitest";
import { resample } from "../src/lib/recorder";
import { mmss } from "../src/components/shell/SentVoice";
import { WAVEFORM_BARS } from "../src/lib/dump";

describe("the bars", () => {
  it("are thirty two over the whole note, whatever was heard", () => {
    expect(resample([])).toHaveLength(WAVEFORM_BARS);
    expect(resample([0.5])).toHaveLength(WAVEFORM_BARS);
    expect(resample(Array.from({ length: 6000 }, (_, i) => (i % 10) / 10))).toHaveLength(WAVEFORM_BARS);
  });

  it("are the mean of each bucket, normalised to the note's own peak", () => {
    // Quiet at the start, loud at the end: the last bar is the peak and the
    // first is not, and a whisper of a note still draws.
    const samples = Array.from({ length: 320 }, (_, i) => (i < 160 ? 0.01 : 0.04));
    const bars = resample(samples);
    expect(bars[0]).toBe(64);
    expect(bars[31]).toBe(255);
    expect(bars.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
    // Silence is all zeros, not a division by nothing.
    expect(resample([0, 0, 0])).toEqual(Array.from({ length: WAVEFORM_BARS }, () => 0));
  });
});

describe("the time", () => {
  it("floors the seconds, so 59.6 is 0:59 and the cap is 10:00", () => {
    expect(mmss(59_600)).toBe("0:59");
    expect(mmss(14_000)).toBe("0:14");
    expect(mmss(600_000)).toBe("10:00");
    expect(mmss(0)).toBe("0:00");
    expect(mmss(-5)).toBe("0:00");
  });
});
