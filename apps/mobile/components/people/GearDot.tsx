// The gear in the app bar, with the one dot. 022.
//
// `IconButton`'s badge, as the design gives it: 8px clay inside a 1.5px
// paper ring at the glyph's top right corner. Only a connection request
// waiting for the viewer's answer dots anything; the count comes from
// `/api/me`, read on every focus so a request answered on My people is
// gone from here when the screen comes back.

import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { refreshMe, useMe } from "../../lib/me";

export function GearDot() {
  const router = useRouter();
  const COLOR = useColors();
  const me = useMe();
  // `useMe` reads once per mount and hears saves; a request answered on
  // another screen changes the count without one, so `/api/me` is asked
  // again on focus, which is the read every screen with a gear makes.
  useFocusEffect(
    useCallback(() => {
      void refreshMe();
    }, []),
  );
  const dot = (me?.requestsWaiting ?? 0) > 0;
  return (
    <Pressable
      onPress={() => router.push("/settings")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={dot ? "Settings, a request is waiting" : "Settings"}
    >
      <View>
        <Glyph name="settings" size={24} color={COLOR.iconOnWell} />
        {dot ? (
          <View
            className="absolute rounded-pill border-paper bg-clay-600"
            style={{ top: -2, right: -2, width: 11, height: 11, borderWidth: 1.5 }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
      </View>
    </Pressable>
  );
}
