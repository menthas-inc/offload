// The field, from ui_kits/mobile_app/Composer.jsx.
//
// **Return makes a new line and the button is the only submit.** The kit gates
// Enter-to-send on a physical keyboard and there is not one, so a phone that
// sent on Return would send half a thought every time somebody wanted a second
// line.
//
// **The camera is drawn since 020 and the microphone since 021.** A photo
// is a chip in the composer, the kit's `AttachChip`, sitting in the row with
// the controls and wrapping; the pill opens into a box when it holds any, as
// it does for a tall draft. Tapping the microphone puts the kit's recording
// row in place of the field: the pulsing dot, the running time, the live
// window of bars growing from the right, Discard and Send. A stopped note is
// the same row with no dot. The words typed before the press stay drawn
// above the row, static, and go with the note; the kit hides them and sends
// them anyway. The field blurs as recording starts, so the keyboard drops,
// and the screen stays awake for the length of the note.

import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { invitation, MAX_PHOTOS } from "../../lib/dump";
import { mmss, SAMPLE_MS } from "../../lib/recorder";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { AttachChip } from "./AttachChip";
import { useConversation } from "./conversation-context";
import { MentionList, mentionQuery } from "../people/MentionList";

const isAndroid = Platform.OS === "android";

/** The kit's own twenty, rotated on a ten second fade. */
const PLACEHOLDERS = [
  "Dump anything",
  "What's on your mind?",
  "Half a thought is fine",
  "Say it before you forget",
  "Anything, in any order",
  "Throw it in here",
  "No need to tidy it",
  "Paste it, I'll sort it",
  "A link, a photo, a mumble",
  "Tell me the messy version",
  "Something you'll want later",
  "Out of your head, in here",
  "Don't file it, just drop it",
  "Even if it's three things at once",
  "Whatever you're holding",
  "I'll find it a home",
  "Type it badly, that's fine",
  "One line is enough",
  "Where does this go? Not your problem",
  "Give it to me",
];

/** Grows with the text, then scrolls. The kit's number. */
const MAX_HEIGHT = 380;

/** 021. The screen stays on while a note records: the case this exists for
 *  is a phone held loosely and a thought longer than the auto-lock. Mounted
 *  only while recording, so the hook's own release is the end of it. */
function KeepAwake() {
  useKeepAwake();
  return null;
}

/** 021. The kit's recording row, in place of the field. The dot while it
 *  records and not after; the time; the window of bars growing from the
 *  right. While recording, the row reads the live window from the
 *  provider's store on its own clock, so nothing else re-renders ten times
 *  a second. The dot blinks on a timer that reduced motion turns off; the
 *  row's meaning never depends on it. A screen reader hears "Recording"
 *  once and "Stopped, 0:14" once, never the running seconds. */
