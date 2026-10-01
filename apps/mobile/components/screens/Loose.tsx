// 028. Not in a thread, the full list: where *All 14* leads, from the
// exploration's P1.
//
// A pushed screen: the bar is back and nothing else on iOS, with the large
// title in the list, and Material's 64px bar with its 22px title on Android.
// Then the line, the same chips as the group, which here filter the whole
// list and keep their counts, then every row with its suggestion, a page at a
// time. At the end, when there are any, the thread page's archived foot row
// opens the archived rows with Put back. The composer and the tabs stay, as on
// every screen: a dump from here is filed like any other.
//
// One spinner while it loads, *Couldn't load these* with Try again when the
// read fails, the same under the last row when a next page does, and an empty
// state when there is nothing; the screen stays until the person goes back.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { ToastHost, useToast } from "../shell/Toast";
import { PlateSpace } from "../shell/plate-inset";
import { useConversation } from "../shell/conversation-context";
import { TypeChips } from "../loose/TypeChips";
import { useLooseRows } from "../loose/useLooseRows";
import { useColors } from "../../lib/colors";
import { failed as logFailed } from "../../lib/log";
import {
  asChip,
  fetchLoose,
  fetchLooseArchived,
  keepChip,
  keyOf,
  type ChipKey,
  type LooseEntry,
  type LoosePage,
} from "../../lib/loose";

const isAndroid = Platform.OS === "android";

/** What the list holds now: a page or more of the live rows, or the archived
 *  ones, with the cursor for the next page. */
interface Held {
  entries: LooseEntry[];
  nextCursor: string | null;
  counts: Pick<LoosePage, "count" | "byType" | "archived">;
}

