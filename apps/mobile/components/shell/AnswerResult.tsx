// One read from an answer: the thread that holds the rows, the rows, one tail.
//
// Not `ContentRow`. That component carries its own `Gesture.Pan` for swipe to
// delete and a `Gesture.LongPress` for the actions sheet, and both are wrong
// here twice over. **Answering is reading**, so delete, rename and archive have
// no business on an answer. And the conversation is itself a gesture-driven
// sheet that folds and raises on pan, so nesting a row's horizontal pan inside
// it is a conflict this repository has no reason to trust untested.
//
// Ticking is the only write, and it is the half of the prompt-injection defence
// that does not depend on the model behaving: after 013 the model reads rows
// from every thread the asker is in, including text somebody else wrote, and
// the surfaces it produces cannot destroy anything.

import { useEffect, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { PhotoThumb } from "./PhotoThumb";
import { foundMeta } from "@offload/widgets";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import type { FoundResult, FoundRow, SliceNote } from "../../lib/dump";
import { foundFoot, foundHead } from "../../lib/loose";
import { MARK_MS, headCount } from "../../lib/reply";

/** This surface's default, passed in rather than reached for.
 *
 *  Five, not web's eight, and it is measured.
 *
 *  The conversation sheet caps at 78% of the screen, which leaves about 446pt
 *  of log on an 844pt device. Eight rows plus the header and the control
 *  overrun that by roughly 165pt, so a new answer lands already scrolled past
 *  the sentence that answers the question. At five, the sentence, the header,
 *  all five rows and the control are in view together. */
export const ROWS_SHOWN = 5;

const isAndroid = Platform.OS === "android";

const TYPE_ICON: Record<string, string> = {
  task: "square-check-big",
  event: "calendar",
  link: "link",
  image: "image",
  screenshot: "image",
  voice: "mic",
  file: "paperclip",
  note: "text-quote",
};

/** 052. One list slice of a reply: the card 013 drew for an answer, with the
 *  thread's open count, the turn's rows marked and its notes under Notes. */
export function AnswerResult({
  result,
  onToggle,
  onOpenThread,
  onOpenRow,
  shown = ROWS_SHOWN,
  count,
  marked = [],
  markFor = 0,
  notes = [],
  previous = {},
  head,
}: {
  result: FoundResult;
  /** Rows drawn before the tail. Defaults to this surface's number. */
  shown?: number;
  /** The thread's open rows, for the header; none is drawn at zero. */
  count: number;
  /** The rows this turn wrote, which take the change mark. */
  marked?: readonly string[];
  /** How long the change mark has left: zero on anything not live. */
  markFor?: number;
  /** The notes the turn wrote, in offload's voice. */
  notes?: readonly SliceNote[];
  /** An edited row's dates before the turn. */
  previous?: Readonly<Record<string, { dueAt?: string | null; occursAt?: string | null }>>;
  /** A header in place of the thread's: a new thread's. */
  head?: ReactNode;
  /** Opens the row's sheet. */
  onOpenRow?: ((row: FoundRow) => void) | undefined;
  // `| undefined` explicitly: `exactOptionalPropertyTypes` treats an omitted
  // prop and one passed as undefined as different things, and this is passed
  // through from a parent that may not have it.
  onToggle?: ((row: FoundRow) => void) | undefined;
  onOpenThread?: ((threadId: string, threadName: string | null) => void) | undefined;
}) {
  const colors = useColors();
  const { zone, today } = useClock();
  // No expand state on the phones. Show more is a web affordance in a pane that
  // can grow; here the tail is the thread, which is where the rest lives and
  // where somebody can actually work through them.
  const drawn = result.rows.slice(0, shown);
  const more = result.rows.length - drawn.length;

  return (
    // Android draws the card on a low container fill; iOS draws paper with a
    // hairline. Material's elevation is a fill rather than a border, and a card
    // outlined on a tonal surface reads as a form field there.
    <View
      className={`overflow-hidden rounded-a-md ${
        isAndroid ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"
      }`}
      // Dark theme: edges (design decisions, 2026-10-07): Android's card takes
      // the edge iOS's hairline already draws.
      style={isAndroid ? { boxShadow: `inset 0 0 0 1px ${colors.edgeCard}` } : undefined}
    >
      {/* The thread names the rows from a header inside the card rather than a
          chip above it: one link out per result, and the count has somewhere
          honest to sit. */}
      {head ?? (
      <Pressable
        onPress={() => onOpenThread?.(result.threadId, result.threadName)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${foundHead(result.threadName)}`}
        className="min-h-tap-min flex-row items-center gap-space-4 border-b border-border-hairline bg-surface-accent-soft px-space-5 py-space-4"
      >
        {/* 028. What is not in a thread wears no thread's icon. */}
        {result.threadName !== null ? <ThreadIcon icon={result.threadIcon ?? ""} hue={result.threadHue ?? 1} seed={result.threadId} size={18} round /> : null}
        <Text
          className="font-core font-medium text-text-accent"
          style={{ fontSize: 13.5 }}
          numberOfLines={1}
        >
          {foundHead(result.threadName)}
        </Text>
        <Text className="ml-auto font-core text-text-accent" style={{ fontSize: 12 }}>
          {headCount(count)}
        </Text>
      </Pressable>
      )}

      {drawn.map((row, index) => (
        <View
          key={row.contentId}
          className={`flex-row items-start gap-space-5 px-space-5 py-space-4 ${
            index === drawn.length - 1 && notes.length === 0 ? "" : "border-b border-border-hairline"
          }`}
        >
          {marked.includes(row.contentId) ? <Mark left={markFor} /> : null}
          {onToggle && row.type === "task" ? (
            <Pressable
              onPress={() => onToggle(row)}
              hitSlop={12}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.done }}
              // The name carries the thread. On the thread page a checkbox can
              // lean on the screen for context; in an answer the rows come from
              // anywhere, and "checkbox, not checked" says nothing at all.
              accessibilityLabel={`${row.title}, ${foundHead(row.threadName)}`}
            >
              <View
                className={`items-center justify-center rounded-a-xs ${
                  row.done ? "border-moss-600 bg-moss-600" : "border-border-strong"
                }`}
                // 21px drawn inside a 44px target: the mark stays small and the
                // thing you hit does not. Sizes in style rather than arbitrary
                // classes, which the adherence lint refuses and is right to.
                style={{ width: 21, height: 21, borderWidth: 1.5 }}
              >
                {row.done ? <Glyph name="check" size={13} color={colors.onBrand} /> : null}
              </View>
            </Pressable>
          ) : row.photo ? (
            // 020. The picture itself, where the thread page draws it.
            <PhotoThumb
              blobId={row.photo.blobId}
              ready={row.photo.ready}
              style={{ width: 32, height: 32 }}
              className="rounded-a-sm"
              fallback={
                <View
                  className="items-center justify-center rounded-a-sm bg-surface-fill"
                  style={{ width: 32, height: 32 }}
                >
                  <Glyph name={TYPE_ICON[row.type] ?? "image"} size={16} />
                </View>
              }
            />
          ) : (
            <View
              className="items-center justify-center rounded-a-sm bg-surface-fill"
              style={{ width: 32, height: 32 }}
            >
              <Glyph name={TYPE_ICON[row.type] ?? "text-quote"} size={16} />
            </View>
          )}

          <Pressable
            className="flex-1"
            onPress={onOpenRow ? () => onOpenRow(row) : undefined}
            disabled={!onOpenRow}
            accessibilityRole={onOpenRow ? "button" : undefined}
          >
            {/* Never opacity. A finished row keeps its place, takes tertiary ink
                and a strike, and the tick has already said it. Dimming on a warm
                page reads as a rendering fault and takes the meta line under the
                contrast floor first. */}
            <Text
              className={`font-core font-medium ${
                row.done ? "text-text-tertiary line-through" : "text-text-primary"
              }`}
              style={{ fontSize: 15.5, lineHeight: 21 }}
            >
              {row.title}
            </Text>
            {/* 2026-10-13. The date under the title, in the chip's words: eight
                rows called Glass blowing class are told apart by nothing else. */}
            {foundMeta(row, zone, today) ? (
              <Text className="font-core text-text-secondary" style={{ fontSize: 12.5, lineHeight: 17.5, marginTop: 2 }}>
                {foundMeta(row, zone, today)}
              </Text>
            ) : null}
            {/* 052. Where an edited row was, while its Undo still holds it. */}
            {previous[row.contentId] && foundMeta({ ...row, ...previous[row.contentId] }, zone, today) ? (
              <Text className="font-core text-text-accent" style={{ fontSize: 12.5, lineHeight: 17.5 }}>
                was {foundMeta({ ...row, ...previous[row.contentId] }, zone, today)}
              </Text>
            ) : null}
          </Pressable>
        </View>
      ))}

      {/* 052. What the turn wrote about the thread, in offload's voice. */}
      {notes.length > 0 ? (
        <View className="pb-space-3">
          <Text className="px-space-5 pt-space-4 pb-space-2 font-core font-medium text-text-tertiary" style={{ fontSize: 12 }}>
            Notes
          </Text>
          {notes.map((note) => (
            <View key={note.id} className="px-space-5 py-space-2">
              {note.marked ? <Mark left={markFor} /> : null}
              <Text className="font-quiet text-text-primary" style={{ fontSize: 15, lineHeight: 22 }}>
                {note.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* One tail or the other, never both. A read that hit its page has no rest
          to expand into, because what was not read was not sent. */}
      {result.truncated || more > 0 ? (
        <Pressable
          onPress={() => onOpenThread?.(result.threadId, result.threadName)}
          accessibilityRole="button"
          className="min-h-tap-min flex-row items-center gap-space-4 border-t border-border-hairline bg-surface-accent-soft px-space-5 py-space-4"
        >
          {result.threadName !== null ? <ThreadIcon icon={result.threadIcon ?? ""} hue={result.threadHue ?? 1} seed={result.threadId} size={18} round /> : null}
          <Text
            className="flex-1 font-core text-text-secondary"
            style={{ fontSize: 12.5, lineHeight: 17.5 }}
          >
            {result.truncated
              ? result.threadName === null
                ? "The rest of the answer is in the list."
                : "The rest of the answer is in the thread."
              : foundFoot(more, result.threadName)}
          </Text>
          <Glyph name="chevron-right" size={15} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 052. The change mark: `--surface-accent-soft` settling to transparent over
 *  `--duration-mark`, behind what arrived. Played once, when a turn's result
 *  arrives live; reduced motion draws nothing rather than a shorter flash. */
export function Mark({ left }: { left: number }) {
  const still = useReducedMotion();
  const veil = useSharedValue(left / MARK_MS);
  useEffect(() => {
    veil.value = withTiming(0, { duration: left });
    // Once, from the time it has left.
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: veil.value }));
  if (still || left <= 0) return null;
  return <Animated.View pointerEvents="none" className="absolute inset-0 bg-surface-accent-soft" style={style} />;
}
