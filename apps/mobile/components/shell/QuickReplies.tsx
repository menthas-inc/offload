// 018. The design system's QuickReplies, answering/QuickReplies.jsx: a question
// offload asked, answerable with a tap. Inside the bubble, where 012's calendar
// control sits, because it acts on the sentence above it.
//
// **Values, not words.** A chip's label is offload's wording of a value the
// server already holds, written by the server; the client sends the index back
// and never sees the value. The last option is always the way out, drawn plain
// like the calendar control's "Not now". No option is a primary: a choice
// among values is a choice offload does not know the answer to, and dark ink
// would say it did.
//
// Five chips at most, wrapping to further rows. Every chip carries the
// sentence that asked as its hint, so a screen reader hears what a chip
// answers; a container role would not be read on iOS. Each chip is the Chip
// contract's shape: drawn 30 tall, a 44 hit area around it, and the hit area
// is cancelled by a negative margin so two wrapped lines sit 30 apart in ink
// and meet at 44 in target. A long label wraps rather than being cut.
//
// **The way out is not one of the values, so it never shares their line.** The
// values wrap among themselves and the plain options take a row of their own.
// Which line the way out landed on was otherwise a property of the labels
// rather than a decision. It carries an x because it cancels the question
// rather than answering it, and without a mark a borderless chip beside
// bordered ones reads as a value whose border failed to draw.

import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

/** The Chip contract's drawn height, the same 30 the thread pills use. */
export const CHIP_H = 30;
/** The 44 target, cancelled so wrapped lines meet at 44 and sit 30 apart. */
export const TAP_MIN = 44;
export const CANCEL = -(TAP_MIN - CHIP_H) / 2;

export interface QuickReplyOption {
  label: string;
  kind: "value" | "plain";
}

/** At most five, and the way out is always the last one kept. */
function fiveOf(options: QuickReplyOption[]): QuickReplyOption[] {
  if (options.length <= 5) return options;
  return [...options.slice(0, 4), options[options.length - 1]!];
}

export function QuickReplies({
  options,
  label,
  onPick,
  disabled = false,
  trailing,
}: {
  options: QuickReplyOption[];
  /** The sentence that asked, read as each chip's hint. */
  label: string;
  onPick: (index: number) => void;
  disabled?: boolean;
  /** 027. A control at the end of the way-out line: Today's clock. */
  trailing?: ReactNode;
}) {
  const COLOR = useColors();
  if (options.length === 0) return null;
  const shown = fiveOf(options);
  const values = shown.filter((option) => option.kind !== "plain");
  const ways = shown.filter((option) => option.kind === "plain");
  const reply = (option: QuickReplyOption) =>
    option.kind === "plain" ? (
      <Pressable
        key={option.label}
        onPress={() => onPick(options.indexOf(option))}
        disabled={disabled}
        className="flex-row items-center gap-space-3 px-space-3"
        style={{ minHeight: TAP_MIN, marginVertical: CANCEL }}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityHint={label}
      >
        <Glyph
          name="x"
          size={13}
          color={disabled ? COLOR.disabledText : COLOR.iconOnWell}
        />
        <Text
          className={`font-core ${
            disabled
              ? "text-state-disabled-text"
              : isAndroid
                ? "text-a-on-var"
                : "text-text-secondary"
          }`}
          style={{ fontSize: 13 }}
        >
          {option.label}
        </Text>
      </Pressable>
    ) : (
      <Pressable
        key={option.label}
        onPress={() => onPick(options.indexOf(option))}
        disabled={disabled}
        // The hit area, painting nothing; the pill inside is the chip.
        className="justify-center"
        style={{ minHeight: TAP_MIN, marginVertical: CANCEL }}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityHint={label}
      >
        <View
          className={`items-center justify-center rounded-pill border px-space-5 ${
            disabled
              ? "border-state-disabled-surface bg-state-disabled-surface"
              : isAndroid
                ? "border-a-outline bg-a-c"
                : "border-border-strong bg-surface-card"
          }`}
          style={{ minHeight: CHIP_H }}
        >
          <Text
            className={`font-core font-medium ${
              disabled
                ? "text-state-disabled-text"
                : isAndroid
                  ? "text-a-on"
                  : "text-text-primary"
            }`}
            style={{ fontSize: 13 }}
          >
            {option.label}
          </Text>
        </View>
      </Pressable>
    );
  return (
    <View className="gap-space-4">
      <View className="flex-row flex-wrap items-center gap-space-4">{values.map(reply)}</View>
      {ways.length > 0 || trailing ? (
        <View className="flex-row flex-wrap items-center gap-space-4">
          {ways.map(reply)}
          {trailing ? <View className="ml-auto">{trailing}</View> : null}
        </View>
      ) : null}
    </View>
  );
}
