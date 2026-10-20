// The option a thread's layout is picked by, in Edit thread and New thread.
// From the design system's components/layout/LayoutTile.jsx (19 October 2026):
// six abstract marks saying how a layout arranges a page, never what is in this
// thread. Colours are token classes; geometry is the system's own drawing.

import { Pressable, Text, View } from "react-native";
import type { Layout } from "@offload/widgets";
import { LAYOUT_NAMES } from "@offload/widgets";

const SIZES = {
  sm: { w: 44, h: 54, p: 7, gap: 3, bar: 4, r: 9 },
  md: { w: 64, h: 78, p: 9, gap: 4, bar: 5, r: 11 },
} as const;

type Size = keyof typeof SIZES;

function Bar({ h, cls, flex }: { h: number; cls: string; flex?: boolean }) {
  return <View className={cls} style={{ height: h, borderRadius: 2, flex: flex ? 1 : undefined }} />;
}

function marks(layout: Layout, s: (typeof SIZES)[Size]) {
  const bar = (h: number = s.bar, cls = "bg-ink-300", flex = true) => <Bar h={h} cls={cls} flex={flex} />;
  const box = () => (
    <View className="border border-ink-400" style={{ width: s.bar + 2, height: s.bar + 2, borderRadius: 1 }} />
  );
  const dot = () => <View className="bg-ink-500" style={{ width: s.bar + 1, height: s.bar + 1, borderRadius: 9 }} />;
  const rows = (lead: () => React.ReactNode, n: number) =>
    Array.from({ length: n }, (_, i) => (
      <View key={i} className="flex-row items-center" style={{ gap: 3, marginBottom: s.gap }}>
        {lead()}
        {bar()}
      </View>
    ));

  if (layout === "todo") return <View>{rows(box, 4)}</View>;
  if (layout === "timeline") return <View>{rows(dot, 3)}</View>;
  if (layout === "events")
    return (
      <View style={{ gap: s.gap }}>
        {bar(s.bar * 2 + 2, "bg-ink-500", false)}
        {bar(s.bar * 2 + 2, "bg-ink-500", false)}
        <View className="border border-ink-300" style={{ height: s.bar * 2, borderRadius: 2 }} />
        <View className="border border-ink-300" style={{ height: s.bar * 2, borderRadius: 2 }} />
      </View>
    );
  if (layout === "gallery")
    return (
      <View className="flex-row flex-wrap" style={{ gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="bg-ink-400" style={{ width: (s.w - s.p * 2 - 3) / 2, height: s.bar * 3, borderRadius: 2 }} />
        ))}
      </View>
    );
  if (layout === "project")
    return (
      <View className="flex-row flex-wrap" style={{ gap: 2 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} className={i < 3 ? "bg-ink-500" : "bg-ink-300"} style={{ width: (s.w - s.p * 2 - 4) / 3, height: s.bar, borderRadius: 2 }} />
        ))}
      </View>
    );
  return (
    <View style={{ gap: s.gap }}>
      {bar(s.bar, "bg-ink-300", false)}
      {bar(s.bar * 3, "bg-ink-400", false)}
      {bar(s.bar, "bg-ink-300", false)}
      {bar(s.bar, "bg-ink-300", false)}
    </View>
  );
}

export function LayoutTile({
  layout,
  size = "md",
  selected = false,
  onPress,
}: {
  layout: Layout;
  size?: Size;
  selected?: boolean;
  onPress?: () => void;
}) {
  const s = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={LAYOUT_NAMES[layout]}
      accessibilityState={{ checked: selected }}
      className="items-center"
      style={{ gap: 6 }}
    >
      <View
        className={selected ? "bg-surface-raised border-2 border-text-primary" : "bg-surface-fill border border-border-hairline"}
        style={{ width: s.w, height: s.h, padding: s.p, borderRadius: s.r, justifyContent: "flex-start" }}
      >
        {marks(layout, s)}
      </View>
      <Text
        className={`font-core ${selected ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}`}
        style={{ fontSize: 12 }}
      >
        {LAYOUT_NAMES[layout]}
      </Text>
    </Pressable>
  );
}
