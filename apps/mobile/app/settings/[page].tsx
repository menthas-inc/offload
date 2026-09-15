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
import { Switch } from "../../components/settings/Switch";
import { useColors } from "../../lib/colors";
import { saveName, setWebAccess, useMe } from "../../lib/me";
import { useCalendars, updateCalendar } from "../../lib/calendars";
import { API_URL } from "../../lib/auth";
import {
  setTheme,
  setWeekStart,
  useTheme,
  useWeekStart,
  THEMES,
  THEME_LABEL,
  WEEK_STARTS,
  WEEK_START_LABEL,
  type Theme,
  type WeekStart,
} from "../../lib/appearance";
import { useState } from "react";

const isAndroid = Platform.OS === "android";

const WEB = process.env["EXPO_PUBLIC_WEB_URL"] ?? "https://offload.club";

const TITLES: Record<string, string> = {
  apps: "Connected apps",
  account: "My account",
  appearance: "Appearance",
  privacy: "Privacy",
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
          {title}
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-gutter-screen pb-space-9 pt-space-2">
        {page === "apps" ? <Apps /> : null}
        {page === "account" ? <Account /> : null}
        {page === "appearance" ? <Appearance /> : null}
        {page === "privacy" ? <Privacy /> : null}
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
  const weekStart = useWeekStart();

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
          options={THEMES.map((value) => ({
            value,
            label: THEME_LABEL[value],
          }))}
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

      <View className="pt-space-7">
        <Text
          className={`px-space-1 pb-space-3 font-core font-medium ${
            isAndroid ? "text-a-on-var" : "text-text-tertiary"
          }`}
          style={{ fontSize: 12 }}
        >
          Week starts on
        </Text>
        <Segmented
          label="Week starts on"
          options={WEEK_STARTS.map((value) => ({ value, label: WEEK_START_LABEL[value] }))}
          value={weekStart}
          onChange={(next) => setWeekStart(next as WeekStart)}
        />
        <Text
          className={`px-space-1 pt-space-3 font-core ${
            isAndroid ? "text-a-on-var" : "text-text-secondary"
          }`}
          style={{ fontSize: 12.5, lineHeight: 17.5 }}
        >
          Which day a thread&apos;s timeline begins its weeks on.
        </Text>
      </View>
    </>
  );
}

/** Whether offload may reach the web, 016.
 *
 *  **Two switches rather than one**, because they are two different promises. A
 *  search sends words somebody wrote to a search company; opening a link they
 *  pasted sends nothing of theirs anywhere and only fetches something they
 *  already chose. Somebody can reasonably want the second without the first,
 *  and collapsing them makes the quieter one impossible to have on its own.
 *
 *  **The notes carry the weight the default no longer does.** Both default on,
 *  which inverts the line this product draws elsewhere for content leaving
 *  offload, so the first clause of each note is what leaves and the second is
 *  the bound on it. No "Off by default" label: that label exists to explain why
 *  something is off, and one saying a switch is on reads as an apology for it. */
function Privacy() {
  const me = useMe();
  // Optimistic, and reverted by the broadcast if the write fails: a switch that
  // waits for a round trip to move reads as a switch that did not work.
  const [pending, setPending] = useState<{ webSearch?: boolean; webLinks?: boolean }>({});

  const search = pending.webSearch ?? me?.webSearch ?? true;
  const links = pending.webLinks ?? me?.webLinks ?? true;

  async function set(patch: { webSearch?: boolean; webLinks?: boolean }) {
    setPending((current) => ({ ...current, ...patch }));
    const updated = await setWebAccess(patch);
    if (!updated) setPending({});
  }

  return (
    <Group label="What offload does with it">
      <Toggle
        title="Search the web"
        note="Sends the words you dumped to a search company when offload can't answer from your threads. Your threads and notes are never sent."
        value={search}
        onChange={(next) => void set({ webSearch: next })}
      />
      <Toggle
        title="Read links I paste"
        note="Opens a link you dumped and reads the page. Nothing of yours is sent."
        value={links}
        onChange={(next) => void set({ webLinks: next })}
        last
      />
    </Group>
  );
}

