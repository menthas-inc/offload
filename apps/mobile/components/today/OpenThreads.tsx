// Open in your threads (design 2026-10-07, the kit's `ThreadPages`). Today
// only, after To do: a page per thread holding open to-dos with no date,
// scrolled sideways past the gutter, each the width less 32 with 8 between so
// the next one peeks, snapping to a page start, with a dot per page under them.
// A set takes its tallest page's height and each foot sits at the bottom.
//
// A page: the thread's icon, name and the people sharing it, which open the
// thread; up to four to-dos, oldest first, with how long each has been open;
// then N more and Open thread. Not in a thread is last, with offload's line
// when it has a thread in mind and Sort them. A tick strikes the row through in
// place with Undo, and the row leaves the page the next time Today is built.
// A row opens its row sheet.
//
// The kit's first sentence of the thread's read is not drawn: nothing writes a
// thread's standing read yet, and the thread page draws nothing in its place.

import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { token } from "@offload/tokens";
import { holdsLine, inMindLine, openFor } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { useColors } from "../../lib/colors";
import { openThreadLabel, threadHref } from "../../lib/loose";
import { perform, type Writes } from "../../lib/optimistic";
import { completeContent } from "../../lib/threads";
import type { OpenPage, TodayRow } from "../../lib/today";
import type { ToastState } from "../shell/Toast";
import { SectionHead } from "./DayParts";

const isAndroid = Platform.OS === "android";
const GAP = parseFloat(token("space-4"));
const GUTTER = parseFloat(token("gutter-screen"));

