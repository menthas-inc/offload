// Everything a swipe cannot carry.
//
// **The scrim arrives with the sheet, not before it.** It faded in over 140ms
// while the sheet took 220, so the page went dark and then, a beat later,
// something slid up: read on a device as a flash and a fault rather than as one
// movement. Both are 220 now, and the plate fades out on the same beat instead
// of being taken off the screen in one frame.
//
// The `RowActionSheet` contract, governed from 5 September 2026. A long press
// opens it. It lists what this account may actually do to the row and omits the
// rest, which is why there is no disabled action in here: the server decides
// who may delete something, and a control that is drawn and refused teaches
// somebody a rule that is not true. It pairs with `SwipeRow`, which stays
// delete-only.

import { Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useScreenSheet } from "./conversation-context";

const isAndroid = Platform.OS === "android";

export interface RowAction {
  label: string;
  /** Lucide slug, 18px, leading the label. */
  icon?: string;
  /** Clay label and glyph. One per sheet at most. */
  danger?: boolean;
  run: () => void | Promise<void>;
}

export function RowActionSheet({
  open,
  actions,
  subject,
  onClose,
}: {
  open: boolean;
  actions: RowAction[];
  /** The row's own title, above the actions, when the sheet needs to say which
   *  row it belongs to. Omitted where that is obvious. */
  subject?: string | undefined;
  onClose: () => void;
}) {
  const COLOR = useColors();
  // The plate is above the router and would paint over this. Before the early
  // return, because a hook is not optional.
  useScreenSheet(open);
  if (!open) return null;

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(140)}
        className="absolute inset-0"
        style={{ backgroundColor: COLOR.scrim, opacity: 0.35 }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        className={`absolute inset-x-0 bottom-0 pb-space-8 pt-space-3 ${
          isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"
        }`}
      >
        {subject ? (
          <Text
            className="px-gutter-screen pb-space-3 font-core text-text-tertiary"
            style={{ fontSize: 13 }}
            numberOfLines={1}
          >
            {subject}
          </Text>
        ) : null}

        {actions.map((action) => (
          <Pressable
            key={action.label}
            className="min-h-tap-min flex-row items-center gap-space-4 px-gutter-screen"
            onPress={() => {
              onClose();
              void action.run();
            }}
          >
            {action.icon ? (
              <Glyph
                name={action.icon}
                size={18}
                color={action.danger ? COLOR.danger : COLOR.iconOnWell}
              />
            ) : null}
            <Text
              className={`font-core ${
                action.danger
                  ? "text-text-danger"
                  : isAndroid
                    ? "text-a-on"
                    : "text-text-primary"
              }`}
              style={{ fontSize: 16 }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
}
