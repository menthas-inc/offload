// The Memories tab, which has nothing in it yet and says so.
//
// The account-scope feature behind it needs person scope, a people table and
// compaction, none of which exists on any client. The tab is here rather than
// hidden and reintroduced, and the line is the kit's own.

import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "../Logo";
import { QuietEmpty } from "./QuietEmpty";

const isAndroid = Platform.OS === "android";

export default function Memories() {
  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
      </View>
      <QuietEmpty line="What offload learns about you collects here. Nothing is learned yet." />
    </SafeAreaView>
  );
}
