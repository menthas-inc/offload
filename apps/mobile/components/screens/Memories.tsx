// 040. The Memories tab: what offload knows about you across your threads,
// to see, add, change and forget. From `ui_kits/memories_tab/`, the phone
// branch (`shell()`, `listH()`, `rowH()`, `edH()`), and the handoff's items 2
// to 5; where the spec and the kit differ, the spec.
//
// **The bar is titled** where the other tabs draw the wordmark, as drawn, then
// List | Map, search and plus. It always opens on List. With nothing kept it
// is the title and the plus, and no switch or search.
//
// What the screen draws is decided in `lib/memories.ts`; every sentence,
// kind, hue and cap is `@offload/widgets`'s, shared with the web.

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedScrollHandler } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MEMORY_COPY, type MemoryKindId, type MemoryView } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { Segmented } from "../Segmented";
import { Spinner } from "../Spinner";
import { QuietEmpty } from "./QuietEmpty";
import { ToastHost, useToast } from "../shell/Toast";
import { PlateSpace } from "../shell/plate-inset";
import { useConversation } from "../shell/conversation-context";
import { MemoryListRow } from "../memories/MemoryListRow";
import { MemoryEditor } from "../memories/MemoryEditor";
import { MemoriesMap } from "../memories/MemoriesMap";
import { useColors } from "../../lib/colors";
import { failed } from "../../lib/log";
import { perform, useWrites, type Writes } from "../../lib/optimistic";
import { prismShift, PRISM_SCROLL_FACTOR } from "../../lib/prism-scroll";
import {
  fetchMemories,
  forgetOp,
  kindColors,
  listView,
  memoriesScreen,
  nextRead,
  type MemoryRead,
} from "../../lib/memories";
import { plusKind } from "../../lib/memories-map";

const isAndroid = Platform.OS === "android";

/** The bar's tools are drawn at 40 and answer to 44. */
const DRAWN = 40;
const TAP = 44;

