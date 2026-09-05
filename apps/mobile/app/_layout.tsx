// The root stack.
//
// No header anywhere in here: every screen before the shell is full-bleed and
// carries its own way back, and the tabs bring their own chrome.

import "../global.css";
import { useEffect, useState } from "react";
import { colorScheme } from "nativewind";
import { AccessibilityInfo, Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { pinExistingSession } from "../lib/auth";
import { ConversationProvider } from "../components/shell/conversation-context";
import { Shell } from "../components/shell/Shell";

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

  // Reduced motion removes the movement rather than shortening it, which the
  // readme states for navigation as much as for anything else: no iOS push, no
  // shared axis. Read once and again whenever the setting changes, because
  // somebody turning it on mid-session means it now.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
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
        {/* Above the router, not inside the tabs.
            A conversation outlives every screen: you dump from My threads,
            walk into a thread while offload is still writing, and it is still
            yours. It lived in the tabs layout first, and a thread route sits
            outside that group, so opening one threw the moment the screen
            asked for it. */}
        <ConversationProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              // The gate fades: it is a sequence of full-bleed screens rather
              // than a hierarchy, so pushing them would claim a depth that is
              // not there.
              animation: reduceMotion ? "none" : "fade",
              contentStyle: { backgroundColor: "transparent" },
            }}
          >
            {/* Navigation motion belongs to the platform, and the readme is
                explicit about whose numbers: iOS pushes the whole screen in
                350ms, which is what `default` is on iOS, and Android uses
                Material's shared axis X at 300ms. A thread is a push into a
                hierarchy, unlike the gate above it. */}
            <Stack.Screen
              name="threads/[id]"
              options={{
                animation: reduceMotion
                  ? "none"
                  : Platform.OS === "ios"
                    ? "default"
                    : "slide_from_right",
                animationDuration: 300,
              }}
            />
          </Stack>
          {/* One plate for the whole app, deciding from the route what it
              holds. Mounted here so a thread pushing over the tabs does not
              produce a second one. */}
          <Shell />
        </SafeAreaProvider>
        </ConversationProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
