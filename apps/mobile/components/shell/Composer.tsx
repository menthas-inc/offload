// The field, from ui_kits/mobile_app/Composer.jsx.
//
// **Return makes a new line and the button is the only submit.** The kit gates
// Enter-to-send on a physical keyboard and there is not one, so a phone that
// sent on Return would send half a thought every time somebody wanted a second
// line.
//
// **The camera and the microphone are not drawn.** The kit has both, fully
// designed, and attachments are out: they need blobs, upload and transcription,
// none of which is built. A control that does nothing is worse on a phone than
// absent, because a phone is exactly where somebody expects both to work.

import { useEffect, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { Glyph } from "../Glyph";
import { COLOR } from "../../lib/colors";
import { useConversation } from "./conversation-context";

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

export function Composer({ placeholder }: { placeholder?: string | undefined }) {
  const { draft, setDraft, submit } = useConversation();
  const [height, setHeight] = useState(0);
  const [which, setWhich] = useState(0);

  useEffect(() => {
    if (placeholder || draft.length > 0) return;
    const timer = setInterval(() => setWhich((n) => (n + 1) % PLACEHOLDERS.length), 10_000);
    return () => clearInterval(timer);
  }, [placeholder, draft.length]);

  const has = draft.trim().length > 0;
  const tall = height > 30;

  return (
    <View className="px-gutter-screen pb-space-5 pt-space-4">
      <View
        className={`flex-row items-center gap-space-3 border border-border-focus px-space-6 ${
          tall ? "rounded-lg" : "rounded-pill"
        } ${isAndroid ? "bg-a-c" : "bg-surface-input"}`}
        style={{ minHeight: 48, paddingRight: 6 }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={placeholder ?? PLACEHOLDERS[which]}
          placeholderTextColor={COLOR.iconOnWell}
          onContentSizeChange={(event) =>
            setHeight(Math.min(event.nativeEvent.contentSize.height, MAX_HEIGHT))
          }
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 16, lineHeight: 22, paddingVertical: 12, maxHeight: MAX_HEIGHT }}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={!has}
          accessibilityLabel="Send"
          className={`items-center justify-center rounded-pill ${
            has ? (isAndroid ? "bg-a-on" : "bg-surface-inverse") : "bg-surface-fill"
          }`}
          style={{ width: 34, height: 34, opacity: has ? 1 : 0.55 }}
        >
          <Glyph name="arrow-up" size={17} color={has ? COLOR.onSolid : COLOR.iconOnWell} />
        </Pressable>
      </View>
    </View>
  );
}
