// 049. Search, a tab (`APPLY-2026-10-30-search.md`; no kit draws it yet).
//
// Memories' bar and field. As the person types: the thread names this phone
// holds at once, then the server's four groups, then meaning after a pause
// from four letters, through the session both clients share. Ask offload is
// the last row and fills the composer unsent. Empty: the recent searches kept
// on this phone, then every thread as a chip.
//
// The keyboard covers the plate, as for every field that is not the
// composer's, and the results scroll clear of it so Ask is always reachable.
// A thread opened from here is pushed over the tabs, so Back finds the page as
// it was left.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import {
  ANNOUNCE_MS,
  ARCHIVED_PARAM,
  DEFAULT_THREAD_ICON,
  KIND_WORDS,
  MEMORY_PARAM,
  NOTE_GLYPH,
  NOTE_PARAM,
  QUERY_CHARS,
  ROW_GLYPHS,
  ROW_PARAM,
  SEARCH_COPY,
  foundMeta,
  looseMatches,
  matchSpans,
  nameMatches,
  rowLabel,
  searchCount,
  searchLetters,
  searchSession,
  type SearchRow,
  type SearchState,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { SearchField } from "../SearchField";
import { ThreadIcon } from "../ThreadIcon";
import { PlateSpace } from "../shell/plate-inset";
import { useConversation } from "../shell/conversation-context";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import { fetchThreadsAndInvitations, type ThreadRow } from "../../lib/threads";
import { dropRecent, keepRecent, onSearchFocus, readRecent, searchFor } from "../../lib/search";

const isAndroid = Platform.OS === "android";

