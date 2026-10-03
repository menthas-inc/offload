// `SegmentedControl`, on a phone.
//
// "Two to four mutually exclusive views. offload's only tab-like control." The
// kits draw a radio list on the phones' Appearance page and `decisions.md`
// overruled that on 5 September, surface all: the contract names this
// component, and the kit predates the answer exactly as the web one did.
//
// A track holding the options with the selected one raised out of it, which is
// what web's does. `min-height`, never height, so it grows with the type.
//
// **030. The icon variant**, a thread's List | Map switch: a pill track with
// two 36 by 30 segments, the picked one raised; on Android an outlined pair of
// 44 by 32 with the picked half on `--surface-accent-soft`. Moved out of
// `settings/` for it. The label stays, as each segment's accessible name.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph, type IconName } from "./Glyph";
import { useColors } from "../lib/colors";

const isAndroid = Platform.OS === "android";

export interface Segment {
  value: string;
  label: string;
  /** Drawn instead of the label, which then names it. */
  icon?: IconName;
}

export function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  /** Names the group for anybody who cannot see it sits under a heading. */
  label: string;
  options: Segment[];
  value: string;
  onChange: (value: string) => void;
}) {
  const COLOR = useColors();
  if (options.every((option) => option.icon)) {
    return (
      <View
        className={`flex-row rounded-pill ${isAndroid ? "border border-border-strong" : "bg-surface-fill"}`}
        // The exploration's 2px track: under the smallest spacing step.
        style={isAndroid ? undefined : { padding: 2, gap: 2 }}
        accessibilityRole="tablist"
        accessibilityLabel={label}
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: on }}
              hitSlop={{ top: 7, bottom: 7 }}
              className={`items-center justify-center rounded-pill ${
                on ? (isAndroid ? "bg-surface-accent-soft" : "bg-surface-raised") : ""
              }`}
              style={[
                isAndroid ? { width: 44, height: 32 } : { width: 36, height: 30 },
                on && !isAndroid
                  ? { shadowColor: COLOR.shadowLift.color, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 2, elevation: 1 }
                  : null,
              ]}
            >
              <Glyph name={option.icon!} size={16} color={on ? (isAndroid ? COLOR.accent : COLOR.ink) : COLOR.secondary} />
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View
      className={`flex-row rounded-sm p-space-1 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            className={`flex-1 items-center justify-center rounded-sm px-space-4 py-space-3 ${
              on ? (isAndroid ? "bg-a-surface" : "bg-surface-raised") : ""
            }`}
            style={{ minHeight: 34 }}
          >
            <Text
              className={`font-core font-medium ${
                on
                  ? isAndroid
                    ? "text-a-on"
                    : "text-text-primary"
                  : isAndroid
                    ? "text-a-on-var"
                    : "text-text-secondary"
              }`}
              style={{ fontSize: 13.5 }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
