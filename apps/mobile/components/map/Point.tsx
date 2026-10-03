// 030. One point on a thread's map, on the phones: 20px, a 2.5px ring in
// paper, its label colours split down the middle, ink with no label; an event
// is a 5px-radius square; 28px with a 3px ring when picked. (16 and 24 in the
// exploration, larger on the owner's call of 2026-10-03.) The web's
// `PointDot`, as views, since a marker's children are drawn into its image.

import { View } from "react-native";
import { useColors } from "../../lib/colors";

export function PointDot({
  a,
  b,
  shape,
  picked,
}: {
  a: number | null;
  b: number | null;
  shape: "dot" | "square";
  picked: boolean;
}) {
  const COLOR = useColors();
  const first = COLOR.labels[a ?? 0]!;
  const second = b === null ? first : COLOR.labels[b]!;
  const size = picked ? 28 : 20;
  const radius = shape === "square" ? 5 : size / 2;
  return (
    // The shadow on the outer view and the clip on the inner one: a view that
    // clips its children clips its own shadow on iOS.
    <View style={{ width: size, height: size, borderRadius: radius, boxShadow: picked ? COLOR.shadowPointPicked : COLOR.shadowPoint }}>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          overflow: "hidden",
          borderRadius: radius,
          borderWidth: picked ? 3 : 2.5,
          borderColor: COLOR.paper,
        }}
      >
        <View style={{ flex: 1, backgroundColor: first }} />
        <View style={{ flex: 1, backgroundColor: second }} />
      </View>
    </View>
  );
}
