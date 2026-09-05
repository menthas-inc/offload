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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { pinExistingSession } from "../lib/auth";

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

  // Once, on launch. A session stored before the device-only class shipped
  // keeps the old one until something rewrites it, and nothing otherwise
  // would inside its thirty days.
  useEffect(() => {
    void pinExistingSession();
  }, []);

  return (
    // Gesture handler wraps everything, and it has to be the outermost thing
    // here. Every swipe in the product depends on it, and without the root
    // view Android swipes silently fail to register or fight the navigator,
    // which is the confusing version of this bug rather than the obvious one.
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* The keyboard, once, rather than per screen. `KeyboardAvoidingView` is
          the thing that does not work on Android when an app is edge to edge,
          which this app is, and this repo has already shipped a form sitting
          underneath a keyboard learning that. */}
      <KeyboardProvider>
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
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
