// Today on day one, from ui_kits/mobile_app/FirstRun.jsx.
//
// Not a zero and not an illustration of one: an invitation in offload's own
// voice, then three examples that fill the composer rather than submitting.
// The first thing that lands in an account should be something the person
// meant, not a sample.

import { useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Logo } from "../Logo";
import { TempSignOut } from "../TempSignOut";
import { DAY_ONE_INVITATION, EXAMPLES } from "../../lib/gate";
import { COLOR } from "../../lib/colors";

/** The same glyph as the examples, inverted for the solid button, rather than
 *  a literal text arrow that picks up the system font. */
function SendArrow() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke={COLOR.onSolid}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ArrowUp() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke={COLOR.accent}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function Today() {
  const [draft, setDraft] = useState("");
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  return (
    <SafeAreaView className="flex-1 bg-surface-page" edges={["top"]}>
      {/* Day one has no title: the wordmark is the bar, because there is
          nothing yet to name. */}
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
        <TempSignOut />
      </View>

      <ScrollView contentContainerClassName="px-gutter-screen pt-space-6 pb-space-8">
        <Text
          className="font-quiet text-text-primary"
          style={{ fontSize: 17, lineHeight: 25.5 }}
        >
          {DAY_ONE_INVITATION}
        </Text>

        <View className="mt-space-7 gap-space-3">
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => {
                setDraft(example);
                input.current?.focus();
              }}
              className="min-h-tap-min flex-row items-center gap-space-4 rounded-md border border-dashed border-border-strong bg-surface-raised px-space-6 py-space-5"
            >
              <ArrowUp />
              <Text
                className="flex-1 font-core text-text-secondary"
                style={{ fontSize: 15, lineHeight: 21 }}
              >
                {example}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* The composer never leaves an empty screen, because on every one of
          them the answer is to dump something. Nothing it accepts is wired up
          yet. */}
      <View className="px-gutter-screen pb-space-5">
        <View className="min-h-composer-height flex-row items-center rounded-pill border border-border-attention bg-surface-attention-soft pl-space-7 pr-space-4">
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Dump anything"
            className="min-h-tap-min flex-1 font-core text-body text-text-primary"
          />
          <Pressable
            disabled={draft.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Send"
            // Drawn at 40 and hit at 44. A control smaller than the minimum
            // needs the difference given back, not ignored.
            hitSlop={2}
            className="h-space-10 w-space-10 items-center justify-center rounded-pill bg-ink-950 disabled:bg-ink-200"
          >
            <SendArrow />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
