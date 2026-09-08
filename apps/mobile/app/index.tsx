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

import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { getMe, stillAsking } from "../lib/api";

export default function Index() {
  const router = useRouter();

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

    return () => {
      live = false;
    };
  }, [router]);

  // The splash screen is still up behind this, so it is deliberately empty
  // rather than a second loading state layered on the first. Empty is only
  // safe because every path out of the effect above navigates somewhere.
  return <View className="flex-1 bg-surface-page" />;
}
