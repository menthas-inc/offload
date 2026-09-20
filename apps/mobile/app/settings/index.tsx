// Settings, the index.
//
// From `SettingsScreen.jsx`: the identity, then rows in labelled groups. Sign
// out sits with the name because that is what it acts on, which is where both
// phone kits put it.
//
// **Three rows, not the kit's ten.** The other seven have no feature behind
// them and the two that read as if they might, Conversations kept and Privacy,
// are the ones this feature explicitly refuses: one is retired and the other
// would be a switch making a claim nothing stores. The group labels stay
// because they are where the missing pages go, and adding a label later moves
// every row on the screen.
//
// The kit also draws a search field. It has ten rows; three do not need one.

import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Glyph } from "../../components/Glyph";
import { Group, Row } from "../../components/settings/Rows";
import { ToastHost, useToast } from "../../components/shell/Toast";
import { useColors } from "../../lib/colors";
import { useMe } from "../../lib/me";
import { useTheme, THEME_LABEL } from "../../lib/appearance";
import { signOut, SignOutFailed } from "../../lib/auth";
import { forgetPlayback } from "../../components/shell/SentVoice";

const isAndroid = Platform.OS === "android";

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const COLOR = useColors();
  const me = useMe();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);

  async function leave(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    try {
      await signOut();
      // Only now. Everything before this point could still have failed.
      // 021. And the device copies of any voice note being heard go with
      // the session.
      forgetPlayback();
      router.replace("/");
    } catch (error) {
      setLeaving(false);
      // What happened, and the way forward next to it. Not why: this cannot
      // see whether the network or the server was the problem and would be
      // wrong about it.
      toast.show(
        error instanceof SignOutFailed
          ? "That didn't go through."
          : "That didn't go through.",
        { label: "Try again", onPress: () => void leave() },
      );
    }
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Back"
        >
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 17 }}
        >
          Settings
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-gutter-screen pb-space-9 pt-space-4">
        {/* Nothing rather than a guess while it loads, and nothing if it
            failed: the rows below need no server, so a settings screen with no
            identity block still does its job. */}
        {me ? (
          <View className="flex-row items-center gap-space-4 pb-space-5">
            <View
              className={`items-center justify-center rounded-pill ${
                isAndroid ? "bg-a-c-high" : "bg-surface-fill"
              }`}
              style={{ width: 52, height: 52 }}
            >
              <Text
                className={`font-core font-medium ${
                  isAndroid ? "text-a-on-var" : "text-text-secondary"
                }`}
                style={{ fontSize: 17 }}
              >
                {/* `?` when the field is absent, which is what the server
                    itself returns for a name with nothing to derive from. Not
                    a second copy of the rule: a client that shipped ahead of
                    the server deploy would otherwise draw an empty disc. */}
                {me.initials || "?"}
              </Text>
            </View>

            <View className="flex-1">
              {me.displayName ? (
                <Text
                  className={`font-core font-semibold ${
                    isAndroid ? "text-a-on" : "text-text-primary"
                  }`}
                  style={{ fontSize: 21, letterSpacing: -0.2 }}
                  numberOfLines={1}
                >
                  {me.displayName}
                </Text>
              ) : null}
              <Text
                className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                style={{ fontSize: 14, marginTop: me.displayName ? 2 : 0 }}
                numberOfLines={1}
              >
                {me.email}
              </Text>
            </View>

            <Pressable
              onPress={() => void leave()}
              disabled={leaving}
              className={`flex-row items-center justify-center rounded-pill border px-space-5 ${
                isAndroid ? "border-a-outline" : "border-border-hairline"
              }`}
              style={{ height: 32, opacity: leaving ? 0.55 : 1 }}
              accessibilityRole="button"
            >
              {leaving ? (
                <ActivityIndicator size="small" color={COLOR.iconOnWell} />
              ) : (
                <Text
                  className={`font-core font-medium ${
                    isAndroid ? "text-a-on" : "text-text-primary"
                  }`}
                  style={{ fontSize: 13 }}
                >
                  Sign out
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <Group label="You">
          <Row
            icon="circle-dot"
            title="My account"
            value={me?.email}
            onPress={() => router.push("/settings/account")}
            last
          />
        </Group>

        <Group label="Reaching you">
          {/* The kit puts Connected apps here, beside Communication. That row
              is not built, so this group holds one thing rather than waiting
              for the other. */}
          <Row
            icon="link"
            title="Connected apps"
            onPress={() => router.push("/settings/apps")}
            last
          />
        </Group>

        <Group label="What offload does with it">
          {/* The kit's Privacy group holds "Let offload notice patterns" too.
              That row is not built, so this group holds the two that are. */}
          <Row
            icon="orbit"
            title="Reaching the web"
            onPress={() => router.push("/settings/privacy")}
            last
          />
        </Group>

        <Group label="The app">
          <Row
            icon="blend"
            title="Appearance"
            value={THEME_LABEL[theme]}
            onPress={() => router.push("/settings/appearance")}
          />
          <Row
            icon="compass"
            title="Help and about"
            value={Constants.expoConfig?.version ?? undefined}
            onPress={() => router.push("/settings/help")}
            last
          />
        </Group>
      </ScrollView>

      <ToastHost state={toast} />
    </SafeAreaView>
  );
}
