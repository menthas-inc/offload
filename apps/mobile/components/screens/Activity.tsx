// Activity: everything offload told you, and what it decided not to. 024.
//
// A pushed screen like Settings, without the plate. Newest first under
// Today, Yesterday and Earlier. A sent row and an unsent row are the same
// row with a different lead: a disc on the fill for something that reached
// the phone, hollow on the lift border for something that did not, plus the
// kind's glyph. Not sent is a sentence-case chip, noticed on its soft ground
// where a setting or the permission caused it and that row opens the
// setting, quiet on the fill where the product chose silence and those rows
// are not doors. Opening it is what clears the dot.

import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { addUtcDays, dayIn } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import { refreshMe } from "../../lib/me";
import { doorOf, glyphOf, loadActivity, sectionOf, seen, tagOf, whenOf, type ActivityEntry } from "../../lib/activity";

const isAndroid = Platform.OS === "android";

export default function Activity() {
  const router = useRouter();
  const COLOR = useColors();
  const { zone, today } = useClock();
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);

  const load = useCallback(async () => {
    const page = await loadActivity(null);
    if (page) {
      setRows(page.rows);
      setNext(page.next);
    } else {
      setRows([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Seen on open, and the dot goes with it.
      void seen().then(() => refreshMe());
    }, [load]),
  );

  async function more(): Promise<void> {
    if (!next) return;
    const page = await loadActivity(next);
    if (!page) return;
    setRows((held) => [...(held ?? []), ...page.rows]);
    setNext(page.next);
  }

  const yesterday = addUtcDays(today, -1);
  const dayOf = (iso: string) => dayIn(new Date(iso), zone);
  const rowInk = isAndroid ? "text-a-on" : "text-text-primary";
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  let section: "Today" | "Yesterday" | "Earlier" | null = null;

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        <Text className={`font-core font-semibold ${rowInk}`} style={{ fontSize: 17 }}>
          Activity
        </Text>
      </View>

      {rows === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLOR.iconOnWell} />
        </View>
      ) : rows.length === 0 ? (
        <View className="flex-1 items-center justify-center px-space-8">
          <Text className={`font-core font-semibold ${rowInk}`} style={{ fontSize: 17 }}>
            Nothing yet
          </Text>
          <Text className={`pt-space-2 text-center font-core ${quiet}`} style={{ fontSize: 15, lineHeight: 21 }}>
            What offload sends you is kept here, and so is what it decided not to send.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-gutter-screen pb-space-9 pt-space-2">
          {rows.map((row) => {
            const here = sectionOf(row.occurredAt, today, yesterday, dayOf);
            const heading = here !== section;
            section = here;
            const door = doorOf(row);
            const tag = tagOf(row);
            const body = (
              <View className="flex-row items-start gap-space-4 py-space-3">
                <View
                  className={`items-center justify-center rounded-pill ${row.sent ? (isAndroid ? "bg-a-c-high" : "bg-surface-fill") : "border-border-lift"}`}
                  style={{ width: 28, height: 28, borderWidth: row.sent ? 0 : 1.5 }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  <Glyph name={glyphOf(row)} size={14} color={row.sent ? COLOR.iconOnWell : COLOR.quiet} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-baseline gap-space-3">
                    <Text className={`flex-1 font-core font-medium ${rowInk}`} style={{ fontSize: 15, lineHeight: 20 }}>
                      {row.title}
                    </Text>
                    <Text className={`font-core ${quiet}`} style={{ fontSize: 12.5, fontVariant: ["tabular-nums"] }}>
                      {whenOf(row.occurredAt, here, zone)}
                    </Text>
                  </View>
                  {row.body ? (
                    <Text className={`font-core ${quiet}`} style={{ fontSize: 14, lineHeight: 19 }}>
                      {row.body}
                    </Text>
                  ) : null}
                  {tag ? (
                    <View
                      className={`mt-space-2 justify-center self-start rounded-sm px-space-2 ${
                        tag.tone === "noticed" ? "bg-surface-noticed-soft" : isAndroid ? "bg-a-c-high" : "bg-surface-fill"
                      }`}
                      style={{ height: 19 }}
                    >
                      <Text className={`font-core font-medium ${tag.tone === "noticed" ? "text-text-noticed" : "text-text-tertiary"}`} style={{ fontSize: 10.5 }}>
                        {tag.label}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
            return (
              <View key={row.id}>
                {heading ? (
                  <Text
                    className={`px-space-1 pb-space-2 pt-space-5 font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-tertiary"}`}
                    style={{ fontSize: 12 }}
                  >
                    {here}
                  </Text>
                ) : null}
                {door ? (
                  <Pressable onPress={() => router.push(door as never)} accessibilityRole="button" className="min-h-tap-min">
                    {body}
                  </Pressable>
                ) : (
                  body
                )}
              </View>
            );
          })}
          {next ? (
            <Pressable onPress={() => void more()} className="min-h-tap-min items-center justify-center" accessibilityRole="button">
              <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-accent"}`} style={{ fontSize: 14 }}>
                Earlier still
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
