// Choosing one of a few, by seeing what you get. 031.
//
// *Settings, tightened*: Theme and Week starts on were a bare segmented control,
// the only choice controls in the product that showed nothing of what they
// chose. A tile is a small picture of the choice with its radio and name under
// it. `Segmented` stays, for switching views.
//
// One tap writes, as the segmented control did. A radio group to a screen
// reader, named by the section heading above it.
//
// 042. `disabled` is a set whose switch is off, How many under Reminders: not
// pressable, and announced as such. The row that holds it greys it, with the
// fade the hours on that page use.

import { Platform, Pressable, Text, View } from "react-native";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

export interface Choice {
  value: string;
  label: string;
  preview: React.ReactNode;
}

export function ChoiceTiles({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row" style={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={option.label}
            className={`flex-1 ${
              on && isAndroid
                ? "border-blue-600 bg-surface-attention-soft"
                : on
                  ? "border-ink-950 bg-surface-raised"
                  : "border-border-lift bg-surface-raised"
            }`}
            style={{ borderRadius: isAndroid ? 18 : 14, borderWidth: on ? 2 : 1, padding: on ? 7 : 8, paddingBottom: on ? 10 : 11, gap: 9 }}
          >
            {/* A hairline ring, so a dark preview keeps its edge on a dark tile. */}
            <View className="overflow-hidden border border-border-hairline" style={{ height: 62, borderRadius: 9 }}>
              {option.preview}
            </View>
            <View className="flex-row items-center" style={{ gap: 8, paddingHorizontal: 4 }}>
              <View
                className={`rounded-pill ${
                  on ? (isAndroid ? "border-blue-600" : "border-ink-950") : "border-border-strong"
                }`}
                style={{ width: 18, height: 18, borderWidth: on ? 5.5 : 1.5 }}
              />
              <Text
                className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 14 }}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A screen in a theme: its ground and three bars of text. */
export function ThemePreview({ theme }: { theme: "light" | "dark" | "system" }) {
  const { preview } = useColors();
  const screen = (ground: string, bar: string, split = false) => (
    <View className="flex-1" style={{ backgroundColor: ground }}>
      {[60, 80, split ? 0 : 40].map((width, index) =>
        width ? (
          <View
            key={index}
            style={{ height: 7, borderRadius: 4, marginTop: index === 0 ? 9 : 6, marginLeft: 10, width: `${width}%`, backgroundColor: bar }}
          />
        ) : null,
      )}
    </View>
  );
  if (theme === "light") return screen(preview.lightPage, preview.lightBar);
  if (theme === "dark") return screen(preview.darkPage, preview.darkBar);
  return (
    <View className="flex-1 flex-row">
      {screen(preview.lightPage, preview.lightBar, true)}
      {screen(preview.darkPage, preview.darkBar, true)}
    </View>
  );
}

/** A week, its first day filled and the weekend quieter. */
export function WeekPreview({ start }: { start: "monday" | "sunday" }) {
  const days = start === "monday" ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const weekend = (index: number) => (start === "monday" ? index > 4 : index === 0 || index === 6);
  return (
    <View className={`flex-1 flex-row items-center justify-around ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`} style={{ paddingHorizontal: 6 }}>
      {days.map((day, index) => (
        <View
          key={index}
          className={`items-center justify-center rounded-pill ${index === 0 ? (isAndroid ? "bg-blue-600" : "bg-surface-inverse") : ""}`}
          style={{ width: 22, height: 22 }}
        >
          {/* A picture of a week: it does not grow with the type. */}
          <Text
            allowFontScaling={false}
            className={`font-core font-medium ${
              index === 0 ? (isAndroid ? "text-text-on-solid" : "text-text-inverse") : weekend(index) ? "text-text-tertiary" : "text-text-secondary"
            }`}
            style={{ fontSize: 11.5 }}
          >
            {day}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 042. How many reminders: a short line ending at a date, with one, two or
 *  three marks before it. */
export function CountPreview({ count }: { count: 1 | 2 | 3 }) {
  const mark = isAndroid ? "bg-a-on-var" : "bg-text-secondary";
  const date = isAndroid ? "bg-blue-600" : "bg-surface-inverse";
  return (
    <View className={`flex-1 justify-center ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`} style={{ paddingHorizontal: 12 }}>
      <View className="flex-row items-center justify-end" style={{ gap: 12, height: 14 }}>
        <View className="absolute bg-border-strong" style={{ left: 0, right: 7, height: 2, borderRadius: 1 }} />
        {Array.from({ length: count }, (_, index) => (
          <View key={index} className={`rounded-pill ${mark}`} style={{ width: 8, height: 8 }} />
        ))}
        <View className={date} style={{ width: 14, height: 14, borderRadius: 4 }} />
      </View>
    </View>
  );
}
