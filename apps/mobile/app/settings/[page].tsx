// The settings pages, all three, one layout.
//
// From `SettingsDetail.jsx`, whose whole point is that ten pages cost one
// vocabulary rather than ten screens. Three exist here; the rest arrive with
// their features and cost a `PAGES` entry each.

import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Glyph } from "../../components/Glyph";
import { EditableRow, Group, Row } from "../../components/settings/Rows";
import { Segmented } from "../../components/settings/Segmented";
import { Switch } from "../../components/settings/Switch";
import { ToastHost, useToast, type ToastState } from "../../components/shell/Toast";
import { useColors } from "../../lib/colors";
import { endSignedIn, listSignedIn, type SignedIn } from "../../lib/sessions";
import { fetchCountries, saveName, setClock, setCountry, setWebAccess, useMe } from "../../lib/me";
import { approveCalendar, disconnect, setAskFirst, useCalendars } from "../../lib/calendars";
import { CalendarRow } from "../../components/settings/CalendarRow";
import { ConnectButton, ConnectStepBody, ProviderMark } from "../../components/ConnectStep";
import { RowActionSheet } from "../../components/shell/RowActionSheet";
import { BlockedPage, PeoplePage } from "../../components/people/PeoplePage";
import { googleCalendarMark } from "../../lib/brands";
import { CONNECT_STEP } from "../../lib/gate";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { modernZoneName, zoneCity, zonesByRegion } from "@offload/widgets";

const isAndroid = Platform.OS === "android";

const WEB = process.env["EXPO_PUBLIC_WEB_URL"] ?? "https://offload.club";

const TITLES: Record<string, string> = {
  apps: "Connected apps",
  calendar: "Calendar",
  account: "My account",
  appearance: "Appearance",
  datetime: "Date and time",
  timezone: "Time zone",
  privacy: "Privacy",
  country: "Country",
  help: "Help and about",
  people: "My people",
  blocked: "Blocked",
};

export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const router = useRouter();
  const COLOR = useColors();
  const title = TITLES[page ?? ""] ?? "Settings";
  const toast = useToast();

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
        {page === "calendar" ? <CalendarPage /> : null}
        {page === "account" ? <Account /> : null}
        {page === "appearance" ? <Appearance /> : null}
        {page === "datetime" ? <DateTime /> : null}
        {page === "timezone" ? <TimeZonePicker /> : null}
        {page === "privacy" ? <Privacy toast={toast} /> : null}
        {page === "country" ? <CountryPicker /> : null}
        {page === "help" ? <Help /> : null}
        {page === "people" ? <PeoplePage /> : null}
        {page === "blocked" ? <BlockedPage /> : null}
      </ScrollView>
      <ToastHost state={toast} />
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
const since = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function Account() {
  const me = useMe();
  const router = useRouter();
  // One fetch for the whole list. It is the ISO register and does not change
  // while somebody is looking at this screen.
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    void fetchCountries().then(setCountries);
  }, []);

  // Where they are signed in. Read on mount and after every End.
  const [signedIn, setSignedIn] = useState<SignedIn[] | null>(null);
  const loadSignedIn = useCallback(() => {
    void listSignedIn().then(setSignedIn).catch(() => setSignedIn([]));
  }, []);
  useEffect(loadSignedIn, [loadSignedIn]);

  return (
    <>
    <Group label="Details">
      {/* `saveName` hands the identity it got back to every mounted `useMe`,
          so the settings index behind this screen moves with it, initials
          included. */}
      <EditableRow
        title="Name"
        value={me?.displayName ?? null}
        onSave={async (next) => (await saveName(next)) !== null}
      />
      <Row title="Email" value={me?.email} />

      {/* **Where they are, because offload had no idea.** Asked for the next
          bank holiday it answered Columbus Day from three American sources:
          correct somewhere, wrong for whoever asked. A search takes its
          assumptions from nowhere.

          Here rather than in Privacy: it is a fact about them, like their name.
          Its own screen because the list is 250 rows and needs a search field,
          which is not something a settings row can hold. */}
      <Row
        icon="map-pin"
        title="Country"
        value={countryName(me?.country ?? null, countries)}
        onPress={() => router.push("/settings/country")}
        last
      />
    </Group>

    {/* Every live session, this one first. Ending one signs that device out
        on its next request; this phone leaves through Sign out. */}
    <Group label="Signed in on">
      {(signedIn ?? []).map((row, index) => (
        <Row
          key={row.token}
          title={row.device}
          note={row.current ? "This device" : `Since ${since.format(row.since)}`}
          value={row.current ? undefined : "End"}
          onPress={row.current ? undefined : () => void endSignedIn(row.token).then(loadSignedIn)}
          last={index === (signedIn?.length ?? 0) - 1}
        />
      ))}
      {signedIn !== null && signedIn.length === 0 ? <Row title="Nothing else" last /> : null}
    </Group>
    </>
  );
}

