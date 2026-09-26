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

import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useEffect } from "react";
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
import { DateChip } from "./DateChip";
import { PhotoThumb } from "./PhotoThumb";
import { useColors } from "../../lib/colors";
import { domainOf, isFiling, isProvisional, type ContentRow } from "../../lib/threads";
import { openLink } from "../../lib/links";

const REVEAL = 88;
const isAndroid = Platform.OS === "android";

const ICON: Record<string, string> = {
  task: "circle-check",
  event: "calendar",
  location: "map-pin",
  link: "link",
  image: "image",
  screenshot: "image",
  file: "file",
  voice: "mic",
  note: "align-left",
};

interface Props {
  row: ContentRow;
  border: boolean;
  onDelete: () => void;
  onActions: () => void;
  /** Rename it. The same control the web row has drawn since 007, and the same
   *  sheet the long press already opened. */
  onEdit: () => void;
  /** Out of the list, or back into it. Which one it means is decided by the
   *  row, not by the caller. */
  onArchive: () => void;
  /** Arrived while somebody was looking at the screen, so it is marked for a
   *  moment rather than simply being there. */
  arrived?: boolean | undefined;
  /** Only a to-do row gets one. The kit draws these as real checkboxes rather
   *  than list rows, and a tick is one tap rather than a long press into a
   *  sheet, because it is the thing people do most. */
  onToggle?: (() => void) | undefined;
  /** Stands in for the body on a row that represents more than itself.
   *
   *  A collapsed repeating entry uses it to say how often and how many are
   *  held, because the one date it happens to carry is not what it is about. */
  note?: string | undefined;
  /** 024. A line under the title that is about where the row lives rather
   *  than what it says: Today draws the thread's name here. Additive, so the
   *  body and a link's domain keep their place. */
  meta?: string | undefined;
  /** The row can be dragged to a new place in its list. Given by To do for
   *  its unfinished rows and by nothing else. `onDrop` gets how far the row
   *  travelled; the list, which measured its rows, works out where that is. */
  reorder?: { onDrop: (dy: number) => void } | undefined;
  /** 020. A photo row's tile opens the viewer; the row itself opens as a row. */
  onOpenPhoto?: (() => void) | undefined;
}

