// Today on day one, from ui_kits/android_app/M3FirstRun.jsx.
//
// Not a zero and not an illustration of one: an invitation in offload's own
// voice, then three examples that fill the composer rather than submitting.
// The first thing that lands in an account should be something the person
// meant, not a sample.

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Logo } from "../Logo";
import { TempSignOut } from "../TempSignOut";
import { DAY_ONE_INVITATION, EXAMPLES } from "../../lib/gate";
import { COLOR } from "../../lib/colors";
import { useConversation } from "../shell/conversation-context";

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
  // The plate below holds the only composer now. An example fills it rather
  // than a second field on this screen, which is what the kit means by
  // "examples that fill the composer rather than submitting".
  const { setDraft } = useConversation();

  return (
    <SafeAreaView className="flex-1 bg-a-surface" edges={["top"]}>
      {/* Day one has no title: the wordmark is the bar, because there is
          nothing yet to name. */}
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
        <TempSignOut />
      </View>

      <ScrollView contentContainerClassName="px-gutter-screen pt-space-6 pb-space-8">
        <Text
          className="font-quiet text-a-on"
          style={{ fontSize: 17, lineHeight: 25.5 }}
        >
          {DAY_ONE_INVITATION}
        </Text>

        <View className="mt-space-7 gap-space-3">
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => setDraft(example)}
              className="min-h-tap-min flex-row items-center gap-space-4 rounded-a-lg  bg-a-c-low px-space-6 py-space-5"
            >
              <ArrowUp />
              <Text
                className="flex-1 font-core text-a-on-var"
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
