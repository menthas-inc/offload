// The shell.
//
// One tab exists so far. The bar is here rather than added later because the
// first tab is time-aware and its label changes on its own, which is easier to
// get right from the start than to retrofit around a screen that assumed a
// fixed title.

import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { resolved } from "@offload/tokens";

const light = resolved.light;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: light["text-primary"],
        tabBarInactiveTintColor: light["text-tertiary"],
        tabBarStyle: {
          backgroundColor: light["surface-raised"],
          borderTopColor: light["border-hairline"],
          // Material 3 chrome on Android is taller and unlabelled-on-inactive;
          // iOS keeps the platform bar. The height comes from the design system
          // either way rather than from a framework default.
          height: Platform.OS === "android" ? 72 : parseInt(light["tabbar-height"] ?? "64", 10),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
    </Tabs>
  );
}
