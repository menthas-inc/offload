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
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { onSignedOut, pinExistingSession } from "../lib/auth";
// Listening from launch for the end of a session, to forget what the phone
// kept of the account. Before anything can sign out.
import { claimDevice } from "../lib/device-data";
import { getMe } from "../lib/api";
import { ConversationProvider } from "../components/shell/conversation-context";
import { Recede, SheetStatusBar } from "../components/shell/Recede";
import { RecordArrival } from "../components/shell/RecordArrival";
import { Shell } from "../components/shell/Shell";
import { PlateInsetProvider } from "../components/shell/plate-inset";
import { ShareArrival } from "../components/shell/ShareArrival";
import * as Notifications from "expo-notifications";
import { prepare, register, respond } from "../lib/notifications";

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

  const router = useRouter();

  // Whose copy the phone holds, settled from here as well as from the index
  // route: a cold launch from a notification, a share or a link can open
  // another route, and the index route never runs. Both ask in one frame and
  // share the answer and the claim.
  useEffect(() => {
    void getMe().then((me) => {
      if (typeof me === "object") void claimDevice(me.accountId);
    });
  }, []);

  // **A session ended on this phone: signed out, deleted, refused by the
  // server, or another account found under the stamp.** The keys and the
  // phone's copy are already gone by the time this hears it. The conversation
  // lives above the router, so going to the gate never reached it, and on
  // 2026-10-11 an iPhone showed the next account the last one's turns, chips
  // and a photo. Counting the ends and keying the provider on the count starts
  // it, and every screen under it, again empty (009 AC-32b).
  const [ends, setEnds] = useState(0);
  useEffect(() => onSignedOut(() => setEnds((n) => n + 1)), []);

  // Then the gate, from here and only here: after the new tree has mounted,
  // since this parent's effect runs after its children's, so the navigation
  // is never sent to a navigator that is being replaced. Nothing stays under
  // the gate either: the stack goes down to one screen and that one is
  // replaced.
  useEffect(() => {
    if (ends === 0) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  }, [ends, router]);

  // 024. The categories and channels once per launch, then the token when
  // permission was granted, then whatever notification opened the app and
  // every response while it runs. A verb acts without opening a screen; a
  // tap opens the screen its kind names, from the table in the lib.
  useEffect(() => {
    const open = (route: { pathname: string; params?: Record<string, string> }) =>
      router.push(route as never);
    void prepare().then(() => register());
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void respond(response, open);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void respond(response, open);
    });
    return () => subscription.remove();
  }, [router]);

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
        <ConversationProvider key={ends}>
        {/* 020. A photo shared from another app lands in the composer. Above
            the router, like the conversation it lands in, and before the gate
            so a share while signed out waits in the draft behind it. */}
        <ShareArrival />
        {/* 021. Record, from a long press on the app icon: the recording row
            on whatever screen is up, once the gate has had its say. */}
        <RecordArrival />
        <SafeAreaProvider>
          <SheetStatusBar />
          {/* The ground every navigator fades through.
              
              **Every screen in a fade is briefly see-through, and what shows is
              this.** Nothing set it, so it stayed React Navigation's own
              `rgb(242, 242, 242)` in both themes, and switching tabs in dark
              flashed light grey. It is our own surface colour now rather than
              the library's near-black `rgb(1, 1, 1)`, so the ground under a
              transition is exactly the colour the screens paint: there is
              nothing to see through to, in either theme. */}
          <PlateInsetProvider>
          {/* On iOS the page steps back under a raised conversation. */}
          <Recede>
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
            {/* 028. Not in a thread is a push into My threads, as a thread is. */}
            <Stack.Screen
              name="threads/loose"
              options={{
                animation: reduceMotion
                  ? "none"
                  : Platform.OS === "ios"
                    ? "default"
                    : "slide_from_right",
                animationDuration: 300,
              }}
            />
            {/* 031. See the tutorial again, over Help, closed back to it. */}
            <Stack.Screen
              name="tutorial"
              options={{ presentation: "modal", animation: reduceMotion ? "none" : "default" }}
            />
          </Stack>
          </ThemeProvider>
          </Recede>
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
