// The page behind a raised conversation (30 September 2026).
//
// **iOS: it recedes.** Scaled to 0.93 from its top edge, down 10 points, with
// a 14 point corner, over the dark ground, all on the sheet's own position so
// a finger moves it with the sheet. The status bar turns light for that dark
// ground while the conversation is up.
//
// **Android: it does not move.** The scrim dims it deeper instead. Scaling
// the whole navigator every frame is the likeliest dropped frame on a
// mid-range phone, a receded page would show the dark ground under dark
// status bar icons, and an M3 sheet dims. Reduced motion draws no recede on
// either.

import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { useAnimatedStyle, useReducedMotion } from "react-native-reanimated";
import { useColors } from "../../lib/colors";
import { progress, recede } from "../../lib/sheet";
import { useConversation } from "./conversation-context";

const isIOS = Platform.OS === "ios";

export function Recede({ children }: { children: ReactNode }) {
  const COLOR = useColors();
  const { sheetY, sheetTravel } = useConversation();
  const still = useReducedMotion();
  const moves = isIOS && !still;

  const page = useAnimatedStyle(() => {
    if (!moves) return {};
    const { scale, translateY, radius } = recede(progress(sheetY.value, sheetTravel.value));
    return { transform: [{ translateY }, { scale }], borderRadius: radius };
  });

  if (!moves) return <>{children}</>;
  return (
    // The dark ground that shows round the receded page: the scrim's own ink.
    <View style={{ flex: 1, backgroundColor: COLOR.scrim }}>
      <Animated.View
        style={[{ flex: 1, overflow: "hidden", transformOrigin: "top", backgroundColor: COLOR.page }, page]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export function SheetStatusBar() {
  const { raised } = useConversation();
  const still = useReducedMotion();
  return <StatusBar style={isIOS && raised && !still ? "light" : "auto"} animated />;
}
