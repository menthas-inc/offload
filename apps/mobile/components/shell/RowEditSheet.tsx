// The row's one sheet. 023.
//
// The kit's edit was a rename. It has grown rather than changed: the title
// and the details keep their place at the top, then When and Repeats carry
// their values and open the When sheet, then Remind me while the row is a
// reminder, which is the one way out of one. Save writes once: every changed
// field in one request, drawn first and sent second by the screen.

import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle } from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { Switch } from "../settings/Switch";
import { atOpacity, useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import type { ContentPatch, ContentRow } from "../../lib/threads";
import { patchFor, repeatsLabel, sameWhen, whenLabel, whenValueOf, type WhenValue } from "../../lib/when";
import { useScreenSheet } from "./conversation-context";
import { WhenSheet } from "./WhenSheet";

const isAndroid = Platform.OS === "android";

export function RowEditSheet({
  row,
  onClose,
  onSave,
  onRemove,
}: {
  row: ContentRow | null;
  onClose: () => void;
  /** Every changed field, in one patch. The sheet closes at the press and
   *  the screen writes it, so the keyboard is never held up for a round trip. */
  onSave: (row: ContentRow, patch: ContentPatch) => void;
  /** The way out, in the sheet that already has the row open. */
  onRemove: (row: ContentRow) => void;
}) {
  const COLOR = useColors();
  const { zone } = useClock();
  useScreenSheet(row !== null);
  const [title, setTitle] = useState(row?.title ?? "");
  const [body, setBody] = useState(row?.body ?? "");
  const [when, setWhen] = useState<WhenValue>(() => (row ? whenValueOf(row, zone) : { day: null, time: null, endTime: null, rrule: null }));
  const [remind, setRemind] = useState(row?.isReminder ?? false);
  const [picking, setPicking] = useState<"when" | "repeats" | null>(null);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: keyboardHeight.value }] }));

  if (!row) return null;
  const held = whenValueOf(row, zone);

  function save(): void {
    if (!row) return;
    const patch: ContentPatch = {};
    const text = title.trim();
    if (text.length > 0 && text !== row.title) patch.title = text;
    const details = body.trim();
    if (details !== (row.body ?? "")) patch.body = details || null;
    if (!sameWhen(when, held)) Object.assign(patch, patchFor(row, when));
    if (row.isReminder && !remind) patch.isReminder = false;
    if (Object.keys(patch).length === 0) return onClose();
    onSave(row, patch);
  }

  const rowInk = isAndroid ? "text-a-on" : "text-text-primary";
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  return (
    <>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} className="absolute inset-0" style={{ backgroundColor: atOpacity(COLOR.scrim, 0.35) }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={lift}
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        className={`absolute inset-x-0 bottom-0 px-gutter-screen pb-space-8 pt-space-6 ${isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"}`}
      >
        <Text className={`font-core font-semibold ${rowInk}`} style={{ fontSize: 17 }}>
          Edit
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          autoFocus
          placeholder="What is it?"
          placeholderTextColor={COLOR.iconOnWell}
          className={`mt-space-3 rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${rowInk}`}
          style={{ fontSize: 15 }}
          returnKeyType="done"
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Add details"
          placeholderTextColor={COLOR.iconOnWell}
          multiline
          className={`mt-space-2 rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${rowInk}`}
          style={{ fontSize: 15, minHeight: 44, maxHeight: 96 }}
        />

        {/* When and Repeats carry their values and open the same sheet, which
            hands back rather than writing: Save below writes once. A row on a
            calendar keeps its time, which is Google's, and offers neither. */}
        {!row.onCalendar ? (
          <>
            <Pressable onPress={() => setPicking("when")} className="mt-space-2 min-h-tap-min flex-row items-center gap-space-3" accessibilityRole="button">
              <Glyph name="calendar" size={18} color={COLOR.iconOnWell} />
              <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                When
              </Text>
              <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }}>
                {whenLabel(when)}
              </Text>
              <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
            </Pressable>
            <Pressable onPress={() => setPicking(when.day ? "repeats" : "when")} className="min-h-tap-min flex-row items-center gap-space-3" accessibilityRole="button">
              <Glyph name="clock" size={18} color={COLOR.iconOnWell} />
              <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                Repeats
              </Text>
              <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }} numberOfLines={1}>
                {when.day ? repeatsLabel(when) : ""}
              </Text>
              <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
            </Pressable>
          </>
        ) : null}

        {/* Remind me, drawn only while the row is a reminder: the way out of
            one, and nothing a person touches sets it. */}
        {row.isReminder ? (
          <View className="min-h-tap-min flex-row items-center gap-space-3">
            <Glyph name="bell" size={18} color={COLOR.iconOnWell} />
            <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
              Remind me
            </Text>
            <Switch checked={remind} onChange={setRemind} label="Remind me" />
          </View>
        ) : null}

        <View className="mt-space-4 flex-row items-center justify-end gap-space-4">
          <Pressable
            onPress={() => onRemove(row)}
            accessibilityLabel={row.archivedAt ? "Put back in the thread" : row.canDelete ? "Delete" : "Archive"}
            className="mr-auto flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5"
            style={{ minHeight: 30, justifyContent: "center" }}
          >
            <Glyph name={row.archivedAt ? "rewind" : row.canDelete ? "trash-2" : "archive"} size={14} color={row.canDelete && !row.archivedAt ? COLOR.danger : COLOR.iconOnWell} />
            <Text className={`font-core font-medium ${row.canDelete && !row.archivedAt ? "text-text-danger" : quiet}`} style={{ fontSize: 13 }}>
              {row.archivedAt ? "Put back" : row.canDelete ? "Delete" : "Archive"}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} className="rounded-pill border border-border-hairline px-space-5" style={{ minHeight: 30, justifyContent: "center" }} accessibilityRole="button">
            <Text className={`font-core font-medium ${quiet}`} style={{ fontSize: 13 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={save} className={`rounded-pill px-space-5 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`} style={{ minHeight: 30, justifyContent: "center" }} accessibilityRole="button">
            <Text className={`font-core font-medium ${isAndroid ? "text-a-surface" : "text-text-inverse"}`} style={{ fontSize: 13 }}>
              Save
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      {picking ? (
        <WhenSheet
          open
          title={title.trim() || row.title}
          isEvent={row.type === "event"}
          initial={when}
          focus={picking}
          onClose={() => setPicking(null)}
          onSave={(value) => {
            setWhen(value);
            setPicking(null);
          }}
        />
      ) : null}
    </>
  );
}
