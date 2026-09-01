// The root stack.
//
// No header anywhere in here: every screen before the shell is full-bleed and
// carries its own way back, and the tabs bring their own chrome.

import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          // The design's transition, not the platform default.
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </SafeAreaProvider>
  );
}
