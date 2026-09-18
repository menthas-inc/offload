// Where a row goes, chosen by hand.
//
// The first move control the product has drawn. The shape is the kit's share
// sheet in ui_kits/mobile_app/Sharing.jsx: a list with search on top and a tap
// to choose. The threads are the person's own, from the same read My threads
// makes, minus the one the row is already in.

import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glyph } from "../Glyph";
import { atOpacity, useColors } from "../../lib/colors";
import { fetchThreads, type ThreadRow } from "../../lib/threads";
import { useScreenSheet } from "./conversation-context";

const isAndroid = Platform.OS === "android";

export function MoveSheet({
  open,
  exceptThreadId,
  onPick,
  onClose,
}: {
  open: boolean;
  exceptThreadId: string | null;
  onPick: (thread: ThreadRow) => void;
  onClose: () => void;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [query, setQuery] = useState("");
  const input = useRef<TextInput>(null);
  useScreenSheet(open);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setQuery("");
    void fetchThreads().then((groups) => {
      if (live) setThreads(groups.flatMap((group) => group.threads));
    });
    return () => {
      live = false;
    };
  }, [open]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (threads ?? [])
      .filter((thread) => thread.id !== exceptThreadId)
      .filter((thread) => !needle || thread.name.toLowerCase().includes(needle));
  }, [threads, query, exceptThreadId]);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: keyboardHeight.value }] }));

  if (!open) return null;

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(140)}
        className="absolute inset-0"
        style={{ backgroundColor: atOpacity(COLOR.scrim, 0.35) }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      {/* Lifted by the keyboard, which the search field raises on open: this
          app is edge to edge, Android ignores adjustResize, and a sheet
          anchored to the bottom sat entirely under the keyboard on a Pixel,
          which is the waitlist form's own lesson. The same lift Notes uses. */}
      <Animated.View
        entering={SlideInDown.duration(260)}
        exiting={SlideOutDown.duration(200)}
        className={`absolute inset-x-0 bottom-0 rounded-t-lg ${isAndroid ? "bg-a-c" : "bg-surface-raised"}`}
        style={[{ maxHeight: "70%", paddingBottom: insets.bottom }, lift]}
        accessibilityViewIsModal
      >
        <View className="flex-row items-center gap-space-3 border-b border-border-hairline px-gutter-screen" style={{ height: 52 }}>
          <Glyph name="search" size={16} color={COLOR.iconOnWell} />
          <TextInput
            ref={input}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Which thread?"
            placeholderTextColor={COLOR.iconOnWell}
            accessibilityLabel="Which thread?"
            className="flex-1 font-core text-text-primary"
            style={{ fontSize: 16 }}
          />
          <Pressable onPress={onClose} hitSlop={13} accessibilityLabel="Close" accessibilityRole="button">
            <Glyph name="x" size={18} color={COLOR.iconOnWell} />
          </Pressable>
        </View>
        <FlatList
          data={shown}
          keyExtractor={(thread) => thread.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            threads === null ? null : (
              <Text className="px-gutter-screen py-space-5 font-core text-text-tertiary" style={{ fontSize: 13 }}>
                {query.trim() ? "Nothing by that name." : "No other thread."}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              className="min-h-tap-min flex-row items-center gap-space-3 px-gutter-screen"
              accessibilityRole="button"
            >
              <Text className="flex-1 font-core text-text-primary" style={{ fontSize: 15 }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
                {item.meta}
              </Text>
            </Pressable>
          )}
        />
      </Animated.View>
    </>
  );
}
