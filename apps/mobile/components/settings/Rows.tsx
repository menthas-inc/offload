// The two pieces every settings page is made of.
//
// From `SettingsScreen.jsx` and `SettingsDetail.jsx`, which build ten pages out
// of one small vocabulary so that ten screens cost one layout. **Two pieces,
// not the kits' five**: the toggle, the danger tone and the radio choice group
// have no caller here, because every page that uses them is out of this
// feature's scope, and this repository does not build for a caller that does
// not exist. They arrive with the page that needs them.
//
// `Group` is `Card variant="fill"`'s shape: a sunken grey ground, `radius-lg`,
// no border. `Row` divides with an inset hairline rather than a border, so the
// last row's rounded corner is not cut by a line across it.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

export function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <>
      {label ? (
        <Text
          className={`px-space-1 pb-space-3 pt-space-5 font-core font-medium ${
            isAndroid ? "text-a-on-var" : "text-text-tertiary"
          }`}
          style={{ fontSize: 12 }}
        >
          {label}
        </Text>
      ) : null}
      <View
        className={`overflow-hidden rounded-lg px-space-4 ${
          isAndroid ? "bg-a-c-low" : "bg-surface-fill"
        }`}
      >
        {children}
      </View>
    </>
  );
}

interface RowProps {
  title: string;
  /** A second line under the title, for anything that needs explaining. */
  note?: string | undefined;
  /** The current state, on the right. Absent rather than invented: no row here
   *  shows a number nothing computes. */
  value?: string | undefined;
  /** A Lucide slug for the leading well. The index has them, the detail pages
   *  do not. */
  icon?: string | undefined;
  /** Tappable, and the chevron appears with it. Omit for a row that only
   *  states something. */
  onPress?: (() => void) | undefined;
  last?: boolean;
}

export function Row({ title, note, value, icon, onPress, last }: RowProps) {
  const COLOR = useColors();

  const body = (
    <>
      {icon ? (
        <View
          className={`items-center justify-center ${
            isAndroid ? "rounded-pill bg-a-c-high" : "rounded-sm bg-paper"
          }`}
          // Material gives it a 40px circle, iOS a 30px rounded square. The
          // kits differ here on purpose and so does this.
          style={isAndroid ? { width: 40, height: 40 } : { width: 30, height: 30 }}
        >
          <Glyph name={icon} size={isAndroid ? 18 : 15} color={COLOR.iconOnWell} />
        </View>
      ) : null}

      <View className="flex-1">
        <Text
          className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 15, lineHeight: 20 }}
        >
          {title}
        </Text>
        {note ? (
          <Text
            className={`mt-space-1 font-core ${
              isAndroid ? "text-a-on-var" : "text-text-secondary"
            }`}
            style={{ fontSize: 12.5, lineHeight: 17.5 }}
          >
            {note}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text
          className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
          style={{ fontSize: 14 }}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}

      {onPress ? <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} /> : null}
    </>
  );

  // A minimum, never a height. A row with a note is taller, and one at 200%
  // type is taller again; a fixed height clips both.
  const shape = `flex-row items-center gap-space-4 py-space-4 ${
    last ? "" : "border-b border-border-hairline"
  }`;
  const height = { minHeight: isAndroid ? 56 : 48 };

  if (!onPress) {
    return (
      <View className={shape} style={height}>
        {body}
      </View>
    );
  }

  return (
    <Pressable className={shape} style={height} onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}
