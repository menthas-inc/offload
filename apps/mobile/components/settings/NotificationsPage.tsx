// Settings, Notifications. 024.
//
// A preferences page, not the notifications page 022 ruled out. The
// switches and hours are the account's, one set for every device, and the
// hours are in the account's zone. Hour rows sit under the switch they
// belong to and grey out with it. Labels match the notification titles word
// for word, which is why the evening switch says Tomorrow. Everything is
// drawn first and written second, and put back with one clause when the
// write fails.
//
// Android: each switch is a channel with a fixed id, created at first
// launch and never renamed. The page reads channel state on open: a channel
// switched off in the system shows off here, tapping it opens that channel's
// system page, and the account switch is set off so that Activity tells the
// truth about it. iOS has no per-kind switches in the system, so this page
// is the only place a person can refuse one kind and keep another.

import { useCallback, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Group, Row } from "./Rows";
import { Switch } from "./Switch";
import { setNotify, useMe, type Me } from "../../lib/me";
import { clockLabel } from "../../lib/when";
import { CHANNELS, register } from "../../lib/notifications";

const isAndroid = Platform.OS === "android";

type Switches = "notifyDueToday" | "notifyComingTomorrow" | "notifyPeopleRequests" | "notifySharedActivity";
type Hours = "notifyDueTodayAt" | "notifyComingTomorrowAt";
type Patch = Partial<Pick<Me, Switches | Hours>>;

const CHANNEL_OF: Record<Switches, string> = {
  notifyDueToday: "due_today",
  notifyComingTomorrow: "coming_tomorrow",
  notifyPeopleRequests: "people_requests",
  notifySharedActivity: "shared_activity",
};

function dateOf(hour: string): Date {
  const [h, m] = hour.split(":").map(Number);
  const at = new Date();
  at.setHours(h ?? 8, m ?? 0, 0, 0);
  return at;
}