function RecordingRow({
  liveSamples,
  stopped,
  note,
  color,
}: {
  liveSamples: { current: { live: number[]; elapsedMs: number } };
  stopped: boolean;
  note: { durationMs: number; waveform: number[] } | null;
  color: ReturnType<typeof useColors>;
}) {
  const [dim, setDim] = useState(false);
  const [tick, setTick] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (stopped || reduceMotion) {
      setDim(false);
      return;
    }
    const timer = setInterval(() => setDim((d) => !d), 600);
    return () => clearInterval(timer);
  }, [stopped, reduceMotion]);
  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => setTick((n) => n + 1), SAMPLE_MS);
    return () => clearInterval(timer);
  }, [stopped]);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      stopped ? `Stopped, ${mmss(note?.durationMs ?? liveSamples.current.elapsedMs)}` : "Recording",
    );
    // Once per transition, which is what the two dependencies are.
  }, [stopped, note, liveSamples]);
  void tick;
  const live = stopped ? (note?.waveform.map((v) => v / 255) ?? []) : liveSamples.current.live;
  const elapsedMs = stopped ? (note?.durationMs ?? 0) : liveSamples.current.elapsedMs;
  return (
    <View
      className="flex-1 flex-row items-center gap-space-3"
      style={{ minHeight: 34, paddingVertical: 7 }}
      accessibilityRole="none"
    >
      {stopped ? null : (
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.danger, opacity: dim ? 0.35 : 1 }}
        />
      )}
      <Text
        className="font-core"
        style={{ fontSize: 12.5, color: color.iconOnWell, fontVariant: ["tabular-nums"] }}
      >
        {mmss(elapsedMs)}
      </Text>
      <View className="flex-1 flex-row items-center justify-end" style={{ height: 24, gap: 2, overflow: "hidden" }}>
        {live.map((h, at) => (
          <View
            key={at}
            style={{
              width: 3,
              borderRadius: 2,
              height: Math.max(3, Math.round(h * 24)),
              // The kit's pair: `--a-on` on Android, `--text-primary` elsewhere.
              backgroundColor: isAndroid ? color.tabOn : color.ink,
              opacity: 0.35 + 0.65 * (at / Math.max(1, live.length)),
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function Composer({
  placeholder,
  maxLength,
  showCounter,
  submitLabel = "Send",
}: {
  placeholder?: string | undefined;
  /** A `+`'s own cap, e.g. a note's 200. Absent for an ordinary dump, which
   *  has none. */
  maxLength?: number | undefined;
  /** Whether the cap is tight enough to want a running count while typing. */
  showCounter?: boolean | undefined;
  /** What the control that submits actually does. "Send" describes a dump;
   *  a `+`'s own write earns its own word. */
  submitLabel?: string;
}) {
  const COLOR = useColors();
  const {
    draft,
    setDraft,
    submit,
    pin,
    onScreen,
    openQuestion,
    photos,
    addPhotos,
    removePhoto,
    line,
    clearLine,
    offerPhoto: offerPhotoSheet,
    writing,
    focusRequest,
    recording,
    note,
    liveSamples,
    startRecording,
    discardRecording,
    mentionPeople,
    pickMention,
  } = useConversation();
  const holdsNote = !pin && (recording || note !== null);
  // 022. The @ list, while the draft ends in an @ token and not while a +
  // is pinned: a + is one line into a section, never a person.
  const mentionAt = pin || holdsNote ? null : mentionQuery(draft);
  const [sending, setSending] = useState(false);
  // 018. Precedence: a pinned `+` field is never taken over, then the open
  // question, then whatever the screen asked for, then the cycling set.
  const asked = !pin && openQuestion ? invitation(openQuestion) : null;
  const [height, setHeight] = useState(0);
  // The height of one line, as this platform reports it: Android counts the
  // field's padding into `contentSize` and iOS does not, so "taller than one
  // line" is measured against the first height seen rather than a number.
  // Before 020 a wrong answer here only rounded the corners; now it opens
  // the box, and an empty field on Android was opening it.
  const [oneLine, setOneLine] = useState<number | null>(null);
  const [which, setWhich] = useState(0);
  const field = useRef<TextInput>(null);

  // A `+` raises this with the keyboard down, which is two taps to type one
  // line. The inline fields this replaced all carried `autoFocus`, so pressing
  // + used to put the cursor in the field, and that is the whole of what a + is
  // for. Not on an ordinary dump: the composer is on screen at all times and a
  // keyboard that opens itself takes the page away from somebody who was
  // reading it.
  useEffect(() => {
    if (pin) field.current?.focus();
    // And put the keyboard away when the pin goes, whether it was written or
    // dismissed. A + is one line and then you are done; leaving the keyboard up
    // over the ordinary composer invites a dump nobody meant to send.
    else field.current?.blur();
  }, [pin]);

  // 020. A share from another app: the chips are in, the sheet is open, and
  // the words come next, so the field takes focus and the keyboard comes up.
  // A tick later, since the sheet may be mounting on the same frame; and not
  // before the app is in front, because a share arrives while the sharing
  // app still is, and a focus given then raises no keyboard.
  useEffect(() => {
    if (focusRequest === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sub: { remove: () => void } | null = null;
    const focus = () => {
      timer = setTimeout(() => field.current?.focus(), 50);
    };
    if (AppState.currentState === "active") focus();
    else {
      sub = AppState.addEventListener("change", (state) => {
        if (state !== "active") return;
        sub?.remove();
        sub = null;
        focus();
      });
    }
    return () => {
      if (timer) clearTimeout(timer);
      sub?.remove();
    };
  }, [focusRequest]);

  useEffect(() => {
    if (placeholder || asked || draft.length > 0) return;
    const timer = setInterval(() => setWhich((n) => (n + 1) % PLACEHOLDERS.length), 10_000);
    return () => clearInterval(timer);
  }, [placeholder, asked, draft.length]);

  // A pinned + writes one line into a section and never a photo: the chips
  // wait out of sight and come back with the ordinary composer.
  const chips = pin ? [] : photos;
  const has = draft.trim().length > 0 || chips.some((photo) => !photo.error) || holdsNote;
  const held = chips.some((photo) => photo.error);
  const tall = oneLine !== null && height > oneLine + 8;
  // 021. A recording alone keeps the pill, as the kit's does; words above
  // the row or chips beside it open the box.
  const expanded = tall || chips.length > 0 || (holdsNote && draft.trim().length > 0);

  // The product's own sheet on both phones, per the 21 September design:
  // the library first, since most pictures a person dumps already exist,
  // then the camera, and no Cancel row, since the scrim dismisses it. Drawn
  // by the shell, above the plate: raised inside this box it stayed inside
  // this box.
  function offerPhoto(): void {
    offerPhotoSheet();
  }

  async function send(): Promise<void> {
    setSending(true);
    try {
      await submit();
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="px-gutter-screen pb-space-5 pt-space-4">
      {mentionAt !== null && mentionPeople && mentionPeople.length > 0 ? (
        <MentionList people={mentionPeople} query={mentionAt} onPick={pickMention} />
      ) : null}
      {/* Where an ordinary dump will land, said once, above the field.
          Nothing while pinned: a `+` already says what it is adding to, in its
          own header and its own pill, and a third statement of the same thing
          is noise. Said rather than enforced, because the words in the field
          still win, which the prompt decides and not this. */}
      {!pin && onScreen ? (
        <Text
          className="mb-space-2 font-core text-text-tertiary"
          style={{ fontSize: 12.5 }}
          numberOfLines={1}
        >
          in thread {onScreen.name}
        </Text>
      ) : null}

      <View
        className={`${expanded ? "flex-col items-stretch" : "flex-row items-center"} gap-space-3 border border-border-focus px-space-6 ${
          expanded ? "rounded-lg" : "rounded-pill"
        } ${isAndroid ? "bg-a-c" : "bg-surface-input"}`}
        style={{ minHeight: 48, paddingRight: 6, paddingBottom: expanded ? 6 : 0 }}
      >
        {/* 021. The words typed before the microphone was pressed, drawn
            above the row as static text and sent with the note. */}
        {holdsNote && draft.trim().length > 0 ? (
          <Text
            className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 16, lineHeight: 22, paddingTop: 12 }}
            numberOfLines={3}
          >
            {draft}
          </Text>
        ) : null}
        {holdsNote ? (
          <>
            {recording ? <KeepAwake /> : null}
            <RecordingRow liveSamples={liveSamples} stopped={!recording} note={note} color={COLOR} />
          </>
        ) : (
        <TextInput
          ref={field}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={maxLength}
          placeholder={asked ?? placeholder ?? PLACEHOLDERS[which]}
          // The field's name stays put while the placeholder holds a question;
          // the question is announced through the conversation's own turns.
          accessibilityLabel="Dump anything"
          placeholderTextColor={COLOR.iconOnWell}
          onContentSizeChange={(event) => {
            const next = Math.min(event.nativeEvent.contentSize.height, MAX_HEIGHT);
            setOneLine((first) => (first === null ? next : Math.min(first, next)));
            setHeight(next);
          }}
          // Not `editable={false}` while a send is out: on Android the field
          // came back from that with its text drawn in nothing, present to
          // the screen reader and invisible to the eye. The send control is
          // what locks; the words typed meanwhile survive the send.
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 16, lineHeight: 22, paddingVertical: 12, maxHeight: MAX_HEIGHT }}
        />
        )}

        {/* 020. The chips, in the row with the controls, wrapping, as the kit
            draws them. Ten with the keyboard up is more than a phone should
            hold, so the row scrolls inside the composer's own cap. */}
        <View className={`flex-row items-center gap-space-2 ${expanded ? "" : "flex-none"}`}>
          {chips.length > 0 ? (
            <ScrollView
              horizontal={false}
              style={{ maxHeight: 96, flex: 1 }}
              contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
              keyboardShouldPersistTaps="handled"
            >
              {chips.map((photo) => (
                <AttachChip
                  key={photo.key}
                  name={photo.name}
                  error={photo.error}
                  disabled={sending || writing}
                  onRemove={() => removePhoto(photo.key)}
                />
              ))}
            </ScrollView>
          ) : null}
          <View className="ml-auto flex-row items-center gap-space-2">
            {/* The camera, not while a + is pinned: a + is a line of text.
                Nor while a note is in the row: the kit's recording state
                draws Discard and Send alone. */}
            {pin || holdsNote ? null : (
              <Pressable
                onPress={offerPhoto}
                disabled={sending || writing}
                hitSlop={5}
                accessibilityLabel="Add a photo"
                className="items-center justify-center rounded-pill"
                style={{ width: 34, height: 34 }}
              >
                <Glyph name="camera" size={17} color={COLOR.iconOnWell} />
              </Pressable>
            )}
            {/* 021. The microphone, live, in the kit's order; Discard in its
                place while a note is in the row. One voice note per message. */}
            {pin ? null : holdsNote ? (
              <Pressable
                onPress={() => void discardRecording()}
                disabled={sending}
                hitSlop={5}
                accessibilityLabel="Discard voice note"
                className="items-center justify-center rounded-pill"
                style={{ width: 34, height: 34 }}
              >
                <Glyph name="trash-2" size={17} color={COLOR.danger} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  // The field gives way to the row, so the keyboard drops
                  // first: a view removed under the keyboard does not
                  // reliably take it down on Android.
                  Keyboard.dismiss();
                  void startRecording();
                }}
                disabled={sending || writing}
                hitSlop={5}
                accessibilityLabel="Voice note"
                className="items-center justify-center rounded-pill"
                style={{ width: 34, height: 34 }}
              >
                <Glyph name="mic" size={17} color={COLOR.iconOnWell} />
              </Pressable>
            )}
            <Pressable
              onPress={() => void send()}
              disabled={!has || held || sending}
              accessibilityLabel={submitLabel}
              accessibilityState={{ busy: sending }}
              className={`items-center justify-center rounded-pill ${
                has && !held ? (isAndroid ? "bg-a-on" : "bg-surface-inverse") : "bg-surface-fill"
              }`}
              style={{ width: 34, height: 34, opacity: has && !held ? 1 : 0.55 }}
            >
              {sending ? (
                <ActivityIndicator size="small" color={COLOR.onSolid} />
              ) : (
                <Glyph name="arrow-up" size={17} color={has && !held ? COLOR.onSolid : COLOR.iconOnWell} />
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {line ? (
        <View className="mt-space-2 flex-row items-center gap-space-3" accessibilityLiveRegion="polite">
          <Text className="font-core text-text-danger" style={{ fontSize: 13 }}>
            {line.text}
          </Text>
          {/* 021. The way forward beside the line, when there is one. */}
          {line.action ? (
            <Pressable onPress={line.action.onPress} hitSlop={8}>
              <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13 }}>
                {line.action.label}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={clearLine} hitSlop={15} accessibilityLabel="Dismiss" className="ml-auto">
            <Glyph name="x" size={14} color={COLOR.iconOnWell} />
          </Pressable>
        </View>
      ) : null}

      {showCounter && maxLength ? (
        <Text
          className="mt-space-2 text-right font-core text-text-tertiary"
          style={{ fontSize: 12.5 }}
        >
          {draft.length}/{maxLength}
        </Text>
      ) : null}
    </View>
  );
}
