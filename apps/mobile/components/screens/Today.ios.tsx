// Today on day one, from ui_kits/mobile_app/FirstRun.jsx.
//
// Not a zero and not an illustration of one: an invitation in offload's own
// voice, then three examples that fill the composer rather than submitting.
// The first thing that lands in an account should be something the person
// meant, not a sample.

import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedScrollHandler } from "react-native-reanimated";
import { prismShift, PRISM_SCROLL_FACTOR } from "../../lib/prism-scroll";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { GearDot } from "../people/GearDot";
import { Logo } from "../Logo";
import { DAY_ONE_INVITATION, EXAMPLES } from "../../lib/gate";
import { useColors } from "../../lib/colors";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useConversation } from "../shell/conversation-context";
import { PlateSpace } from "../shell/plate-inset";
import { ZoneStrip } from "../shell/ZoneStrip";
import { BellDot } from "../shell/BellDot";
import { TodayAgenda } from "./TodayAgenda";
import { isQuiet, loadAgenda, type Agenda } from "../../lib/agenda";
import { register } from "../../lib/notifications";

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
  // The field behind the plate slides against this list. On the UI thread, so
  // it never crosses to JS and never waits on a render.
  const onScroll = useAnimatedScrollHandler((event) => {
    prismShift.value = event.contentOffset.y * PRISM_SCROLL_FACTOR;
  });

  // The plate below holds the only composer now. An example fills it rather
  // than a second field on this screen, which is what the kit means by
  // "examples that fill the composer rather than submitting".
  const { setDraft } = useConversation();
  const COLOR = useColors();

  // 024. The agenda, asked for on every focus, and the token registered
  // whenever Today shows: the permission may have been granted since launch.
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const reload = useCallback(() => {
    void loadAgenda().then((next) => {
      if (next) setAgenda(next);
    });
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      void register();
    }, [reload]),
  );

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
          {/* 024. The bell opens Activity and carries its own dot. */}
          <BellDot />
          {/* 022. The gear carries a request's dot. */}
          <GearDot />
        </View>
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="px-gutter-screen pt-space-6 pb-space-8"
      >
        {/* 023. The one place this phone's own zone appears. */}
        <ZoneStrip />
        {agenda === null ? (
          <View className="items-center py-space-8">
            <ActivityIndicator color={COLOR.iconOnWell} />
          </View>
        ) : !isQuiet(agenda) ? (
          <TodayAgenda agenda={agenda} onChanged={reload} />
        ) : agenda.everDumped ? (
          <Text className="font-quiet text-text-primary" style={{ fontSize: 17, lineHeight: 25.5 }}>
            Nothing due today.
          </Text>
        ) : (
          <>
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
          </>
        )}
        <PlateSpace />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
