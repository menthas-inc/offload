// The field, from ui_kits/mobile_app/Composer.jsx.
//
// **Return makes a new line and the button is the only submit.** The kit gates
// Enter-to-send on a physical keyboard and there is not one, so a phone that
// sent on Return would send half a thought every time somebody wanted a second
// line.
//
// **The camera is drawn since 020, the microphone still is not.** The kit has
// both, fully designed. A photo is a chip in the composer, the kit's
// `AttachChip`, sitting in the row with the controls and wrapping; the pill
// opens into a box when it holds any, as it does for a tall draft. The
// microphone waits for voice notes: a control that does nothing is worse on a
// phone than absent, because a phone is exactly where somebody expects it to
// work.

import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { invitation, MAX_PHOTOS } from "../../lib/dump";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { AttachChip } from "./AttachChip";
import { useConversation, type PickedPhoto } from "./conversation-context";

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
    writing,
    focusRequest,
  } = useConversation();
  const [sending, setSending] = useState(false);
  // 018. Precedence: a pinned `+` field is never taken over, then the open
  // question, then whatever the screen asked for, then the cycling set.
  const asked = !pin && openQuestion ? invitation(openQuestion) : null;
  const [height, setHeight] = useState(0);
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
  // A tick later, since the sheet may be mounting on the same frame.
  useEffect(() => {
    if (focusRequest === 0) return;
    const timer = setTimeout(() => field.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [focusRequest]);

  useEffect(() => {
    if (placeholder || asked || draft.length > 0) return;
    const timer = setInterval(() => setWhich((n) => (n + 1) % PLACEHOLDERS.length), 10_000);
    return () => clearInterval(timer);
  }, [placeholder, asked, draft.length]);

  // A pinned + writes one line into a section and never a photo: the chips
  // wait out of sight and come back with the ordinary composer.
  const chips = pin ? [] : photos;
  const has = draft.trim().length > 0 || chips.some((photo) => !photo.error);
  const held = chips.some((photo) => photo.error);
  const tall = height > 30;
  const expanded = tall || chips.length > 0;

  /** 020. The picker or the camera, in the platform's own sheet. The picker
   *  needs no permission on either platform; the camera does, and a refusal
   *  is the one line with the way to the settings beside it. */
  async function pick(from: "library" | "camera"): Promise<void> {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return addPhotos([]);
    let result: ImagePicker.ImagePickerResult;
    if (from === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera is off for offload.", undefined, [
          { text: "Not now", style: "cancel" },
          { text: "Open settings", onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: room,
        quality: 1,
      });
    }
    if (result.canceled) return;
    const picked: PickedPhoto[] = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? null,
      type: asset.mimeType ?? null,
      size: asset.fileSize ?? null,
    }));
    addPhotos(picked, "picker");
    field.current?.focus();
  }

  function offerPhoto(): void {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Choose from library", "Take a photo", "Cancel"], cancelButtonIndex: 2 },
        (index) => {
          if (index === 0) void pick("library");
          if (index === 1) void pick("camera");
        },
      );
    } else {
      Alert.alert("Add a photo", undefined, [
        { text: "Choose from library", onPress: () => void pick("library") },
        { text: "Take a photo", onPress: () => void pick("camera") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
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
          onContentSizeChange={(event) =>
            setHeight(Math.min(event.nativeEvent.contentSize.height, MAX_HEIGHT))
          }
          editable={!sending && !writing}
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 16, lineHeight: 22, paddingVertical: 12, maxHeight: MAX_HEIGHT }}
        />

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
            {/* The camera, not while a + is pinned: a + is a line of text. */}
            {pin ? null : (
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
          {line.retry ? (
            <Pressable onPress={() => void send()} hitSlop={14} accessibilityRole="button">
              <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13 }}>
                Retry
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