export function ContentRowView({
  row,
  border,
  arrived,
  onOpenPhoto,
  onDelete,
  onActions,
  onEdit,
  onArchive,
  onToggle,
  note,
  meta,
  reorder,
}: Props) {
  const COLOR = useColors();
  // Shown instead of an absent body on a link row, and it is what says the row
  // goes somewhere. Ours rather than the page's: a title is written by whoever
  // owns the page and a domain is not.
  const domain = domainOf(row.url);
  // A link with an address is a door: the row opens the page.
  const door = row.type === "link" && Boolean(row.url) && !row.archivedAt;
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
        : interpolateColor(mark.value, [0, 1], [COLOR.page, COLOR.accentSoft]),
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
          className={`flex-row items-center gap-space-5 px-gutter-screen py-space-4 ${
            border ? "border-b border-border-hairline" : ""
          }`}
        >
          {reorder ? (
            <GestureDetector gesture={drag}>
              <View
                className="justify-center self-stretch"
                style={[{ marginLeft: -6, marginRight: -6, marginBlock: -8 }, hidden]}
                pointerEvents={provisional ? "none" : "auto"}
                accessibilityRole="button"
                accessibilityLabel={`Move ${row.title}`}
                accessibilityHint="Hold, then drag"
                accessibilityElementsHidden={provisional}
              >
                <Glyph name="grip-vertical" size={17} color={COLOR.iconOnWell} />
              </View>
            </GestureDetector>
          ) : null}

          {onToggle ? (
            <Pressable
              onPress={onToggle}
              disabled={provisional}
              hitSlop={12}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.doneAt !== null }}
              className="items-center justify-center rounded-xs border"
              style={{
                width: 21,
                height: 21,
                borderColor: row.doneAt ? COLOR.accent : COLOR.iconOnWell,
                backgroundColor: row.doneAt ? COLOR.accent : "transparent",
              }}
            >
              {row.doneAt ? <Glyph name="check" size={13} color={COLOR.onSolid} /> : null}
            </Pressable>
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
                  style={{ width: 36, height: 36 }}
                  className="rounded-sm"
                  fallback={
                    <View
                      className={`items-center justify-center rounded-sm ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
                      style={{ width: 36, height: 36 }}
                    >
                      <Glyph name="image" size={18} color={COLOR.iconOnWell} />
                    </View>
                  }
                />
              </Pressable>
            ) : row.imageUrl && !row.archivedAt ? (
              <Image
                source={{ uri: row.imageUrl }}
                style={{ width: 36, height: 36, borderRadius: 6 }}
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
              style={{ width: 36, height: 36 }}
            >
              <Glyph name={ICON[row.type] ?? "align-left"} size={18} color={COLOR.iconOnWell} />
            </View>
            )
          )}
          {/* 21 September design: a link's row is a door. Tapping it opens
              the page, the one row in the product whose content lives
              somewhere else; it was a detail screen with the page a second
              step. The trailing glyph is arrow-up-right rather than the
              tools, since a chevron promises a screen inside the app, and
              the row's own tools stay in the long press's sheet. */}
          <Pressable
            className="flex-1"
            disabled={!door}
            onPress={door ? () => void openLink(row.url) : undefined}
            accessibilityRole={door ? "link" : undefined}
            accessibilityLabel={door ? `Open ${domain ?? row.title}` : undefined}
          >
            {/* 023. The date chip trails the title on its own line, before
                the tools, and the meta under the title is untouched. */}
            <View className="flex-row items-start gap-space-2">
              <Text
                className={`flex-1 font-core font-medium ${
                  row.doneAt || row.archivedAt
                    ? row.doneAt
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
              >
                {row.title}
              </Text>
              <DateChip row={row} isReminder={row.isReminder} />
            </View>
            {meta ? (
              <Text
                className={`mt-space-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                style={{ fontSize: 13, fontVariant: ["tabular-nums"] }}
                numberOfLines={1}
              >
                {meta}
              </Text>
            ) : null}
            {/* offload is still reading a row somebody typed straight in. The
                one spinner, not a second progress word: the readme reserves
                "filing" for a row that does not know where it is going, and
                this row knows. It is saved and usable already. */}
            {note ?? row.body ? (
              <Text
                className={`mt-space-1 font-core ${
                  isAndroid ? "text-a-on-var" : "text-text-secondary"
                }`}
                style={{ fontSize: 13 }}
                numberOfLines={2}
              >
                {note ?? row.body}
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

          {isFiling(row.filingAt) ? (
            <ActivityIndicator
              size="small"
              color={COLOR.accent}
              accessibilityLabel="offload is reading this"
            />
          ) : null}

          {/* **Two controls, never three: edit, and one way out.** The web
           *  row's own rule, written on `RowTools` and now the phone's as well,
           *  and the same reason: on a solo thread Archive and Delete are two
           *  answers to one question and only one of them is honest about what
           *  it does. Which way out is drawn is decided by the row.
           *
           *  The swipe and the long press both already carried all of this. A
           *  list you are tidying is a row after a row after a row, and a
           *  gesture is something you have to remember where an icon is
           *  something you can see.
           *
           *  **Conditional, never refused.** `edit_content` and the delete both
           *  need the row to be this account's, which is exactly what
           *  `canDelete` reports, so somebody else's row draws neither and
           *  offers Archive instead. An archived row offers the way back,
           *  whoever is looking: putting something back is not destructive and
           *  is not the author's alone. */}
          {door ? (
            <View style={hidden} accessibilityElementsHidden>
              <Glyph name="arrow-up-right" size={17} color={COLOR.iconOnWell} />
            </View>
          ) : (
          <View
            className="flex-row items-center gap-space-6"
            style={hidden}
            pointerEvents={provisional ? "none" : "auto"}
            accessibilityElementsHidden={provisional}
          >
            {row.canDelete ? (
              <Pressable
                onPress={onEdit}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${row.title}`}
              >
                <Glyph name="pencil" size={17} color={COLOR.iconOnWell} />
              </Pressable>
            ) : null}

            {row.archivedAt ? (
              <Pressable
                onPress={onArchive}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Put ${row.title} back in the thread`}
              >
                <Glyph name="rewind" size={17} color={COLOR.iconOnWell} />
              </Pressable>
            ) : row.canDelete ? (
              <Pressable
                onPress={onDelete}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${row.title}`}
              >
                <Glyph name="trash-2" size={17} color={COLOR.iconOnWell} />
              </Pressable>
            ) : (
              <Pressable
                onPress={onArchive}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Archive ${row.title}`}
              >
                <Glyph name="archive" size={17} color={COLOR.iconOnWell} />
              </Pressable>
            )}
          </View>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
