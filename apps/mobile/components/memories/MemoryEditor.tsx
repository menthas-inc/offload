// 040. One memory, added or changed, in a sheet. From the kit's `edH()`, the
// phone branch, and the handoff's item 5.
//
// A `DragSheet` the keyboard lifts, focused from `onOpen` once the sheet has
// a size, never on mount: a keyboard that beats its sheet moves the
// screen. A drag, the scrim and Android's back are Cancel.
//
// **The kind is preselected**, About for a new one (the map's kind when added
// from a map zoomed into one) and the memory's own when changing it, so Save needs only words and nobody chooses before they can put
// something down. A newline is refused and the return key saves: a memory is
// one sentence. A refusal keeps the sheet open with its reason under the
// field; a write that never lands keeps it open too, and the toast offers
// Retry.

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import {
  MEMORY_COPY,
  MEMORY_KINDS,
  MEMORY_TEXT_CHARS,
  memoryOrigin,
  shownText,
  storedText,
  type MemoryKindId,
  type MemoryView,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { DragSheet } from "../shell/DragSheet";
import { useColors } from "../../lib/colors";
import { kindColors, severs, submitMemory, typedLine } from "../../lib/memories";

const isAndroid = Platform.OS === "android";
const COLUMNS = 3;
const GAP = 8;

export function MemoryEditor({
  editing: held,
  preset = null,
  onClose,
  onSaved,
  onFailed,
  onForget,
  onGone,
}: {
  /** The memory being changed, or null for a new one. */
  editing: MemoryView | null;
  /** A new memory's kind when the map is zoomed into one; About otherwise. */
  preset?: MemoryKindId | null;
  /** Cancel, a drag, the scrim and Android's back. Drops the draft. */
  onClose: () => void;
  /** Written. The sheet has closed; the toast is `Saved` or `Remembered`. */
  onSaved: (toast: string) => void;
  /** Never landed. The sheet stays open, and the toast's Retry sends again. */
  onFailed: (retry: () => void) => void;
  /** Forget, from the foot. The sheet has closed. */
  onForget: (memory: MemoryView) => void;
  /** Forgotten elsewhere while open. The sheet has closed; nothing is said,
   *  and the list is read again. */
  onGone: () => void;
}) {
  const COLOR = useColors();
  // Stored about the person and shown to them (F4), by the rule the web's
  // editor uses: the sheet holds the person's form, and a save writes the
  // stored one.
  const editing = held ? { ...held, text: shownText(held.text) } : null;
  const field = useRef<TextInput>(null);
  const [draft, setDraft] = useState(editing?.text ?? "");
  const [kind, setKind] = useState<MemoryKindId>(editing?.kind ?? preset ?? "about");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  // A reason belongs to the words it refused.
  useEffect(() => setRefusal(null), [draft, kind]);

  const canSave = draft.trim().length > 0 && !busy;
  const title = editing ? "Memory" : "New memory";
  const origin = editing ? memoryOrigin(editing) : null;
  const palette = { labels: COLOR.labels, ink: COLOR.ink, raised: COLOR.raised, inverse: COLOR.inverse, onSolid: COLOR.onSolid };
  // Floored, as Edit thread's grid: Android rounds each cell to the pixel
  // grid, and three cells a fraction too wide wrap as two.
  const cell = gridWidth > 0 ? Math.floor((gridWidth - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const action = isAndroid ? "text-blue-700" : "text-text-accent";

  async function save(text: string = draft): Promise<void> {
    if (!text.trim() || busy) return;
    setBusy(true);
    const done = await submitMemory(held, storedText(held?.text ?? null, text), kind);
    setBusy(false);
    if (done.outcome === "refused") {
      setRefusal(done.line);
      return;
    }
    if (done.outcome === "failed") {
      onFailed(() => void save(text));
      return;
    }
    onClose();
    if (done.outcome === "gone") onGone();
    if (done.outcome === "saved") onSaved(done.toast);
  }

  return (
    <DragSheet
      onClose={onClose}
      keyboard="lift"
      // Held while a save is in flight: a drag mid-save would close the sheet
      // under a write that then says Saved.
      locked={busy}
      accessibilityLabel={title}
      className="px-gutter-screen pb-space-8 pt-space-2"
      onOpen={() => field.current?.focus()}
    >
      <View className="flex-row items-center" style={{ minHeight: 36 }}>
        <View className="flex-1 items-start">
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text className={`font-core ${isAndroid ? "font-medium text-blue-700" : "text-text-secondary"}`} style={{ fontSize: 16 }}>
              Cancel
            </Text>
          </Pressable>
        </View>
        <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 17 }} accessibilityRole="header">
          {title}
        </Text>
        <View className="flex-1 items-end">
          <Pressable
            onPress={() => void save()}
            disabled={!canSave}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            <Text className={`font-core ${isAndroid ? "font-medium" : "font-semibold"} ${action}`} style={{ fontSize: 16, opacity: canSave ? 1 : 0.35 }}>
              {editing ? "Save" : "Add"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        className={`mt-space-6 ${
          isAndroid
            ? `rounded-a-xs ${focused ? "border-2 border-blue-600" : "border border-border-strong"}`
            : `rounded-md bg-surface-page ${focused ? "border-2 border-ink-950" : "border border-border-strong"}`
        }`}
        style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 }}
      >
        <TextInput
          ref={field}
          value={draft}
          // Android's Enter on a multiline field arrives as a newline, not a
          // submit: at the end it saves, as iOS's return does.
          onChangeText={(text) => {
            const typed = typedLine(draft, text);
            setDraft(typed.text);
            if (typed.submit) void save(typed.text);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={MEMORY_TEXT_CHARS}
          multiline
          scrollEnabled={false}
          submitBehavior="submit"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          placeholder={MEMORY_COPY.placeholder}
          placeholderTextColor={COLOR.quiet}
          accessibilityLabel={title}
          className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 17, lineHeight: 24.6, minHeight: 74, paddingVertical: 0, textAlignVertical: "top" }}
        />
        <Text className="mt-space-3 self-end font-core text-text-tertiary" style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
          {`${draft.length}/${MEMORY_TEXT_CHARS}`}
        </Text>
      </View>

      {refusal ? (
        <Text className="mt-space-3 font-core text-label text-text-danger" accessibilityLiveRegion="polite">
          {refusal}
        </Text>
      ) : null}
      {severs(editing, draft) ? (
        <Text className={`mt-space-3 font-core text-label ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}>{MEMORY_COPY.sever}</Text>
      ) : null}

      <Text
        className={`mb-space-4 mt-space-7 font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
        style={{ fontSize: 13, marginHorizontal: 2 }}
      >
        Kind
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Kind"
        onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
      >
        {cell > 0
          ? MEMORY_KINDS.map((one) => {
              const on = one.kind === kind;
              const colors = kindColors(one.kind, palette);
              const glyph = on ? colors.ink : colors.filled ? COLOR.ink : colors.ink;
              return (
                <Pressable
                  key={one.kind}
                  onPress={() => setKind(one.kind)}
                  accessibilityRole="radio"
                  accessibilityLabel={one.name}
                  accessibilityState={{ checked: on }}
                  className={`flex-row items-center justify-center ${on ? "" : isAndroid ? "bg-a-c-high" : "bg-surface-fill"}`}
                  style={[
                    { width: cell, minHeight: 44, gap: 7, paddingHorizontal: 10, borderRadius: isAndroid ? 8 : 12 },
                    on ? { backgroundColor: colors.soft } : null,
                    on && !colors.filled ? { borderWidth: 2, borderColor: colors.ink } : null,
                  ]}
                >
                  <Glyph name={one.glyph} size={16} color={glyph} />
                  <Text
                    className={`font-core font-medium ${on ? "" : isAndroid ? "text-a-on" : "text-text-primary"}`}
                    style={[{ fontSize: 14 }, on ? { color: colors.ink } : null]}
                    numberOfLines={1}
                  >
                    {one.name}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </View>

      <View
        className={`mt-space-6 flex-row items-start rounded-md px-space-6 py-space-5 ${isAndroid ? "bg-a-c-high" : "bg-surface-fill"}`}
        style={{ gap: 10 }}
      >
        {origin ? (
          <>
            <Glyph name={origin.glyph} size={16} color={COLOR.secondary} />
            <Text className="flex-1 font-core text-text-secondary" style={{ fontSize: 13.5, lineHeight: 19.6 }}>
              <Text className={`font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}>{origin.lead}</Text>
              {origin.rest}
            </Text>
          </>
        ) : (
          <>
            <Glyph name="compass" size={16} color={COLOR.secondary} />
            <Text className="flex-1 font-core text-text-secondary" style={{ fontSize: 13.5, lineHeight: 19.6 }}>
              {MEMORY_COPY.newRule}
            </Text>
          </>
        )}
      </View>

      {editing ? (
        <Pressable
          onPress={() => {
            onClose();
            onForget(held ?? editing);
          }}
          accessibilityRole="button"
          className="mt-space-6 min-h-tap-min flex-row items-center gap-space-4 self-start"
        >
          <Glyph name="trash-2" size={17} color={COLOR.danger} />
          <Text className="font-core font-medium text-text-danger" style={{ fontSize: 15 }}>
            Forget
          </Text>
        </Pressable>
      ) : null}
    </DragSheet>
  );
}
