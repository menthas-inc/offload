// The shell.
//
// One tab exists so far. The bar is here rather than added later because the
// first tab is time-aware and its label changes on its own, which is easier to
// get right from the start than to retrofit around a screen that assumed a
// fixed title.

import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { SunGlyph, MoonGlyph } from "../../components/Glyphs";
import { timeOfDay } from "../../lib/sun";
import { resolved, android as androidTokens } from "@offload/tokens";

const light = resolved.light;
// Material's own bar height and surface roles, generated from the Android
// kit's platform scope rather than typed here.
const m3 = androidTokens.light;
const isAndroid = Platform.OS === "android";

export default function TabsLayout() {
  const tod = timeOfDay();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isAndroid ? m3["a-on"] : light["text-primary"],
        tabBarInactiveTintColor: isAndroid ? m3["a-on-quiet"] : light["text-tertiary"],
        tabBarStyle: {
          backgroundColor: isAndroid ? m3["a-c-low"] : light["surface-raised"],
          borderTopColor: isAndroid ? m3["a-outline"] : light["border-hairline"],
          // Material's navigation bar is taller than the iOS tab bar. Both
          // numbers come from the design system rather than a framework
          // default.
          height: parseInt((isAndroid ? m3["row-height-lg"] : light["tabbar-height"]) ?? "64", 10),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      {/* Today until sunset, Tonight after, on the real curve rather than a
          fixed hour. Read once per mount: the bar does not need to flip the
          moment the sun sets, and a ticking timer to catch it would run all
          day for a label. Next launch has it right. */}
      <Tabs.Screen
        name="today"
        options={{
          title: tod.label,
          tabBarIcon: ({ color }) =>
            tod.icon === "moon" ? <MoonGlyph size={24} color={color} /> : <SunGlyph size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
