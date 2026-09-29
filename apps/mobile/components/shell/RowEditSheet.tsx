// The row's one sheet. 023.
//
// The kit's edit was a rename. It has grown rather than changed: the title
// and the details keep their place at the top, then When and Repeats carry
// their values and open the When sheet, then Remind me while the row is a
// reminder, which is the one way out of one. Save writes once: every changed
// field in one request, drawn first and sent second by the screen.
//
// 2026-09-29. Labels joined it when the row's tools left the row. When,
// Repeats and Labels open in place, in this sheet, rather than as sheets over
// it, so nobody goes back and forth between layers; each hands its value back
// on Done and Save below still writes once. The details field went the same
// day: offload is for short things, and what is stored there is left as it is.

import { useCallback, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glyph } from "../Glyph";
import { Switch } from "../settings/Switch";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import type { ContentPatch, ContentRow } from "../../lib/threads";
import { patchFor, repeatsLabel, sameWhen, whenLabel, whenValueOf, type WhenValue } from "../../lib/when";
import { DragSheet } from "./DragSheet";
import { CustomFor, WhenPanel, type CustomAsk } from "./WhenSheet";
import { LabelPanel, type LabelChoice } from "../labels/LabelSheet";
import { SheetFoot } from "./SheetFoot";
import { LabelDot } from "../labels/LabelMark";
import type { Label } from "../../lib/labels";

const isAndroid = Platform.OS === "android";

