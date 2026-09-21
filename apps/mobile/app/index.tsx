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

import { useEffect, useState } from "react";
import { Image, Platform, View } from "react-native";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "nativewind";
import Animated, { FadeIn } from "react-native-reanimated";
import { getMe, stillAsking } from "../lib/api";
import { useColors } from "../lib/colors";
import { Spinner } from "../components/Spinner";

/** The mark's canvas, the width the native splash draws it at. */
const MARK = Platform.OS === "android" ? 192 : 216;
/** The spinner's centre, below the mark's box. */
const SPINNER_GAP = 64;
const SPINNER = 18;
const HOLD_MS = 1000;

const light = require("../assets/splash-mark.png");
const dark = require("../assets/splash-mark-dark.png");

export default function Index() {
  const router = useRouter();
  const COLOR = useColors();
  const { colorScheme } = useColorScheme();
  const [holding, setHolding] = useState(false);
  // The screen's own height, so the spinner is placed from its centre and not
  // from a window that may or may not count the status bar.
  const [screen, setScreen] = useState(0);

  useEffect(() => {
    let live = true;

    getMe()
      .then((me) => {
        if (!live) return;
        if (!me) router.replace("/sign-in");
        // Not `needsFirstRun` alone. An account that finished first run before
        // there was a name to give still has one thing to answer, and it is
        // asked on the same screen rather than left for Settings to be found.
        else router.replace(stillAsking(me) ? "/welcome" : "/today");
      })
      .catch(() => {
        // Could not tell. Show the gate rather than nothing.
        //
        // This used to hold here on the theory that a network failure is not a
        // signed-out state, which is true and was still the wrong behaviour: a
        // screen that never changes is indistinguishable from a broken app,
        // and the gate is both honest about what we know and somewhere a
        // person can act. It cost an afternoon on a device, showing a blank
        // screen while behaving exactly as written.
        if (live) router.replace("/sign-in");
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
  }, [router]);

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
      {holding && screen > 0 ? (
        <Animated.View
          entering={FadeIn.duration(280)}
          style={{
            position: "absolute",
            top: screen / 2 + MARK / 2 + SPINNER_GAP - SPINNER / 2,
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
