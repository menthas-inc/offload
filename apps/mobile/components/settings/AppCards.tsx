// Connected apps, one card per app. 031.
//
// *Settings, tightened*: the page was four labelled groups of one row each, two
// of them not built and one a paragraph. A card is the app: its mark, its name,
// one line and its state, and under a hairline the two or three things about it
// worth reaching from here. The calendar's list and Disconnect stay one level
// down; Ask before adding is on both, the same write.
//
// **Mail is always drawn**, whatever the calendar is doing, because it needs no
// connecting: the address works the moment the account exists.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { ProviderMark } from "../ConnectStep";
import { Plain, Row, StatusPill } from "./Rows";
import { Switch } from "./Switch";
import { useColors } from "../../lib/colors";
import { googleCalendarMark } from "../../lib/brands";
import { MAIL_ADDRESS, MAIL_RELAY_NOTE } from "../../lib/gate";
import type { Connection } from "../../lib/calendars";

const isAndroid = Platform.OS === "android";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="overflow-hidden border border-border-hairline bg-surface-raised"
      style={{ borderRadius: isAndroid ? 22 : 16 }}
    >
      <Plain>{children}</Plain>
    </View>
  );
}

function Head({ mark, name, line, end }: { mark: React.ReactNode; name: string; line: string; end: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-space-4" style={{ padding: 14 }}>
      {mark}
      <View className="flex-1">
        <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 16, lineHeight: 20 }}>
          {name}
        </Text>
        <Text
          className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
          style={{ fontSize: 13, lineHeight: 18, marginTop: 2 }}
        >
          {line}
        </Text>
      </View>
      {end}
    </View>
  );
}

/** The primary on a card head: ink on iOS, Material's blue on Android. */
function Primary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`items-center justify-center rounded-pill ${isAndroid ? "bg-blue-600" : "bg-surface-inverse"}`}
      style={{ height: isAndroid ? 40 : 32, paddingHorizontal: isAndroid ? 18 : 14 }}
    >
      <Text className={`font-core font-medium ${isAndroid ? "text-text-on-solid" : "text-text-inverse"}`} style={{ fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** An outline button on a card head, for Sign in again. */
function Outline({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`items-center justify-center rounded-pill border ${isAndroid ? "border-a-outline" : "border-border-hairline bg-surface-raised"}`}
      style={{ height: isAndroid ? 40 : 32, paddingHorizontal: isAndroid ? 18 : 14 }}
    >
      <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function connectedOn(iso: string): string {
  const at = new Date(iso);
  return `${at.getDate()} ${at.toLocaleString("en-GB", { month: "short" })}`;
}

export function CalendarCard({
  connections,
  askFirst,
  onAsk,
  onOpen,
  onConnect,
}: {
  connections: Connection[];
  askFirst: boolean;
  onAsk: (next: boolean) => void;
  onOpen: () => void;
  onConnect: () => void;
}) {
  const mark = <ProviderMark tone={isAndroid ? "android" : "ios"} source={googleCalendarMark} size={42} radius={11} />;

  if (connections.length === 0) {
    return (
      <Card>
        <Head
          mark={mark}
          name="Google Calendar"
          line="See your week in offload, and let it add things for you."
          end={<Primary label="Connect" onPress={onConnect} />}
        />
      </Card>
    );
  }

  const line =
    connections.length === 1
      ? `${connections[0]!.email}, connected ${connectedOn(connections[0]!.connectedAt)}`
      : `${connections.length} Google accounts`;
  // A connection that lost access, or lacks the sharing scope, is the one
  // thing on the card that needs them, so it takes the pill's place.
  const signInAgain = connections.some((c) => c.state === "needs_reauth" || c.needsScope);
  const all = connections.flatMap((c) => c.calendars);
  const inUse = all.filter((c) => c.selected).length;

  return (
    <Card>
      <Head
        mark={mark}
        name="Google Calendar"
        line={line}
        end={signInAgain ? <Outline label="Sign in again" onPress={onConnect} /> : <StatusPill label="Connected" />}
      />
      <View className="border-t border-border-hairline px-space-4">
        <Row title="Calendars offload can use" value={`${inUse} of ${all.length}`} onPress={onOpen} />
        <View className="flex-row items-center gap-space-4 py-space-4" style={{ minHeight: isAndroid ? 58 : 50 }}>
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
          <Switch checked={askFirst} onChange={onAsk} label="Ask before adding" />
        </View>
      </View>
    </Card>
  );
}

export function MailCard({
  email,
  available,
  onCopy,
  onContacts,
  onHow,
}: {
  email: string;
  available: boolean;
  onCopy: () => void;
  onContacts: () => void;
  onHow: () => void;
}) {
  const COLOR = useColors();
  const mark = (
    <View className="items-center justify-center bg-surface-accent-soft" style={{ width: 42, height: 42, borderRadius: 11 }}>
      <Glyph name="mail" size={21} color={COLOR.accentInk} />
    </View>
  );

  // An Apple hidden email is never the address mail comes from, so nothing
  // under the head would work.
  if (!available) {
    return (
      <Card>
        <Head mark={mark} name="Mail" line={MAIL_RELAY_NOTE} end={<StatusPill label="Unavailable" tone="neutral" />} />
      </Card>
    );
  }

  return (
    <Card>
      <Head
        mark={mark}
        name="Mail"
        line="Forward an email and it's filed like anything you dump"
        end={<StatusPill label="Ready" tone="neutral" />}
      />
      <View className="border-t border-border-hairline px-space-4">
        <Row
          title={MAIL_ADDRESS}
          note={`Only mail from ${email} is accepted. Forward by hand.`}
          pill="Copy"
          pillIcon="copy"
          onPress={onCopy}
        />
        <Row title="Add to contacts" external onPress={onContacts} />
        {/* The Mail page stays, for how it works; this is its door. */}
        <Row title="How it works" onPress={onHow} last />
      </View>
    </Card>
  );
}