export function OpenThreads({
  pages,
  struck,
  onStrike,
  onOpenRow,
  toast,
  writes,
  now,
}: {
  pages: OpenPage[];
  /** Rows ticked here since Today was built. */
  struck: ReadonlySet<string>;
  onStrike: (id: string, on: boolean) => void;
  onOpenRow: (row: TodayRow) => void;
  toast: ToastState;
  writes: Writes;
  now: Date;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [shown, setShown] = useState(0);
  if (pages.length === 0) return null;
  const page = width - 2 * GUTTER - 32;
  const count = pages.reduce((sum, one) => sum + one.count, 0);
  const ground = isAndroid ? "bg-a-c-low" : "bg-surface-fill";
  const ink = isAndroid ? "text-a-on" : "text-text-primary";
  const rule = isAndroid ? "border-a-outline" : "border-border-hairline";

  function tick(row: TodayRow): void {
    const on = !struck.has(row.id);
    void perform(
      {
        apply: () => onStrike(row.id, on),
        revert: () => onStrike(row.id, !on),
        write: () => completeContent(row.id, on),
        ...(on ? { unwrite: () => completeContent(row.id, false), did: "Ticked off" } : {}),
        failed: on ? "Couldn't tick that off" : "Couldn't put that back",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  return (
    <View>
      <SectionHead title="Open in your threads" count={count} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={page + GAP}
        decelerationRate="fast"
        disableIntervalMomentum
        className="-mx-gutter-screen"
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP }}
        onScroll={(event) => setShown(Math.round(event.nativeEvent.contentOffset.x / (page + GAP)))}
        scrollEventThrottle={32}
      >
        {pages.map((one) => {
          const loose = one.name === null;
          const go = () => router.push(threadHref(one.threadId, one.name));
          const more = one.count - one.todos.length;
          const line = loose && one.loose ? inMindLine(one.loose.inMind, one.todos.length) : null;
          const holds = loose && one.loose ? holdsLine(one.loose.holds) : null;
          return (
            <View
              key={one.threadId}
              className={`overflow-hidden ${isAndroid ? "rounded-a-lg" : "rounded-lg"} ${ground}`}
              style={{ width: page, boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }}
            >
              <Pressable onPress={go} accessibilityRole="link" accessibilityLabel={loose ? openThreadLabel(null) : `Open ${one.name}`}>
                <View className="flex-row items-center gap-space-4 px-space-6" style={{ paddingTop: 14, paddingBottom: line ? 4 : 10, minHeight: 22 }}>
                  {loose ? (
                    // In a thread mark's 22 slot, so every page's name starts in one place.
                    <View className="items-center justify-center" style={{ width: 22, height: 22 }}>
                      <Glyph name="inbox" size={16} color={COLOR.iconOnWell} />
                    </View>
                  ) : (
                    <ThreadIcon icon={one.icon ?? "lasso"} hue={one.hue ?? 1} seed={one.threadId} size={22} />
                  )}
                  <Text className={`flex-shrink font-core font-semibold ${ink}`} style={{ fontSize: 17 }} numberOfLines={1}>
                    {one.name ?? "Not in a thread"}
                  </Text>
                  {one.people.length > 0 ? (
                    <View className="ml-auto flex-row">
                      {one.people.map((person, n) => (
                        <View
                          key={person.accountId}
                          className={`items-center justify-center rounded-pill bg-surface-attention-soft ${isAndroid ? "border-a-c-low" : "border-surface-fill"}`}
                          // A 22 disc with a 2pt ring in the page's ground, overlapping 5.
                          style={{ width: 26, height: 26, marginLeft: n ? -9 : 0, borderWidth: 2 }}
                        >
                          <Text className="font-core font-semibold text-blue-700" style={{ fontSize: 10 }}>
                            {person.initials}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                {line ? (
                  <Text className="px-space-6 pb-space-5 font-quiet text-text-secondary" style={{ fontSize: 15, lineHeight: 21.75 }} numberOfLines={2}>
                    {line}
                  </Text>
                ) : null}
              </Pressable>
              {one.todos.map((row) => {
                const done = struck.has(row.id);
                // The row is not one control: a screen reader reaches the tick
                // and the title apart, as on the thread page.
                return (
                  <View key={row.id} className={`flex-row items-center gap-space-4 border-t px-space-6 ${rule}`} style={{ minHeight: 44 }}>
                    <Pressable
                      onPress={() => tick(row)}
                      hitSlop={12}
                      accessibilityRole="checkbox"
                      accessibilityLabel={done ? `Put ${row.title} back on the list` : `Finish ${row.title}`}
                      accessibilityState={{ checked: done }}
                      className="items-center justify-center rounded-xs border"
                      style={{
                        width: 21,
                        height: 21,
                        borderColor: done ? COLOR.accent : COLOR.iconOnWell,
                        backgroundColor: done ? COLOR.accent : "transparent",
                      }}
                    >
                      {done ? <Glyph name="check" size={13} color={COLOR.onSolid} /> : null}
                    </Pressable>
                    <Pressable
                      onPress={() => onOpenRow(row)}
                      accessibilityRole="button"
                      accessibilityLabel={row.title}
                      className="flex-1 flex-row items-center gap-space-4"
                      style={{ paddingVertical: 10 }}
                    >
                      <Text
                        className={`flex-1 font-core font-medium ${done ? "text-text-tertiary" : ink}`}
                        style={{ fontSize: 15, lineHeight: 20, ...(done ? { textDecorationLine: "line-through" as const } : {}) }}
                        numberOfLines={1}
                      >
                        {row.title}
                      </Text>
                      <Text className="font-core text-text-tertiary" style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
                        {openFor(row.createdAt, now)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              <View className={`mt-auto flex-row items-center justify-between border-t px-space-6 ${rule}`} style={{ minHeight: 40 }}>
                <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
                  {more > 0 ? `${more} more` : (holds ?? "")}
                </Text>
                <Pressable onPress={go} accessibilityRole="link" hitSlop={10} className="min-h-tap-min justify-center">
                  <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13 }}>
                    {loose ? "Sort them" : "Open thread"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {pages.length > 1 ? (
        <View className="mt-space-4 flex-row justify-center" style={{ gap: 5 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {pages.map((one, n) => (
            <View
              key={one.threadId}
              className={`rounded-pill ${n === shown ? (isAndroid ? "bg-a-on" : "bg-text-primary") : "bg-border-strong"}`}
              style={{ width: n === shown ? 16 : 6, height: 6 }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
