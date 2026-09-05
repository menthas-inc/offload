// A tab with nothing in it yet.
//
// From `ui_kits/mobile_app/FirstRun.jsx`'s `QuietEmpty`: the mark at low
// opacity, then one line in offload's own voice. Not a zero, not an
// illustration of one, and no control to press.

import { Platform, Text, View } from "react-native";
import { Logo } from "../Logo";

const isAndroid = Platform.OS === "android";

export function QuietEmpty({ line }: { line: string }) {
  return (
    <View className="flex-1 items-center justify-center px-gutter-screen">
      <View style={{ opacity: 0.22 }}>
        <Logo size={30} />
      </View>
      <Text
        className={`mt-space-5 text-center font-quiet ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 17, lineHeight: 25.5, maxWidth: 300 }}
      >
        {line}
      </Text>
    </View>
  );
}
