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

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { PhotoThumb } from "./PhotoThumb";
import { useColors } from "../../lib/colors";
import type { FoundResult, FoundRow } from "../../lib/dump";
import { foundFoot, foundHead } from "../../lib/loose";

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

export function AnswerResults({
  found,
  onToggle,
  onOpenThread,
  shown = ROWS_SHOWN,
}: {
  found: FoundResult[];
  /** Absent draws the rows untickable, which is right for a fact. */
  onToggle?: ((row: FoundRow) => void) | undefined;
  /** 028. The name is null for what is not in a thread, which opens the
   *  full list rather than a thread. */
  onOpenThread?: ((threadId: string, threadName: string | null) => void) | undefined;
  /** Rows drawn before the tail. Defaults to this surface's number. */
  shown?: number;
}) {
  if (found.length === 0) return null;
  return (
    <View className="mt-space-4 gap-space-4 self-stretch">
      {found.map((result) => (
        <Result
          key={result.threadId}
          result={result}
          onToggle={onToggle}
          onOpenThread={onOpenThread}
          shown={shown}
        />
      ))}
    </View>
  );
}

function Result({
  result,
  onToggle,
  onOpenThread,
  shown,
}: {
  result: FoundResult;
  shown: number;
  // `| undefined` explicitly: `exactOptionalPropertyTypes` treats an omitted
  // prop and one passed as undefined as different things, and this is passed
  // through from a parent that may not have it.
  onToggle?: ((row: FoundRow) => void) | undefined;
  onOpenThread?: ((threadId: string, threadName: string | null) => void) | undefined;
}) {
  const colors = useColors();
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
          {result.rows.length}
        </Text>
      </Pressable>

      {drawn.map((row, index) => (
        <View
          key={row.contentId}
          className={`flex-row items-start gap-space-5 px-space-5 py-space-4 ${
            index === drawn.length - 1 ? "" : "border-b border-border-hairline"
          }`}
        >
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

          <View className="flex-1">
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
          </View>
        </View>
      ))}

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
