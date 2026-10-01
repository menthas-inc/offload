// A piece of content in a thread, and the two gestures that act on it.
//
// **A swipe deletes; a long press opens the rest.** No kit draws a content row
// action on any platform, and this is the answer the design system took: the
// swipe does the one thing `SwipeRow` is built for, and the sheet lists what
// this account may actually do, which is how the authorship split is handled
// without a gesture map that is wrong for half the rows.
//
// **And since 2026-09-11 the row draws what the web row draws**: edit, and one
// way out. Three ways to the same action, which the rule above deliberately
// avoided, and the product owner asked for it after an evening of tidying a
// list: a gesture is something you have to remember, and an icon is something
// you can see. The two gestures are unchanged and still carry everything else.
//
// **And since 2026-09-16 a handle, on a row in a list that can be arranged.**
// `grip-vertical` at the row's leading edge, left of the checkbox, always
// drawn and with no container: a move area, not one of the row's actions.
// Hold it, and the row lifts and follows
// the finger; let go, and the list says where it landed. The handle's own pan
// activates after the hold, which is before the row's long press would have,
// so holding the handle never opens the action sheet, and a vertical drag is
// exactly what the row's swipe fails on. Reanimated and gesture-handler, which
// the row already uses, rather than a list library the app does not have.
//
// **And since 2026-09-29 a tap opens the edit sheet, and the row draws no
// tools.** Three glyphs on every row took a third of a phone's width off the
// title. The sheet carries what they did: delete, and labels. A link keeps
// the tap for its page and draws an ellipsis that opens the same sheet.

