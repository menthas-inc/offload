// Where a row goes, chosen by hand.
//
// The first move control the product has drawn. The shape is the kit's share
// sheet in ui_kits/mobile_app/Sharing.jsx: a list with search on top and a tap
// to choose. The threads are the person's own, from the same read My threads
// makes, minus the one the row is already in. Per the 21 September design:
// a row leads with the thread's own icon at 24 (037), since
// the share sheet's list is people and this one is threads; the footer is
// Cancel, because a tap on a destination commits; and a one-thread account
// gets a sentence rather than a search field over an empty list, which is
// the one state where the footer is the only thing to press.

import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { useColors } from "../../lib/colors";
import { fetchThreads, type ThreadRow } from "../../lib/threads";
import { DragSheet } from "./DragSheet";

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

  const others = useMemo(
    () => (threads ?? []).filter((thread) => thread.id !== exceptThreadId),
    [threads, exceptThreadId],
  );
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return others.filter((thread) => !needle || thread.name.toLowerCase().includes(needle));
  }, [others, query]);
  // Move can run out of destinations, which sharing never can.
  const nowhere = threads !== null && others.length === 0;

  if (!open) return null;

  return (
    <>
      {/* Lifted by the keyboard, which the search field raises on open: this
          app is edge to edge, Android ignores adjustResize, and a sheet
          anchored to the bottom sat entirely under the keyboard on a Pixel,
          which is the waitlist form's own lesson. The same lift Notes uses. */}
      <DragSheet
        onClose={onClose}
        keyboard="lift"
        surface={`rounded-t-lg ${isAndroid ? "bg-a-c" : "bg-surface-raised"}`}
        sheetStyle={{ maxHeight: "70%", paddingBottom: insets.bottom }}
        onOpen={() => input.current?.focus()}
      >
        {nowhere ? (
          <Text className="px-gutter-screen pb-space-3 pt-space-6 font-core text-text-secondary" style={{ fontSize: 15, lineHeight: 22 }}>
            There is no other thread to move it to.
          </Text>
        ) : (
          <>
            <View className="flex-row items-center gap-space-3 border-b border-border-hairline px-gutter-screen" style={{ height: 52 }}>
              <Glyph name="search" size={16} color={COLOR.iconOnWell} />
              <TextInput
                ref={input}
                value={query}
                onChangeText={setQuery}
                placeholder="Which thread?"
                placeholderTextColor={COLOR.iconOnWell}
                accessibilityLabel="Which thread?"
                className="flex-1 font-core text-text-primary"
                style={{ fontSize: 16 }}
              />
            </View>
            <FlatList
              data={shown}
              keyExtractor={(thread) => thread.id}
              keyboardShouldPersistTaps="handled"
              // The list gives way to the footer: grown to its content it
              // pushed Cancel off the bottom of the screen.
              style={{ flexGrow: 0, flexShrink: 1 }}
              ListEmptyComponent={
                threads === null ? null : (
                  <Text className="px-gutter-screen py-space-5 font-core text-text-tertiary" style={{ fontSize: 13 }}>
                    Nothing by that name.
                  </Text>
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onPick(item)}
                  className="min-h-tap-min flex-row items-center gap-space-3 px-gutter-screen"
                  accessibilityRole="button"
                >
                  <ThreadIcon icon={item.icon} hue={item.hue} seed={item.id} size={24} />
                  <Text className="flex-1 font-core text-text-primary" style={{ fontSize: 15 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
                    {item.meta}
                  </Text>
                </Pressable>
              )}
            />
          </>
        )}
        <View className="px-gutter-screen pb-space-3 pt-space-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="items-center justify-center rounded-pill border border-border-strong"
            style={{ height: 44 }}
          >
            <Text className="font-core font-medium text-text-primary" style={{ fontSize: 15 }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </DragSheet>
    </>
  );
}
