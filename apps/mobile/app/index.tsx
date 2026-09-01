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
import { getMe } from "../lib/api";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let live = true;
    getMe()
      .then((me) => {
        if (!live) return;
        if (!me) router.replace("/sign-in");
        else router.replace(me.needsFirstRun ? "/welcome" : "/today");
      })
      .catch(() => {
        // A network failure is not a signed-out state. Holding here and
        // letting a retry happen beats bouncing someone to the gate because
        // their train went into a tunnel.
      });
    return () => {
      live = false;
    };
  }, [router]);

  // The splash screen is still up behind this, so it is deliberately empty
  // rather than a second loading state layered on the first.
  return <View className="flex-1 bg-surface-page" />;
}
