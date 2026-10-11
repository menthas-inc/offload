// 021. A voice note sent with a message, from components/conversation/SentVoice.jsx.
//
// Two pieces. `SentVoice` is the design system's component, to its contract:
// the control, the bars, the length, the transcript beneath, all of it told
// what to draw. `VoiceNotePlayer` is what the conversation renders: it owns
// the player, one playing at a time across the screen, and hands the
// component its state. The split is the contract's: the kit draws a voice
// note with no player behind it, and the web draws the same component over
// a different one.
//
// The bars are the note's own thirty two from the wire, resampled over the
// whole recording on the device, never the live window and never a sine. At
// rest every bar is tertiary; while playing the played bars are the
// attention blue and the rest recede to `--ink-300`, since ink on tertiary
// measures 1.21:1 and the fill edge is the one thing you have to see. The
// glyph says what pressing it does: play, then pause.
//
// The bytes come down through `fetch` with the session as a header into a
// cache file, and the player plays the file. Not a URL handed to the player:
// a native player carries no header (020's lesson with `Image`), and a token
// in a URL is a credential in a cache. The file goes when the note ends, on
// leaving the screen and on sign-out; a pause keeps it for the resume.

import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File } from "expo-file-system";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { authHeaders } from "../../lib/api";
import { voiceUrl, type VoiceOnWire } from "../../lib/dump";
import { mmss, playbackDirectory } from "../../lib/recorder";
import { copyGeneration } from "../../lib/session-end";

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
  const COLOR = useColors();
  const bars = waveform && waveform.length ? waveform : Array.from({ length: BARS }, () => 40);
  const played = playing && durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const remaining = playing ? Math.max(0, durationMs - positionMs) : durationMs;
  const words = transcribed ? (transcript ?? "") : null;

  return (
    <View className="mt-space-2" style={{ minWidth: 150, gap: 6 }}>
      <Pressable
        onPress={onToggle}
        disabled={inert}
        accessibilityRole="button"
        accessibilityLabel={`Voice note, ${mmss(durationMs)}, ${playing ? "pause" : "play"}`}
        accessibilityHint={playing ? `playing, ${mmss(remaining)} left` : undefined}
        accessibilityState={{ disabled: inert, selected: playing }}
        className="flex-row items-center gap-space-3"
        style={{ minHeight: 44 }}
      >
        <Glyph name={playing ? "pause" : "play"} size={14} color={COLOR.iconOnWell} />
        <View className="flex-1 flex-row items-center" style={{ height: 20, gap: 2, overflow: "hidden" }}>
          {bars.map((value, at) => (
            <View
              key={at}
              style={{
                width: 3,
                borderRadius: 2,
                height: Math.max(3, Math.round((value / 255) * 20)),
                backgroundColor:
                  at / bars.length < played
                    ? COLOR.textAttention
                    : playing
                      ? COLOR.waveRemainder
                      : COLOR.quiet,
              }}
            />
          ))}
        </View>
        <Text
          className="font-core"
          style={{ fontSize: 12.5, color: COLOR.iconOnWell, fontVariant: ["tabular-nums"] }}
        >
          {mmss(remaining)}
        </Text>
      </Pressable>
      {failed ? (
        <Text className="font-core text-text-danger" style={{ fontSize: 13 }} accessibilityLiveRegion="polite">
          Not here yet.
        </Text>
      ) : null}
      {words ? (
        <Text className="font-core" style={{ fontSize: 15, lineHeight: 22, color: COLOR.iconOnWell }}>
          {words}
          {folded ? (
            <Text
              className="font-core font-medium text-text-accent"
              onPress={onShowAll}
              accessibilityRole="button"
            >
              {"  Show all"}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

/** One playing at a time across the screen: starting one pauses the other. */
let playingNow: { pause: () => void } | null = null;

/** The conversation's voice note: the player behind `SentVoice`. */
export function VoiceNotePlayer({
  voice,
  /** The composer is recording: the row is inert, so playback never feeds
   *  the microphone. */
  inert = false,
}: {
  voice: VoiceOnWire;
  inert?: boolean;
}) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const fetched = useRef<File | null>(null);
  const mounted = useRef(true);

  const playing = state === "playing";
  const positionMs = playing ? status.currentTime * 1000 : 0;

  // The end of the note, and the device copy with it.
  useEffect(() => {
    if (state !== "playing") return;
    if (status.didJustFinish) {
      setState("idle");
      if (playingNow?.pause === player.pause) playingNow = null;
      forgetCopy();
    }
  }, [status.didJustFinish, state, player]);

  useEffect(
    () => () => {
      // Leaving the screen: paused and forgotten. A fetch still in flight
      // sees `mounted` and deletes what it wrote.
      mounted.current = false;
      try {
        player.pause();
      } catch {
        // Already released.
      }
      forgetCopy();
    },
    // Mount only: the player is the hook's for the component's life.
    [],
  );

  function forgetCopy(): void {
    const file = fetched.current;
    fetched.current = null;
    setLoaded(null);
    try {
      if (file?.exists) file.delete();
    } catch {
      // Already gone.
    }
  }

  /** The note's bytes, from this device's own recording when it was sent
   *  here, otherwise fetched once with the session into the cache. */
  async function source(): Promise<string | null> {
    if (voice.localUri) return voice.localUri;
    if (loaded) return loaded;
    const generation = copyGeneration();
    const headers = await authHeaders();
    const response = await fetch(voiceUrl(voice.blobId), { headers });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // The session ended while it came down: the copy is no longer the phone's.
    if (copyGeneration() !== generation) return null;
    const dir = playbackDirectory();
    dir.create({ idempotent: true, intermediates: true });
    const type = response.headers.get("content-type") ?? "audio/mp4";
    const extension = type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : "m4a";
    const file = new File(dir, `${voice.blobId}.${extension}`);
    file.write(bytes);
    if (!mounted.current) {
      file.delete();
      return null;
    }
    fetched.current = file;
    setLoaded(file.uri);
    return file.uri;
  }

  async function toggle(): Promise<void> {
    if (inert) return;
    if (state === "playing") {
      // The copy stays for the resume; it goes at the end, on leaving the
      // screen and on sign-out.
      player.pause();
      setState("paused");
      return;
    }
    // The row is the retry: the line clears on the way in.
    setFailed(false);
    try {
      const uri = await source();
      if (!uri) {
        setFailed(true);
        return;
      }
      if (playingNow && playingNow.pause !== player.pause) playingNow.pause();
      playingNow = { pause: () => player.pause() };
      // Through the silent switch, as a voice note is in every messaging app.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (state === "idle") player.replace({ uri });
      player.play();
      setState("playing");
    } catch {
      setState("idle");
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
      positionMs={positionMs}
      failed={failed}
      inert={inert}
      onToggle={() => void toggle()}
      folded={folded}
      onShowAll={() => setAll(true)}
    />
  );
}
