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
//
// 2026-11-02 (the owner). The details came back, because a screenshot's
// number was stored and nowhere to be read on a phone: the attachment, which
// opens it, and the caption beside it, editable, with the `Text:` words kept
// as they are. A number in them is a Call pill under them.
//
// 042. Remind me is drawn to the author whenever offload will remind them, and
// to anybody else while somebody asked, by the shared rule. The author's
// switch writes `reminders`, which stops every reminder for good; anybody
// else's writes 023's `isReminder` alone. Either is folded into the one Save.

import { useCallback, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glyph } from "../Glyph";
import { Switch } from "../settings/Switch";
import { photoCaption, remindSwitchShown, withCaption } from "@offload/widgets";
import { PhotoThumb } from "./PhotoThumb";
import { Actions } from "./Actions";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import type { ContentPatch, ContentRow } from "../../lib/threads";
import { NOTHING, patchFor, repeatsLabel, sameWhen, whenLabel, whenValueOf, type WhenValue } from "../../lib/when";
import { remindOf, remindWrite } from "../../lib/reminders";
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
  onArchive,
  labels,
  onMove,
  onOpenPhoto,
  onRemoveAction,
}: {
  row: ContentRow | null;
  onClose: () => void;
  /** 2026-11-02. The attachment's tile opens it: the viewer, or the PDF. */
  onOpenPhoto?: ((row: ContentRow) => void) | undefined;
  /** 050. Remove one of the row's actions, author only, with the row's Undo. */
  onRemoveAction?: ((row: ContentRow, url: string) => void) | undefined;
  /** Every changed field, in one patch. The sheet closes at the press and
   *  the screen writes it, so the keyboard is never held up for a round trip.
   *  `made` is any label typed in the label sheet, to be made first and
   *  added to `patch.labels`. */
  onSave: (row: ContentRow, patch: ContentPatch, made: string[]) => void;
  /** The thread's labels. Absent on Today, which has no one thread's set. */
  labels?: Label[] | undefined;
  /** The way out, in the sheet that already has the row open. */
  onRemove: (row: ContentRow) => void;
  /** 2026-10-17. Archive, beside Delete on your own row. */
  onArchive?: ((row: ContentRow) => void) | undefined;
  /** 2026-10-12. Move, for whoever may move the row: the sheet closes and the
   *  screen opens its thread list. Absent where nothing can be moved. */
  onMove?: (row: ContentRow) => void;
}) {
  const COLOR = useColors();
  const { zone } = useClock();
  const [title, setTitle] = useState(row?.title ?? "");
  const [details, setDetails] = useState(photoCaption(row?.body) ?? "");
  // 050. Removed here while the sheet is open; the row prop is a snapshot.
  const [removed, setRemoved] = useState<string[]>([]);
  const [when, setWhen] = useState<WhenValue>(() => (row ? whenValueOf(row, zone) : NOTHING));
  const [remind, setRemind] = useState(row ? remindOf(row, row.author.isYou) : false);
  const [picking, setPicking] = useState<"when" | "repeats" | "labels" | null>(null);
  const [choice, setChoice] = useState<LabelChoice | null>(null);
  const [custom, setCustom] = useState<CustomAsk | null>(null);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const titleField = useRef<TextInput>(null);
  const scrollTo = useCallback((y: number) => scroll.current?.scrollTo({ y, animated: false }), []);

  if (!row) return null;
  const held = whenValueOf(row, zone);
  const carried = (labels ?? []).filter((label) => (choice?.ids ?? row.labels).includes(label.id));

  function save(): void {
    if (!row) return;
    const patch: ContentPatch = {};
    const text = title.trim();
    if (text.length > 0 && text !== row.title) patch.title = text;
    if (details.trim() !== (photoCaption(row.body) ?? "")) patch.body = withCaption(row.body, details);
    if (!sameWhen(when, held)) Object.assign(patch, patchFor(row, when));
    Object.assign(patch, remindWrite(row, row.author.isYou, remind));
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
        onOpen={() => titleField.current?.focus()}
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
          ref={titleField}
          value={title}
          onChangeText={setTitle}
          placeholder="What is it?"
          placeholderTextColor={COLOR.iconOnWell}
          accessibilityLabel="Title"
          className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core font-semibold text-title-3 ${rowInk}`}
          returnKeyType="done"
        />

        {/* 2026-11-02. What the row came with: the attachment, which opens
            it, and its details. Neither is drawn when the row has none. */}
        {row.photo || photoCaption(row.body) ? (
          <View className="mt-space-3 flex-row items-start gap-space-3">
            {row.photo && onOpenPhoto ? (
              <Pressable
                onPress={() => onOpenPhoto(row)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Open ${row.title}`}
                className="overflow-hidden rounded-sm"
              >
                <PhotoThumb
                  blobId={row.photo.blobId}
                  ready={row.photo.ready}
                  style={{ width: 56, height: 56 }}
                  className="rounded-sm"
                  fallback={
                    <View
                      className={`items-center justify-center rounded-sm ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
                      style={{ width: 56, height: 56, boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }}
                    >
                      <Glyph name={row.photo.kind === "pdf" ? "paperclip" : "image"} size={18} color={COLOR.iconOnWell} />
                    </View>
                  }
                />
              </Pressable>
            ) : null}
            {photoCaption(row.body) ? (
              <TextInput
                value={details}
                onChangeText={setDetails}
                multiline
                accessibilityLabel="Details"
                className={`flex-1 rounded-sm border border-border-hairline px-space-3 py-space-2 font-core ${quiet}`}
                style={{ fontSize: 14, lineHeight: 20, textAlignVertical: "top" }}
              />
            ) : null}
          </View>
        ) : null}
        {/* 050. The row's actions, with Remove beside a Call or an Email,
            which have no confirm to hold it. A removal is the row's own write
            with its Undo, not part of Save. */}
        <Actions
          actions={row.actions?.filter((a) => !removed.includes(a.url))}
          place={row.place}
          canRemove={row.canDelete && onRemoveAction !== undefined}
          onRemove={(url) => {
            setRemoved((now) => [...now, url]);
            onRemoveAction?.(row, url);
          }}
          removeHere
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
                {repeatsLabel(when)}
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
                {[...carried.map((label) => label.name), ...(choice?.made ?? [])].join(", ") || "None"}
              </Text>
            </View>
            <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}

        {/* Move, to another thread, from the one sheet (the owner,
            2026-10-12): it was behind a long press the tap never hinted at. */}
        {row.canMove && onMove ? (
          <Pressable
            onPress={() => {
              onClose();
              onMove(row);
            }}
            className="min-h-tap-min flex-row items-center gap-space-3"
            accessibilityRole="button"
          >
            <Glyph name="layers" size={18} color={COLOR.iconOnWell} />
            <Text className={`flex-1 font-core ${rowInk}`} style={{ fontSize: 15 }}>
              Move
            </Text>
            <Glyph name="chevron-right" size={18} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}

        {/* Remind me: to the author on anything offload reminds about, to
            anybody else only while somebody asked, and the way out of it. */}
        {remindSwitchShown(row, row.author.isYou) ? (
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
          also={
            row.canDelete && !row.archivedAt && onArchive ? { label: "Archive", icon: "archive", onPress: () => onArchive(row) } : undefined
          }
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
