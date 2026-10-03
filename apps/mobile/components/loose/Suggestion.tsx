// 028. One suggestion under a row, from LooseParts.jsx's `LooseSuggestion`.
//
// The whole line is one button and a tap accepts. *Move to* an existing
// thread sits on moss soft ground with the thread's own icon; *Create* a new one is paper
// with a dashed moss outline, a plus, and *new thread*. **The name inside is a
// label, never a link**: the button's accessible name is the action and the
// name is hidden from assistive tech. The cross beside it dismisses for good.
//
// Two changes from the kit: the button and the cross are 44px targets while
// they draw 32, the button by its hit slop and the cross by its box, so the
// two targets do not overlap; and a shared thread draws its faces after the
// name. The name ellipsises before the faces drop, and the button never
// wraps.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { useColors } from "../../lib/colors";
import { facesOf, sharedHint, suggestionName, type Suggestion } from "../../lib/loose";
import { Faces } from "./Faces";

const isAndroid = Platform.OS === "android";
const TARGET = 44;
const DRAWN = 32;

export function SuggestionLine({
  suggestion,
  title,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  /** The row's own title, for the button's name. */
  title: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const COLOR = useColors();
  const move = suggestion.kind === "move";
  const name = move ? suggestion.thread.name : suggestion.proposal.name;
  const shown = move ? facesOf(suggestion) : null;
  const hint = move ? sharedHint(suggestion) : undefined;
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  return (
    // 8px under the meta. The cross's target is taller than the button, so it
    // gives the difference back above and below rather than growing the row.
    <View className="mt-space-4 flex-row items-center">
      <Pressable
        onPress={onAccept}
        hitSlop={{ top: (TARGET - DRAWN) / 2, bottom: (TARGET - DRAWN) / 2 }}
        accessibilityRole="button"
        accessibilityLabel={suggestionName(suggestion, title)}
        {...(hint ? { accessibilityHint: hint } : {})}
        className={`flex-row items-center gap-space-3 border ${isAndroid ? "rounded-a-sm" : "rounded-pill"} ${
          move ? "border-transparent bg-surface-accent-soft" : "border-dashed border-moss-600 bg-surface-raised"
        }`}
        style={{ minHeight: DRAWN, paddingLeft: 10, paddingRight: 12, flexShrink: 1 }}
      >
        <Glyph name="sparkles" size={13} color={COLOR.accent} />
        <Text className={`font-core ${quiet}`} style={{ fontSize: 13, flexShrink: 0 }}>
          {move ? "Move to" : "Create"}
        </Text>
        <View
          className="flex-row items-center gap-space-2"
          style={{ flexShrink: 1, minWidth: 0 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {move ? <ThreadIcon icon={suggestion.thread.icon} hue={suggestion.thread.hue} seed={suggestion.thread.id} size={16} round /> : <Glyph name="plus" size={12} color={COLOR.accent} />}
          <Text className="font-core font-medium text-moss-700" style={{ fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
            {name}
          </Text>
        </View>
        {shown ? (
          <Faces faces={shown.faces} more={shown.more} />
        ) : (
          <Text className={`font-core ${quiet}`} style={{ fontSize: 13, flexShrink: 0 }}>
            new thread
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss suggestion"
        className="items-center justify-center"
        style={{ width: TARGET, height: TARGET, marginVertical: (DRAWN - TARGET) / 2 }}
      >
        <Glyph name="x" size={14} color={COLOR.quiet} />
      </Pressable>
    </View>
  );
}
