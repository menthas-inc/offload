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

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { zoneCity } from "@offload/widgets";
import { Glyph } from "../../components/Glyph";
import { Group, Row, Sections } from "../../components/settings/Rows";
import { useCalendars } from "../../lib/calendars";
import { appsValue } from "../../lib/settings";
import { ToastHost, useToast } from "../../components/shell/Toast";
import { useColors } from "../../lib/colors";
import { refreshMe, useMe } from "../../lib/me";
import { answerRequest, fetchPeople, type PeoplePage } from "../../lib/people";
import { Avatar } from "../../components/Avatar";
import { RequestCard } from "../../components/people/RequestCard";
import { useTheme, THEME_LABEL } from "../../lib/appearance";
import { useSignOut } from "../../components/settings/useSignOut";

const isAndroid = Platform.OS === "android";

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const COLOR = useColors();
  const me = useMe();
  // 022. The cards and the count, read on every focus: a request answered on
  // My people is gone from here when the screen comes back.
  const [people, setPeople] = useState<PeoplePage | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void fetchPeople().then((page) => {
        if (live && page) setPeople(page);
      });
      return () => {
        live = false;
      };
    }, []),
  );
  async function answerCard(requestId: string, answer: "accept" | "dismiss"): Promise<boolean> {
    const ok = await answerRequest(requestId, answer);
    if (ok) {
      setPeople(await fetchPeople());
      void refreshMe();
    }
    return ok;
  }
  // 031. What Connected apps has connected, as its value. On focus, since
  // the page under it connects and disconnects.
  const calendars = useCalendars();
  useFocusEffect(useCallback(calendars.reload, [calendars.reload]));
  const toast = useToast();
  const { leaving, leave } = useSignOut(toast);

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
            {/* 022. The viewer's own mark, at the person page's 52. `?` when
                the field is absent, which is what the server itself returns
                for a name with nothing to derive from. */}
            <Avatar uid={me.accountId} initials={me.initials || "?"} name={me.displayName ?? undefined} size={52} />

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

        {/* 022. A request waiting for an answer sits above everything, and
            is answered here. Nowhere else but My people lists it. */}
        {people?.requestsForYou.map((card) => (
          <RequestCard key={card.id} card={card} onAnswer={(answer) => answerCard(card.id, answer)} />
        ))}

        <Sections>
        <Group label="You" icon="circle-dot">
          <Row
            icon="circle-dot"
            title="My account"
            value={me?.email}
            onPress={() => router.push("/settings/account")}
          />
          {/* 022. The count as the value when there is one, no value at zero,
              and the dot when a request needs answering. Sits in You, beside
              My account: your people are yours, not a service you authorised. */}
          <Row
            icon="users"
            title="My people"
            value={people && people.count > 0 ? String(people.count) : undefined}
            badge={(me?.requestsWaiting ?? 0) > 0}
            onPress={() => router.push("/settings/people")}
            last
          />
        </Group>

        <Group label="Reaching you" icon="bell">
          {/* 024. Notifications, where the kit drew Communication. */}
          <Row
            icon="bell"
            title="Notifications"
            onPress={() => router.push("/settings/notifications")}
          />
          <Row
            icon="link"
            title="Connected apps"
            value={appsValue({
              calendar: calendars.connections.length > 0,
              mail: me?.mailAvailable ?? false,
            })}
            onPress={() => router.push("/settings/apps")}
            last
          />
        </Group>

        <Group label="What offload does with it" icon="lock">
          {/* The kit's Privacy group holds "Let offload notice patterns" too.
              That row is not built, so this group holds the two that are. */}
          <Row
            icon="orbit"
            title="Reaching the web"
            onPress={() => router.push("/settings/privacy")}
            last
          />
        </Group>

        <Group label="The app" icon="sliders-horizontal">
          {/* 023. The account's clock, as a city. Nothing until a device has
              named one. */}
          <Row
            icon="clock"
            title="Date and time"
            value={me?.timeZone ? zoneCity(me.timeZone) : undefined}
            onPress={() => router.push("/settings/datetime")}
          />
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
        </Sections>
      </ScrollView>

      <ToastHost state={toast} />
    </SafeAreaView>
  );
}