export function RowEditSheet({
  row,
  onClose,
  onSave,
  onRemove,
  labels,
}: {
  row: ContentRow | null;
  onClose: () => void;
  /** Every changed field, in one patch. The sheet closes at the press and
   *  the screen writes it, so the keyboard is never held up for a round trip.
   *  `made` is any label typed in the label sheet, to be made first and
   *  added to `patch.labels`. */
  onSave: (row: ContentRow, patch: ContentPatch, made: string[]) => void;
  /** The thread's labels. Absent on Today, which has no one thread's set. */
  labels?: Label[] | undefined;
  /** The way out, in the sheet that already has the row open. */
  onRemove: (row: ContentRow) => void;
}) {
  const COLOR = useColors();
  const { zone } = useClock();
  const [title, setTitle] = useState(row?.title ?? "");
  const [when, setWhen] = useState<WhenValue>(() => (row ? whenValueOf(row, zone) : { day: null, time: null, endTime: null, rrule: null }));
  const [remind, setRemind] = useState(row?.isReminder ?? false);
  const [picking, setPicking] = useState<"when" | "repeats" | "labels" | null>(null);
  const [choice, setChoice] = useState<LabelChoice | null>(null);
  const [custom, setCustom] = useState<CustomAsk | null>(null);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const scrollTo = useCallback((y: number) => scroll.current?.scrollTo({ y, animated: false }), []);

  if (!row) return null;
  const held = whenValueOf(row, zone);
  const carried = (labels ?? []).filter((label) => (choice?.ids ?? row.labels).includes(label.id));

  function save(): void {
    if (!row) return;
    const patch: ContentPatch = {};
    const text = title.trim();
    if (text.length > 0 && text !== row.title) patch.title = text;
    if (!sameWhen(when, held)) Object.assign(patch, patchFor(row, when));
    if (row.isReminder && !remind) patch.isReminder = false;
    const relabelled =
      choice !== null &&
      (choice.made.length > 0 || choice.ids.length !== row.labels.length || choice.ids.some((id) => !row.labels.includes(id)));
    if (relabelled) patch.labels = choice.ids;
    if (Object.keys(patch).length === 0) return onClose();
    onSave(row, patch, relabelled ? choice.made : []);
  }

  const rowInk = isAndroid ? "text-a-on" : "text-text-primary";
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  // The keyboard is up from the title field, and a panel has no use for it.
  function pick(which: "when" | "repeats" | "labels"): void {
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: false });
    setPicking(which);
  }
  function back(): void {
    // A panel's own field may have had the keyboard; the sheet's fields do
    // not want it back uninvited.
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: false });
    setPicking(null);
  }

  return (
    <>
      {/* The sheet grows by the keyboard from its foot rather than rising by
          it, so its top never leaves the screen however much is in it. The
          heading is gone, so the sheet carries the name a screen reader
          announces. A drag down is Cancel. */}
      <DragSheet
        onClose={onClose}
        keyboard="room"
        sheetStyle={{ maxHeight: windowHeight - insets.top - 12 }}
        className="px-gutter-screen"
        accessibilityLabel="Edit"
      >
        {/* Bounded and scrolling, because at a large text size on a small
            phone the fields and the pills together outgrow the sheet, and a
            sheet that clips is one whose Save cannot be reached. */}
        <ScrollView ref={scroll} style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        {/* A panel in place of the sheet's own fields. */}
        {picking === "labels" && labels ? (
          <LabelPanel
            title={title.trim() || row.title}
            labels={labels}
            carried={choice?.ids ?? row.labels}
            made={choice?.made ?? []}
            confirm="Done"
            onCancel={back}
            onDone={(next) => {
              setChoice(next);
              back();
            }}
          />
        ) : picking === "when" || picking === "repeats" ? (
          <WhenPanel
            title={title.trim() || row.title}
            isEvent={row.type === "event"}
            initial={when}
            focus={picking}
            confirm="Done"
            onCancel={back}
            onSave={(value) => {
              setWhen(value);
              back();
            }}
            onCustom={setCustom}
            onScrollTo={scrollTo}
          />
        ) : null}

        {/* The sheet's own fields stay mounted under a panel, hidden, so the
            title field does not take focus and raise the keyboard again when
            a panel closes. */}
        <View style={picking ? { display: "none" } : undefined}>
        {/* No heading: the title field is larger and in the primary ink. */}
        <TextInput
          value={title}
          onChangeText={setTitle}
          autoFocus
          placeholder="What is it?"
          placeholderTextColor={COLOR.iconOnWell}
          accessibilityLabel="Title"
          className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core font-semibold text-title-3 ${rowInk}`}
          returnKeyType="done"
        />

        {/* When and Repeats carry their values and open the same sheet, which
            hands back rather than writing: Save below writes once. A row on a
            calendar keeps its time, which is Google's, and offers neither. */}
        {!row.onCalendar ? (
          <>
            <Pressable onPress={() => pick("when")} className="mt-space-2 min-h-tap-min flex-row items-center gap-space-3" accessibilityRole="button">
              <Glyph name="calendar" size={18} color={COLOR.iconOnWell} />
              <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
                When
              </Text>
              <Text className={`font-core ${quiet}`} style={{ fontSize: 15 }}>
                {whenLabel(when)}
              </Text>
              <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
            </Pressable>
            <Pressable onPress={() => pick(when.day ? "repeats" : "when")} className="min-h-tap-min flex-row items-center gap-space-3" accessibilityRole="button">
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

        {/* The row's labels, by dot and name, and the label sheet behind them. */}
        {labels ? (
          <Pressable onPress={() => pick("labels")} className="min-h-tap-min flex-row items-center gap-space-3" accessibilityRole="button" accessibilityLabel={`Labels, ${[...carried.map((label) => label.name), ...(choice?.made ?? [])].join(", ") || "none"}`}>
            <Glyph name="tag" size={18} color={COLOR.iconOnWell} />
            <Text className={`font-core ${rowInk}`} style={{ fontSize: 15 }}>
              Labels
            </Text>
            <View className="flex-1 flex-row items-center justify-end gap-space-2">
              {carried.map((label) => (
                <LabelDot key={label.id} colour={label.colour} />
              ))}
              <Text className={`shrink font-core ${quiet}`} style={{ fontSize: 15 }} numberOfLines={1}>
                {[...carried.map((label) => label.name), ...(choice?.made ?? [])].join(", ")}
              </Text>
            </View>
            <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
          </Pressable>
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

        {/* The way out on the left, Cancel and Save on the right. Three pills
            that wrap at an accessibility text size rather than pushing Save
            past the edge. */}
        <SheetFoot
          lead={{
            label: row.archivedAt ? "Put back" : row.canDelete ? "Delete" : "Archive",
            icon: row.archivedAt ? "rewind" : row.canDelete ? "trash-2" : "archive",
            danger: row.canDelete && !row.archivedAt,
            onPress: () => onRemove(row),
          }}
          onCancel={onClose}
          onConfirm={save}
          confirm="Save"
        />
        </View>
        </ScrollView>
      </DragSheet>

      <CustomFor ask={custom} onClose={() => setCustom(null)} />
    </>
  );
}
