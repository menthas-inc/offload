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
// Five chips at most, wrapping to further rows. The kit drew three and the
// decision log records the change. Every chip carries the sentence that asked
// as its hint, so a screen reader hears what a chip answers; a container role
// would not be read on iOS. Each chip is the Chip contract's shape: drawn 30
// tall, a 44 hit area around it. A long label wraps rather than being cut.

import { Platform, Pressable, Text, View } from "react-native";

const isAndroid = Platform.OS === "android";

/** The Chip contract's drawn height, the same 30 the thread pills use. */
const CHIP_H = 30;

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
}: {
  options: QuickReplyOption[];
  /** The sentence that asked, read as each chip's hint. */
  label: string;
  onPick: (index: number) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-space-4 gap-y-space-2">
      {fiveOf(options).map((option) =>
        option.kind === "plain" ? (
          <Pressable
            key={option.label}
            onPress={() => onPick(options.indexOf(option))}
            disabled={disabled}
            className="min-h-tap-min justify-center px-space-3"
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityHint={label}
          >
            <Text
              className={`font-core ${
                disabled
                  ? "text-state-disabled-text"
                  : isAndroid
                    ? "text-a-on-var"
                    : "text-text-secondary"
              }`}
              style={{ fontSize: 15 }}
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
            className="min-h-tap-min justify-center"
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityHint={label}
          >
            <View
              className={`items-center justify-center rounded-pill border px-space-6 ${
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
                style={{ fontSize: 15 }}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        ),
      )}
    </View>
  );
}