/** The name for a code, or the absence said out loud.
 *
 *  "Not set" rather than a blank, because the blank reads as a row that has not
 *  loaded. The absence is a real state: offload tells the model it does not know
 *  rather than assuming, and the row should say that plainly. */
function countryName(code: string | null, all: { code: string; name: string }[]): string {
  if (!code) return "Not set";
  return all.find((country) => country.code === code)?.name ?? code;
}

/** Saying where you are. 
 *
 *  A searchable list rather than a picker: 250 rows is a scroll nobody wants to
 *  do, and the thing somebody knows is the name, not the code. Filtering is on
 *  the name and on the code, so "PT" and "Port" both find Portugal.
 *
 *  **"Not set" is the first row and is always reachable**, because clearing it
 *  is a real choice: offload then says it does not know where they are rather
 *  than carrying on with a stale answer from somewhere they have left. */
function CountryPicker() {
  const me = useMe();
  const router = useRouter();
  const COLOR = useColors();
  const [all, setAll] = useState<{ code: string; name: string }[]>([]);
  const [find, setFind] = useState("");

  useEffect(() => {
    void fetchCountries().then(setAll);
  }, []);

  const needle = find.trim().toLowerCase();
  const shown = needle
    ? all.filter(
        (country) =>
          country.name.toLowerCase().includes(needle) ||
          country.code.toLowerCase() === needle,
      )
    : all;

  async function pick(code: string | null) {
    await setCountry(code);
    router.back();
  }

  return (
    <>
      <View className="pb-space-4">
        <TextInput
          value={find}
          onChangeText={setFind}
          placeholder="Find a country"
          placeholderTextColor={COLOR.quiet}
          autoCorrect={false}
          autoCapitalize="none"
          className={`min-h-tap-min rounded-lg px-space-5 font-core ${
            isAndroid ? "bg-a-c-low text-a-on" : "bg-surface-fill text-text-primary"
          }`}
          style={{ fontSize: 15.5 }}
        />
      </View>

      <Group>
        <Row
          title="Not set"
          value={me?.country ? undefined : "Now"}
          onPress={() => void pick(null)}
        />
        {shown.map((country, index) => (
          <Row
            key={country.code}
            title={country.name}
            value={me?.country === country.code ? "Now" : undefined}
            onPress={() => void pick(country.code)}
            last={index === shown.length - 1}
          />
        ))}
      </Group>
    </>
  );
}

/** Your clock, and your week. 023.
 *
 *  The clock is the account's and the week is this device's, the split 015
 *  made and this page keeps: Starts on moved here from Appearance because the
 *  month grid needs it everywhere, and it kept its store. */