export default function Memories() {
  const COLOR = useColors();
  const [read, setRead] = useState<MemoryRead | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<"kind" | "new">("kind");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Keyed per opening, so the sheet starts out holding its memory's words.
  const [editor, setEditor] = useState<{ key: number; editing: MemoryView | null; preset: MemoryKindId | null } | null>(null);
  // The kind the map is zoomed into: a new memory from the map is that kind.
  const [mapKind, setMapKind] = useState<MemoryKindId | null>(null);
  const toast = useToast();
  const { filed } = useConversation();
  const searchField = useRef<TextInput>(null);

  const onScroll = useAnimatedScrollHandler((event) => {
    prismShift.value = event.contentOffset.y * PRISM_SCROLL_FACTOR;
  });

  // A reload yields to a forget still in flight, or it would draw the row
  // back for the length of a round trip.
  const writesRef = useRef<Writes | null>(null);
  const load = useCallback(async () => {
    let fetched: MemoryRead;
    try {
      fetched = await fetchMemories();
    } catch (error) {
      failed("memories.load", error);
      fetched = "failed";
    }
    if (writesRef.current && !writesRef.current.idle()) return;
    setRead((shown) => nextRead(shown, fetched));
  }, []);
  const writes = useWrites(load);
  writesRef.current = writes;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A turn can remember something while this tab is showing.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    void load();
  }, [filed, load]);

  useEffect(() => {
    if (searching) searchField.current?.focus();
  }, [searching]);

  const screen = memoriesScreen(read);
  const memories = read && read !== "failed" ? read.memories : [];
  const shown = listView(memories, sort, query);
  const palette = { labels: COLOR.labels, ink: COLOR.ink, raised: COLOR.raised, inverse: COLOR.inverse, onSolid: COLOR.onSolid };

  function toggleSearch(): void {
    if (searching) setQuery("");
    setSearching(!searching);
  }

  function open(editing: MemoryView | null): void {
    setEditor({ key: Date.now(), editing, preset: editing ? null : plusKind(view, mapKind) });
  }

  function retry(): void {
    setRead(null);
    void load();
  }

  async function forget(memory: MemoryView): Promise<void> {
    await perform(
      forgetOp(memory, {
        drop: (id) => setRead((r) => (r && r !== "failed" ? { ...r, memories: r.memories.filter((m) => m.id !== id) } : r)),
        put: (back) =>
          setRead((r) =>
            r && r !== "failed" && !r.memories.some((m) => m.id === back.id) ? { ...r, memories: [...r.memories, back] } : r,
          ),
      }),
      toast,
      writes,
    );
  }

  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  const nothing = shown.nothing ? (
    <Text className="mx-gutter-screen text-center font-core text-text-tertiary" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 60 }}>
      {shown.nothing}
    </Text>
  ) : null;

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <Bar
        full={screen.state === "list"}
        plus={screen.state === "list" || screen.state === "empty"}
        searching={searching}
        view={view}
        onView={setView}
        onSearch={toggleSearch}
        onAdd={() => open(null)}
      />

      {searching && screen.state === "list" ? (
        <View className="px-gutter-screen pb-space-3 pt-space-1">
          <View
            className={`flex-row items-center gap-space-4 px-space-5 ${isAndroid ? "rounded-pill bg-a-c-low" : "bg-surface-fill"}`}
            // A minimum, so the field grows with the text size rather than clipping it.
            style={isAndroid ? { minHeight: 48 } : { minHeight: 40, borderRadius: 12 }}
          >
            <Glyph name="search" size={16} color={COLOR.quiet} />
            <TextInput
              ref={searchField}
              value={query}
              onChangeText={setQuery}
              placeholder={MEMORY_COPY.search}
              placeholderTextColor={COLOR.quiet}
              accessibilityLabel={MEMORY_COPY.search}
              returnKeyType="search"
              autoCorrect={false}
              className="flex-1 font-core"
              style={{ color: COLOR.ink, fontSize: 15.5, paddingVertical: 0 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear">
                <Glyph name="x" size={15} color={COLOR.quiet} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {screen.state === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : screen.state === "failed" ? (
        <View className="flex-1 items-center justify-center gap-space-3 px-gutter-screen">
          <Text className={`text-center font-core ${quiet}`} style={{ fontSize: 15 }}>
            {screen.line}
          </Text>
          <Pressable onPress={retry} accessibilityRole="button" className="min-h-tap-min justify-center">
            <Text className="font-core font-medium text-text-accent" style={{ fontSize: 15 }}>
              {screen.retry}
            </Text>
          </Pressable>
        </View>
      ) : screen.state === "empty" ? (
        <QuietEmpty line={screen.line} />
      ) : view === "map" ? (
        <MemoriesMap
          memories={memories}
          query={query}
          openId={editor?.editing?.id ?? null}
          onOpen={(memory) => open(memory)}
          onFocusKind={setMapKind}
        />
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="pt-space-3"
        >
          <View className="px-gutter-screen pb-space-2">
            <Segmented
              label="Sort"
              options={[
                { value: "kind", label: "By kind" },
                { value: "new", label: "Newest" },
              ]}
              value={sort}
              onChange={(value) => setSort(value === "new" ? "new" : "kind")}
            />
          </View>

          {screen.capLine ? (
            <Text className="mx-gutter-screen mt-space-5 font-core text-text-tertiary" style={{ fontSize: 12.5, lineHeight: 18 }}>
              {screen.capLine}
            </Text>
          ) : null}

          {nothing}

          {shown.sections.map((section) => (
            <View key={section.key}>
              <View className="flex-row items-center px-gutter-screen pb-space-3 pt-space-7" style={{ gap: 9 }} accessibilityRole="header">
                {section.kind ? <Dot color={kindColors(section.kind, palette).dot} size={11} /> : null}
                <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 19 }}>
                  {section.title}
                </Text>
                <View className="rounded-pill bg-surface-fill px-space-3 py-space-1">
                  <Text className="font-core text-text-secondary" style={{ fontSize: 12 }}>
                    {section.rows.length}
                  </Text>
                </View>
              </View>
              {section.rows.map((memory, i) => (
                <MemoryListRow
                  key={memory.id}
                  memory={memory}
                  dot={sort === "new" ? kindColors(memory.kind, palette).dot : null}
                  border={i > 0}
                  onOpen={() => open(memory)}
                  onForget={() => void forget(memory)}
                />
              ))}
            </View>
          ))}
          <View style={{ height: 28 }} />
          <PlateSpace />
        </Animated.ScrollView>
      )}

      {editor ? (
        <MemoryEditor
          key={editor.key}
          editing={editor.editing}
          preset={editor.preset}
          onClose={() => setEditor(null)}
          onSaved={(said) => {
            toast.show(said);
            void load();
          }}
          onFailed={(again) => toast.show(MEMORY_COPY.saveFailed, { label: "Retry", onPress: again })}
          onForget={(memory) => void forget(memory)}
          onGone={() => void load()}
        />
      ) : null}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function Dot({ color, size }: { color: string; size: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

function Bar({
  full,
  plus,
  searching,
  view,
  onView,
  onSearch,
  onAdd,
}: {
  /** The switch and search, once there is something to switch or search. */
  full: boolean;
  plus: boolean;
  searching: boolean;
  view: "list" | "map";
  onView: (view: "list" | "map") => void;
  onSearch: () => void;
  onAdd: () => void;
}) {
  const COLOR = useColors();
  return (
    <View className="min-h-appbar-height flex-row items-center px-gutter-screen" style={{ gap: 6 }}>
      <Text
        className={`flex-1 font-core ${isAndroid ? "text-a-on" : "font-semibold text-text-primary"}`}
        style={isAndroid ? { fontSize: 24, lineHeight: 28.8 } : { fontSize: 30, lineHeight: 33, letterSpacing: -0.6 }}
        accessibilityRole="header"
      >
        {MEMORY_COPY.title}
      </Text>
      {full ? (
        <>
          <View style={{ marginRight: 6 }}>
            <Segmented
              label={MEMORY_COPY.view}
              options={[
                { value: "list", label: "List", icon: "list" },
                { value: "map", label: "Map", icon: "map" },
              ]}
              value={view}
              onChange={(value) => onView(value === "map" ? "map" : "list")}
            />
          </View>
          <Pressable
            onPress={onSearch}
            hitSlop={(TAP - DRAWN) / 2}
            accessibilityRole="button"
            accessibilityLabel={MEMORY_COPY.search}
            accessibilityState={{ expanded: searching }}
            className={`items-center justify-center rounded-pill ${searching ? (isAndroid ? "bg-a-c-low" : "bg-surface-fill") : ""}`}
            style={{ width: DRAWN, height: DRAWN }}
          >
            <Glyph name="search" size={21} color={searching ? COLOR.ink : COLOR.secondary} />
          </Pressable>
        </>
      ) : null}
      {plus ? (
        <Pressable
          onPress={onAdd}
          hitSlop={(TAP - DRAWN) / 2}
          accessibilityRole="button"
          accessibilityLabel="New memory"
          className="items-center justify-center rounded-pill"
          style={{ width: DRAWN, height: DRAWN }}
        >
          <Glyph name="plus" size={21} color={COLOR.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