/** A row whose control is a switch.
 *
 *  The platform's own, rather than a hand-drawn track: it is the control both
 *  phones already use everywhere else, it is the one that announces itself
 *  correctly, and the design system's 44 by 26 with an inverse on-state is what
 *  `trackColor` expresses. */
function Toggle({
  title,
  note,
  value,
  onChange,
  last,
}: {
  title: string;
  note: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      className={`gap-space-2 py-space-4 ${last ? "" : "border-b border-border-hairline"}`}
    >
      <View className="min-h-tap-min flex-row items-center gap-space-4">
        <Text
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 15.5 }}
        >
          {title}
        </Text>
        <Switch checked={value} onChange={onChange} label={title} />
      </View>
      <Text
        className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
        style={{ fontSize: 12.5, lineHeight: 17.5 }}
      >
        {note}
      </Text>
    </View>
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

/** Connected apps.
 *
 *  **The kit draws four and one of them works.** The other three stay listed
 *  and say they are not built, because knowing what is coming is worth more
 *  than a page with one row on it.
 *
 *  Connecting leaves for Google's consent screen in the system browser, which
 *  is the same round trip signing in already makes. */
function Apps() {
  const { loading, available, connections, reload } = useCalendars();
  const [busy, setBusy] = useState<string | null>(null);

  async function change(
    id: string,
    patch: Parameters<typeof updateCalendar>[1],
  ) {
    setBusy(id);
    const ok = await updateCalendar(id, patch);
    setBusy(null);
    if (ok) reload();
  }

  return (
    <>
      {loading ? null : !available ? (
        <Group label="Calendar">
          {/* Not a failure and not a promise. What is true. */}
          <Row title="Calendar" note="Not available yet." last />
        </Group>
      ) : connections.length === 0 ? (
        <Group label="Calendar">
          <Row
            title="Google Calendar"
            note="See your week in offload, and let it add things for you."
            value="Connect"
            onPress={() =>
              void WebBrowser.openAuthSessionAsync(
                `${API_URL}/api/connectors/google/start?landing=settings`,
                `${WEB}/settings/apps`,
              ).then(reload)
            }
            last
          />
        </Group>
      ) : (
        connections.map((connection) => (
          <Group key={connection.id} label={connection.email}>
            {connection.state === "needs_reauth" ? (
              <Row
                title="Sign in again"
                note="offload lost access to this account."
                value="Reconnect"
                onPress={() =>
                  void WebBrowser.openAuthSessionAsync(
                    `${API_URL}/api/connectors/google/start?landing=settings`,
                    `${WEB}/settings/apps`,
                  ).then(reload)
                }
              />
            ) : null}

            {connection.calendars.map((calendar, index) => (
              <Row
                key={calendar.id}
                title={calendar.summary}
                note={
                  calendar.writable
                    ? calendar.isShared
                      ? "Other people see this one."
                      : "Only you see this one."
                    : "You can only read this one."
                }
                value={
                  busy === calendar.id
                    ? "Saving"
                    : calendar.selected
                      ? "On"
                      : "Off"
                }
                // Turning one on needs a thread, which is a choice this screen
                // cannot make. Off is always available.
                onPress={
                  calendar.selected
                    ? () => void change(calendar.id, { selected: false })
                    : calendar.threadId
                      ? () => void change(calendar.id, { selected: true })
                      : undefined
                }
                last={index === connection.calendars.length - 1}
              />
            ))}
          </Group>
        ))
      )}

      <Group label="Not built yet">
        <Row title="Mail" note="So a confirmation files itself." />
        <Row title="Browser" note="Save a page straight into a thread." />
        <Row
          title="Photos"
          note="Screenshots become things you can search."
          last
        />
      </Group>

      <Group label="What offload may do">
        <Row
          title="It writes to your calendar when you ask"
          note="It never sends mail or deletes photos. When a change would reach somebody else, it asks first."
          last
        />
      </Group>
    </>
  );
}