function DateTime() {
  const me = useMe();
  const router = useRouter();
  const weekStart = useWeekStart();

  // The switch drawn first and written second; back to the server's word
  // once it answers, either way.
  const [follow, setFollow] = useState<boolean | null>(null);
  const following = follow ?? me?.followDevice ?? true;

  async function switchFollow(next: boolean) {
    setFollow(next);
    await setClock({ followDevice: next });
    setFollow(null);
  }

  return (
    <>
      <Group label="Your clock">
        <Row
          title="Time zone"
          value={me?.timeZone ? zoneCity(me.timeZone) : undefined}
          onPress={() => router.push("/settings/timezone")}
        />
        <Toggle
          title="Follow this device"
          note="Offer to switch when the phone is somewhere else."
          value={following}
          onChange={(next) => void switchFollow(next)}
          last
        />
      </Group>

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

/** The device's own zones, grouped by region, with a filter. 023.
 *
 *  The Country page's shape and no server: the list is the runtime's, or the
 *  one checked in beside the shared function where the runtime has none,
 *  which Hermes does. A pick writes and goes back, as a country does. */
function TimeZonePicker() {
  const me = useMe();
  const router = useRouter();
  const COLOR = useColors();
  const [find, setFind] = useState("");
  const groups = useMemo(() => zonesByRegion(), []);

  const needle = find.trim().toLowerCase();
  const shown = needle
    ? groups
        .map((group) => ({
          region: group.region,
          zones: group.zones.filter(
            (zone) =>
              zone.city.toLowerCase().includes(needle) || zone.name.toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.zones.length > 0)
    : groups;
  const current = me?.timeZone ? modernZoneName(me.timeZone) : null;

  async function pick(name: string) {
    await setClock({ timeZone: name });
    router.back();
  }

  return (
    <>
      <View className="pb-space-4">
        <TextInput
          value={find}
          onChangeText={setFind}
          placeholder="Find a city"
          placeholderTextColor={COLOR.quiet}
          autoCorrect={false}
          autoCapitalize="none"
          className={`min-h-tap-min rounded-lg px-space-5 font-core ${
            isAndroid ? "bg-a-c-low text-a-on" : "bg-surface-fill text-text-primary"
          }`}
          style={{ fontSize: 15.5 }}
        />
      </View>

      {shown.map((group) => (
        <Group key={group.region} label={group.region}>
          {group.zones.map((zone, index) => (
            <Row
              key={zone.name}
              title={zone.city}
              value={current === zone.name ? "Now" : undefined}
              onPress={() => void pick(zone.name)}
              last={index === group.zones.length - 1}
            />
          ))}
        </Group>
      ))}
    </>
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
function Privacy({ toast }: { toast: ToastState }) {
  const me = useMe();
  // Optimistic, and reverted with a word if the write fails: a switch that
  // waits for a round trip to move reads as a switch that did not work, and
  // one that moves back on its own with nothing said reads as haunted.
  const [pending, setPending] = useState<{ webSearch?: boolean; webLinks?: boolean }>({});

  const search = pending.webSearch ?? me?.webSearch ?? true;
  const links = pending.webLinks ?? me?.webLinks ?? true;

  async function set(patch: { webSearch?: boolean; webLinks?: boolean }) {
    setPending((current) => ({ ...current, ...patch }));
    const updated = await setWebAccess(patch);
    if (updated) return;
    setPending({});
    toast.show("Couldn't change that", { label: "Retry", onPress: () => set(patch) });
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
 *  019. The Calendar row leads one level down, to the calendar page: first
 *  run's connect screen before anything is connected, the list with its count
 *  once something is. Approving a calendar there adds it to no thread; threads
 *  pick from inside. */
function Apps() {
  const router = useRouter();
  const { loading, available, connections, reload } = useCalendars();
  // On focus, not only on mount: the calendar page one level down connects
  // and disconnects, and coming back to a row that still says On after a
  // disconnect is the version of that bug somebody notices.
  useFocusEffect(useCallback(reload, [reload]));

  return (
    <>
      {loading ? null : !available ? (
        <Group label="Calendar">
          {/* Not a failure and not a promise. What is true. */}
          <Row title="Calendar" note="Not available yet." last />
        </Group>
      ) : (
        <Group label="Calendar">
          <Row
            title="Calendar"
            // `On` with the address, as the kit draws it. Which calendars
            // are in use is the page's to say, one level down.
            note={
              connections.length === 0
                ? "See your week in offload, and let it add things for you."
                : connections.length === 1
                  ? connections[0]!.email
                  : `${connections.length} Google accounts`
            }
            value={connections.length === 0 ? "Connect" : "On"}
            onPress={() => router.push("/settings/calendar")}
            last
          />
        </Group>
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

/** 019. The calendar page, one level under Connected apps.
 *
 *  Before anything is connected it is first run's connect screen, verbatim,
 *  plus one sentence under the button: connecting is not consenting to all
 *  of them. Once connected, one block per account, then one switch for the
 *  offload account. A calendar is a checkbox, never a switch: the capability
 *  is the connection one level up, and this is a selection among peers. */
function CalendarPage() {
  const router = useRouter();
  const { loading, available, askFirst, connections, reload, settle } = useCalendars();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function approve(id: string, selected: boolean) {
    setBusy(id);
    setFailed(false);
    const ok = await approveCalendar(id, selected);
    setBusy(null);
    if (ok) {
      settle({ calendarId: id, selected });
      reload();
    } else setFailed(true);
  }

  async function ask(next: boolean) {
    setFailed(false);
    if (await setAskFirst(next)) settle({ askFirst: next });
    else setFailed(true);
  }

  const connect = () =>
    void WebBrowser.openAuthSessionAsync(
      `${API_URL}/api/connectors/google/start?landing=settings`,
      `${WEB}/settings/apps`,
    ).then(reload);

  if (loading) return null;

  if (!available) {
    return (
      <Group label="Calendar">
        <Row title="Calendar" note="Not available yet." last />
      </Group>
    );
  }

  if (connections.length === 0) {
    return (
      <View className="flex-1" style={{ minHeight: 560 }}>
        <ConnectStepBody tone={isAndroid ? "android" : "ios"} mark={googleCalendarMark} />
        <View className="px-gutter-screen pb-space-6">
          <ConnectButton tone={isAndroid ? "android" : "ios"} onPress={connect} />
          {/* The one sentence Settings adds: connecting is not consenting to
              all of them, and this is the only place that can say so before
              Google's consent screen. */}
          <Text
            className={`mt-space-4 text-center font-core ${isAndroid ? "text-a-on-var" : "text-text-tertiary"}`}
            style={{ fontSize: 12.5, lineHeight: 17 }}
          >
            You choose which calendars after this.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {failed ? (
        <Text className="pt-space-4 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
          That did not go through. Try again.
        </Text>
      ) : null}

      {connections.map((connection) => {
        const inUse = connection.calendars.filter((c) => c.selected).length;
        const count = inUse === 0 ? "None in use" : `${inUse} of ${connection.calendars.length} in use`;
        return (
          <View key={connection.id}>
            <View className="flex-row items-center gap-space-5 pb-space-5 pt-space-5">
              <ProviderMark tone={isAndroid ? "android" : "ios"} source={googleCalendarMark} size={34} radius={8} />
              <View className="flex-1">
                <Text className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }}>
                  Google Calendar
                </Text>
                <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 12.5, lineHeight: 17 }}>
                  {connection.email}, connected {connectedOn(connection.connectedAt)}
                </Text>
              </View>
            </View>

            {connection.state === "needs_reauth" ? (
              <Group>
                <Row title="Sign in again" note="offload lost access to this account." value="Reconnect" onPress={connect} last />
              </Group>
            ) : connection.needsScope ? (
              /* The grant lacks the sharing scope. The connection keeps
                 working; every write confirms until they sign in again. */
              <Group>
                <Row
                  title="Sign in again"
                  note="offload needs one more permission: to see who can see each calendar. Until then it checks with you before every write."
                  onPress={connect}
                  last
                />
              </Group>
            ) : null}

            <Group label="Calendars offload can use" count={count}>
              {connection.calendars.map((calendar, index) => (
                <CalendarRow
                  key={calendar.id}
                  calendar={calendar}
                  picked={calendar.selected}
                  disabled={busy === calendar.id}
                  onChange={(next) => void approve(calendar.id, next)}
                  last={index === connection.calendars.length - 1}
                />
              ))}
            </Group>

            <Group>
              <Pressable
                className="flex-row items-center gap-space-4 py-space-4"
                style={{ minHeight: isAndroid ? 56 : 48 }}
                accessibilityRole="button"
                onPress={() => setDisconnecting(connection.id)}
              >
                <View className="flex-1">
                  <Text className="font-core text-text-danger" style={{ fontSize: 15, lineHeight: 20 }}>
                    Disconnect Google Calendar
                  </Text>
                  <Text
                    className={`mt-space-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                    style={{ fontSize: 12.5, lineHeight: 17.5 }}
                  >
                    Notes offload made from your days stay. offload stops reading your calendars and cannot add to them.
                  </Text>
                </View>
              </Pressable>
            </Group>
          </View>
        );
      })}

      <Group label="When offload adds something">
        <View className="flex-row items-center gap-space-4 py-space-4" style={{ minHeight: isAndroid ? 56 : 48 }}>
          <View className="flex-1">
            <Text className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }}>
              Ask before adding
            </Text>
            <Text
              className={`mt-space-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 12.5, lineHeight: 17.5 }}
            >
              Off means offload adds it without asking, unless somebody else would see it.
            </Text>
          </View>
          <Switch checked={askFirst} onChange={(next) => void ask(next)} label="Ask before adding" />
        </View>
      </Group>

      {/* Disconnecting asks once, in the sheet the row's own actions use, then
          revokes at Google and deletes the copy and every pick. */}
      <RowActionSheet
        open={disconnecting !== null}
        subject="Disconnect Google Calendar?"
        actions={[
          {
            label: "Disconnect",
            icon: "cloud-off",
            danger: true,
            run: async () => {
              const id = disconnecting;
              setDisconnecting(null);
              if (!id) return;
              setFailed(false);
              if (await disconnect(id)) {
                reload();
                router.back();
              } else setFailed(true);
            },
          },
        ]}
        onClose={() => setDisconnecting(null)}
      />
    </>
  );
}

function connectedOn(iso: string): string {
  const at = new Date(iso);
  return `${at.getDate()} ${at.toLocaleString("en-GB", { month: "short" })}`;
}