function hourOf(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export function NotificationsPage() {
  const me = useMe();
  // Drawn first: what was just switched, until the server answers.
  const [drawn, setDrawn] = useState<Patch>({});
  // The patch that did not land, so Try again can send the same one.
  const [failed, setFailed] = useState<Patch | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  // Which channels the system has switched off, on Android.
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<Hours | null>(null);

  const value = <K extends keyof Patch>(key: K): Me[K] | undefined => (drawn[key] ?? me?.[key]) as Me[K] | undefined;

  const write = useCallback(async (patch: Patch) => {
    setDrawn((held) => ({ ...held, ...patch }));
    setFailed(null);
    const ok = await setNotify(patch);
    setDrawn((held) => {
      const next = { ...held };
      for (const key of Object.keys(patch) as (keyof Patch)[]) delete next[key];
      return next;
    });
    if (!ok) setFailed(patch);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void Notifications.getPermissionsAsync()
        .then((granted) => setPermission(granted.status))
        .catch(() => setPermission(null));
      if (!isAndroid) return;
      void (async () => {
        const off = new Set<string>();
        for (const channel of CHANNELS) {
          const held = await Notifications.getNotificationChannelAsync(channel.id).catch(() => null);
          if (held && held.importance === Notifications.AndroidImportance.NONE) off.add(channel.id);
        }
        setBlocked(off);
      })();
    }, []),
  );

  // The account switch follows the system's answer, once, so the record
  // never says sent about a send the system dropped.
  useFocusEffect(
    useCallback(() => {
      if (!isAndroid || !me) return;
      for (const [key, channel] of Object.entries(CHANNEL_OF) as [Switches, string][]) {
        if (blocked.has(channel) && me[key]) void write({ [key]: false });
      }
    }, [blocked, me, write]),
  );

  function openChannel(channel: string): void {
    const pkg = Constants.expoConfig?.android?.package;
    if (!pkg) return;
    void Linking.sendIntent("android.settings.CHANNEL_NOTIFICATION_SETTINGS", [
      { key: "android.provider.extra.APP_PACKAGE", value: pkg },
      { key: "android.provider.extra.CHANNEL_ID", value: channel },
    ]).catch(() => Linking.openSettings());
  }

  function onSwitch(key: Switches, next: boolean): void {
    if (isAndroid && blocked.has(CHANNEL_OF[key])) {
      openChannel(CHANNEL_OF[key]);
      return;
    }
    void write({ [key]: next });
  }

  function pickHour(key: Hours): void {
    const held = value(key) ?? (key === "notifyDueTodayAt" ? "08:00" : "19:00");
    if (isAndroid) {
      DateTimePickerAndroid.open({
        mode: "time",
        value: dateOf(held),
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type === "set" && picked) void write({ [key]: hourOf(picked) });
        },
      });
      return;
    }
    setPicking((now) => (now === key ? null : key));
  }

  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  const hourRow = (key: Hours, title: string, on: boolean) => {
    const held = value(key) ?? (key === "notifyDueTodayAt" ? "08:00" : "19:00");
    return (
      <View className={on ? "" : "opacity-60"} pointerEvents={on ? "auto" : "none"}>
        <Row title={title} value={clockLabel(held)} onPress={() => pickHour(key)} last={key === "notifyComingTomorrowAt"} />
        {!isAndroid && picking === key ? (
          <DateTimePicker
            mode="time"
            display="spinner"
            minuteInterval={5}
            value={dateOf(held)}
            onChange={(_event: DateTimePickerEvent, picked?: Date) => {
              if (picked) void write({ [key]: hourOf(picked) });
            }}
          />
        ) : null}
      </View>
    );
  };

  const toggle = (key: Switches, title: string, note?: string, last?: boolean) => (
    <View className={`gap-space-2 py-space-4 ${last ? "" : "border-b border-border-hairline"}`}>
      <View className="min-h-tap-min flex-row items-center gap-space-4">
        <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15.5 }}>
          {title}
        </Text>
        <Switch checked={value(key) === true && !blocked.has(CHANNEL_OF[key])} onChange={(next) => onSwitch(key, next)} label={title} />
      </View>
      {note ? (
        <Text className={`font-core ${quiet}`} style={{ fontSize: 12.5, lineHeight: 17.5 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      {failed ? (
        <View className="flex-row items-center gap-space-3 px-space-1 pt-space-3" accessibilityRole="alert">
          <Text className="font-core text-text-danger" style={{ fontSize: 13 }}>
            Couldn&apos;t save that.
          </Text>
          <Pressable onPress={() => void write(failed)} hitSlop={10} accessibilityRole="button" className="min-h-tap-min justify-center">
            <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-accent"}`} style={{ fontSize: 13 }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Group label="Dates">
        {toggle("notifyDueToday", "Due today", "One message each morning.")}
        {hourRow("notifyDueTodayAt", "In the morning at", value("notifyDueToday") === true)}
        {toggle("notifyComingTomorrow", "Tomorrow", "One message each evening.")}
        {hourRow("notifyComingTomorrowAt", "In the evening at", value("notifyComingTomorrow") === true)}
      </Group>

      <Group label="People">
        {toggle("notifyPeopleRequests", "Connection requests")}
        {toggle("notifySharedActivity", "Added to a shared thread", undefined, true)}
      </Group>

      <Group label="On this phone">
        {permission === "denied" ? (
          <Text className={`px-space-1 pt-space-4 font-core ${quiet}`} style={{ fontSize: 13.5, lineHeight: 19 }}>
            Notifications are off for offload on this phone.
          </Text>
        ) : null}
        {/* Never asked on this phone: an account from before first run asked,
            or a reinstall. Not a refusal, so the one ask is offered here; a
            refusal is never asked again, above. */}
        {permission === "undetermined" ? (
          <Row
            title="Turn on notifications"
            onPress={() =>
              void Notifications.requestPermissionsAsync()
                .then((granted) => {
                  setPermission(granted.status);
                  if (granted.status === "granted") void register();
                })
                .catch(() => undefined)
            }
          />
        ) : null}
        <Row
          title="System settings"
          note="Sounds, the lock screen, and turning offload off entirely."
          onPress={() => void Linking.openSettings()}
          last
        />
      </Group>
    </>
  );
}
