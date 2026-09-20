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
import { mmss, playbackDirectory, sweepRecordings } from "../../lib/recorder";

/** Past this many characters the transcript folds, roughly four lines. */
const FOLD_AT = 280;

/** Forget every device copy of a note, heard or not yet sent. Sign-out
 *  calls this; launch runs the same sweep. */
export function forgetPlayback(): void {
  sweepRecordings();
}

/** One playing at a time across the screen: starting one pauses the other. */
let playingNow: { pause: () => void } | null = null;

export function SentVoice({
  voice,
  /** The composer is recording: the row is inert, so playback never feeds
   *  the microphone. */
  inert = false,
}: {
  voice: VoiceOnWire;
  inert?: boolean;
}) {
  const COLOR = useColors();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [notYet, setNotYet] = useState(false);
  const [all, setAll] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const fetched = useRef<File | null>(null);
  const mounted = useRef(true);

  const duration = voice.durationMs;
  const positionMs = state === "idle" ? 0 : status.currentTime * 1000;
  const played = duration > 0 ? Math.min(1, positionMs / duration) : 0;
  const bars = voice.waveform.length ? voice.waveform : Array.from({ length: 32 }, () => 40);

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
    const headers = await authHeaders();
    const response = await fetch(voiceUrl(voice.blobId), { headers });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
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
    setNotYet(false);
    try {
      const uri = await source();
      if (!uri) {
        setNotYet(true);
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
      setNotYet(true);
    }
  }

  const remaining = state === "idle" ? duration : Math.max(0, duration - positionMs);
  const name = `Voice note, ${mmss(duration)}, ${state === "playing" ? "pause" : "play"}`;
  const stateText =
    state === "playing" ? `playing, ${mmss(remaining)} left` : state === "paused" ? "paused" : undefined;
  const transcript = voice.transcribed ? (voice.transcript ?? "") : null;
  const folded = transcript !== null && transcript.length > FOLD_AT && !all;

  return (
    <View className="mt-space-2" style={{ minWidth: 150, gap: 6 }}>
      <Pressable
        onPress={() => void toggle()}
        disabled={inert}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityHint={stateText}
        accessibilityState={{ disabled: inert, selected: state === "playing" }}
        className="flex-row items-center gap-space-3"
        style={{ minHeight: 44 }}
      >
        <Glyph name="mic" size={14} color={COLOR.iconOnWell} />
        <View className="flex-1 flex-row items-center" style={{ height: 20, gap: 2, overflow: "hidden" }}>
          {bars.map((value, at) => (
            <View
              key={at}
              style={{
                width: 3,
                borderRadius: 2,
                height: Math.max(3, Math.round((value / 255) * 20)),
                backgroundColor: at / bars.length < played ? COLOR.ink : COLOR.quiet,
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
      {notYet ? (
        <Text className="font-core text-text-danger" style={{ fontSize: 13 }} accessibilityLiveRegion="polite">
          Not here yet.
        </Text>
      ) : null}
      {transcript !== null && transcript.length > 0 ? (
        <Text className="font-core" style={{ fontSize: 15, lineHeight: 22, color: COLOR.iconOnWell }}>
          {folded ? transcript.slice(0, FOLD_AT).trimEnd() : transcript}
          {folded ? (
            <Text
              className="font-core font-medium text-text-accent"
              onPress={() => setAll(true)}
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
