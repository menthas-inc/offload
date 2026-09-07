// `SegmentedControl`, on a phone.
//
// "Two to four mutually exclusive views. offload's only tab-like control." The
// kits draw a radio list on the phones' Appearance page and `decisions.md`
// overruled that on 5 September, surface all: the contract names this
// component, and the kit predates the answer exactly as the web one did.
//
// A track holding the options with the selected one raised out of it, which is
// what web's does. `min-height`, never height, so it grows with the type.

import { Platform, Pressable, Text, View } from "react-native";

const isAndroid = Platform.OS === "android";

export interface Segment {
  value: string;
  label: string;
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
