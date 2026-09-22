// The bell on Today, a control at last. 024.
//
// Drawn and doing nothing since day one, so the bar's shape would not move
// under somebody the day notifications landed. It opens Activity now, and
// carries a dot, never a count, when a row is newer than the last opening.
// Every kind dots it except a connection request, which keeps 022's gear dot
// and dots nothing else.

import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { refreshMe, useMe } from "../../lib/me";

export function BellDot() {
  const router = useRouter();
  const COLOR = useColors();
  const me = useMe();
  // Asked again on focus, as the gear does: Activity opened on this phone
  // clears the dot without a save.
  useFocusEffect(
    useCallback(() => {
      void refreshMe();
    }, []),
  );
  const dot = me?.activityUnread === true;
  return (
    <Pressable
      // The route exists in `app/`; the generated route types catch up on the
      // next Metro start, which is why the string is widened here.
      onPress={() => router.push("/activity" as never)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={dot ? "Activity, something new" : "Activity"}
    >
      <View>
        <Glyph name="bell" size={21} color={COLOR.iconOnWell} />
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
