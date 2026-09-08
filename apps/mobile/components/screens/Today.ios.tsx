// Today on day one, from ui_kits/mobile_app/FirstRun.jsx.
//
// Not a zero and not an illustration of one: an invitation in offload's own
// voice, then three examples that fill the composer rather than submitting.
// The first thing that lands in an account should be something the person
// meant, not a sample.

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { Logo } from "../Logo";
import { DAY_ONE_INVITATION, EXAMPLES } from "../../lib/gate";
import { useColors } from "../../lib/colors";
import { useConversation } from "../shell/conversation-context";

function ArrowUp() {
  const COLOR = useColors();
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
  // The plate below holds the only composer now. An example fills it rather
  // than a second field on this screen, which is what the kit means by
  // "examples that fill the composer rather than submitting".
  const { setDraft } = useConversation();
  const router = useRouter();
  const COLOR = useColors();

  return (
    <SafeAreaView className="flex-1 bg-surface-page" edges={["top"]}>
      {/* The bar the kit draws on day one: the wordmark, then notifications
          and settings. `DayOneBar` in `FirstRun.jsx` gives that order.

          **The bell is drawn and does nothing, deliberately.** It is this
          feature's one exception to its own rule against controls that do not
          work, and the reason is that the bar's shape should not move under
          somebody the day notifications land. It carries no unread dot,
          because there is nothing to be unread, and its accessible name says
          what it is rather than promising what it does. */}
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
        <View className="ml-auto flex-row items-center gap-space-5">
          <Glyph name="bell" size={21} color={COLOR.iconOnWell} />
          <Pressable
            onPress={() => router.push("/settings")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Glyph name="settings" size={21} color={COLOR.iconOnWell} />
          </Pressable>
        </View>
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
              onPress={() => setDraft(example)}
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
    </SafeAreaView>
  );
}
