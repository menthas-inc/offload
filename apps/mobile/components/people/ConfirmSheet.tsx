// A confirmation with a body and a list. 022.
//
// The design's Remove, Block and Take out sheets, and Withdraw and Leave
// beside them: a title, the sentence that carries the consequence, up to two
// rows listed and a count for the rest, a line under them, and Cancel beside
// the one action. Every one of these is outward facing, so the sheet is the
// confirmation OFF-6 asks for and there is no Undo after it; the body says
// so where the design's copy does, and this component adds nothing to it.
// The list is bounded at two on purpose: a member with two hundred rows made
// the drawn sheet unbounded.

import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { useColors } from "../../lib/colors";
import { DragSheet } from "../shell/DragSheet";

const isAndroid = Platform.OS === "android";

export interface ConfirmRow {
  title: string;
  meta?: string | undefined;
  /** Lucide slug for the lead. Absent draws none. */
  icon?: string | undefined;
  /** 037. A row that is a thread leads with its own icon. */
  thread?: { id: string; icon: string; hue: number } | undefined;
}

export function ConfirmSheet({
  open,
  title,
  body,
  rows = [],
  rowCount,
  hint,
  action,
  danger = false,
  busy = false,
  failed = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  /** At most two are drawn; `rowCount` says how many there are. */
  rows?: ConfirmRow[];
  rowCount?: number | undefined;
  /** The line under the list. */
  hint?: string | undefined;
  /** The verb on the button. */
  action: string;
  danger?: boolean;
  busy?: boolean;
  /** The failure line, beside the control that retries it. */
  failed?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  if (!open) return null;

  const shown = rows.slice(0, 2);
  const more = (rowCount ?? rows.length) - shown.length;

  return (
    <>
      <DragSheet
        onClose={onClose}
        surface={isAndroid ? "rounded-t-a-xl bg-a-c" : "rounded-t-lg bg-surface-raised"}
        className="px-gutter-screen pt-space-2"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 21, lineHeight: 26, letterSpacing: -0.25 }}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <Text
          className={`pt-space-3 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
          style={{ fontSize: 15, lineHeight: 22 }}
        >
          {body}
        </Text>

        {shown.length > 0 ? (
          <View className={`mt-space-5 rounded-lg px-space-4 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}>
            {shown.map((row, i) => (
              <View
                key={`${row.title}-${i}`}
                className={`flex-row items-center gap-space-4 py-space-3 ${
                  i < shown.length - 1 || more > 0 ? "border-b border-border-hairline" : ""
                }`}
                style={{ minHeight: 44 }}
              >
                {row.thread ? (
                  <ThreadIcon icon={row.thread.icon} hue={row.thread.hue} seed={row.thread.id} size={24} />
                ) : row.icon ? (
                  <Glyph name={row.icon} size={18} color={COLOR.secondary} />
                ) : null}
                <Text
                  className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                  style={{ fontSize: 15 }}
                  numberOfLines={1}
                >
                  {row.title}
                </Text>
                {row.meta ? (
                  <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }} numberOfLines={1}>
                    {row.meta}
                  </Text>
                ) : null}
              </View>
            ))}
            {more > 0 ? (
              <Text className="py-space-3 font-core text-text-tertiary" style={{ fontSize: 13 }}>
                and {more} more
              </Text>
            ) : null}
          </View>
        ) : null}

        {hint ? (
          <Text className="pt-space-4 font-core text-text-tertiary" style={{ fontSize: 12.5, lineHeight: 18 }}>
            {hint}
          </Text>
        ) : null}

        {failed ? (
          <Text className="pt-space-4 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
            That didn't go through.
          </Text>
        ) : null}

        <View className="flex-row gap-space-3 pt-space-6">
          <Pressable
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            className="flex-1 items-center justify-center rounded-pill border border-border-strong"
            style={{ minHeight: 44 }}
          >
            <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            className={`flex-1 items-center justify-center rounded-pill ${
              danger ? "bg-surface-danger" : isAndroid ? "bg-blue-600" : "bg-surface-inverse"
            }`}
            style={{ minHeight: 44, opacity: busy ? 0.55 : 1 }}
          >
            <Text
              className={`font-core font-medium ${
                danger || isAndroid ? "text-text-on-solid" : "text-text-inverse"
              }`}
              style={{ fontSize: 15 }}
            >
              {failed ? "Try again" : action}
            </Text>
          </Pressable>
        </View>
      </DragSheet>
    </>
  );
}
