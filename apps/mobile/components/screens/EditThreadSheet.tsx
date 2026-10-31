// 037. Edit thread: the name, the icon and the colour in one sheet, in place
// of the rename sheet. From the handoff's item 6 and the standalone page's
// `.sheet`, `.shh`, `.nfv`, `.pscroll`, `.pgrid`, `.pk` and `.sws`; Android's
// circles, blue pick and outlined field are its `[data-plat=android]` rules.
//
// What Save sends is `threadChange` in @offload/widgets, which the web's
// popover shares, and the icon shown is `previewThreadIcon`: while the pick is
// still offload's, typing a name shows the icon the rename would pick.
//
// 2026-10-07. The same sheet is New thread, from the plus on My threads, with
// a heading and an action of its own.
//
// The sheet is as tall as its contents and rides up with the keyboard, so
// the name being typed is never under it.

import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  HUE_NAMES,
  LAYOUTS,
  LAYOUT_NAMES,
  THREAD_ICON_NAMES,
  previewThreadIcon,
  threadChange,
  threadIconLabel,
  type Layout,
  type ThreadLook,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { LayoutTile } from "../LayoutTile";
import { DragSheet } from "../shell/DragSheet";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";
const HUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const COLUMNS = 6;
const GAP = 6;

export function EditThreadSheet({
  thread,
  from,
  onClose,
  onSave,
  heading = "Edit thread",
  action = "Save",
}: {
  /** New thread's words in place of Edit thread's. */
  heading?: string;
  action?: string;
  thread: ThreadLook & { id: string; layout?: Layout; layoutSetBy?: "offload" | "person" };
  /** What was tapped. The name opens the keyboard; the icon does not; a
   *  notice's Change brings the picked layout into view. */
  from: "icon" | "name" | "layout";
  /** Cancel, the scrim, a swipe down and Android's back. Drops everything. */
  onClose: () => void;
  /** The change to write, and what the bar draws at the press. The sheet has
   *  already closed. */
  onSave: (change: { name?: string; icon?: string; hue?: number; layout?: Layout }, shown: { name: string; icon: string; hue: number }) => void;
}) {
  const COLOR = useColors();
  const [name, setName] = useState(thread.name);
  const [picked, setPicked] = useState<string | null>(null);
  const [hue, setHue] = useState(thread.hue);
  const [layout, setLayout] = useState<Layout>(thread.layout ?? "default");
  const [focused, setFocused] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const field = useRef<TextInput>(null);
  const layouts = useRef<ScrollView>(null);

  const icon = previewThreadIcon(thread, { name, icon: picked });
  const canSave = name.trim().length > 0;
  // Floored: Android rounds each cell to the pixel grid, and six cells a
  // fraction too wide wrap as five.
  const cell = gridWidth > 0 ? Math.floor((gridWidth - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  function save(): void {
    if (!canSave) return;
    const change: { name?: string; icon?: string; hue?: number; layout?: Layout } = threadChange(thread, { name, icon: picked, hue }) ?? {};
    // The layout rides the same Save, so one write and one Undo (6.8).
    if (layout !== (thread.layout ?? "default")) change.layout = layout;
    onClose();
    if (Object.keys(change).length > 0) onSave(change, { name: name.trim(), icon, hue });
  }

  return (
    <DragSheet
      onClose={onClose}
      accessibilityLabel={heading}
      // As tall as what is in it, and no taller: the design's sheet ran from
      // 150 below the top and left the space under the colours empty.
      className="px-gutter-screen pb-space-8 pt-space-2"
      keyboard="lift"
      onOpen={() => {
        if (from === "name") field.current?.focus();
        // A medium LayoutTile is 64 wide, with the strip's gap of 10.
        if (from === "layout") layouts.current?.scrollTo({ x: LAYOUTS.indexOf(layout) * 74, animated: true });
      }}
    >
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text className={`font-core ${isAndroid ? "text-blue-700" : "text-text-secondary"}`} style={{ fontSize: 16 }}>
            Cancel
          </Text>
        </Pressable>
        <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 17 }} accessibilityRole="header">
          {heading}
        </Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={12} accessibilityRole="button" accessibilityState={{ disabled: !canSave }}>
          <Text
            className={`font-core font-semibold ${isAndroid ? "text-blue-700" : "text-text-accent"}`}
            style={{ fontSize: 16, opacity: canSave ? 1 : 0.4 }}
          >
            {action}
          </Text>
        </Pressable>
      </View>

      <View className="flex-row items-center" style={{ gap: 14, marginTop: 16, marginBottom: 4 }}>
        <ThreadIcon icon={icon} hue={hue} seed={thread.id} size={56} />
        <View className="flex-1" style={{ gap: 5 }}>
          <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 12.5 }}>
            Name
          </Text>
          <TextInput
            ref={field}
            value={name}
            onChangeText={setName}
            maxLength={80}
            accessibilityLabel="Name"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={save}
            returnKeyType="done"
            placeholderTextColor={COLOR.iconOnWell}
            className={`px-space-4 font-core font-medium ${
              isAndroid
                ? `rounded-a-xs text-a-on ${focused ? "border-2 border-blue-600" : "border border-border-strong"}`
                : `rounded-md bg-surface-page text-text-primary ${focused ? "border-2 border-ink-950" : "border border-border-hairline"}`
            }`}
            style={{ minHeight: 44, fontSize: 17 }}
          />
        </View>
      </View>

      <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13, marginTop: 16, marginBottom: 8, marginHorizontal: 2 }}>
        Icon
      </Text>
      {/* The seventy scroll on their own, inside the sheet. */}
      <View className={isAndroid ? "bg-a-c-high" : "bg-surface-fill"} style={{ height: 222, borderRadius: 14, overflow: "hidden" }}>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 8 }}>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Icon"
            onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
            style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
          >
            {cell > 0
              ? THREAD_ICON_NAMES.map((one) => {
                  const on = one === icon;
                  return (
                    <Pressable
                      key={one}
                      onPress={() => setPicked(one)}
                      accessibilityRole="radio"
                      accessibilityLabel={threadIconLabel(one)}
                      accessibilityState={{ checked: on }}
                      className={`items-center justify-center ${
                        on ? (isAndroid ? "border-2 border-blue-600 bg-surface-attention-soft" : "border-2 border-ink-950 bg-surface-raised") : ""
                      }`}
                      style={{ width: cell, height: cell, borderRadius: isAndroid ? cell / 2 : 11 }}
                    >
                      <Glyph name={one} size={22} color={on ? (isAndroid ? COLOR.sectionGlyph : COLOR.ink) : COLOR.iconOnWell} />
                    </Pressable>
                  );
                })
              : null}
          </View>
        </ScrollView>
      </View>

      <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13, marginTop: 16, marginBottom: 8, marginHorizontal: 2 }}>
        Colour
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Colour" className="flex-row justify-between">
        {HUES.map((one, index) => {
          const on = one === hue;
          return (
            <Pressable
              key={one}
              onPress={() => setHue(one)}
              hitSlop={6}
              accessibilityRole="radio"
              accessibilityLabel={HUE_NAMES[index]}
              accessibilityState={{ checked: on }}
              className={`rounded-pill border-2 ${on ? (isAndroid ? "border-blue-600" : "border-ink-950") : "border-transparent"}`}
              style={{ padding: 2 }}
            >
              <ThreadIcon icon={icon} hue={one} seed={thread.id} size={26} round bare />
            </Pressable>
          );
        })}
      </View>

      <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13, marginTop: 16, marginBottom: 8, marginHorizontal: 2 }}>
        Layout
      </Text>
      <ScrollView
        ref={layouts}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="radiogroup"
        accessibilityLabel="Layout"
        contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}
      >
        {LAYOUTS.map((one) => (
          <LayoutTile key={one} layout={one} selected={one === layout} onPress={() => setLayout(one)} />
        ))}
      </ScrollView>
      {thread.layoutSetBy === "offload" && (thread.layout ?? "default") !== "default" ? (
        <View
          className={isAndroid ? "bg-a-c-high" : "bg-surface-fill"}
          style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 8, padding: 10, borderRadius: 12 }}
        >
          <Glyph name="sparkles" size={14} color={COLOR.iconOnWell} />
          <Text className={`font-core flex-1 ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13, lineHeight: 19 }}>
            offload picked {LAYOUT_NAMES[thread.layout ?? "default"]} when it made this thread.
          </Text>
        </View>
      ) : null}
    </DragSheet>
  );
}
