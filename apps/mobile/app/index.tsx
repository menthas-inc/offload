// Where the app opens.
//
// This file is the route at "/", so the first tab cannot also be an index: two
// files resolving to the same path is a conflict Expo Router reports at bundle
// time, and a route group does not add a segment to disambiguate them. The tab
// is "/today", which is also the name it already had on screen.
//
// It asks the server rather than reading a stored flag, because the two things
// that decide this both live there: whether the session is still good, and
// whether first run is finished. A cached answer to either is a screen that
// lies for as long as the cache does.
//
// It is also the holding screen, per the 21 September design: the native
// splash is the mark alone on the page, and no platform splash takes a
// spinner, so the app draws the same mark in the same place and lets a
// spinner fade in 64px under it at 1000ms. The native splash stays up until
// that moment, so a fast cold start never sees a handover at all, and a slow
// one sees it once, when the spinner is due anyway. The spinner is placed
// from the screen's centre and never sits in the centring flow: in the column
// its box would re-centre the mark by half its height plus the gap, and every
// cold start would blink.

import { useEffect, useRef, useState } from "react";
import { AppState, Image, Platform, Pressable, Text, View } from "react-native";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "nativewind";
import Animated, { FadeIn } from "react-native-reanimated";
import { getMe, lastRetryAfter, stillAsking } from "../lib/api";
import { claimDevice } from "../lib/device-data";
import { LAUNCH_COPY, failureOf, nextWait, type LaunchFailure } from "../lib/launch";
import { useColors } from "../lib/colors";
import { Spinner } from "../components/Spinner";

/** The mark's canvas, the width the native splash draws it at. */
const MARK = Platform.OS === "android" ? 192 : 216;
/** The spinner's centre, below the mark's box. */
const SPINNER_GAP = 64;
const SPINNER = 18;
/** 027. The failure's block starts this far under the mark's lower edge,
 *  where the kit's `LaunchHold` puts it. */
const FAILURE_GAP = 52;
const HOLD_MS = 1000;

const light = require("../assets/splash-mark.png");
const dark = require("../assets/splash-mark-dark.png");

export default function Index() {
  const router = useRouter();
  // 027. A tapped evening digest hands its day through launch to Today.
  const { day } = useLocalSearchParams<{ day?: string }>();
  const COLOR = useColors();
  const { colorScheme } = useColorScheme();
  const [holding, setHolding] = useState(false);
  // No answer came, so the screen holds and says which of two things is true.
  // Only a 401 sends anyone to the gate: on 2026-09-30 an edge outage showed
  // the Pixel the gate for nine minutes while its session was still good.
  // 027: offline or not answering, and it asks again on its own.
  const [failure, setFailure] = useState<LaunchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tries = useRef(0);
  // The screen's own height, so the spinner is placed from its centre and not
  // from a window that may or may not count the status bar.
  const [screen, setScreen] = useState(0);

  useEffect(() => {
    let live = true;

    void getMe()
      // Whose copy the phone holds is settled before the shell draws: another
      // account's goes first, and nothing of it reaches a screen.
      .then(async (me) => {
        if (typeof me === "object") await claimDevice(me.accountId);
        return me;
      })
      .then((me) => {
        if (!live) return;
        if (me === "signed-out") router.replace("/sign-in");
        else if (me === "unreachable") {
          // Held, not blank: a screen that never changes is indistinguishable
          // from a broken app, which cost an afternoon on a device once. The
          // gate is not the answer to that either, since it says signed out.
          setHolding(true);
          void SplashScreen.hideAsync();
          void Network.getNetworkStateAsync()
            .then((state) => state.isInternetReachable ?? state.isConnected ?? null)
            .catch(() => null)
            .then((online) => {
              if (live) setFailure(failureOf(online));
            });
        }
        // Not `needsFirstRun` alone. An account that finished first run before
        // there was a name to give still has one thing to answer, and it is
        // asked on the same screen rather than left for Settings to be found.
        else if (stillAsking(me)) router.replace("/welcome");
        else router.replace(day ? { pathname: "/today", params: { day } } : "/today");
      });

    // The handover, if the answer has not come by then.
    const timer = setTimeout(() => {
      if (!live) return;
      setHolding(true);
      void SplashScreen.hideAsync();
    }, HOLD_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [router, attempt, day]);

  const again = () => {
    tries.current += 1;
    setFailure(null);
    setAttempt((n) => n + 1);
  };

  // Offline: ask again the moment the network is back.
  useEffect(() => {
    if (failure !== "offline") return;
    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable ?? state.isConnected) again();
    });
    return () => subscription.remove();
  }, [failure]);

  // Not answering: ask again on the schedule, never sooner than the server
  // asked, and not at all while the app is in the background.
  useEffect(() => {
    if (failure !== "unanswered") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(again, nextWait(tries.current, lastRetryAfter()));
    };
    if (AppState.currentState === "active") arm();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") arm();
      else clearTimeout(timer);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [failure]);

  const below = screen / 2 + MARK / 2 + SPINNER_GAP;

  return (
    <View
      className="flex-1 items-center justify-center bg-surface-page"
      style={{ backgroundColor: COLOR.page }}
      onLayout={(event) => setScreen(event.nativeEvent.layout.height)}
    >
      <Image
        source={colorScheme === "dark" ? dark : light}
        style={{ width: MARK, height: MARK }}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      {failure && screen > 0 ? (
        // In the spinner's place and out of the centring flow, so the mark
        // never moves. Never danger red: neither state is the person's.
        <Animated.View
          entering={FadeIn.duration(280)}
          style={{ position: "absolute", top: screen / 2 + MARK / 2 + FAILURE_GAP, left: 24, right: 24 }}
          className="items-center gap-space-4"
          accessibilityLiveRegion="polite"
        >
          <View className="items-center gap-space-1">
            <Text
              className="text-center font-core font-semibold text-text-primary"
              style={{ fontSize: 17, lineHeight: 22 }}
              accessibilityRole="header"
            >
              {LAUNCH_COPY[failure].title}
            </Text>
            <Text className="text-center font-core text-text-secondary" style={{ fontSize: 14, lineHeight: 20 }}>
              {LAUNCH_COPY[failure].line}
            </Text>
          </View>
          <Pressable
            onPress={again}
            hitSlop={4}
            accessibilityRole="button"
            className="min-h-tap-min justify-center"
          >
            <View className="justify-center rounded-pill border border-border-strong px-space-6" style={{ minHeight: 36 }}>
              <Text className="font-core font-medium text-text-primary" style={{ fontSize: 14 }}>
                Try again
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : holding && screen > 0 ? (
        <Animated.View
          entering={FadeIn.duration(280)}
          style={{
            position: "absolute",
            top: below - SPINNER / 2,
            alignSelf: "center",
          }}
          accessibilityElementsHidden
        >
          <Spinner />
        </Animated.View>
      ) : null}
    </View>
  );
}