import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "expo-router";
import Animated, {
  ReduceMotion,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { DateChip, HourChip } from "./DateChip";
import { ThreadPill } from "./ThreadPill";
import { PhotoThumb } from "./PhotoThumb";
import { useColors } from "../../lib/colors";
import { domainOf, isFiling, isProvisional, rowTap, type ContentRow } from "../../lib/threads";
import { openLink } from "../../lib/links";
import { LabelMark } from "../labels/LabelMark";
import { useRowLabels } from "../labels/labels-context";

const REVEAL = 88;
/** 45 tall by 45 wide around the 17px ellipsis: the row's one tool. */
const TOOL_SLOP = { top: 14, bottom: 14, left: 14, right: 14 };
const isAndroid = Platform.OS === "android";

const ICON: Record<string, string> = {
  task: "square-check-big",
  event: "calendar",
  location: "map-pin",
  link: "link",
  image: "image",
  screenshot: "image",
  file: "paperclip",
  voice: "mic",
  note: "text-quote",
};

/** The title's line height, which every lead and tool is centred on. */
const TITLE_LINE = 21;
/** A 36px tile centred on that line: the top padding is 8, so it fits. */
const ON_TITLE_LINE = (TITLE_LINE - 36) / 2;
/** 2026-09-29. A picture is 40% larger than the tile, so it reads as one: a
 *  link's page and a photo row's photo. Too tall to centre on the title line,
 *  so it tops with it. The Files grid is its own tile and unchanged. */
const PICTURE = 50;

interface Props {
  row: ContentRow;
  border: boolean;
  onDelete: () => void;
  onActions: () => void;
  /** The row's edit sheet, which a tap opens: its fields, labels, and the
   *  way out. */
  onEdit: () => void;
  /** Arrived while somebody was looking at the screen, so it is marked for a
   *  moment rather than simply being there. */
  arrived?: boolean | undefined;
  /** Only a to-do row gets one. The kit draws these as real checkboxes rather
   *  than list rows, and a tick is one tap rather than a long press into a
   *  sheet, because it is the thing people do most. */
  onToggle?: (() => void) | undefined;
  /** A line under the title, for a row that represents more than itself.
   *  The row's own details are not drawn (2026-09-29).
   *
   *  A collapsed repeating entry uses it to say how often and how many are
   *  held, because the one date it happens to carry is not what it is about. */
  note?: string | undefined;
  /** 024. A line under the title that is about where the row lives rather
   *  than what it says: Today draws the thread's name here. Additive, so the
   *  body and a link's domain keep their place. */
  meta?: string | undefined;
  /** 025. Today's marks, drawn after `meta` on its line: a label away from
   *  its thread always travels with the thread's name. */
  metaMarks?: { id: string; name: string; colour: number }[] | undefined;
  /** The row can be dragged to a new place in its list. Given by To do for
   *  its unfinished rows and by nothing else. `onDrop` gets how far the row
   *  travelled; the list, which measured its rows, works out where that is. */
  reorder?: { onDrop: (dy: number) => void } | undefined;
  /** Keeps the handle's space with no handle in it: a finished task in a list
   *  that can be arranged, so its checkbox sits under the others'
   *  (2026-09-29). */
  handleSpace?: boolean | undefined;
  /** 020. A photo row's tile opens the viewer; the row itself opens as a row. */
  onOpenPhoto?: (() => void) | undefined;
  /** 027. Today: the row's thread, drawn as the thread pill on the marks
   *  line after the chip and before `metaMarks`, in place of `meta`. 028: a
   *  row not in a thread has no name, and draws no pill. */
  thread?: { id: string; name: string | null } | undefined;
  /** 027. Which chip leads the marks line: the date chip (the default), the
   *  hour with a clock for a row with a time on its day, or none for a row
   *  due that day with no hour. */
  chip?: "date" | "time" | "none" | undefined;
  /** 027. A control at the trailing edge, centred on the title line: Today's
   *  + Today pill on a pick. */
  trailing?: ReactNode;
  /** 027. The ground the row paints under its swipe, when it sits on a card
   *  rather than on the page. */
  ground?: string | undefined;
  /** 027. Today's card: tighter at the sides and around the checkbox, so a
   *  title has the width (the kit's 14px sides and 8px gap). */
  dense?: boolean | undefined;
  /** 028. Not in a thread draws each title on one line. */
  titleLines?: number | undefined;
  /** 028. A muted note, drawn in tertiary ink as the thread page draws it. */
  muted?: boolean | undefined;
  /** 028. Under the meta, inside the row: a suggestion. */
  below?: ReactNode;
}

export function ContentRowView({
  row,
  border,
  arrived,
  onOpenPhoto,
  onDelete,
  onActions,
  onEdit,
  onToggle,
  note,
  meta,
  metaMarks,
  reorder,
  handleSpace,
  thread,
  chip = "date",
  trailing,
  ground,
  dense,
  titleLines,
  muted,
  below,
}: Props) {
  const COLOR = useColors();
  const router = useRouter();
  // 025. The thread's labels, from the screen that holds the thread, and the
  // marks this row carries. Absent on Today, which passes `metaMarks`.
  const threadLabels = useRowLabels();
  const marks = threadLabels
    ? row.labels.flatMap((id) => {
        const label = threadLabels.labels.get(id);
        return label ? [label] : [];
      })
    : [];
  // Shown instead of an absent body on a link row, and it is what says the row
  // goes somewhere. Ours rather than the page's: a title is written by whoever
  // owns the page and a domain is not.
  const domain = domainOf(row.url);
  // A link with an address is a door: the row opens the page. Anything else
  // opens its sheet, or the actions for a row that is somebody else's.
  const tap = rowTap(row);
  const door = tap === "open";
  const sheet = row.canDelete ? onEdit : onActions;
  // A row drawn at the press, before the server has it. It looks like the row
  // it is about to be and offers nothing: no swipe, no long press, no tools,
  // because there is nothing to act on until the write lands and the id is
  // real. The handle and the tools keep their space and lose their presence,
  // so the row does not reflow when the id arrives, which is the readme's own
  // rule for the filing slot.
  const provisional = isProvisional(row.id);
  const hidden = provisional ? { opacity: 0 } : null;
  const dx = useSharedValue(0);
  // Called from two UI-thread gesture worklets below (pan.onEnd, long.onStart)
  // and its return value is read synchronously there. Without the directive
  // it is a plain JS-thread closure, and Reanimated proxies it as a remote
  // function: reading its result synchronously from the UI thread throws
  // "Tried to synchronously call a Remote Function" rather than settling the
  // row, which is the crash a long press on a row threw.
  const settle = () => {
    "worklet";
    return withSpring(0, { damping: 20, stiffness: 220 });
  };

  // The change mark: a moss ground settling to transparent over 1400ms. Moss
  // because it already means "offload did this, you didn't", which is exactly
  // what happened. Reduced motion drops it rather than shortening it, because
  // a flash that is only briefer is still a flash.
  const mark = useSharedValue(arrived ? 1 : 0);
  useEffect(() => {
    if (!arrived) return;
    mark.value = 1;
    mark.value = withTiming(0, { duration: 1400, reduceMotion: ReduceMotion.System });
  }, [arrived, mark]);

  const pan = Gesture.Pan()
    .enabled(!provisional)
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      dx.value = Math.min(0, Math.max(-REVEAL - 24, event.translationX));
    })
    .onEnd(() => {
      // Only the author may delete, and the server decides that, so a row that
      // is not yours does not park open at all rather than opening onto a
      // control the server will refuse.
      dx.value = dx.value < -REVEAL / 2 && row.canDelete
        ? withSpring(-REVEAL, { damping: 20, stiffness: 220 })
        : settle();
    });

  const long = Gesture.LongPress()
    .enabled(!provisional)
    .minDuration(320)
    .onStart(() => {
      dx.value = settle();
      runOnJS(onActions)();
    });

  // The drag. Vertical only, from the handle, after a hold. The row follows
  // the finger and, while it does, sits raised over its neighbours; on release
  // it snaps home and the list re-sorts under it, so the travel is never
  // animated twice. `onDrop` is a plain function and is called through
  // `runOnJS`, the same rule `onActions` follows above.
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const onDrop = reorder?.onDrop;
  const drag = Gesture.Pan()
    .enabled(!provisional)
    .activateAfterLongPress(250)
    .hitSlop(8)
    .onStart(() => {
      lifted.value = 1;
    })
    .onUpdate((event) => {
      dy.value = event.translationY;
    })
    .onEnd((event) => {
      if (onDrop) runOnJS(onDrop)(event.translationY);
    })
    .onFinalize(() => {
      lifted.value = 0;
      dy.value = 0;
    });

  // The lift takes `--surface-raised` and `--shadow-2`, the only shadow token
  // with a value in dark, where it is a hard 1px line rather than a blur. iOS
  // reads these; Android draws its elevation from `stacking` below.
  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }, { translateY: dy.value }],
    backgroundColor:
      lifted.value === 1
        ? COLOR.raised
        : interpolateColor(mark.value, [0, 1], [ground ?? COLOR.page, COLOR.accentSoft]),
    shadowColor: COLOR.shadowLift.color,
    shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY },
    shadowRadius: COLOR.shadowLift.radius,
    shadowOpacity: lifted.value === 1 ? 1 : 0,
  }));

  // The lifted row draws over the rows it crosses, which its own view cannot
  // do from inside the stacking order: the parent has to come forward.
  const stacking = useAnimatedStyle(() => ({
    zIndex: lifted.value === 1 ? 10 : 0,
    elevation: lifted.value === 1 ? 3 : 0,
  }));

  /** The reveal is a property of the gesture, not of the row's existence.
   *
   *  A ramp over the first 12px and `pointerEvents` off while closed, which is
   *  what the `SwipeRow` contract now specifies. Covering it with the row's
   *  opaque background is not enough: any group fade over the screen, a tab
   *  change or a modal, shows it through every closed row at once. */
  const revealed = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(dx.value) / 12),
    pointerEvents: dx.value === 0 ? "none" : "auto",
  }));

  return (
    <Animated.View className="relative" style={stacking}>
      <Animated.View
        className="absolute inset-y-0 right-0 items-center justify-center bg-clay-600"
        style={[revealed, { width: REVEAL + 24 }]}
      >
        <Text
          className="font-core font-medium text-text-on-solid"
          style={{ fontSize: 13 }}
          onPress={() => {
            dx.value = settle();
            onDelete();
          }}
        >
          Delete
        </Text>
      </Animated.View>

      <GestureDetector gesture={Gesture.Simultaneous(pan, long)}>
        <Animated.View
          style={sliding}
          // 2026-09-26. Top-aligned, and every lead and tool is centred on the
          // title's 21px line by its own margin, so the chip, the meta and
          // the body under the title read as the row's detail. Centred on
          // the whole row, a checkbox beside a three-line row floated
          // between lines that were not its own.
          className={`flex-row items-start ${dense ? "gap-space-4 px-space-5" : "gap-space-5 px-gutter-screen"} py-space-4 ${
            border ? "border-b border-border-hairline" : ""
          }`}
        >
          {reorder ? (
            <GestureDetector gesture={drag}>
              <View
                className="justify-start self-stretch"
                style={[{ marginLeft: -6, marginRight: -6, marginBlock: -8, paddingTop: 10 }, hidden]}
                pointerEvents={provisional ? "none" : "auto"}
                accessibilityRole="button"
                accessibilityLabel={`Move ${row.title}`}
                accessibilityHint="Hold, then drag"
                accessibilityElementsHidden={provisional}
              >
                <Glyph name="grip-vertical" size={17} color={COLOR.iconOnWell} />
              </View>
            </GestureDetector>
          ) : handleSpace ? (
            <View
              style={{ marginLeft: -6, marginRight: -6, opacity: 0 }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Glyph name="grip-vertical" size={17} color={COLOR.iconOnWell} />
            </View>
          ) : null}

          {onToggle ? (
            // In the tile's 36px slot, so a task's title starts where an
            // event's does: the owner saw the two indented apart on Today.
            // Not beside a handle: To do is all tasks, so there is nothing to
            // line up with, and grip, slot and gap together pushed the title
            // half an inch in (2026-09-29).
            <View className="items-center" style={{ width: reorder || handleSpace || dense ? 21 : 36 }}>
              <Pressable
                onPress={onToggle}
                disabled={provisional}
                hitSlop={12}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.doneAt !== null }}
                className="items-center justify-center rounded-xs border"
                style={{
                  // The title line is 21 tall, so the box sits on it as it is.
                  width: 21,
                  height: 21,
                  borderColor: row.doneAt ? COLOR.accent : COLOR.iconOnWell,
                  backgroundColor: row.doneAt ? COLOR.accent : "transparent",
                }}
              >
                {row.doneAt ? <Glyph name="check" size={13} color={COLOR.onSolid} /> : null}
              </Pressable>
            </View>
          ) : (
            // **The page's own picture, where the type glyph would be.** A
            // listing is recognised by its photo long before its title, and the
            // tile is already the right size and shape for one. The glyph is
            // what a row falls back to, which is every row that is not a link
            // and every link whose page published nothing.
            //
            // Loaded from the site by this device. That is the trade the cheap
            // shape makes and it is written down in the privacy policy, not
            // only here.
            row.photo && !row.archivedAt ? (
              // 020. The photo itself, in the same slot and at the same size
              // the link row's picture takes, and the one part of the row that
              // opens the viewer. The glyph until the renditions exist.
              <Pressable
                onPress={onOpenPhoto}
                hitSlop={4}
                accessibilityLabel={`Open ${row.title}`}
                accessibilityRole="button"
              >
                <PhotoThumb
                  blobId={row.photo.blobId}
                  ready={row.photo.ready}
                  style={{ width: PICTURE, height: PICTURE }}
                  className="rounded-sm"
                  fallback={
                    <View
                      className={`items-center justify-center rounded-sm ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
                      style={{ width: PICTURE, height: PICTURE }}
                    >
                      <Glyph name="image" size={18} color={COLOR.iconOnWell} />
                    </View>
                  }
                />
              </Pressable>
            ) : row.imageUrl && !row.archivedAt ? (
              <Image
                source={{ uri: row.imageUrl }}
                style={{ width: PICTURE, height: PICTURE, borderRadius: 6 }}
                // The page chose a picture to represent itself; it did not write
                // a description of it. Decorative, so a screen reader is not
                // handed a filename, and the title beside it already says what
                // the row is.
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ) : (
            // Archived is a hollow tile with a dashed border and secondary
            // ink, never opacity: dimming a row on a warm page reads as a
            // rendering fault and takes the label under the contrast floor.
            <View
              className={`items-center justify-center rounded-sm ${
                row.archivedAt
                  ? "border border-dashed border-border-strong"
                  : isAndroid
                    ? "bg-a-c-low"
                    : "bg-surface-fill"
              }`}
              style={{ width: 36, height: 36, marginTop: ON_TITLE_LINE }}
            >
              <Glyph name={ICON[row.type] ?? "text-quote"} size={18} color={COLOR.iconOnWell} />
            </View>
            )
          )}
          {/* 21 September design: a link's row is a door. Tapping it opens
              the page, the one row in the product whose content lives
              somewhere else; it was a detail screen with the page a second
              step. Every other row opens its edit sheet on the same tap
              (2026-09-29), and a link reaches its sheet from the ellipsis. */}
          {/* 028. A column, so a suggestion sits under the row's words and
              outside its press: inside it, a screen reader would read the
              row as one button and never reach the suggestion's two. */}
          <View className="flex-1">
          <Pressable
            disabled={provisional}
            onPress={door ? () => void openLink(row.url) : sheet}
            accessibilityRole={door ? "link" : "button"}
            accessibilityLabel={door ? `Open ${domain ?? row.title}` : undefined}
            accessibilityHint={door ? undefined : row.canDelete ? "Edit, label or delete" : "Actions"}
            // 027. The thread pill inside is unreachable to a screen reader
            // once the row is one element, so the row carries it as an action.
            {...(thread && thread.name !== null
              ? {
                  accessibilityActions: [{ name: "openThread", label: `Open ${thread.name}` }],
                  onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
                    if (event.nativeEvent.actionName === "openThread") router.push({ pathname: "/threads/[id]", params: { id: thread.id } });
                  },
                }
              : {})}
          >
            {/* 023, moved on 2026-09-26. The date chip sits on its own line
                under the title, above the meta. It trailed the title on one
                line, and beside a chip a long title was squeezed to a word or
                two a line, which the owner saw on the Pixel. A wrapping row
                would keep short titles on one line, and Yoga would not wrap
                it, so the rule is one line each, on every surface. */}
            <View className="items-start gap-space-1">
              <Text
                className={`self-stretch font-core font-medium ${
                  row.doneAt || row.archivedAt || muted
                    ? row.doneAt || muted
                      ? "text-text-tertiary"
                      : "text-text-secondary"
                    : isAndroid
                      ? "text-a-on"
                      : "text-text-primary"
                }`}
                style={{
                  fontSize: 15.5,
                  lineHeight: 21,
                  // A finished row keeps the tick, the sinking and a 1px strike,
                  // and loses the opacity: tertiary ink already says it.
                  ...(row.doneAt ? { textDecorationLine: "line-through" as const } : {}),
                }}
                {...(titleLines ? { numberOfLines: titleLines } : {})}
              >
                {row.title}
              </Text>
              {/* 025. The marks line: the date chip, then the row's labels,
                  wrapping. A row with neither draws nothing. Chips of a
                  fixed size wrap on Yoga, which a growing title beside a
                  chip did not. */}
              {thread ? (
                // 027. Today's marks line: the chip it asked for, the
                // thread, then the labels the row carries there.
                <View className="flex-row flex-wrap items-center gap-space-2">
                  {chip === "date" ? <DateChip row={row} isReminder={row.isReminder} /> : null}
                  {chip === "time" ? <HourChip row={row} /> : null}
                  {thread.name !== null ? <ThreadPill id={thread.id} name={thread.name} size={24} /> : null}
                  {(metaMarks ?? []).map((label) => (
                    <LabelMark key={label.id} color={label.colour}>
                      {label.name}
                    </LabelMark>
                  ))}
                </View>
              ) : marks.length > 0 ? (
                <View className="flex-row flex-wrap items-center gap-space-2">
                  <DateChip row={row} isReminder={row.isReminder} />
                  {marks.map((label) => (
                    <LabelMark key={label.id} color={label.colour} onClick={() => threadLabels?.onOpenLabel(label.id)}>
                      {label.name}
                    </LabelMark>
                  ))}
                </View>
              ) : (
                <DateChip row={row} isReminder={row.isReminder} />
              )}
            </View>
            {meta && !thread ? (
              <View className="mt-space-1 flex-row flex-wrap items-center gap-space-2">
                <Text
                  className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                  style={{ fontSize: 13, fontVariant: ["tabular-nums"] }}
                  numberOfLines={1}
                >
                  {meta}
                </Text>
                {(metaMarks ?? []).map((label) => (
                  <LabelMark key={label.id} color={label.colour}>
                    {label.name}
                  </LabelMark>
                ))}
              </View>
            ) : null}
            {/* offload is still reading a row somebody typed straight in. The
                one spinner, not a second progress word: the readme reserves
                "filing" for a row that does not know where it is going, and
                this row knows. It is saved and usable already. */}
            {/* 2026-09-29. Only what the list says about the row: its
                details are no longer drawn, offload being for short things. */}
            {note ? (
              <Text
                className={`mt-space-1 font-core ${
                  isAndroid ? "text-a-on-var" : "text-text-secondary"
                }`}
                style={{ fontSize: 13 }}
                numberOfLines={2}
              >
                {note}
              </Text>
            ) : null}

            {/* **The domain is the link, and the title is not.** On web the
                title already opens the row's own detail, so hanging the page on
                it would mean the same tap doing different things on different
                surfaces. The domain is free on both, it is the part that says
                the row goes somewhere, and it is ours rather than the page's: a
                title is written by whoever owns the page and a domain is not.

                The system browser, never a webview. A page rendered inside
                offload is a page whose owner is impossible to see. */}
            {domain && !note ? (
              <Pressable
                onPress={() => void openLink(row.url)}
                hitSlop={10}
                accessibilityRole="link"
                accessibilityLabel={`Open ${domain}`}
                className="mt-space-1 flex-row items-center gap-space-2 self-start"
              >
                <Glyph name="link" size={12} color={COLOR.accent} />
                <Text className="font-core text-text-accent" style={{ fontSize: 13 }}>
                  {domain}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
          {below}
          </View>

          {trailing ? <View style={{ marginTop: (TITLE_LINE - 44) / 2 }}>{trailing}</View> : null}

          {isFiling(row.filingAt) ? (
            <ActivityIndicator
              size="small"
              color={COLOR.accent}
              accessibilityLabel="offload is reading this"
            />
          ) : null}

          {/* A link's tap is its page, so its sheet is behind the one tool a
              row still draws. No arrow: the domain under the title already
              says the row goes somewhere. */}
          {door ? (
            <Pressable
              onPress={sheet}
              hitSlop={TOOL_SLOP}
              style={[hidden, { marginTop: (TITLE_LINE - 17) / 2 }]}
              disabled={provisional}
              accessibilityRole="button"
              accessibilityLabel={`More for ${row.title}`}
            >
              <Glyph name="ellipsis" size={17} color={COLOR.iconOnWell} />
            </Pressable>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