export default function Loose() {
  const COLOR = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const [chip, setChip] = useState<ChipKey | null>(() => asChip(params.type));
  const [archived, setArchived] = useState(false);
  const [held, setHeld] = useState<Held | null>(null);
  const [unread, setUnread] = useState(false);
  // Bumped by each whole read, which is what clears the rows drawn ahead of
  // the server; a next page appended is not one.
  const [readAt, setReadAt] = useState(0);
  const [next, setNext] = useState<"idle" | "loading" | "failed">("idle");
  const toast = useToast();
  const { filed } = useConversation();
  // The counts of the live list, kept while the archived rows are showing.
  const counts = useRef<Held["counts"]>({ count: 0, byType: {}, archived: 0 });

  const load = useCallback(async () => {
    setUnread(false);
    try {
      if (archived) {
        const read = await fetchLooseArchived();
        if (!read) return setUnread(true);
        setHeld({
          entries: read.rows.map((row) => ({ kind: "content" as const, row, suggestion: null })),
          nextCursor: read.nextCursor,
          counts: counts.current,
        });
        setReadAt((n) => n + 1);
        return;
      }
      const read = await fetchLoose({ type: chip });
      if (!read) return setUnread(true);
      // The picked type emptied, or the chips went: back to All, which reads
      // again from here.
      const kept = keepChip(chip, read.byType);
      if (kept !== chip) return setChip(kept);
      counts.current = { count: read.count, byType: read.byType, archived: read.archived };
      setHeld({ entries: read.rows, nextCursor: read.nextCursor, counts: counts.current });
      setReadAt((n) => n + 1);
    } catch (error) {
      logFailed("loose.load", error);
      setUnread(true);
    }
  }, [chip, archived]);

  const rows = useLooseRows(readAt, load, toast);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A dump filed while this screen is up may well land here.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    void load();
  }, [filed, load]);

  async function more(): Promise<void> {
    if (!held?.nextCursor || next === "loading") return;
    setNext("loading");
    const cursor = held.nextCursor;
    const read = archived
      ? await fetchLooseArchived(cursor).then((page) =>
          page ? { rows: page.rows.map((row) => ({ kind: "content" as const, row, suggestion: null })), nextCursor: page.nextCursor } : null,
        )
      : await fetchLoose({ type: chip, cursor });
    if (!read) return setNext("failed");
    setNext("idle");
    setHeld((current) => {
      if (!current || current.nextCursor !== cursor) return current;
      const known = new Set(current.entries.map(keyOf));
      return { ...current, entries: [...current.entries, ...read.rows.filter((entry) => !known.has(keyOf(entry)))], nextCursor: read.nextCursor };
    });
  }

  function pick(next_: ChipKey | null): void {
    if (next_ === chip) return;
    setHeld(null);
    setNext("idle");
    setChip(next_);
  }

  function showArchived(on: boolean): void {
    setHeld(null);
    setNext("idle");
    setArchived(on);
  }

  const shown = held ? rows.live(held.entries) : [];
  // The live list's counts, less what has left since they were read.
  const live = rows.less(counts.current);
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";
  const ink = isAndroid ? "text-a-on" : "text-text-primary";

  const header = (
    <View>
      {isAndroid ? null : (
        <Text className={`px-gutter-screen pt-space-2 font-core font-semibold ${ink}`} style={{ fontSize: 26, lineHeight: 30 }} accessibilityRole="header">
          Not in a thread
        </Text>
      )}
      <Text className={`px-gutter-screen pb-space-5 pt-space-1 font-core ${quiet}`} style={{ fontSize: 13.5, lineHeight: 19 }}>
        Put down without a thread, newest first.
      </Text>
      {archived ? null : <TypeChips count={live.count} byType={live.byType} picked={chip} onPick={pick} />}
      {archived ? (
        <Text className={`px-gutter-screen pb-space-3 pt-space-5 font-core font-semibold ${ink}`} style={{ fontSize: 21 }}>
          Archived
        </Text>
      ) : null}
    </View>
  );

  const footer = (
    <View>
      {next === "loading" ? (
        <View className="items-center py-space-6">
          <ActivityIndicator color={COLOR.spinnerHead} accessibilityLabel="Loading" />
        </View>
      ) : next === "failed" ? (
        <Failed onRetry={() => void more()} />
      ) : null}
      {/* The thread page's way to the archived pile and back: a row under
          everything live, once the list has reached its end. */}
      {held && !held.nextCursor ? (
        archived ? (
          <Pressable
            onPress={() => showArchived(false)}
            accessibilityRole="button"
            className="min-h-tap-min flex-row items-center gap-space-3 border-t border-border-hairline px-gutter-screen"
          >
            <Glyph name="chevron-left" size={15} color={COLOR.iconOnWell} />
            <Text className={`font-core font-medium ${quiet}`} style={{ fontSize: 14 }}>
              Back to the list
            </Text>
          </Pressable>
        ) : counts.current.archived > 0 ? (
          <Pressable
            onPress={() => showArchived(true)}
            accessibilityRole="button"
            className="min-h-tap-min flex-row items-center gap-space-3 border-t border-border-hairline px-gutter-screen"
          >
            <Text className={`flex-1 font-core font-medium ${quiet}`} style={{ fontSize: 14 }}>
              {counts.current.archived} archived
            </Text>
            <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null
      ) : null}
      <PlateSpace />
    </View>
  );

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className={`flex-row items-center gap-space-4 px-gutter-screen ${isAndroid ? "h-a-appbar-height" : "h-appbar-height"}`}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        {isAndroid ? (
          <Text className="flex-1 font-core text-a-on" style={{ fontSize: 22 }} numberOfLines={1} accessibilityRole="header">
            Not in a thread
          </Text>
        ) : null}
      </View>

      {held === null ? (
        unread ? (
          <View className="flex-1">
            {header}
            <Failed onRetry={() => void load()} />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLOR.spinnerHead} accessibilityLabel="Loading" />
          </View>
        )
      ) : (
        <FlatList
          data={shown}
          keyExtractor={keyOf}
          renderItem={({ item: entry, index }) => <>{rows.row(entry, { border: index < shown.length - 1 })}</>}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            <View className="items-center px-space-9 py-space-11">
              <Text className={`text-center font-core font-semibold text-title-3 ${ink}`}>Nothing in here yet</Text>
            </View>
          }
          onEndReached={() => {
            if (next === "idle") void more();
          }}
          onEndReachedThreshold={0.5}
        />
      )}

      {rows.sheets}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

/** One clause and the way forward, beside it. */
function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-space-4 px-gutter-screen py-space-5">
      <Text className="flex-1 font-core text-body-sm text-text-danger" accessibilityRole="alert">
        Couldn&apos;t load these
      </Text>
      <Pressable
        onPress={onRetry}
        className="items-center justify-center rounded-pill border border-border-strong px-space-6"
        style={{ minHeight: 44 }}
        accessibilityRole="button"
      >
        <Text className="font-core font-medium text-body-sm text-text-primary">Try again</Text>
      </Pressable>
    </View>
  );
}
