// The three tabs.
//
// The bar itself is not here: `M3App.jsx` draws one raised plate holding the
// folded conversation header, the composer and the tabs, and they move together
// when the keyboard comes up. So this supplies the routing and `Shell` supplies
// the chrome, once, above the router.

import { Platform } from "react-native";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // iOS cuts between tabs because UIKit does; Android fades through
        // between peers, which is Material's own rule for siblings at the same
        // level. Neither is a slide: tabs are peers, not a hierarchy.
        animation: Platform.OS === "android" ? "fade" : "none",
      }}
      tabBar={() => null}
    >
      <Tabs.Screen name="today" />
      <Tabs.Screen name="threads" />
      <Tabs.Screen name="notes" />
    </Tabs>
  );
}
