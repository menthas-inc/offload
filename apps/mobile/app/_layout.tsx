// The root stack.
//
// No header anywhere in here: every screen before the shell is full-bleed and
// carries its own way back, and the tabs bring their own chrome.

import "../global.css";
import { useEffect, useState } from "react";
import { useColorScheme } from "nativewind";
import { applyTheme, storedTheme } from "../lib/appearance";
import { useColors } from "../lib/colors";
import { AccessibilityInfo, Platform } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { onSessionRefused, pinExistingSession } from "../lib/auth";
import { ConversationProvider } from "../components/shell/conversation-context";
import { RecordArrival } from "../components/shell/RecordArrival";
import { Shell } from "../components/shell/Shell";
import { PlateInsetProvider } from "../components/shell/plate-inset";
import { ShareArrival } from "../components/shell/ShareArrival";

// The index route asks the server where to open and draws nothing while it
// waits, on the stated assumption that the splash is still up behind it. It
// was not: nothing held it, so a signed-out cold start showed the composer and
// the tabs over an empty page for as long as `/api/me` took, and only then the
// gate. Held here and let go once the router has left "/".
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {

  // Whatever Settings says, and light until it says anything.
  //
  // "A new account opens in light regardless of the device setting. Dark is a
  // choice in Settings" is a design decision, not a default, so an unset
  // preference is light rather than the device.
  //
  // **During the first render, not at module scope and not in an effect.**
  // Both were tried on a device. At module scope it runs before the app is
  // active and NativeWind never picks it up. In an effect it runs after the
  // first screen has already mounted, so the app launches light and only turns
  // dark once something navigates, which is worse than a frame: it looks
  // broken. A `useState` initialiser runs once, during this component's first
  // render, before any child mounts.
  useState(() => {
    applyTheme(storedTheme());
    return null;
  });

  // **The tree is keyed on the scheme, and it has to be.** Applying the theme
  // before any child mounts is not enough on its own: NativeWind does not
  // repaint a tree that is already rendering in the same pass, so the app
  // launched light with the store, the control and `useColorScheme()` all
  // saying dark, and only turned dark once something navigated. Keying the
  // navigator remounts it when the scheme changes, which is what makes both
  // the launch and the switch take effect. Found on a device after three
  // placements of the apply itself all failed the same way.
  //
  // The cost is a remount on theme change, which loses nothing worth keeping:
  // at launch there is no state yet, and changing your theme is not something
  // you do mid-thought.
  const { colorScheme } = useColorScheme();
  const COLOR = useColors();

  // Built from our tokens rather than taken from the library, because the two
  // disagree: its dark background is `rgb(1, 1, 1)` and ours is a warm ink.
  const navigationTheme = {
    ...(colorScheme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === "dark" ? DarkTheme : DefaultTheme).colors,
      background: COLOR.page,
    },
  };

  // Once, on launch. A session stored before the device-only class shipped
  // keeps the old one until something rewrites it, and nothing otherwise
  // would inside its thirty days.
  useEffect(() => {
    void pinExistingSession();
  }, []);

  // A session the server refused. The keys are already gone by the time this
  // fires; the shell's part is to show the gate, which decides the rest.
  useEffect(() => onSessionRefused(() => router.replace("/")), []);

  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/") void SplashScreen.hideAsync();
  }, [pathname]);

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
        {/* 020. A photo shared from another app lands in the composer. Above
            the router, like the conversation it lands in, and before the gate
            so a share while signed out waits in the draft behind it. */}
        <ShareArrival />
        {/* 021. Record, from a long press on the app icon: the recording row
            on whatever screen is up, once the gate has had its say. */}
        <RecordArrival />
        <SafeAreaProvider>
          <StatusBar style="auto" />
          {/* The ground every navigator fades through.
              
              **Every screen in a fade is briefly see-through, and what shows is
              this.** Nothing set it, so it stayed React Navigation's own
              `rgb(242, 242, 242)` in both themes, and switching tabs in dark
              flashed light grey. It is our own surface colour now rather than
              the library's near-black `rgb(1, 1, 1)`, so the ground under a
              transition is exactly the colour the screens paint: there is
              nothing to see through to, in either theme. */}
          <PlateInsetProvider>
          <ThemeProvider value={navigationTheme}>
          <Stack
            key={colorScheme}
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
          </ThemeProvider>
          {/* One plate for the whole app, deciding from the route what it
              holds. Mounted here so a thread pushing over the tabs does not
              produce a second one. */}
          <Shell />
          </PlateInsetProvider>
        </SafeAreaProvider>
        </ConversationProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
