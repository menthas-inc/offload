// 025. The label sheet, for one row: title Labels, the row's title under it,
// each of the thread's labels with its dot, name, count and a tick, and New
// label, which opens a name field in place and adds the label ticked. Done is
// one write and a toast with Undo; Cancel writes nothing, a label made in here
// included.
//
// 2026-09-29. The body is `LabelPanel`, which the edit sheet opens in place
// rather than as a second sheet over it, and which this sheet wraps when the
// long press's Labels opens it alone. Its foot is the row sheets' own: Clear
// on the left where Delete sits, Cancel and Done on the right. The sheet grows
// by the keyboard's height from its foot rather than rising by it, so its top,
// where the name field sits, never leaves the screen; this app is edge to
// edge and Android ignores adjustResize.

import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { scrimIn, scrimOut, sheetIn, sheetOut } from "../../lib/motion";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { foldDraft, LABEL_NAME_CHARS } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { atOpacity, useColors } from "../../lib/colors";
import { useScreenSheet } from "../shell/conversation-context";
import { SheetFoot } from "../shell/SheetFoot";
import { LabelDot } from "./LabelMark";
import type { Label } from "../../lib/labels";

const isAndroid = Platform.OS === "android";
const LIMIT = 10;

export interface LabelChoice {
  ids: string[];
  made: string[];
}

export function LabelSheet({
  title,
  labels,
  carried,
  onDone,
  onClose,
}: {
  title: string;
  labels: Label[];
  carried: string[];
  onDone: (choice: LabelChoice) => void;
  onClose: () => void;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  useScreenSheet(true);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  // Whichever is taller, the keyboard or the home indicator's inset, is the
  // foot's padding. `keyboardHeight` is negative while the keyboard is up.
  const room = useAnimatedStyle(() => ({
    paddingBottom: Math.max(insets.bottom, -keyboardHeight.value) + 8,
  }));

  return (
    <>
      <Animated.View
        entering={scrimIn()}
        exiting={scrimOut()}
        className="absolute inset-0"
        style={{ backgroundColor: atOpacity(COLOR.scrim, 0.35) }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={sheetIn()}
        exiting={sheetOut()}
        className={`absolute inset-x-0 bottom-0 rounded-t-lg ${isAndroid ? "bg-a-c" : "bg-surface-raised"}`}
        style={[{ maxHeight: windowHeight - insets.top - 12 }, room]}
        accessibilityViewIsModal
      >
        <View className="items-center pt-space-3">
          <View className="rounded-pill bg-border-strong" style={{ width: 36, height: 4 }} />
        </View>
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerClassName="px-gutter-screen pt-space-5"
          keyboardShouldPersistTaps="handled"
        >
          <LabelPanel title={title} labels={labels} carried={carried} confirm="Done" onCancel={onClose} onDone={onDone} />
        </ScrollView>
      </Animated.View>
    </>
  );
}

/** The label sheet's body and foot, with no sheet around it. */
export function LabelPanel({
  title,
  labels,
  carried,
  made: madeBefore = [],
  confirm,
  onCancel,
  onDone,
}: {
  title: string;
  labels: Label[];
  carried: string[];
  /** Names typed on an earlier open, not made yet: the edit sheet hands them
   *  back when the panel is opened again before Save. */
  made?: string[];
  confirm: string;
  onCancel: () => void;
  onDone: (choice: LabelChoice) => void;
}) {
  const COLOR = useColors();
  const [ticked, setTicked] = useState<string[]>(carried);
  const [made, setMade] = useState<string[]>(madeBefore);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const full = labels.length + made.length >= LIMIT;

  function addName(): void {
    const folded = foldDraft(draft, made, labels.map((l) => l.name));
    if ("line" in folded) return setLine(folded.line);
    setMade(folded.made);
    setDraft("");
    setNaming(false);
    setLine(null);
  }

  /** Done takes in a name still in the field: the press can arrive before the
   *  field's blur has added it. */
  function done(): void {
    const folded = naming ? foldDraft(draft, made, labels.map((l) => l.name)) : { made };
    if ("line" in folded) return setLine(folded.line);
    onDone({ ids: ticked, made: folded.made });
  }

  const tick = (on: boolean) => (
    <View
      className={`items-center justify-center rounded-xs ${on ? "bg-surface-inverse" : "border border-border-strong"}`}
      style={{ width: 22, height: 22, borderWidth: on ? 0 : 1.5 }}
    >
      {on ? <Glyph name="check" size={14} color={COLOR.onSolid} /> : null}
    </View>
  );

  return (
    <View>
      <View className="pb-space-3">
        <Text className="font-core font-semibold text-text-primary text-title-2">Labels</Text>
        <Text className="mt-space-1 font-core text-text-secondary text-body-sm" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {labels.map((label) => {
        const on = ticked.includes(label.id);
        return (
          <Pressable
            key={label.id}
            onPress={() => setTicked((current) => (on ? current.filter((id) => id !== label.id) : [...current, label.id]))}
            className="min-h-tap-min flex-row items-center gap-space-5 border-b border-border-hairline"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <LabelDot colour={label.colour} />
            <Text className="flex-1 font-core text-text-primary text-body" numberOfLines={1}>
              {label.name}
            </Text>
            {label.count > 0 ? (
              <Text className="font-core text-label text-text-tertiary" style={{ fontVariant: ["tabular-nums"] }}>
                {label.count}
              </Text>
            ) : null}
            {tick(on)}
          </Pressable>
        );
      })}
      {made.map((name) => (
        <Pressable
          key={`new:${name}`}
          onPress={() => setMade((current) => current.filter((one) => one !== name))}
          className="min-h-tap-min flex-row items-center gap-space-5 border-b border-border-hairline"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: true }}
        >
          <Glyph name="plus" size={14} color={COLOR.iconOnWell} />
          <Text className="flex-1 font-core text-text-primary text-body" numberOfLines={1}>
            {name}
          </Text>
          {tick(true)}
        </Pressable>
      ))}
      {naming ? (
        <View className="mt-space-4 flex-row items-center rounded-sm border border-border-strong px-space-5" style={{ minHeight: 44 }}>
          <TextInput
            ref={input}
            autoFocus
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setLine(null);
            }}
            onSubmitEditing={addName}
            onBlur={addName}
            returnKeyType="done"
            placeholder="Name it"
            placeholderTextColor={COLOR.quiet}
            maxLength={LABEL_NAME_CHARS + 4}
            accessibilityLabel="New label's name"
            className="flex-1 font-core text-text-primary text-body"
          />
        </View>
      ) : (
        <Pressable
          onPress={() => setNaming(true)}
          disabled={full}
          className="min-h-tap-min flex-row items-center gap-space-4"
          accessibilityRole="button"
          accessibilityState={{ disabled: full }}
        >
          <Glyph name="plus" size={16} color={full ? COLOR.disabledText : COLOR.iconOnWell} />
          <Text className={`font-core ${full ? "text-state-disabled-text" : "text-text-secondary"} text-body`}>New label</Text>
        </Pressable>
      )}
      {full && !naming ? <Text className="font-core text-text-secondary text-label">A thread holds ten labels.</Text> : null}
      {line ? <Text className="pt-space-3 font-core text-text-danger text-label">{line}</Text> : null}

      {/* Clear takes every label off, and whatever was typed here with them. */}
      <SheetFoot
        lead={{
          label: "Clear",
          danger: true,
          onPress: () => onDone({ ids: [], made: [] }),
        }}
        onCancel={onCancel}
        onConfirm={done}
        confirm={confirm}
      />
    </View>
  );
}
