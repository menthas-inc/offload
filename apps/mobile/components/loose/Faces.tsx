// 028. Who else is in a suggested thread, after its name: so the person sees
// who will see it before they tap. A 20px initials mark on the fill, the
// second overlapping the first, then the rest as a count. Smaller than the
// design system's Avatar, which stops at 28; a new mark, logged with the
// feature's divergences. Hidden from a screen reader, which hears the
// button's hint instead.

import { Platform, Text, View } from "react-native";
import { useColors } from "../../lib/colors";
import type { Face } from "../../lib/loose";

const isAndroid = Platform.OS === "android";
const SIZE = 20;

export function Faces({ faces, more }: { faces: Face[]; more: string | null }) {
  const COLOR = useColors();
  if (faces.length === 0) return null;
  return (
    <View
      className="flex-row items-center"
      style={{ flexShrink: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {faces.map((face, i) => (
        <View
          key={face.accountId}
          className={`items-center justify-center rounded-pill ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
          // Ringed in the button's own ground, so the overlap reads as two.
          style={{ width: SIZE, height: SIZE, marginLeft: i > 0 ? -6 : 0, borderWidth: 1.5, borderColor: COLOR.accentSoft }}
        >
          <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 8.5 }} numberOfLines={1}>
            {face.initials}
          </Text>
        </View>
      ))}
      {more ? (
        <Text className="ml-space-2 font-core text-text-secondary" style={{ fontSize: 12 }}>
          {more}
        </Text>
      ) : null}
    </View>
  );
}
