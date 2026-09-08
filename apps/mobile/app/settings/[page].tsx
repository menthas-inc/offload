// The settings pages, all three, one layout.
//
// From `SettingsDetail.jsx`, whose whole point is that ten pages cost one
// vocabulary rather than ten screens. Three exist here; the rest arrive with
// their features and cost a `PAGES` entry each.

import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Glyph } from "../../components/Glyph";
import { EditableRow, Group, Row } from "../../components/settings/Rows";
import { Segmented } from "../../components/settings/Segmented";
import { useColors } from "../../lib/colors";
import { saveName, useMe } from "../../lib/me";
import { setTheme, useTheme, THEMES, THEME_LABEL, type Theme } from "../../lib/appearance";

const isAndroid = Platform.OS === "android";

const WEB = process.env["EXPO_PUBLIC_WEB_URL"] ?? "https://offload.club";

const TITLES: Record<string, string> = {
  account: "My account",
  appearance: "Appearance",
  help: "Help and about",
};

export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const router = useRouter();
  const COLOR = useColors();
  const title = TITLES[page ?? ""] ?? "Settings";

  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 17 }}
        >
          {title}
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-gutter-screen pb-space-9 pt-space-2">
        {page === "account" ? <Account /> : null}
        {page === "appearance" ? <Appearance /> : null}
        {page === "help" ? <Help /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Who you are.
 *
 *  The kit also draws Phone, Password, a Plan group and a Delete account panel.
 *  Phone and Password go because this product is OAuth-only: there is no
 *  password to change and no phone stored, so both would be controls that do
 *  nothing. Plan goes because there are no plans, and inventing a tier on a
 *  settings screen is a product claim nobody has made. Deletion is specified in
 *  001 and not built, and a panel that does nothing is worse than its absence.
 *
 *  The email is not editable here. Changing one is an identity change with a
 *  verification flow behind it, not a text field. The name is, since 011. */
function Account() {
  const me = useMe();

  return (
    <Group label="Details">
      {/* `saveName` hands the identity it got back to every mounted `useMe`,
          so the settings index behind this screen moves with it, initials
          included. */}
      <EditableRow
        title="Name"
        value={me?.displayName ?? null}
        onSave={async (next) => (await saveName(next)) !== null}
      />
      <Row title="Email" value={me?.email} last />
    </Group>
  );
}

/** How it looks.
 *
 *  **A segmented control, not the kit's radio list.** `decisions.md`, "The
 *  design queue, applied", surface all, put the Settings Appearance page on
 *  `SegmentedControl`; the phone kits predate that answer exactly as the web
 *  one did.
 *
 *  **No text size here**, and that is structural rather than a preference: see
 *  `lib/appearance.ts`. */
function Appearance() {
  // The stored preference, not the resolved scheme. Switching Light to System
  // on a light device changes this and repaints nothing, which is exactly the
  // case a component reading the scheme would miss.
  const theme = useTheme();

  return (
    <>
      <View className="pt-space-5">
        <Text
          className={`px-space-1 pb-space-3 font-core font-medium ${
            isAndroid ? "text-a-on-var" : "text-text-tertiary"
          }`}
          style={{ fontSize: 12 }}
        >
          Theme
        </Text>
        <Segmented
          label="Theme"
          options={THEMES.map((value) => ({ value, label: THEME_LABEL[value] }))}
          value={theme}
          onChange={(next) => setTheme(next as Theme)}
        />
        <Text
          className={`px-space-1 pt-space-3 font-core ${
            isAndroid ? "text-a-on-var" : "text-text-secondary"
          }`}
          style={{ fontSize: 12.5, lineHeight: 17.5 }}
        >
          System follows whatever this device is set to.
        </Text>
      </View>
    </>
  );
}

/** What this is and where to read the rest.
 *
 *  The version comes from the build rather than a string typed here, which is
 *  the same rule every value on the index follows. */
function Help() {
  return (
    <Group>
      <Row title="Version" value={Constants.expoConfig?.version ?? "?"} />
      <Row
        title="Privacy policy"
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB}/privacy`)}
        last
      />
    </Group>
  );
}
