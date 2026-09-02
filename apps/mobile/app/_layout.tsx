// The root stack.
//
// No header anywhere in here: every screen before the shell is full-bleed and
// carries its own way back, and the tabs bring their own chrome.

import "../global.css";
import { useEffect } from "react";
import { colorScheme } from "nativewind";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  // Light, whatever the device says.
  //
  // "A new account opens in light regardless of the device setting. Dark is a
  // choice in Settings" is a design decision, not a default, and app.json's
  // userInterfaceStyle only governs native chrome. NativeWind follows the
  // system unless told otherwise, so on a phone in night mode the surfaces
  // went dark while the type stayed ink and the gate was black on charcoal.
  //
  // When Settings gains a theme choice, this reads it instead.
  useEffect(() => {
    colorScheme.set("light");
  }, []);

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