/** The letters a query matched, semibold, the rest regular. */
function Marked({ text, query, mode, lines = 1 }: { text: string; query: string; mode: "word" | "any"; lines?: number }) {
  const COLOR = useColors();
  return (
    <Text className="font-core" style={{ color: COLOR.ink, fontSize: 16 }} numberOfLines={lines}>
      {matchSpans(text, query, mode).map((span, i) => (
        <Text key={i} style={span.match ? { fontWeight: "600" } : undefined}>
          {span.text}
        </Text>
      ))}
    </Text>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Text className="px-gutter-screen pb-space-2 pt-space-6 font-core font-medium text-text-tertiary" style={{ fontSize: 13 }} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** A result row: 56 at least, a hairline under it. */
function Row({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="mx-gutter-screen flex-row items-center gap-space-4 border-b border-border-hairline py-space-3"
      style={{ minHeight: 56 }}
    >
      {children}
    </Pressable>
  );
}

function Well({ glyph }: { glyph: string }) {
  const COLOR = useColors();
  return (
    <View className={`items-center justify-center bg-surface-fill ${isAndroid ? "rounded-pill" : ""}`} style={{ width: 36, height: 36, borderRadius: isAndroid ? 18 : 10 }}>
      <Glyph name={glyph} size={17} color={COLOR.secondary} />
    </View>
  );
}

export default function Search() {
  const COLOR = useColors();
  const router = useRouter();
  const { zone, today } = useClock();
  const { setDraft } = useConversation();
  const field = useRef<TextInput>(null);
  const [state, setState] = useState<SearchState>({ q: "", answer: null, failed: false });
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [hasLoose, setHasLoose] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const session = useRef<ReturnType<typeof searchSession> | null>(null);
  const { height: keyboard } = useReanimatedKeyboardAnimation();
  const clear = useAnimatedStyle(() => ({ height: Math.abs(keyboard.value) }));

  useEffect(() => {
    session.current = searchSession(searchFor, setState);
    return () => session.current?.dispose();
  }, []);
  useEffect(() => onSearchFocus(() => field.current?.focus()), []);

  // The names held here, and the field focused, each time the tab is shown.
  useFocusEffect(
    useCallback(() => {
      field.current?.focus();
      void fetchThreadsAndInvitations().then((page) => {
        if (!page) return;
        setThreads(page.groups.flatMap((group) => group.threads));
        setHasLoose(page.loose !== null);
      });
    }, []),
  );

  const q = state.q;
  const trimmed = q.trim();
  const answer = state.answer;
  const byId = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);

  const type = (next: string) => session.current?.type(next.slice(0, QUERY_CHARS));
  const remember = (words: string) => {
    if (words.trim()) setRecent(keepRecent(words));
  };
  const open = (href: Parameters<typeof router.push>[0]) => {
    remember(q);
    Keyboard.dismiss();
    router.push(href);
  };
  const ask = () => {
    if (!trimmed) return;
    remember(q);
    setDraft(trimmed);
    Keyboard.dismiss();
  };

  // The count, once typing pauses.
  const found = answer ? answer.threads.length + (answer.loose ? 1 : 0) + answer.rows.length + answer.notes.length + answer.memories.length : 0;
  useEffect(() => {
    if (!trimmed || !answer) return;
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(searchCount(found)), ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, answer, found]);

  const threadHits = answer
    ? answer.threads.map((t) => ({ id: t.id, name: t.name, row: byId.get(t.id) ?? null }))
    : nameMatches(threads, q).map((t) => ({ id: t.id, name: t.name, row: t as ThreadRow | null }));
  const looseHit = hasLoose && (answer ? answer.loose : looseMatches(q));
  const nameOf = (id: string, loose: boolean) => (loose ? SEARCH_COPY.loose : (byId.get(id)?.name ?? ""));
  const mark = (id: string, loose: boolean, size: number) => {
    const t = loose ? null : byId.get(id);
    return <ThreadIcon icon={t?.icon ?? DEFAULT_THREAD_ICON} hue={t?.hue ?? 1} seed={id} size={size} />;
  };
  const dateOf = (row: SearchRow) => (row.archived ? null : foundMeta(row, zone, today));
  const metaOf = (row: SearchRow) => (row.archived ? SEARCH_COPY.archived : (dateOf(row) ?? KIND_WORDS[row.type] ?? null));
  const showsNothing = trimmed && searchLetters(trimmed) >= 2 && answer !== null && found === 0;

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className="min-h-appbar-height flex-row items-center px-gutter-screen">
        <Text
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "font-semibold text-text-primary"}`}
          style={isAndroid ? { fontSize: 24, lineHeight: 28.8 } : { fontSize: 30, lineHeight: 33, letterSpacing: -0.6 }}
          accessibilityRole="header"
        >
          {SEARCH_COPY.title}
        </Text>
      </View>
      <View className="px-gutter-screen pb-space-3 pt-space-1">
        <SearchField
          value={q}
          onChangeText={type}
          placeholder={SEARCH_COPY.placeholder}
          label={SEARCH_COPY.title}
          inputRef={field}
          maxLength={QUERY_CHARS}
          onSubmitEditing={() => remember(q)}
        />
      </View>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-space-6">
        <View accessibilityLiveRegion="polite">
          {state.failed ? (
            <View className="flex-row items-center justify-center gap-space-2 px-gutter-screen py-space-6">
              <Text className="font-core text-text-tertiary" style={{ fontSize: 14 }}>
                {SEARCH_COPY.failed}
              </Text>
              <Pressable onPress={() => session.current?.retry()} accessibilityRole="button" hitSlop={12} className="min-h-tap-min justify-center">
                <Text className="font-core text-text-accent underline" style={{ fontSize: 14 }}>
                  {SEARCH_COPY.retry}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {showsNothing ? (
            <Text className="px-gutter-screen py-space-6 text-center font-core text-text-tertiary" style={{ fontSize: 14 }}>
              {SEARCH_COPY.nothing(trimmed)}
            </Text>
          ) : null}
        </View>

        {!trimmed ? (
          <>
            {recent.length ? <Heading>{SEARCH_COPY.headings.recent}</Heading> : null}
            {recent.map((words) => (
              <View key={words} className="mx-gutter-screen flex-row items-center border-b border-border-hairline" style={{ minHeight: 52 }}>
                <Pressable onPress={() => type(words)} accessibilityRole="button" accessibilityLabel={words} className="flex-1 flex-row items-center gap-space-4 py-space-3">
                  <Glyph name="clock" size={17} color={COLOR.quiet} />
                  <Text className="flex-1 font-core" style={{ color: COLOR.ink, fontSize: 16 }} numberOfLines={1}>
                    {words}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setRecent(dropRecent(words))}
                  accessibilityRole="button"
                  accessibilityLabel={SEARCH_COPY.remove(words)}
                  className="items-center justify-center"
                  style={{ width: 44, height: 44 }}
                >
                  <Glyph name="x" size={15} color={COLOR.quiet} />
                </Pressable>
              </View>
            ))}
            {threads.length ? <Heading>{SEARCH_COPY.headings.threads}</Heading> : null}
            <View className="flex-row flex-wrap gap-space-2 px-gutter-screen">
              {threads.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => open({ pathname: "/threads/[id]", params: { id: t.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={t.name}
                  className={`flex-row items-center gap-space-2 border border-border-hairline ${isAndroid ? "rounded-a-sm" : "rounded-pill"}`}
                  style={{ minHeight: 36, paddingLeft: 6, paddingRight: 12, marginVertical: 4 }}
                  hitSlop={{ top: 4, bottom: 4 }}
                >
                  <ThreadIcon icon={t.icon} hue={t.hue} seed={t.id} size={24} />
                  <Text className="font-core font-medium" style={{ color: COLOR.ink, fontSize: 14 }}>
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            {threadHits.length || looseHit ? <Heading>{SEARCH_COPY.headings.threads}</Heading> : null}
            {looseHit ? (
              <Row label={SEARCH_COPY.loose} onPress={() => open("/threads/loose")}>
                {mark("loose", true, 36)}
                <View className="flex-1">
                  <Marked text={SEARCH_COPY.loose} query={q} mode="any" />
                </View>
              </Row>
            ) : null}
            {threadHits.map((t) => (
              <Row key={t.id} label={t.name} onPress={() => open({ pathname: "/threads/[id]", params: { id: t.id } })}>
                <ThreadIcon icon={t.row?.icon ?? DEFAULT_THREAD_ICON} hue={t.row?.hue ?? 1} seed={t.id} size={36} />
                <View className="flex-1">
                  <Marked text={t.name} query={q} mode="any" />
                  {t.row?.meta ? (
                    <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }} numberOfLines={1}>
                      {t.row.meta}
                    </Text>
                  ) : null}
                </View>
              </Row>
            ))}

            {answer?.rows.length ? <Heading>{SEARCH_COPY.headings.rows}</Heading> : null}
            {answer?.rows.map((row) => {
              const meta = metaOf(row);
              const params = { [ROW_PARAM]: row.id, ...(row.archived ? { [ARCHIVED_PARAM]: "1" } : {}) };
              return (
                <Row
                  key={row.id}
                  label={rowLabel({ title: row.title, kind: KIND_WORDS[row.type] ?? null, date: dateOf(row), threadName: nameOf(row.threadId, row.loose), archived: row.archived })}
                  onPress={() =>
                    open(row.loose ? { pathname: "/threads/loose", params } : { pathname: "/threads/[id]", params: { id: row.threadId, ...params } })
                  }
                >
                  <Well glyph={ROW_GLYPHS[row.type] ?? NOTE_GLYPH} />
                  <View className="flex-1">
                    <Marked text={row.title} query={q} mode="word" />
                    <View className="flex-row items-center gap-space-2">
                      {meta ? (
                        <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
                          {meta} ·
                        </Text>
                      ) : null}
                      {mark(row.threadId, row.loose, 16)}
                      <Text className="flex-1 font-core text-text-tertiary" style={{ fontSize: 13 }} numberOfLines={1}>
                        {nameOf(row.threadId, row.loose)}
                      </Text>
                    </View>
                  </View>
                </Row>
              );
            })}

            {answer?.notes.length ? <Heading>{SEARCH_COPY.headings.notes}</Heading> : null}
            {answer?.notes.map((note) => (
              <Row
                key={note.id}
                label={`${note.text}, note, in ${nameOf(note.threadId, note.loose)}`}
                onPress={() =>
                  open(note.loose ? "/threads/loose" : { pathname: "/threads/[id]", params: { id: note.threadId, [NOTE_PARAM]: note.id } })
                }
              >
                <Well glyph={NOTE_GLYPH} />
                <View className="flex-1">
                  <Marked text={note.text} query={q} mode="word" lines={2} />
                  <View className="flex-row items-center gap-space-2">
                    {mark(note.threadId, note.loose, 16)}
                    <Text className="flex-1 font-core text-text-tertiary" style={{ fontSize: 13 }} numberOfLines={1}>
                      {nameOf(note.threadId, note.loose)}
                    </Text>
                  </View>
                </View>
              </Row>
            ))}

            {answer?.memories.length ? <Heading>{SEARCH_COPY.headings.memories}</Heading> : null}
            {answer?.memories.map((memory) => (
              <Row key={memory.id} label={`${memory.text}, memory`} onPress={() => open({ pathname: "/memories", params: { [MEMORY_PARAM]: memory.id } })}>
                <Well glyph="cloudy" />
                <View className="flex-1">
                  <Marked text={memory.text} query={q} mode="word" lines={2} />
                  <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
                    {SEARCH_COPY.memory}
                  </Text>
                </View>
              </Row>
            ))}

            <Pressable
              onPress={ask}
              accessibilityRole="button"
              accessibilityLabel={SEARCH_COPY.ask(trimmed)}
              className="mx-gutter-screen mt-space-5 flex-row items-center gap-space-4 bg-surface-accent-soft px-space-4"
              style={{ minHeight: 52, borderRadius: isAndroid ? 16 : 14 }}
            >
              <Glyph name="sparkles" size={17} color={COLOR.accent} />
              <Text className="flex-1 font-core" style={{ color: COLOR.ink, fontSize: 16 }} numberOfLines={2}>
                {SEARCH_COPY.ask(trimmed)}
              </Text>
            </Pressable>
          </>
        )}
        <PlateSpace />
        <Animated.View style={clear} />
      </ScrollView>
    </SafeAreaView>
  );
}
